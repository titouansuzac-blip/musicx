// Service worker — cache applicatif pour usage hors-ligne / installation PWA.
const CACHE = "pulse-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/css/styles.css",
  "./src/css/fonts.css",
  "./src/js/app.js",
  "./src/js/player.js",
  "./src/js/visualizer.js",
  "./src/js/library.js",
  "./src/js/ui.js",
  "./src/js/storage.js",
  "./src/js/launch.js",
  "./src/js/db.js",
  "./vendor/three.module.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/fonts/anton-latin-400-normal.woff2",
  "./assets/fonts/archivo-latin-800-normal.woff2",
  "./assets/fonts/archivo-latin-900-normal.woff2",
  "./assets/fonts/space-grotesk-latin-400-normal.woff2",
  "./assets/fonts/space-grotesk-latin-500-normal.woff2",
  "./assets/fonts/space-grotesk-latin-700-normal.woff2",
  "./assets/fonts/space-mono-latin-400-normal.woff2",
  "./assets/fonts/space-mono-latin-700-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  // blob: (fichiers importés) et données : pas de cache
  if (request.url.startsWith("blob:") || request.url.startsWith("data:")) return;

  // app shell (tout est local) : cache-first, repli réseau puis index
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
