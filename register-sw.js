/* Enregistrement du service worker (mode hors ligne) */
if ("serviceWorker" in navigator) {
    /* Mémorise s'il y avait déjà un SW actif AVANT cette session */
    var swHadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(function(reg) { reg.update(); })
      .catch(function(e) { console.warn("SW:", e); });

    /* Rechargement uniquement si c'est une MISE À JOUR (pas la 1ère install) */
    navigator.serviceWorker.addEventListener("controllerchange", function() {
      if (swHadController) window.location.reload();
    });
  }
