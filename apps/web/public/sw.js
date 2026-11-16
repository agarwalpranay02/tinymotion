/* TinyMotion service worker: offline-first for the app shell, the models and the demo recordings. */
const VERSION = "tinymotion-v2";
// Keep in step with MODEL_VERSION in src/lib/engine/version.ts (a unit test checks this).
const MODEL_DIR = "/models/2026.11/tinymotion-anywhere";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const PRECACHE_PAGES = ["/offline", "/live"];

/** Caches Live's page, the scripts and styles it loads, and the default model, so the installed app opens offline. */
async function precache() {
  const pages = await caches.open(PAGES);
  const stat = await caches.open(STATIC);
  await Promise.all(PRECACHE_PAGES.map((u) => pages.add(new Request(u, { cache: "reload" })).catch(() => {})));
  try {
    const html = await (await pages.match("/live"))?.text();
    const assets = [...new Set((html || "").match(/\/_next\/static\/[^"'\s)]+/g) || [])];
    await Promise.all([...assets, `${MODEL_DIR}/model.json`, `${MODEL_DIR}/weights.bin`].map((u) => stat.add(u).catch(() => {})));
  } catch {
    /* offline during install: pages are cached as they are visited instead */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
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
          const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
          if (hit) return hit;
          return (await cache.match("/offline")) || Response.error();
        })
    );
  }
});
