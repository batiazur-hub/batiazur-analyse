/* ═══════════════════════════════════════════════════════
   BatiAzur Analyse — Guide de démarrage (première utilisation)
   Fenêtre accessible : rôle dialog, focus piégé, Échap pour fermer.
   ═══════════════════════════════════════════════════════ */
(function() {
  "use strict";
  var KEY = "batiazur_onboarded";

  var STEPS = [
    { icon: "sparkles", title: "Bienvenue dans BatiAzur Analyse",
      text: "En quelques gestes, calculez le volume de votre piscine et la bonne dose de produit après une analyse d'eau.",
      points: ["Gratuit, sans publicité", "Fonctionne aussi hors connexion une fois installée"] },
    { icon: "ruler-dimension-line", title: "1. Calculez votre volume",
      text: "Onglet Volume : choisissez la forme et le fond (plat, pente composée ou pointe de diamant), puis saisissez les dimensions.",
      points: ["Pente composée : longueur du plat, de la pente et de la partie basse", "Pointe de diamant : longueur de la plateforme et profondeur à la pointe", "Enregistrez le bassin pour ne plus le ressaisir"] },
    { icon: "test-tube", title: "2. Analysez votre eau",
      text: "Mesurez pH, TAC, chlore, stabilisant ou sel avec vos bandelettes ou votre trousse, ou faites analyser un échantillon chez Bati Azur.",
      points: ["pH idéal : 7,2", "TAC idéal : 150 ppm", "Stabilisant idéal : 30 ppm"] },
    { icon: "droplet", title: "3. Calculez la dose",
      text: "Onglet Dosage : choisissez le paramètre à corriger, saisissez la valeur mesurée et obtenez la quantité exacte, avec le mode d'emploi.",
      points: ["« Produits Bati Azur » : doses calibrées pour nos produits", "« Mes produits » : doses calculées avec vos propres produits", "Plan de traitement : l'ordre des corrections"] },
    { icon: "camera", title: "4. Vos produits, en photo",
      text: "Dans Espace › Mes produits, photographiez l'étiquette : l'app lit la dose (ex. « 100 g pour 10 m³ ») et vous la fait vérifier.",
      points: ["La lecture se fait sur votre téléphone", "Vous pouvez aussi saisir la dose à la main"] },
    { icon: "user-round", title: "5. Retrouvez tout partout",
      text: "Sans compte, vos bassins et produits restent sur ce téléphone. Créez un compte gratuit pour les retrouver sur tous vos appareils.",
      points: ["Une question ? L'onglet Assistant répond aux problèmes courants", "Bati Azur : 04 70 34 21 96"] }
  ];

  var overlay = null, idx = 0, lastFocus = null;

  function ic(name) {
    return typeof icon === "function" ? icon(name) : "";
  }

  function render() {
    var st = STEPS[idx], last = idx === STEPS.length - 1;
    overlay.querySelector(".ob-body").innerHTML =
      '<div class="ob-icon">' + ic(st.icon) + "</div>" +
      '<h2 id="obTitle" tabindex="-1">' + st.title + "</h2>" +
      '<p class="ob-text">' + st.text + "</p>" +
      "<ul class=\"ob-points\">" + st.points.map(function(p) { return "<li>" + ic("check") + "<span>" + p + "</span></li>"; }).join("") + "</ul>";
    overlay.querySelector(".ob-dots").innerHTML = STEPS.map(function(_, i) {
      return '<span class="ob-dot' + (i === idx ? " active" : "") + '"></span>';
    }).join("");
    overlay.querySelector(".ob-progress").textContent = "Étape " + (idx + 1) + " sur " + STEPS.length;
    var prev = overlay.querySelector("[data-ob=prev]");
    prev.disabled = idx === 0;
    prev.style.visibility = idx === 0 ? "hidden" : "visible";
    overlay.querySelector("[data-ob=next]").textContent = last ? "C'est parti" : "Suivant";
    var t = overlay.querySelector("#obTitle");
    if (t) t.focus({ preventScroll: true });
  }

  function close() {
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
    if (!overlay) return;
    overlay.classList.remove("open");
    var o = overlay; overlay = null;
    setTimeout(function() { o.remove(); }, 220);
    document.removeEventListener("keydown", onKey, true);
    var app = document.querySelector(".app");
    if (app) app.removeAttribute("aria-hidden");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (!overlay) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowRight") { go(1); return; }
    if (e.key === "ArrowLeft") { go(-1); return; }
    if (e.key === "Tab") {
      var f = Array.from(overlay.querySelectorAll("button:not([disabled]), [tabindex='-1']")).filter(function(el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  }

  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= STEPS.length) { close(); return; }
    idx = n;
    render();
  }

  function open() {
    if (overlay) return;
    idx = 0;
    lastFocus = document.activeElement;
    overlay = document.createElement("div");
    overlay.className = "ob-overlay";
    overlay.innerHTML =
      '<div class="ob-sheet" role="dialog" aria-modal="true" aria-labelledby="obTitle">' +
        '<button type="button" class="ob-skip" data-ob="skip">Passer</button>' +
        '<div class="ob-body" aria-live="polite"></div>' +
        '<p class="ob-progress visually-hidden"></p>' +
        '<div class="ob-dots" aria-hidden="true"></div>' +
        '<div class="ob-actions">' +
          '<button type="button" class="secondary-btn" data-ob="prev">Précédent</button>' +
          '<button type="button" class="primary-btn" data-ob="next">Suivant</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);
    var app = document.querySelector(".app");
    if (app) app.setAttribute("aria-hidden", "true");
    overlay.addEventListener("click", function(e) {
      var b = e.target.closest("[data-ob]");
      if (!b) return;
      if (b.dataset.ob === "skip") close();
      if (b.dataset.ob === "next") go(1);
      if (b.dataset.ob === "prev") go(-1);
    });
    /* Balayage gauche / droite */
    var x0 = null;
    overlay.addEventListener("touchstart", function(e) { x0 = e.touches[0].clientX; }, { passive: true });
    overlay.addEventListener("touchend", function(e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener("keydown", onKey, true);
    render();
    requestAnimationFrame(function() { if (overlay) overlay.classList.add("open"); });
  }

  function init() {
    ["openGuideHome", "openGuideSpace"].forEach(function(id) {
      var b = document.getElementById(id);
      if (b) b.addEventListener("click", open);
    });
    var seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch (e) { seen = true; }
    /* Première visite : après l'écran de lancement */
    if (!seen) setTimeout(open, 2300);
  }

  window.Onboarding = { open: open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
