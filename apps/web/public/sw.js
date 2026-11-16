/* TinyMotion service worker: offline-first for the app shell, the models and the demo recordings. */
const VERSION = "tinymotion-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE_PAGES = ["/offline", "/live"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => Promise.all(PRECACHE_PAGES.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Model files (model.json, weights.bin) and the downloadable formats are versioned by folder.
const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  (url.pathname.startsWith("/models/") && /\/(model\.json|weights\.bin)$/.test(url.pathname)) ||
  url.pathname.startsWith("/demo/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(woff2|svg|png|jpg|webp)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isStatic(url)) {
    // Cache-first: versioned, immutable assets
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    // Network-first for pages, fall back to the cached copy, then the offline page
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          const hit = await cache.match(req);
          if (hit) return hit;
          return (await cache.match("/offline")) || Response.error();
        })
    );
  }
});
