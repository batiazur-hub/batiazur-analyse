/* ═══════════════════════════════════════════════════════
   BatiAzur Analyse — Mon espace (comptes, bassins, produits)
   ───────────────────────────────────────────────────────
   • Sans compte : bassins + produits enregistrés sur l'appareil
     (localStorage).
   • Avec compte : mêmes données synchronisées via /api (Worker
     Cloudflare + KV), disponibles sur tous les appareils.
   • Mode « Produits Bati Azur » : dosages historiques de l'app,
     inchangés (calculés dans app.js).
   • Mode « Mes produits » : dosages calculés à partir du produit
     du client (dose de l'étiquette ou concentration).
   ═══════════════════════════════════════════════════════ */
(function() {
  "use strict";

  var LS_DATA = "batiazur_userdata_v1";
  var LS_TOKEN = "batiazur_token";
  var LS_EMAIL = "batiazur_email";

  /* ── Catégories de produits ─────────────────────────────
     label   : dose de référence par défaut (= produits Bati Azur)
     effect  : unité de l'effet (null = dose fixe, sans effet)
     conc    : calcul possible depuis la concentration
               factor = g de matière pure par m³ pour 1 unité d'effet */
  var CATS = {
    ph_plus:  { name: "pH plus",            param: "ph",         effect: "pH",  effectWord: "faire monter le pH de",   def: { qty: 150, unit: "g", per: 10, eff: 0.2 } },
    ph_minus: { name: "pH moins",           param: "ph",         effect: "pH",  effectWord: "faire baisser le pH de",  def: { qty: 200, unit: "g", per: 10, eff: 0.2 } },
    tac:      { name: "TAC plus",           param: "tac",        effect: "ppm", effectWord: "faire monter le TAC de",  def: { qty: 170, unit: "g", per: 10, eff: 10 },
                conc: { factor: 1.7, what: "bicarbonate de sodium" } },
    stab:     { name: "Stabilisant",        param: "stabilizer", effect: "ppm", effectWord: "faire monter le stabilisant de", def: { qty: 100, unit: "g", per: 10, eff: 10 },
                conc: { factor: 1.0, what: "acide cyanurique" } },
    salt:     { name: "Sel",                param: "salt",       effect: "g/L", effectWord: "faire monter le sel de",  def: { qty: 1, unit: "kg", per: 1, eff: 1 },
                conc: { factor: 1000, what: "chlorure de sodium" } },
    chlore:   { name: "Chlore choc",        param: "shock",      effect: null,  def: { qty: 70, unit: "g", per: 10 },
                conc: { factor: 1, what: "chlore disponible", target: 5 } },
    brome:    { name: "Brome choc",         param: "brome",      effect: null,  def: { qty: 150, unit: "g", per: 10 } },
    metaux:   { name: "Séquestrant métaux", param: "metals",     effect: null,  def: { qty: 0.5, unit: "L", per: 100 } }
  };
  var TIPS = {
    ph_plus:  "Cherchez « Mode d'emploi » ou « Dosage » : ex. « 100 g pour 10 m³ augmentent le pH de 0,1 ».",
    ph_minus: "Cherchez « Mode d'emploi » ou « Dosage » : ex. « 100 g pour 10 m³ diminuent le pH de 0,1 ».",
    tac:      "Ex. « 200 g pour 10 m³ augmentent le TAC de 10 ppm (1 °f) ». Ou le % de bicarbonate de sodium.",
    stab:     "Ex. « 1 kg pour 100 m³ = +10 mg/L ». Ou le % d'acide cyanurique.",
    salt:     "Ex. « 1 kg par m³ = 1 g/L ». Ou la pureté en % (souvent 99 %).",
    chlore:   "Cherchez la dose « traitement choc » : ex. « 15 g par m³ ». Ou le % de chlore disponible.",
    brome:    "Cherchez la dose « traitement choc » : ex. « 150 g pour 10 m³ ».",
    metaux:   "Ex. « 0,5 L pour 100 m³ » ou « 25 cL pour 10 m³ »."
  };
  var CAT_ORDER = ["ph_plus", "ph_minus", "tac", "stab", "salt", "chlore", "brome", "metaux"];
  var UNITS = ["g", "kg", "mL", "L", "pastilles"];
  var PARAM_CATS = { ph: ["ph_plus", "ph_minus"], tac: ["tac"], salt: ["salt"], stabilizer: ["stab"], shock: ["chlore"], brome: ["brome"], metals: ["metaux"] };

  /* ── Utilitaires ─────────────────────────────────────── */
  function q(s, root) { return (root || document).querySelector(s); }
  function qa(s, root) { return Array.from((root || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function(c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) {
    var x = parseFloat(String(v == null ? "" : v).replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  }
  function f(x, d) {
    d = d === undefined ? 1 : d;
    if (!Number.isFinite(x)) return "--";
    return Number(x.toFixed(d)).toLocaleString("fr-FR");
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function now() { return new Date().toISOString(); }
  function tap(el) { if (typeof press === "function") press(el); }

  /* Affiche une quantité dans l'unité du produit */
  function amountText(x, unit) {
    if (!Number.isFinite(x)) return "--";
    if (unit === "g") return x >= 1000 ? f(x / 1000, 2) + " kg" : f(x, 0) + " g";
    if (unit === "kg") return x < 1 ? f(x * 1000, 0) + " g" : f(x, 2) + " kg";
    if (unit === "mL") return x >= 1000 ? f(x / 1000, 2) + " L" : f(x, 0) + " mL";
    if (unit === "L") return x < 1 ? f(x * 1000, 0) + " mL" : f(x, 2) + " L";
    if (unit === "pastilles") { var p = Math.ceil(x * 2) / 2; return f(p, 1) + " pastille" + (p > 1 ? "s" : ""); }
    return f(x, 2) + " " + unit;
  }

  /* ── Données locales ─────────────────────────────────── */
  function emptyData() {
    return { v: 1, pools: [], products: [], deleted: [], prefs: { mode: "batiazur", selected: {} }, updatedAt: null };
  }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(LS_DATA) || "null");
      if (d && typeof d === "object") {
        var e = emptyData();
        d.pools = Array.isArray(d.pools) ? d.pools : [];
        d.products = Array.isArray(d.products) ? d.products : [];
        d.deleted = Array.isArray(d.deleted) ? d.deleted : [];
        d.prefs = Object.assign(e.prefs, d.prefs || {});
        d.prefs.selected = d.prefs.selected || {};
        return d;
      }
    } catch (err) {}
    return emptyData();
  }
  var data = load();

  function persist(skipSync) {
    data.updatedAt = now();
    try { localStorage.setItem(LS_DATA, JSON.stringify(data)); } catch (err) {}
    if (!skipSync) scheduleSync();
  }

  /* Fusion local ↔ serveur : par identifiant, la modification la plus récente l'emporte */
  function merge(a, b) {
    var out = emptyData();
    var del = {};
    (a.deleted || []).concat(b.deleted || []).forEach(function(id) { del[id] = true; });
    out.deleted = Object.keys(del).slice(-300);
    ["pools", "products"].forEach(function(key) {
      var map = {};
      (a[key] || []).concat(b[key] || []).forEach(function(item) {
        if (!item || !item.id || del[item.id]) return;
        var cur = map[item.id];
        if (!cur || String(item.updatedAt || "") > String(cur.updatedAt || "")) map[item.id] = item;
      });
      out[key] = Object.keys(map).map(function(k) { return map[k]; })
        .sort(function(x, y) { return String(x.createdAt || "").localeCompare(String(y.createdAt || "")); });
    });
    var newer = String(a.updatedAt || "") >= String(b.updatedAt || "") ? a : b;
    out.prefs = Object.assign(emptyData().prefs, (newer.prefs || {}));
    out.prefs.selected = Object.assign({}, (b.prefs || {}).selected || {}, (a.prefs || {}).selected || {}, out.prefs.selected || {});
    out.updatedAt = newer.updatedAt || now();
    return out;
  }

  /* ── API ─────────────────────────────────────────────── */
  var api = { available: null, reset: false };
  function token() { try { return localStorage.getItem(LS_TOKEN) || ""; } catch (e) { return ""; } }
  function email() { try { return localStorage.getItem(LS_EMAIL) || ""; } catch (e) { return ""; } }
  function setSession(t, mail) {
    try {
      if (t) { localStorage.setItem(LS_TOKEN, t); localStorage.setItem(LS_EMAIL, mail || ""); }
      else { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_EMAIL); }
    } catch (e) {}
  }

  function call(path, method, body) {
    var headers = { "Content-Type": "application/json" };
    var t = token();
    if (t) headers.Authorization = "Bearer " + t;
    return fetch("./api/" + path, {
      method: method || "GET",
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    }).then(function(res) {
      return res.json().catch(function() { return { ok: false, error: "Réponse invalide du serveur." }; })
        .then(function(j) {
          if (res.status === 401 && t && path !== "login" && path !== "password" && path !== "account") {
            setSession(null);
            renderAccount();
          }
          if (!res.ok || !j.ok) { var e = new Error(j.error || "Erreur " + res.status); e.status = res.status; throw e; }
          return j;
        });
    });
  }

  function checkApi() {
    return fetch("./api/health", { cache: "no-store" })
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(j) { api.available = !!(j && j.ok && j.accounts); api.reset = !!(j && j.reset); })
      .catch(function() { api.available = false; })
      .then(function() { renderAccount(); });
  }

  var syncTimer = null, syncState = "";
  function scheduleSync() {
    if (!token() || !api.available) return;
    clearTimeout(syncTimer);
    syncState = "pending";
    renderSyncState();
    syncTimer = setTimeout(pushData, 900);
  }
  function pushData() {
    if (!token()) return Promise.resolve();
    syncState = "saving";
    renderSyncState();
    return call("data", "PUT", { data: data })
      .then(function() { syncState = "ok"; })
      .catch(function() { syncState = "error"; })
      .then(renderSyncState);
  }
  function pullAndMerge(serverUser) {
    var server = serverUser && serverUser.data;
    if (server && typeof server === "object") data = merge(data, server);
    persist(true);
    return pushData().then(refreshAll);
  }

  /* ── Bassins ─────────────────────────────────────────── */
  function savePool(name, volume) {
    name = String(name || "").trim() || "Mon bassin";
    volume = n(volume);
    if (volume <= 0) return null;
    var existing = data.pools.find(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (existing) {
      existing.volume = volume;
      existing.updatedAt = now();
    } else {
      existing = { id: uid(), name: name.slice(0, 60), volume: volume, createdAt: now(), updatedAt: now() };
      data.pools.push(existing);
    }
    data.prefs.activePool = existing.id;
    persist();
    refreshAll();
    return existing;
  }
  function deletePool(id) {
    data.pools = data.pools.filter(function(p) { return p.id !== id; });
    data.deleted.push(id);
    persist();
    refreshAll();
  }

  /* ── Produits ────────────────────────────────────────── */
  function productsOf(cat) { return data.products.filter(function(p) { return p.cat === cat; }); }
  function selectedProduct(cat) {
    var list = productsOf(cat);
    if (!list.length) return null;
    var id = data.prefs.selected[cat];
    return list.find(function(p) { return p.id === id; }) || list[0];
  }
  function deleteProduct(id) {
    data.products = data.products.filter(function(p) { return p.id !== id; });
    data.deleted.push(id);
    persist();
    refreshAll();
  }

  /* Quantité de produit (dans son unité) pour un volume et un besoin (effet) */
  function amountFor(p, volume, need) {
    var c = CATS[p.cat];
    if (!c) return NaN;
    if (p.mode === "conc" && c.conc) {
      var pct = n(p.conc);
      if (pct <= 0) return NaN;
      var g = c.effect ? volume * c.conc.factor * need / (pct / 100)
                       : volume * (n(p.target) || c.conc.target) / (pct / 100);
      return g; /* toujours en grammes */
    }
    var qty = n(p.qty), per = n(p.per), eff = n(p.eff);
    if (qty <= 0 || per <= 0) return NaN;
    var base = qty * (volume / per);
    if (c.effect) {
      if (eff <= 0) return NaN;
      return base * (need / eff);
    }
    return base;
  }
  function unitOf(p) { return p.mode === "conc" ? "g" : p.unit; }
  function describe(p) {
    var c = CATS[p.cat];
    if (p.mode === "conc" && c.conc) {
      return f(n(p.conc), 1) + " % de " + c.conc.what + (c.effect ? "" : " · dose visée " + f(n(p.target) || c.conc.target, 1) + " mg/L");
    }
    return amountText(n(p.qty), p.unit) + " pour " + f(n(p.per), 1) + " m³" + (c.effect ? " → " + (c.effect === "pH" ? f(n(p.eff), 2) : f(n(p.eff), 1)) + " " + c.effect : "");
  }

  /* ── Calcul « Mes produits » (appelé par app.js) ─────── */
  function instr(param, ctx) {
    return typeof instructionsFor === "function" ? instructionsFor(param, ctx) : "Filtration 24 h obligatoire.";
  }
  function missing(cat) {
    return { title: "Produit à renseigner", text: "Ajoutez votre produit « " + CATS[cat].name + " » dans Mon espace › Mes produits (dose indiquée sur l'étiquette ou concentration), ou repassez sur Produits Bati Azur." };
  }

  function customDose(param, volume) {
    if (!isCustom() || !PARAM_CATS[param]) return null;
    var p, x, title, text;
    if (param === "ph") {
      var cur = n(q("#phCurrent") && q("#phCurrent").value), tgt = n(q("#phTarget") && q("#phTarget").value);
      var diff = tgt - cur;
      if (!cur || !tgt || Math.abs(diff) < 0.01) return { title: "Pas de correction", text: "Renseigne un pH mesuré différent du pH souhaité." };
      var cat = diff > 0 ? "ph_plus" : "ph_minus";
      p = selectedProduct(cat);
      if (!p) return missing(cat);
      var corr = Math.abs(diff);
      var steps = Math.ceil((corr - 0.0001) / 0.2);
      var per = amountFor(p, volume, 0.2);
      if (!Number.isFinite(per)) return missing(cat);
      title = amountText(per * steps, unitOf(p)) + " au total";
      text = p.name + " (" + CATS[cat].name + ") · Correction : " + f(corr, 1) + " pH. " + steps + " apport" + (steps > 1 ? "s" : "") + " de 0,2. Dose par apport : " + amountText(per, unitOf(p)) + ". Ne pas verser la dose totale d'un coup. " + instr("ph");
      return { title: title, text: text };
    }
    var map = {
      tac:        { cat: "tac",  cur: "#tacCurrent",  tgt: "#tacTarget",  unit: "ppm" },
      stabilizer: { cat: "stab", cur: "#stabCurrent", tgt: "#stabTarget", unit: "ppm" },
      salt:       { cat: "salt", cur: "#saltCurrent", tgt: "#saltTarget", unit: "g/L" }
    };
    if (map[param]) {
      var m = map[param];
      var inc = n(q(m.tgt) && q(m.tgt).value) - n(q(m.cur) && q(m.cur).value);
      if (inc <= 0) return { title: "Pas d'ajout", text: "La valeur est déjà au niveau cible ou au-dessus." };
      p = selectedProduct(m.cat);
      if (!p) return missing(m.cat);
      x = amountFor(p, volume, inc);
      if (!Number.isFinite(x)) return missing(m.cat);
      return {
        title: amountText(x, unitOf(p)),
        text: p.name + " (" + CATS[m.cat].name + ") · Augmentation souhaitée : +" + f(inc, m.unit === "g/L" ? 1 : 0) + " " + m.unit + ". Base de calcul : " + describe(p) + ". " + instr(param)
      };
    }
    var cat2 = PARAM_CATS[param][0];
    p = selectedProduct(cat2);
    if (!p) return missing(cat2);
    x = amountFor(p, volume, 0);
    if (!Number.isFinite(x)) return missing(cat2);
    text = p.name + " (" + CATS[cat2].name + ") · Base de calcul : " + describe(p) + ". ";
    if (cat2 === "chlore" && p.stabilized) text += "Attention : un chlore choc stabilisé augmente le taux de stabilisant. ";
    text += instr(param, { product: p.unit === "pastilles" && p.mode !== "conc" ? "tabs" : "" });
    return { title: amountText(x, unitOf(p)), text: text };
  }

  /* Ligne de dose pour le plan de traitement (null = garder Bati Azur) */
  function planLine(cat, volume, need) {
    if (!isCustom()) return null;
    var p = selectedProduct(cat);
    if (!p) return null;
    if (cat === "ph_plus" || cat === "ph_minus") {
      var st = Math.ceil((need - 0.0001) / 0.2);
      var per = amountFor(p, volume, 0.2);
      if (!Number.isFinite(per)) return null;
      return p.name + " : " + amountText(per * st, unitOf(p)) + " total, " + st + " apport" + (st > 1 ? "s" : "") + " de 0,2 — dose/apport : " + amountText(per, unitOf(p));
    }
    var x = amountFor(p, volume, need);
    if (!Number.isFinite(x)) return null;
    return p.name + " : " + amountText(x, unitOf(p)) + " (+" + f(need, 0) + " " + CATS[cat].effect + ")";
  }

  /* ── Mode Bati Azur / Mes produits ───────────────────── */
  function isCustom() { return data.prefs.mode === "custom"; }
  function setMode(mode) {
    data.prefs.mode = mode === "custom" ? "custom" : "batiazur";
    persist();
    renderModeSwitch();
    if (typeof renderParamFields === "function") renderParamFields();
    if (typeof setResult === "function") setResult("doseResult", "En attente", "Renseigne le volume et les valeurs, puis appuie sur Calculer le dosage.");
  }

  function renderModeSwitch() {
    var box = q("#productModeBox");
    if (!box) return;
    var custom = isCustom();
    box.innerHTML =
      '<div class="segmented" role="tablist">' +
        '<button type="button" class="seg' + (custom ? "" : " active") + '" data-mode="batiazur">Produits Bati Azur</button>' +
        '<button type="button" class="seg' + (custom ? " active" : "") + '" data-mode="custom">Mes produits</button>' +
      '</div>' +
      '<p class="note" style="padding-bottom:12px!important;">' + (custom
        ? "Dosages calculés avec vos produits (" + data.products.length + " enregistré" + (data.products.length > 1 ? "s" : "") + "). <a href=\"#\" data-open-products>Gérer mes produits</a>"
        : "Dosages calibrés pour les produits vendus chez Bati Azur.") + '</p>';
    qa("[data-mode]", box).forEach(function(b) {
      b.addEventListener("click", function() { tap(b); setMode(b.dataset.mode); });
    });
    var link = q("[data-open-products]", box);
    if (link) link.addEventListener("click", function(e) { e.preventDefault(); openSpace("products"); });
  }

  /* Ajoute le choix du produit dans le formulaire du paramètre courant */
  function decorateParamFields(param, root) {
    if (!root || !isCustom() || !PARAM_CATS[param]) return;
    if (param === "shock") {
      /* Les choix « non stabilisé / stabilisé · Chlorite / Ritocal… » sont propres aux produits Bati Azur */
      root.innerHTML = "";
    }
    if (param === "brome" || param === "metals") root.innerHTML = "";
    var html = '<div class="product-pick">';
    PARAM_CATS[param].forEach(function(cat) {
      var list = productsOf(cat);
      var sel = selectedProduct(cat);
      html += '<label class="field"><span>' + esc(CATS[cat].name) + '</span>';
      if (list.length) {
        html += '<select data-select-cat="' + cat + '">' + list.map(function(p) {
          return '<option value="' + esc(p.id) + '"' + (sel && sel.id === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>";
        }).join("") + "</select>";
      } else {
        html += '<button type="button" class="link-btn" data-add-cat="' + cat + '">+ Ajouter</button>';
      }
      html += "</label>";
    });
    html += "</div>";
    root.insertAdjacentHTML("afterbegin", html);
    qa("[data-select-cat]", root).forEach(function(s) {
      s.addEventListener("change", function() {
        data.prefs.selected[s.dataset.selectCat] = s.value;
        persist();
      });
    });
    qa("[data-add-cat]", root).forEach(function(b) {
      b.addEventListener("click", function() { tap(b); openSpace("products", { cat: b.dataset.addCat }); });
    });
  }

  /* ── Bassins dans Dosage / Volume / Accueil ─────────── */
  function renderPoolPicker() {
    var box = q("#poolPicker");
    if (!box) return;
    if (!data.pools.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var active = data.prefs.activePool;
    box.innerHTML = '<div class="chip-row" style="padding-top:12px;">' + data.pools.map(function(p) {
      return '<button type="button" class="chip' + (p.id === active ? " active" : "") + '" data-pool="' + esc(p.id) + '">' + esc(p.name) + " · " + f(p.volume, 1) + " m³</button>";
    }).join("") + "</div>";
    qa("[data-pool]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        var p = data.pools.find(function(x) { return x.id === b.dataset.pool; });
        if (!p) return;
        tap(b);
        data.prefs.activePool = p.id;
        persist();
        if (typeof state !== "undefined") state.lastVolume = p.volume;
        try { localStorage.setItem("batiAzurAnalyseVolume", String(p.volume.toFixed(1))); } catch (e) {}
        var input = q("#doseVolume");
        if (input) input.value = p.volume.toFixed(1);
        renderPoolPicker();
      });
    });
  }

  function renderSavePoolBox() {
    var box = q("#savePoolBox");
    if (!box) return;
    var vol = typeof state !== "undefined" ? state.lastVolume : 0;
    if (!(vol > 0)) { box.innerHTML = ""; return; }
    var active = data.pools.find(function(p) { return p.id === data.prefs.activePool; });
    box.innerHTML =
      '<div class="form-grid" style="margin-top:12px;"><label class="field"><span>Nom du bassin</span>' +
      '<input id="savePoolName" type="text" maxlength="60" placeholder="Ex. Piscine maison" value="' + esc(active ? active.name : "") + '"></label></div>' +
      '<button type="button" class="secondary-btn" id="savePoolBtn">Enregistrer ce bassin (' + f(vol, 1) + " m³)</button>";
    q("#savePoolBtn").addEventListener("click", function(e) {
      tap(e.currentTarget);
      var p = savePool(q("#savePoolName").value, vol);
      if (p) {
        var btn = q("#savePoolBtn");
        if (btn) { btn.classList.add("is-done"); btn.textContent = "Bassin « " + p.name + " » enregistré"; }
      }
    });
  }

  function renderHomeSpace() {
    var el = q("#homeSpaceText");
    if (!el) return;
    var who = token() ? "Connecté : " + esc(email()) : "Sans compte — données sur cet appareil";
    var ap = data.pools.find(function(p) { return p.id === data.prefs.activePool; });
    var hv = q("#homeVolumeText");
    if (hv && ap) hv.textContent = ap.name + " · " + f(ap.volume, 1) + " m³";
    el.innerHTML = who + "<br>" + data.pools.length + " bassin" + (data.pools.length > 1 ? "s" : "") + " · " + data.products.length + " produit" + (data.products.length > 1 ? "s" : "") + " · mode " + (isCustom() ? "Mes produits" : "Produits Bati Azur");
  }

  /* ── Page Mon espace ─────────────────────────────────── */
  var authView = "login";   // login | signup | reset | resetCode
  var resetEmail = "";
  var editor = null;        // produit en cours d'édition

  function msg(id, text, ok) {
    var el = q("#" + id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "form-msg" + (text ? (ok ? " ok" : " ko") : "");
    if (text && !ok) el.setAttribute("role", "alert"); else el.removeAttribute("role");
  }
  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = !!on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Patientez…"; }
    else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  function renderSyncState() {
    var el = q("#syncState");
    if (!el) return;
    var t = { pending: "Modifications en attente…", saving: "Enregistrement…", ok: "Synchronisé", error: "Hors ligne — sera synchronisé plus tard" }[syncState] || "Synchronisé";
    el.textContent = t;
    el.className = "sync-state " + (syncState || "ok");
  }

  function renderAccount() {
    var box = q("#accountBox");
    if (!box) return;
    renderHomeSpace();
    if (api.available === null) { box.innerHTML = '<p class="space-p">Vérification…</p>'; return; }
    if (!api.available) {
      box.innerHTML = '<p class="space-p">Les comptes en ligne ne sont pas disponibles sur cette adresse. Vos bassins et produits restent enregistrés sur cet appareil.</p>';
      return;
    }
    if (token()) {
      box.innerHTML =
        '<div class="contact-block"><span>Compte</span><strong>' + esc(email()) + '</strong></div>' +
        '<div class="contact-block" style="border-bottom:none;"><span>Sauvegarde</span><strong id="syncState" class="sync-state ok">Synchronisé</strong></div>' +
        '<button type="button" class="secondary-btn" id="btnLogout">Se déconnecter</button>' +
        '<details class="space-details"><summary>Mot de passe et suppression du compte</summary>' +
          '<div class="form-grid"><label class="field"><span>Mot de passe actuel</span><input id="pwCurrent" type="password" autocomplete="current-password"></label>' +
          '<label class="field"><span>Nouveau</span><input id="pwNew" type="password" autocomplete="new-password" placeholder="8 caractères min."></label></div>' +
          '<button type="button" class="secondary-btn" id="btnPw">Changer le mot de passe</button>' +
          '<p class="form-msg" id="pwMsg"></p>' +
          '<button type="button" class="danger-btn" id="btnDelete">Supprimer mon compte</button>' +
          '<p class="note">Supprime définitivement le compte et les données enregistrées en ligne (mot de passe actuel demandé ci-dessus). Les données restent sur cet appareil.</p>' +
        '</details>';
      renderSyncState();
      q("#btnLogout").addEventListener("click", function(e) {
        tap(e.currentTarget);
        call("logout", "POST").catch(function() {}).then(function() { setSession(null); renderAccount(); });
      });
      q("#btnPw").addEventListener("click", function(e) {
        var btn = e.currentTarget; tap(btn); busy(btn, true);
        call("password", "POST", { current: q("#pwCurrent").value, password: q("#pwNew").value })
          .then(function(j) { if (j && j.token) setSession(j.token, email()); msg("pwMsg", "Mot de passe modifié. Vos autres appareils ont été déconnectés.", true); q("#pwCurrent").value = ""; q("#pwNew").value = ""; })
          .catch(function(err) { msg("pwMsg", err.message); })
          .then(function() { busy(btn, false); });
      });
      q("#btnDelete").addEventListener("click", function(e) {
        var btn = e.currentTarget; tap(btn);
        var pw = q("#pwCurrent").value;
        if (!pw) { msg("pwMsg", "Saisissez votre mot de passe actuel pour confirmer la suppression."); return; }
        if (!window.confirm("Supprimer définitivement votre compte BatiAzur Analyse ?")) return;
        busy(btn, true);
        call("account", "DELETE", { password: pw })
          .then(function() { setSession(null); renderAccount(); })
          .catch(function(err) { msg("pwMsg", err.message); busy(btn, false); });
      });
      return;
    }

    var html = "";
    if (authView === "login" || authView === "signup") {
      var signup = authView === "signup";
      html =
        '<div class="segmented" style="margin:14px 16px 4px;">' +
          '<button type="button" class="seg' + (signup ? "" : " active") + '" data-auth="login">Se connecter</button>' +
          '<button type="button" class="seg' + (signup ? " active" : "") + '" data-auth="signup">Créer un compte</button>' +
        '</div>' +
        '<form id="authForm" class="form-grid" autocomplete="on">' +
          '<label class="field"><span>E-mail</span><input id="authEmail" type="email" inputmode="email" autocomplete="username" placeholder="vous@exemple.fr" value="' + esc(resetEmail) + '" required></label>' +
          '<label class="field"><span>Mot de passe</span><input id="authPassword" type="password" autocomplete="' + (signup ? "new-password" : "current-password") + '" placeholder="' + (signup ? "8 caractères min." : "") + '" required></label>' +
          '<button type="submit" class="primary-btn" id="authSubmit" style="margin-bottom:4px;">' + (signup ? "Créer mon compte" : "Se connecter") + '</button>' +
        '</form>' +
        '<p class="form-msg" id="authMsg"></p>' +
        (signup
          ? '<p class="note">Vos bassins et produits déjà saisis sur cet appareil seront ajoutés au compte. Données utilisées uniquement pour l\'application, jamais revendues.</p>'
          : '<button type="button" class="link-btn block" data-auth="reset">Mot de passe oublié ?</button>');
    } else if (authView === "reset") {
      html =
        '<p class="space-p">Recevez un code par e-mail pour choisir un nouveau mot de passe.</p>' +
        '<form id="resetForm" class="form-grid"><label class="field"><span>E-mail</span><input id="resetEmailIn" type="email" inputmode="email" autocomplete="username" value="' + esc(resetEmail) + '" required></label>' +
        '<button type="submit" class="primary-btn" id="resetSubmit" style="margin-bottom:4px;">Recevoir un code</button></form>' +
        '<p class="form-msg" id="authMsg"></p>' +
        '<button type="button" class="link-btn block" data-auth="login">Retour à la connexion</button>';
    } else {
      html =
        '<p class="space-p">Si un compte existe pour <strong>' + esc(resetEmail) + '</strong>, un code à 6 chiffres vient d\'être envoyé (pensez aux indésirables).</p>' +
        '<form id="resetCodeForm" class="form-grid">' +
          '<label class="field"><span>Code reçu</span><input id="resetCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>' +
          '<label class="field"><span>Nouveau mot de passe</span><input id="resetPw" type="password" autocomplete="new-password" placeholder="8 caractères min." required></label>' +
          '<button type="submit" class="primary-btn" id="resetCodeSubmit" style="margin-bottom:4px;">Valider</button></form>' +
        '<p class="form-msg" id="authMsg"></p>' +
        '<button type="button" class="link-btn block" data-auth="reset">Renvoyer un code</button>';
    }
    box.innerHTML = html;

    qa("[data-auth]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        tap(b);
        var e = q("#authEmail") || q("#resetEmailIn");
        if (e && e.value) resetEmail = e.value.trim();
        authView = b.dataset.auth;
        renderAccount();
      });
    });

    var authForm = q("#authForm");
    if (authForm) authForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = q("#authSubmit"); busy(btn, true); msg("authMsg", "");
      var mail = q("#authEmail").value.trim();
      var body = { email: mail, password: q("#authPassword").value };
      if (authView === "signup") body.data = data;
      call(authView === "signup" ? "signup" : "login", "POST", body)
        .then(function(j) {
          setSession(j.token, j.user.email);
          resetEmail = "";
          return pullAndMerge(j.user);
        })
        .then(function() { renderAccount(); })
        .catch(function(err) { msg("authMsg", err.message); busy(btn, false); });
    });

    var resetForm = q("#resetForm");
    if (resetForm) resetForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = q("#resetSubmit"); busy(btn, true); msg("authMsg", "");
      resetEmail = q("#resetEmailIn").value.trim();
      call("reset/request", "POST", { email: resetEmail })
        .then(function() { authView = "resetCode"; renderAccount(); })
        .catch(function(err) { msg("authMsg", err.message); busy(btn, false); });
    });

    var codeForm = q("#resetCodeForm");
    if (codeForm) codeForm.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = q("#resetCodeSubmit"); busy(btn, true); msg("authMsg", "");
      call("reset/confirm", "POST", { email: resetEmail, code: q("#resetCode").value, password: q("#resetPw").value })
        .then(function(j) { setSession(j.token, j.user.email); authView = "login"; return pullAndMerge(j.user); })
        .then(function() { renderAccount(); })
        .catch(function(err) { msg("authMsg", err.message); busy(btn, false); });
    });
  }

  function renderPoolsList() {
    var box = q("#poolsList");
    if (!box) return;
    var html = "";
    if (!data.pools.length) {
      html += '<p class="space-p">Aucun bassin enregistré. Calculez un volume dans l\'onglet Volume puis « Enregistrer ce bassin », ou ajoutez-le ici.</p>';
    } else {
      html += data.pools.map(function(p) {
        return '<div class="space-row"><div><strong>' + esc(p.name) + "</strong><small>" + f(p.volume, 1) + ' m³</small></div>' +
          '<button type="button" class="row-del" data-del-pool="' + esc(p.id) + '" aria-label="Supprimer le bassin ' + esc(p.name) + '">Supprimer</button></div>';
      }).join("");
    }
    html +=
      '<details class="space-details"' + (data.pools.length ? "" : " open") + '><summary>Ajouter un bassin</summary>' +
        '<div class="form-grid"><label class="field"><span>Nom</span><input id="newPoolName" type="text" maxlength="60" placeholder="Ex. Piscine maison"></label>' +
        '<label class="field"><span>Volume (m³)</span><input id="newPoolVol" type="number" inputmode="decimal" step="0.1" placeholder="48"></label></div>' +
        '<button type="button" class="secondary-btn" id="newPoolBtn">Enregistrer</button><p class="form-msg" id="poolMsg"></p>' +
      "</details>";
    box.innerHTML = html;
    qa("[data-del-pool]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        var p = data.pools.find(function(x) { return x.id === b.dataset.delPool; });
        if (p && window.confirm("Supprimer le bassin « " + p.name + " » ?")) deletePool(p.id);
      });
    });
    q("#newPoolBtn").addEventListener("click", function(e) {
      tap(e.currentTarget);
      if (!savePool(q("#newPoolName").value, q("#newPoolVol").value)) msg("poolMsg", "Indiquez un volume en m³.");
    });
  }

  function renderProductsList() {
    var box = q("#productsList");
    if (!box) return;
    if (editor) { renderEditor(box); return; }
    var html = "";
    if (!data.products.length) {
      html += '<p class="space-p">Aucun produit. Ajoutez les produits que vous utilisez : la dose indiquée sur l\'étiquette suffit (ex. « 100 g pour 10 m³ font baisser le pH de 0,1 »).</p>';
    }
    CAT_ORDER.forEach(function(cat) {
      var list = productsOf(cat);
      if (!list.length) return;
      html += '<p class="space-cat">' + esc(CATS[cat].name) + "</p>";
      html += list.map(function(p) {
        return '<div class="space-row"><div><strong>' + esc(p.name) + "</strong><small>" + esc(describe(p)) + "</small></div>" +
          '<div class="row-actions"><button type="button" class="row-edit" data-edit-prod="' + esc(p.id) + '" aria-label="Modifier ' + esc(p.name) + '">Modifier</button>' +
          '<button type="button" class="row-del" data-del-prod="' + esc(p.id) + '" aria-label="Supprimer ' + esc(p.name) + '">Supprimer</button></div></div>';
      }).join("");
    });
    html += '<button type="button" class="primary-btn" id="addProductBtn" style="margin-bottom:16px;">Ajouter un produit</button>';
    box.innerHTML = html;
    qa("[data-edit-prod]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        var p = data.products.find(function(x) { return x.id === b.dataset.editProd; });
        if (p) { tap(b); editor = Object.assign({}, p); renderProductsList(); }
      });
    });
    qa("[data-del-prod]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        var p = data.products.find(function(x) { return x.id === b.dataset.delProd; });
        if (p && window.confirm("Supprimer le produit « " + p.name + " » ?")) deleteProduct(p.id);
      });
    });
    q("#addProductBtn").addEventListener("click", function(e) { tap(e.currentTarget); startEditor("ph_minus"); editor.generic = true; renderProductsList(); });
  }

  function startEditor(cat) {
    var c = CATS[cat] || CATS.ph_minus;
    editor = { id: null, cat: cat, name: "", mode: "label", qty: "", unit: c.def.unit, per: c.def.per, eff: c.effect ? c.def.eff : "", conc: "", target: c.conc && c.conc.target || "", stabilized: false };
    renderProductsList();
  }

  function readEditor() {
    if (!editor) return;
    var g = function(id) { var el = q("#" + id); return el ? el.value : ""; };
    editor.name = g("pName");
    editor.qty = g("pQty"); editor.unit = g("pUnit") || editor.unit;
    editor.per = g("pPer"); editor.eff = g("pEff");
    editor.conc = g("pConc"); editor.target = g("pTarget");
    var st = q("#pStab"); if (st) editor.stabilized = st.checked;
  }

  function renderEditor(box) {
    var e = editor, c = CATS[e.cat];
    var concMode = e.mode === "conc" && c.conc;
    var html = '<p class="space-cat">' + (e.id ? "Modifier le produit" : "Nouveau produit") + "</p>";
    html += '<div class="chip-row">' + CAT_ORDER.map(function(cat) {
      return '<button type="button" class="chip' + (cat === e.cat ? " active" : "") + '" data-ecat="' + cat + '">' + esc(CATS[cat].name) + "</button>";
    }).join("") + "</div>";
    html += '<div class="scan-box">' +
      '<label class="secondary-btn scan-btn" for="labelPhoto">' + icon("camera") + ' Photographier l\'étiquette</label>' +
      '<input id="labelPhoto" type="file" accept="image/*" capture="environment" class="visually-hidden">' +
      '<p class="scan-tip">' + esc(TIPS[e.cat] || "") + ' La lecture se fait sur votre téléphone : la photo n\'est envoyée nulle part.</p>' +
      (e.scan ? '<p class="form-msg ' + (e.scan.ok ? "ok" : "ko") + '" role="status">' + esc(e.scan.msg) + '</p>' +
        (e.scan.text ? '<details class="space-details scan-text"><summary>Texte lu sur l\'étiquette</summary><pre>' + esc(e.scan.text.slice(0, 1500)) + '</pre></details>' : "") : '<p class="form-msg" id="scanMsg" role="status"></p>') +
      '</div>';
    html += '<div class="form-grid"><label class="field"><span>Nom du produit</span><input id="pName" type="text" maxlength="60" placeholder="Ex. ' + esc(c.name) + ' marque X" value="' + esc(e.name) + '"></label></div>';
    if (c.conc) {
      html += '<div class="segmented" style="margin:12px 16px 0;">' +
        '<button type="button" class="seg' + (concMode ? "" : " active") + '" data-emode="label">Dose de l\'étiquette</button>' +
        '<button type="button" class="seg' + (concMode ? " active" : "") + '" data-emode="conc">Concentration</button></div>';
    }
    if (concMode) {
      html += '<div class="form-grid">' +
        '<label class="field"><span>Concentration (%)</span><input id="pConc" type="number" inputmode="decimal" step="0.1" placeholder="Ex. 65" value="' + esc(e.conc) + '"></label>' +
        (c.effect ? "" : '<label class="field"><span>Dose de choc visée (mg/L)</span><input id="pTarget" type="number" inputmode="decimal" step="0.5" value="' + esc(e.target || c.conc.target) + '"></label>') +
        '</div><p class="note">% de ' + esc(c.conc.what) + " indiqué sur l'emballage. Le calcul part de la matière active pure" + (c.effect ? "." : " (chlore disponible) pour atteindre la dose visée.") + "</p>";
    } else {
      html += '<div class="form-grid">' +
        '<label class="field"><span>Quantité</span><input id="pQty" type="number" inputmode="decimal" step="any" placeholder="Ex. ' + c.def.qty + '" value="' + esc(e.qty) + '"></label>' +
        '<label class="field"><span>Unité</span><select id="pUnit">' + UNITS.map(function(u) { return '<option' + (u === e.unit ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></label>" +
        '<label class="field"><span>Pour (m³ d\'eau)</span><input id="pPer" type="number" inputmode="decimal" step="any" value="' + esc(e.per) + '"></label>' +
        (c.effect ? '<label class="field"><span>Pour ' + esc(c.effectWord.replace("faire ", "")) + " (" + c.effect + ')</span><input id="pEff" type="number" inputmode="decimal" step="any" value="' + esc(e.eff) + '"></label>' : "") +
        '</div><p class="note">Recopiez la dose de l\'étiquette' + (c.effect ? " : « quantité pour X m³ pour " + esc(c.effectWord) + " … »" : " : « quantité pour X m³ »") + ". Pour référence, Bati Azur : " + esc(amountText(c.def.qty, c.def.unit)) + " pour " + c.def.per + " m³" + (c.effect ? " → " + String(c.def.eff).replace(".", ",") + " " + c.effect : "") + ".</p>";
    }
    if (e.cat === "chlore") {
      html += '<label class="field check-field"><span>Chlore stabilisé</span><input id="pStab" type="checkbox"' + (e.stabilized ? " checked" : "") + "></label>";
    }
    html += '<p class="form-msg" id="prodMsg"></p>' +
      '<button type="button" class="primary-btn" id="saveProdBtn">Enregistrer le produit</button>' +
      '<button type="button" class="secondary-btn" id="cancelProdBtn" style="margin-bottom:16px;">Annuler</button>';
    box.innerHTML = html;

    qa("[data-ecat]", box).forEach(function(b) {
      b.addEventListener("click", function() {
        tap(b); readEditor();
        var keepName = editor.name, keepId = editor.id;
        startEditor(b.dataset.ecat);
        editor.name = keepName; editor.id = keepId;
        renderProductsList();
      });
    });
    qa("[data-emode]", box).forEach(function(b) {
      b.addEventListener("click", function() { tap(b); readEditor(); editor.mode = b.dataset.emode; renderProductsList(); });
    });
    var photo = q("#labelPhoto");
    if (photo) photo.addEventListener("change", function() {
      var file = photo.files && photo.files[0];
      if (!file || !window.LabelReader) return;
      readEditor();
      var status = q("#scanMsg") || q(".scan-box .form-msg");
      var lbl = q(".scan-btn");
      if (lbl) lbl.classList.add("is-busy");
      var say = function(t) { if (status) { status.className = "form-msg"; status.textContent = t; } };
      say("Lecture de l'étiquette… (la première fois, téléchargement du module ~5 Mo)");
      LabelReader.read(file, editor.generic ? null : editor.cat, function(st, pr) {
        say("Lecture de l'étiquette… " + Math.round((pr || 0) * 100) + " %");
      }).then(function(r) {
        if (!editor) return;
        if (editor.generic && r.cat && r.cat !== editor.cat) {
          var keep = { name: editor.name, id: editor.id };
          startEditor(r.cat);
          editor.name = keep.name; editor.id = keep.id;
        }
        var cc = CATS[editor.cat], found = [];
        if (r.qty > 0 && r.per > 0) {
          editor.mode = "label";
          editor.qty = r.qty; editor.unit = r.unit; editor.per = r.per;
          found.push(amountText(r.qty, r.unit) + " pour " + f(r.per, 1) + " m³");
          if (cc.effect && r.eff > 0) { editor.eff = r.eff; found.push("effet " + String(r.eff).replace(".", ",") + " " + cc.effect); }
        } else if (r.conc > 0 && cc.conc) {
          editor.mode = "conc"; editor.conc = r.conc;
          found.push(f(r.conc, 1) + " % de " + cc.conc.what);
        }
        editor.scan = found.length
          ? { ok: true, msg: "Lu sur l'étiquette (" + cc.name + ") : " + found.join(", ") + ". Vérifiez ces valeurs avant d'enregistrer." + (cc.effect && editor.mode === "label" && !(r.eff > 0) ? " L'effet n'a pas été trouvé : complétez-le." : ""), text: r.text }
          : { ok: false, msg: "Aucune dose reconnue. Reprenez la photo de près, à plat et bien éclairée, ou saisissez la dose à la main.", text: r.text };
        editor.generic = false;
        renderProductsList();
      }).catch(function(err) {
        say(err && err.message ? err.message : "Lecture impossible.");
      }).then(function() { if (lbl) lbl.classList.remove("is-busy"); });
    });
    q("#cancelProdBtn").addEventListener("click", function(ev) { tap(ev.currentTarget); editor = null; renderProductsList(); });
    q("#saveProdBtn").addEventListener("click", function(ev) {
      tap(ev.currentTarget); readEditor();
      var p = editor, cc = CATS[p.cat];
      if (!String(p.name).trim()) return msg("prodMsg", "Donnez un nom au produit.");
      if (p.mode === "conc" && cc.conc) {
        if (!(n(p.conc) > 0 && n(p.conc) <= 100)) return msg("prodMsg", "Concentration entre 0 et 100 %.");
        if (!cc.effect && !(n(p.target) > 0)) return msg("prodMsg", "Indiquez la dose de choc visée.");
      } else {
        p.mode = "label";
        if (!(n(p.qty) > 0)) return msg("prodMsg", "Indiquez la quantité de l'étiquette.");
        if (!(n(p.per) > 0)) return msg("prodMsg", "Indiquez le volume d'eau (m³).");
        if (cc.effect && !(n(p.eff) > 0)) return msg("prodMsg", "Indiquez l'effet obtenu (" + cc.effect + ").");
      }
      var clean = {
        id: p.id || uid(), cat: p.cat, name: String(p.name).trim().slice(0, 60), mode: p.mode,
        qty: n(p.qty), unit: p.unit, per: n(p.per), eff: n(p.eff), conc: n(p.conc), target: n(p.target),
        stabilized: !!p.stabilized, updatedAt: now()
      };
      var idx = data.products.findIndex(function(x) { return x.id === clean.id; });
      if (idx >= 0) { clean.createdAt = data.products[idx].createdAt; data.products[idx] = clean; }
      else { clean.createdAt = now(); data.products.push(clean); }
      data.prefs.selected[clean.cat] = clean.id;
      editor = null;
      persist();
      refreshAll();
    });
  }

  function refreshAll() {
    renderModeSwitch();
    renderPoolPicker();
    renderPoolsList();
    renderProductsList();
    renderHomeSpace();
    renderSavePoolBox();
    if (typeof state !== "undefined" && state.page === "dosage" && typeof renderParamFields === "function") renderParamFields();
  }

  function openSpace(section, opts) {
    if (typeof showPage === "function") showPage("compte");
    if (section === "products" && opts && opts.cat) startEditor(opts.cat);
    setTimeout(function() {
      var el = q(section === "products" ? "#productsSection" : "#accountSection");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  function init() {
    refreshAll();
    renderAccount();
    checkApi().then(function() {
      if (token() && api.available) {
        call("me").then(function(j) { return pullAndMerge(j.user); }).catch(function() {});
      }
    });
    window.addEventListener("online", function() { if (syncState === "error") scheduleSync(); });
  }

  window.BA = {
    init: init,
    isCustom: isCustom,
    customDose: customDose,
    planLine: planLine,
    decorateParamFields: decorateParamFields,
    renderSavePoolBox: renderSavePoolBox,
    renderPoolPicker: renderPoolPicker,
    openSpace: openSpace,
    /* exposés pour les tests */
    _amountFor: amountFor,
    _merge: merge,
    _data: function() { return data; }
  };
})();
