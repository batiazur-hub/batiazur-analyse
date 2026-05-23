/* ═══════════════════════════════════════════════════════
   BatiAzur Analyse — Service Worker
   Version: 8  ← incrémenter à chaque déploiement
   ═══════════════════════════════════════════════════════ */

const CACHE_NAME = "batiazur-v20";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=20",
  "./app.js?v=20",
  "./site.webmanifest",
  "./favicon.ico",
  "./favicon-16x16.png",
  "./favicon-32x32.png",
  "./apple-touch-icon.png",
  "./android-chrome-192x192.png",
  "./android-chrome-512x512.png"
];

/* ── Installation : mise en cache de l'app shell ───────── */
self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(APP_SHELL); })
      .then(function() { return self.skipWaiting(); }) /* activation immédiate */
  );
});

/* ── Activation : suppression des anciens caches ───────── */
self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME; })
          .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim(); /* prise de contrôle immédiate */
    })
  );
});

/* ── Fetch : stratégies par type de ressource ──────────── */
self.addEventListener("fetch", function(e) {
  var url = e.request.url;

  /* Google Places API → réseau uniquement (jamais en cache) */
  if (url.includes("places.googleapis.com")) return;

  /* actus.json → réseau d'abord, cache en secours */
  if (url.includes("actus.json")) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, copy); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  /* index.html → réseau d'abord (toujours la version la plus fraîche) */
  if (e.request.mode === "navigate" || url.endsWith("/") || url.endsWith("index.html")) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, copy); });
        return res;
      }).catch(function() {
        return caches.match("./index.html");
      })
    );
    return;
  }

  /* Tout le reste (CSS, JS, images) → cache d'abord */
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
