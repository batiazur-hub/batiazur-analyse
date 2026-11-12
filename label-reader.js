/* ═══════════════════════════════════════════════════════
   BatiAzur Analyse — Lecture d'étiquette produit
   ───────────────────────────────────────────────────────
   Reconnaissance de texte (OCR) faite sur l'appareil avec
   Tesseract.js (fichiers hébergés dans /vendor/tesseract,
   aucune image n'est envoyée sur Internet).
   Le texte lu est ensuite analysé pour trouver la dose :
   « 100 g pour 10 m³ … baisse le pH de 0,1 », « 65 % de chlore »…
   Les valeurs trouvées sont proposées, jamais enregistrées
   sans validation de l'utilisateur.
   ═══════════════════════════════════════════════════════ */
(function() {
  "use strict";

  var BASE = "./vendor/tesseract/";
  var workerPromise = null;

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      if (window.Tesseract) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error("Chargement du module de lecture impossible.")); };
      document.head.appendChild(s);
    });
  }

  var progressCb = null;
  function getWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = loadScript(BASE + "tesseract.min.js").then(function() {
      return window.Tesseract.createWorker("fra", 1, {
        workerPath: BASE + "worker.min.js",
        corePath: BASE,
        langPath: BASE.replace(/\/$/, ""),
        gzip: true,
        workerBlobURL: false,
        logger: function(m) { if (progressCb && m && typeof m.progress === "number") progressCb(m.status, m.progress); }
      });
    }).catch(function(e) { workerPromise = null; throw e; });
    return workerPromise;
  }

  /* Réduit et passe en niveaux de gris : lecture plus rapide et plus fiable */
  function prepareImage(file) {
    return new Promise(function(resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function() {
        var max = 2000, w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        var ctx = c.getContext("2d");
        ctx.filter = "grayscale(1) contrast(1.35)";
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = function() { URL.revokeObjectURL(url); reject(new Error("Image illisible. Essayez une photo JPEG ou PNG.")); };
      img.src = url;
    });
  }

  /* ── Analyse du texte ──────────────────────────────── */
  function toNum(s) { var x = parseFloat(String(s).replace(",", ".")); return Number.isFinite(x) ? x : 0; }

  function normalize(t) {
    return String(t || "")
      .replace(/\r/g, "")
      .replace(/m\s?[³3²](?![\d])/gi, "m3")       /* m³, m 3 */
      .replace(/m[éeè]tres?\s+cubes?/gi, "m3")
      .replace(/\bm\?\b/g, "m3")
      .replace(/[‘’]/g, "'")
      .replace(/[ \t]+/g, " ");
  }

  var UNIT_MAP = { kg: "kg", kilo: "kg", kilos: "kg", g: "g", gr: "g", gramme: "g", grammes: "g",
    ml: "mL", cl: "cL", l: "L", litre: "L", litres: "L", pastille: "pastilles", pastilles: "pastilles", galet: "pastilles", galets: "pastilles" };

  function detectCategory(t) {
    var s = t.toLowerCase();
    if (/s[ée]questrant|m[ée]taux|anti[- ]?calcaire|anti[- ]?tartre/.test(s)) return "metaux";
    if (/brome/.test(s)) return "brome";
    if (/ph\s*[-–]|ph\s*moins|ph\s*minus|r[ée]ducteur de ph|baisse(r)? (le )?ph|diminue(r)? (le )?ph/.test(s)) return "ph_minus";
    if (/ph\s*\+|ph\s*plus|r[ée]hausseur de ph|augmente(r)? (le )?ph|remonte(r)? (le )?ph|hausse (du )?ph/.test(s)) return "ph_plus";
    if (/tac\s*\+|alcalinit[ée]|tac plus|bicarbonate/.test(s)) return "tac";
    if (/stabilisant|acide cyanurique|cyanurique/.test(s)) return "stab";
    if (/chlore|hypochlorite|dichlor|chloration/.test(s)) return "chlore";
    if (/\bsel\b|chlorure de sodium|[ée]lectrolyse/.test(s)) return "salt";
    return null;
  }

  function parse(raw, cat) {
    var t = normalize(raw);
    var flat = t.replace(/\n/g, " ");
    var out = { text: raw, cat: detectCategory(flat) };
    cat = cat || out.cat;

    /* Dose : « 100 g pour 10 m3 », « 1 kg / 50 m3 », « 15 g par m3 » */
    var doseRe = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|grammes?|gr|g|ml|cl|litres?|l|pastilles?|galets?)\b\.?[^\d\n]{0,28}?(?:pour|par|\/|dans|tous les)\s*(\d+(?:[.,]\d+)?)?\s*m3/i;
    var m = flat.match(doseRe);
    if (m) {
      var u = UNIT_MAP[m[2].toLowerCase()] || m[2];
      var q = toNum(m[1]);
      if (u === "cL") { u = "mL"; q = q * 10; }
      out.qty = q; out.unit = u;
      out.per = m[3] ? toNum(m[3]) : 1;
      /* Effet cherché juste après la dose */
      var after = flat.slice(flat.indexOf(m[0]) + m[0].length, flat.indexOf(m[0]) + m[0].length + 140);
      var effPh = after.match(/(?:de|d')\s*(0[.,]\d{1,2}|1[.,]0)\s*(?:unit[ée]s?|pt|point|ph)?/i);
      var effPpm = after.match(/(\d+(?:[.,]\d+)?)\s*(?:ppm|mg\s*\/\s*l|°f)/i);
      var effGL = after.match(/(\d+(?:[.,]\d+)?)\s*g\s*\/\s*l/i);
      if ((cat === "ph_minus" || cat === "ph_plus") && effPh) out.eff = toNum(effPh[1]);
      else if ((cat === "tac" || cat === "stab") && effPpm) out.eff = toNum(effPpm[1]);
      else if (cat === "salt" && effGL) out.eff = toNum(effGL[1]);
    }

    /* Concentration : « 65 % de chlore disponible », « chlore actif : 56 % » */
    var concRe = /(\d{1,3}(?:[.,]\d+)?)\s*%[^\n%]{0,30}?(chlore|cyanurique|bicarbonate|hydrog[ée]nocarbonate|chlorure de sodium|nacl|actif|disponible|pur)/i;
    var concRe2 = /(chlore (?:actif|disponible)|acide cyanurique|bicarbonate|chlorure de sodium)[^\n\d]{0,20}(\d{1,3}(?:[.,]\d+)?)\s*%/i;
    var c1 = flat.match(concRe), c2 = flat.match(concRe2);
    var conc = c1 ? toNum(c1[1]) : (c2 ? toNum(c2[2]) : 0);
    if (conc > 0 && conc <= 100) out.conc = conc;
    return out;
  }

  function read(file, cat, onProgress) {
    progressCb = onProgress || null;
    if (onProgress) onProgress("Préparation", 0);
    return Promise.all([prepareImage(file), getWorker()]).then(function(r) {
      return r[1].recognize(r[0]);
    }).then(function(res) {
      progressCb = null;
      return parse(res && res.data ? res.data.text : "", cat);
    });
  }

  window.LabelReader = { read: read, parse: parse, detectCategory: detectCategory };
})();
