/**
 * BatiAzur Analyse — Cloudflare Worker (site + API comptes clients)
 *
 * Le site (index.html, app.js…) est servi par le binding ASSETS.
 * Ce Worker ne répond qu'aux routes /api/* :
 *   GET    /api/health                 → l'API est-elle disponible ?
 *   POST   /api/signup   {email,password}
 *   POST   /api/login    {email,password}
 *   POST   /api/logout
 *   GET    /api/me                     → { email, data, updatedAt }
 *   PUT    /api/data     {data}        → enregistre bassins + produits
 *   POST   /api/password {current,password}
 *   POST   /api/reset/request {email}  → code par e-mail (si Gmail configuré)
 *   POST   /api/reset/confirm {email,code,password}
 *   DELETE /api/account  {password}    → suppression définitive (RGPD)
 *
 * Bindings :
 *   KV                  espace KV « batiazur-analyse-comptes »
 *   ASSETS              fichiers statiques
 * Variables / secrets (facultatifs, pour le mot de passe oublié) :
 *   GMAIL_USER          bati.azur03@gmail.com
 *   GMAIL_APP_PASSWORD  secret (même mot de passe d'application que Terrain)
 *   GOOGLE_PLACES_KEY   secret : clé Google Places (horaires du magasin)
 *   PLACE_ID            identifiant Google Maps du magasin
 *
 * Sécurité :
 *   - mots de passe : PBKDF2-SHA256 100 000 itérations, sel aléatoire
 *   - sessions : jeton aléatoire 256 bits, seul son SHA-256 est stocké,
 *     invalidées au changement / réinitialisation du mot de passe
 *   - tentatives limitées (connexion, inscription, code de réinitialisation)
 *   - pas de cookie (jeton en en-tête Authorization) → pas de CSRF
 *   - en-têtes de sécurité sur toutes les réponses de l'API
 */

import { connect } from "cloudflare:sockets";

const SESSION_TTL = 60 * 60 * 24 * 180;   // 180 jours
const RESET_TTL = 60 * 15;                 // 15 minutes
const PBKDF2_ITER = 100000;                // maximum accepté par Workers
const MAX_DATA_BYTES = 200 * 1024;
const MAX_BODY_BYTES = 256 * 1024;
const DEFAULT_PLACE_ID = "ChIJt0auf_wd8UcR_Cdc9S1ZyOc";
const SEC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};
const enc = new TextEncoder();

/* ── utilitaires ─────────────────────────────────────────── */
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC_HEADERS, ...extra }
  });
}
const err = (msg, status = 400) => json({ ok: false, error: msg }, status);

function b64(bytes) {
  let s = "";
  bytes = new Uint8Array(bytes);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomToken(n = 32) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sha256(str) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, saltB64, iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: iter }, key, 256);
  return b64(bits);
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function validEmail(e) {
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}
function validPassword(p) {
  return typeof p === "string" && p.length >= 8 && p.length <= 200;
}
async function readJson(req) {
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}
function clientIp(req) {
  return req.headers.get("CF-Connecting-IP") || "local";
}

/* Limitation simple des tentatives (fenêtre de 15 min) */
async function tooMany(env, key, limit) {
  const k = "rl:" + key;
  const n = parseInt((await env.KV.get(k)) || "0", 10);
  if (n >= limit) return true;
  await env.KV.put(k, String(n + 1), { expirationTtl: 900 });
  return false;
}

async function getUser(env, email) {
  return env.KV.get("user:" + email, "json");
}
async function putUser(env, user) {
  await env.KV.put("user:" + user.email, JSON.stringify(user));
}
async function newSession(env, user) {
  const token = randomToken(32);
  await env.KV.put("sess:" + (await sha256(token)), user.email + "|" + (user.gen || 0), { expirationTtl: SESSION_TTL });
  return token;
}
/* Nouveau mot de passe : toutes les sessions existantes deviennent invalides */
async function setPassword(user, password) {
  user.salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  user.iter = PBKDF2_ITER;
  user.hash = await hashPassword(password, user.salt);
  user.gen = (user.gen || 0) + 1;
}
/* Hachage factice : même durée de réponse, que le compte existe ou non */
const DUMMY_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";
async function checkPassword(user, password) {
  if (!user) { await hashPassword(String(password || ""), DUMMY_SALT); return false; }
  return safeEqual(await hashPassword(String(password || ""), user.salt, user.iter), user.hash);
}
function bearer(req) {
  const h = req.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}
async function sessionUser(env, req) {
  const token = bearer(req);
  if (!token || token.length > 128) return null;
  const val = await env.KV.get("sess:" + (await sha256(token)));
  if (!val) return null;
  const [email, gen] = val.split("|");
  const user = await getUser(env, email);
  if (!user || String(user.gen || 0) !== String(gen || 0)) return null;
  return { user, token };
}
function publicUser(u) {
  return { email: u.email, data: u.data || null, updatedAt: u.updatedAt || null };
}

