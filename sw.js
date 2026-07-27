/* Daily Task Manager - service worker
 *
 * Offline strategy: the whole app is one HTML file, so the shell is simply
 * precached on install and served from cache first. Nothing is fetched at
 * runtime, so once installed the app works with no network at all.
 *
 * HOW TO SHIP AN UPDATE
 *   1. Change index.html (or any file in PRECACHE).
 *   2. Bump CACHE_VERSION below. This is the only thing that triggers an update.
 *   3. Upload. On the next visit the new worker installs, precaches the new
 *      files, activates, deletes the old cache, and tells any open page to
 *      show its "reload to update" bar.
 *
 * Keep CACHE_VERSION in step with APP_VERSION inside index.html.
 */
const CACHE_VERSION = "daily-task-manager-v2.4.0";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    /* The shell must succeed as a unit. If it does not, installation fails and
       the browser keeps the previous working service worker and cache. */
    const core = ["./", "./index.html", "./manifest.webmanifest"];
    await cache.addAll(core.map(url => new Request(url, { cache: "reload" })));

    /* Icons are useful but not allowed to invalidate an otherwise complete
       offline shell during an update. */
    const optional = PRECACHE.filter(url => !core.includes(url));
    await Promise.all(optional.map(url =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const stale = names.filter(n => n.startsWith("daily-task-manager-") && n !== CACHE_VERSION);
    await Promise.all(stale.map(n => caches.delete(n)));
    await self.clients.claim();
    /* Only announce real updates, never the very first install. */
    if (stale.length) {
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach(c => c.postMessage({ type: "updated", version: CACHE_VERSION }));
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* Page loads always resolve to the cached shell, so the app opens offline. */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("./index.html", { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetch(req); }
      catch (e) {
        return new Response("Daily Task Manager is offline and has not been installed yet.",
          { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  /* Everything else: cache first, network as a fallback, store what we fetch. */
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === "basic") {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return new Response("", { status: 504 });
    }
  })());
});
