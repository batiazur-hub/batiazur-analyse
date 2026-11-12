/**
 * Cloudflare Worker — BatiAzur Analyse
 * Publication automatique de actus.json sur GitHub.
 *
 * Secrets / variables à créer dans Cloudflare :
 * - GITHUB_TOKEN     secret
 * - ADMIN_PASSWORD   secret
 * - GITHUB_OWNER     batiazur-hub
 * - GITHUB_REPO      batiazur-analyse
 * - GITHUB_BRANCH    main
 */

const DEFAULT_OWNER = "batiazur-hub";
const DEFAULT_REPO = "batiazur-analyse";
const DEFAULT_BRANCH = "main";
const FILE_PATH = "actus.json";

function corsHeaders(origin) {
  const allowedOrigins = [
    "https://batiazur-hub.github.io",
    "https://batiazuranalyse.batiazur-mail.workers.dev"
  ];
  const ok = allowedOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.batiazurportail\.site$/.test(origin);
  const allowOrigin = ok ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

/* Comparaison en temps constant (via SHA-256) */
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

function toBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Méthode non autorisée" }, 405, origin);
    }

    const adminPassword = request.headers.get("X-Admin-Password") || "";
    if (!env.ADMIN_PASSWORD || !(await sameSecret(adminPassword, env.ADMIN_PASSWORD))) {
      /* ralentit les essais de mot de passe à la chaîne */
      await new Promise(r => setTimeout(r, 1500));
      return jsonResponse({ ok: false, error: "Mot de passe admin incorrect" }, 401, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ ok: false, error: "JSON invalide" }, 400, origin);
    }

    const payload = body.actus;
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
      return jsonResponse({ ok: false, error: "Format actus.json invalide" }, 400, origin);
    }

    payload.updated_at = new Date().toISOString().slice(0, 10);

    const owner = env.GITHUB_OWNER || DEFAULT_OWNER;
    const repo = env.GITHUB_REPO || DEFAULT_REPO;
    const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH;

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ ok: false, error: "GITHUB_TOKEN manquant dans Cloudflare" }, 500, origin);
    }

    const githubUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}?ref=${branch}`;

    let sha = null;

    const current = await fetch(githubUrl, {
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "BatiAzur-Analyse-Worker"
      }
    });

    if (current.ok) {
      const currentJson = await current.json();
      sha = currentJson.sha;
    } else if (current.status !== 404) {
      const errorText = await current.text();
      return jsonResponse({ ok: false, error: "Impossible de lire actus.json", details: errorText }, 500, origin);
    }

    const content = JSON.stringify(payload, null, 2);
    const updateBody = {
      message: `Mise à jour actualités BatiAzur Analyse - ${payload.updated_at}`,
      content: toBase64Utf8(content),
      branch
    };

    if (sha) updateBody.sha = sha;

    const update = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "BatiAzur-Analyse-Worker"
      },
      body: JSON.stringify(updateBody)
    });

    if (!update.ok) {
      const errorText = await update.text();
      return jsonResponse({ ok: false, error: "Publication GitHub échouée", details: errorText }, 500, origin);
    }

    return jsonResponse({
      ok: true,
      message: "Actualités publiées",
      updated_at: payload.updated_at,
      file: FILE_PATH
    }, 200, origin);
  }
};