/* ── e-mail (Gmail SMTP, port 465) ──────────────────────── */
function b64utf8(s) { return b64(enc.encode(s)); }
function encHeader(s) { return /[^\x00-\x7F]/.test(s) ? `=?UTF-8?B?${b64utf8(s)}?=` : s; }

async function sendMail(env, to, subject, html) {
  const user = env.GMAIL_USER, pass = String(env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return false;
  const raw = [
    `From: ${encHeader("BatiAzur Analyse")} <${user}>`,
    `To: ${to}`,
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomToken(16)}@batiazurportail.site>`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64utf8(html).replace(/(.{76})/g, "$1\r\n")
  ].join("\r\n");

  const socket = connect({ hostname: "smtp.gmail.com", port: 465 }, { secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const read = async () => {
    for (;;) {
      const lines = buf.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const r = lines.slice(0, i + 1).join("\n");
          buf = lines.slice(i + 1).join("\r\n");
          return r;
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP fermé");
      buf += dec.decode(value, { stream: true });
    }
  };
  const cmd = async (line, expect) => {
    if (line !== null) await writer.write(enc.encode(line + "\r\n"));
    const r = await read();
    if (!r.startsWith(expect)) throw new Error("SMTP " + r);
  };
  try {
    await cmd(null, "220");
    await cmd("EHLO batiazurportail.site", "250");
    await cmd("AUTH PLAIN " + b64utf8(`\0${user}\0${pass}`), "235");
    await cmd(`MAIL FROM:<${user}>`, "250");
    await cmd(`RCPT TO:<${to}>`, "250");
    await cmd("DATA", "354");
    await writer.write(enc.encode(raw.replace(/\r\n\./g, "\r\n..") + "\r\n.\r\n"));
    await cmd(null, "250");
    await writer.write(enc.encode("QUIT\r\n"));
    return true;
  } catch (e) {
    console.warn("sendMail:", e.message);
    return false;
  } finally {
    try { await socket.close(); } catch {}
  }
}

/* ── routes ─────────────────────────────────────────────── */
async function horaires(env, ctx) {
  if (!env.GOOGLE_PLACES_KEY) return json({ ok: false, error: "Horaires en ligne non configurés." });
  const cache = caches.default;
  const key = new Request("https://cache.batiazur/horaires");
  const hit = await cache.match(key);
  if (hit) return hit;
  const placeId = env.PLACE_ID || DEFAULT_PLACE_ID;
  const r = await fetch("https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + "?languageCode=fr", {
    headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "currentOpeningHours,regularOpeningHours" }
  });
  if (!r.ok) return err("Horaires indisponibles.", 502);
  const g = await r.json();
  /* On ne renvoie que les horaires (jamais la clé ni autre chose) */
  const pick = (h) => h ? { periods: h.periods || [], weekdayDescriptions: h.weekdayDescriptions || [], openNow: !!h.openNow } : undefined;
  const res = json({ ok: true, currentOpeningHours: pick(g.currentOpeningHours), regularOpeningHours: pick(g.regularOpeningHours) }, 200, { "Cache-Control": "public, max-age=1800" });
  ctx && ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function handleApi(req, env, path, ctx) {
  const method = req.method;
  if (path === "/api/horaires" && method === "GET") return horaires(env, ctx);
  if (!env.KV) return err("Stockage des comptes non configuré", 503);

  if (path === "/api/health") {
    return json({ ok: true, accounts: true, reset: !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD) });
  }

  if (path === "/api/signup" && method === "POST") {
    const b = await readJson(req);
    const email = normEmail(b.email);
    if (!validEmail(email)) return err("Adresse e-mail invalide.");
    if (!validPassword(b.password)) return err("Le mot de passe doit faire au moins 8 caractères.");
    if (await tooMany(env, "signup:" + clientIp(req), 10)) return err("Trop de tentatives, réessayez dans 15 minutes.", 429);
    if (await getUser(env, email)) return err("Un compte existe déjà avec cette adresse. Connectez-vous.", 409);
    const user = {
      email, gen: 0,
      createdAt: new Date().toISOString(),
      data: b.data && typeof b.data === "object" ? b.data : null,
      updatedAt: new Date().toISOString()
    };
    if (JSON.stringify(user.data || {}).length > MAX_DATA_BYTES) user.data = null;
    await setPassword(user, b.password);
    user.gen = 0;
    await putUser(env, user);
    return json({ ok: true, token: await newSession(env, user), user: publicUser(user) });
  }

  if (path === "/api/login" && method === "POST") {
    const b = await readJson(req);
    const email = normEmail(b.email);
    if (await tooMany(env, "login:" + email, 8) || await tooMany(env, "loginip:" + clientIp(req), 30)) {
      return err("Trop de tentatives, réessayez dans 15 minutes.", 429);
    }
    const user = validEmail(email) ? await getUser(env, email) : null;
    if (!(await checkPassword(user, b.password))) return err("E-mail ou mot de passe incorrect.", 401);
    return json({ ok: true, token: await newSession(env, user), user: publicUser(user) });
  }

  if (path === "/api/reset/request" && method === "POST") {
    const b = await readJson(req);
    const email = normEmail(b.email);
    if (!validEmail(email)) return err("Adresse e-mail invalide.");
    if (await tooMany(env, "reset:" + email, 3)) return err("Trop de demandes, réessayez dans 15 minutes.", 429);
    if (!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD)) {
      return err("La réinitialisation par e-mail n'est pas encore active. Contactez Bati Azur au 04 70 34 21 96.", 503);
    }
    const user = await getUser(env, email);
    if (user) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      await env.KV.put("reset:" + email, JSON.stringify({ code: await sha256(code), tries: 0 }), { expirationTtl: RESET_TTL });
      await sendMail(env, email, "Votre code BatiAzur Analyse",
        `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1c2b3a">
          <h2 style="color:#0e5ac8;margin:0 0 12px">BatiAzur Analyse</h2>
          <p>Voici votre code pour choisir un nouveau mot de passe :</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
          <p style="color:#5b6b7b;font-size:14px">Ce code est valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
          <p style="color:#5b6b7b;font-size:13px">Bati Azur · Piscines – Spa · 04 70 34 21 96</p>
        </div>`);
    }
    // Même réponse que le compte existe ou non
    return json({ ok: true });
  }

  if (path === "/api/reset/confirm" && method === "POST") {
    const b = await readJson(req);
    const email = normEmail(b.email);
    if (!validPassword(b.password)) return err("Le mot de passe doit faire au moins 8 caractères.");
    const rec = await env.KV.get("reset:" + email, "json");
    if (!rec) return err("Code expiré ou invalide. Redemandez un code.", 400);
    if (rec.tries >= 5) { await env.KV.delete("reset:" + email); return err("Trop d'essais. Redemandez un code.", 429); }
    if (!safeEqual(await sha256(String(b.code || "").trim()), rec.code)) {
      rec.tries++;
      await env.KV.put("reset:" + email, JSON.stringify(rec), { expirationTtl: RESET_TTL });
      return err("Code incorrect.", 400);
    }
    const user = await getUser(env, email);
    if (!user) return err("Compte introuvable.", 404);
    await setPassword(user, b.password);
    await putUser(env, user);
    await env.KV.delete("reset:" + email);
    return json({ ok: true, token: await newSession(env, user), user: publicUser(user) });
  }

  /* ── routes authentifiées ── */
  const s = await sessionUser(env, req);
  if (!s) return err("Session expirée, reconnectez-vous.", 401);
  const user = s.user;

  if (path === "/api/me" && method === "GET") return json({ ok: true, user: publicUser(user) });

  if (path === "/api/logout" && method === "POST") {
    await env.KV.delete("sess:" + (await sha256(s.token)));
    return json({ ok: true });
  }

  if (path === "/api/data" && method === "PUT") {
    const raw = await req.text();
    if (raw.length > MAX_DATA_BYTES) return err("Données trop volumineuses.", 413);
    let b;
    try { b = JSON.parse(raw); } catch { return err("JSON invalide."); }
    if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return err("Données manquantes.");
    if ((b.data.pools || []).length > 100 || (b.data.products || []).length > 300) return err("Trop d'éléments enregistrés.", 413);
    user.data = b.data;
    user.updatedAt = new Date().toISOString();
    await putUser(env, user);
    return json({ ok: true, updatedAt: user.updatedAt });
  }

  if (path === "/api/password" && method === "POST") {
    const b = await readJson(req);
    if (await tooMany(env, "pw:" + user.email, 8)) return err("Trop de tentatives, réessayez dans 15 minutes.", 429);
    if (!(await checkPassword(user, b.current))) return err("Mot de passe actuel incorrect.", 401);
    if (!validPassword(b.password)) return err("Le mot de passe doit faire au moins 8 caractères.");
    await setPassword(user, b.password);
    await putUser(env, user);
    /* les autres appareils sont déconnectés ; celui-ci reçoit une nouvelle session */
    return json({ ok: true, token: await newSession(env, user) });
  }

  if (path === "/api/account" && method === "DELETE") {
    const b = await readJson(req);
    if (await tooMany(env, "pw:" + user.email, 8)) return err("Trop de tentatives, réessayez dans 15 minutes.", 429);
    if (!(await checkPassword(user, b.password))) return err("Mot de passe incorrect.", 401);
    await env.KV.delete("user:" + user.email);
    await env.KV.delete("sess:" + (await sha256(s.token)));
    return json({ ok: true });
  }

  return err("Route inconnue.", 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url.pathname, ctx);
      } catch (e) {
        console.error(e);
        return err("Erreur serveur.", 500);
      }
    }
    return env.ASSETS.fetch(req);
  }
};
