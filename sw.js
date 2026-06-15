// Service worker — cache applicatif pour usage hors-ligne / installation PWA.
const CACHE = "pulse-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/css/styles.css",
  "./src/js/app.js",
  "./src/js/player.js",
  "./src/js/visualizer.js",
  "./src/js/library.js",
  "./src/js/ui.js",
  "./src/js/storage.js",
  "./src/js/launch.js",
  "./vendor/three.module.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
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

  // CDN three.js : stale-while-revalidate
  if (request.url.includes("unpkg.com") || request.url.includes("fonts.")) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request).then((res) => { cache.put(request, res.clone()); return res; }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // app shell : cache-first
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
