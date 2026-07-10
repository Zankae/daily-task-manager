/* Service worker behaviour test. Run: node swtest.js
   Fakes just enough of the worker global scope to exercise install, activate,
   update notification, offline navigation, and cross-origin pass-through. */
let pass = 0, fail = 0;
function ok(c, m) { c ? pass++ : (fail++, console.log("FAIL: " + m)); }

/* ---- fake environment ---- */
class FakeResponse {
  constructor(body, init) { this.body = body; const i = init || {}; this.status = i.status || 200; this.ok = this.status < 400; this.type = i.type || "basic"; }
  clone() { const r = new FakeResponse(this.body, { status: this.status }); r.type = this.type; return r; }
}
class FakeRequest {
  constructor(url, init) { this.url = url; const i = init || {}; this.method = i.method || "GET"; this.mode = i.mode || "no-cors"; }
}
class FakeCache {
  constructor() { this.map = new Map(); }
  async add(req) {
    const url = typeof req === "string" ? req : req.url;
    if (network.missing.includes(url)) throw new Error("404");
    this.map.set(url, new FakeResponse("cached:" + url));
  }
  async addAll(reqs) {
    const urls = reqs.map(req => typeof req === "string" ? req : req.url);
    if (urls.some(url => network.missing.includes(url))) throw new Error("404");
    urls.forEach(url => this.map.set(url, new FakeResponse("cached:" + url)));
  }
  async put(req, res) { this.map.set(typeof req === "string" ? req : req.url, res); }
  async match(req, opts) { return this.map.get(typeof req === "string" ? req : req.url) || undefined; }
}
const cacheStore = new Map();
const network = { online: true, missing: [], hits: [] };

global.caches = {
  async open(name) { if (!cacheStore.has(name)) cacheStore.set(name, new FakeCache()); return cacheStore.get(name); },
  async keys() { return [...cacheStore.keys()]; },
  async delete(name) { return cacheStore.delete(name); },
  async match(req) {
    for (const c of cacheStore.values()) { const r = await c.match(req); if (r) return r; }
    return undefined;
  }
};
global.fetch = async req => {
  const url = typeof req === "string" ? req : req.url;
  network.hits.push(url);
  if (!network.online) throw new Error("offline");
  return new FakeResponse("network:" + url);
};
global.Response = FakeResponse;
global.Request = FakeRequest;
global.URL = require("url").URL;

const messages = [];
const handlers = {};
global.self = {
  location: { origin: "https://example.com" },
  addEventListener: (t, fn) => { handlers[t] = fn; },
  skipWaiting: async () => { self._skipped = true; },
  clients: {
    claim: async () => { self._claimed = true; },
    matchAll: async () => [{ postMessage: m => messages.push(m) }]
  }
};

require("./sw.js");

/* ---- helpers ---- */
async function fire(type, event) { await handlers[type](event); }
function evt() { let p; const e = { waitUntil: x => { p = x; }, respondWith: x => { p = x; } }; e._promise = () => p; return e; }

(async () => {
  /* --- first install --- */
  let e = evt(); await fire("install", e); await e._promise();
  ok(self._skipped === true, "install calls skipWaiting");
  const cacheName = [...cacheStore.keys()][0];
  ok(/^daily-task-manager-v/.test(cacheName), "versioned cache created");
  const c = cacheStore.get(cacheName);
  ok(c.map.has("./index.html") && c.map.has("./"), "app shell precached");
  ok(c.map.has("./icon-192.png"), "icons precached");

  e = evt(); await fire("activate", e); await e._promise();
  ok(self._claimed === true, "activate claims clients");
  ok(messages.length === 0, "first install does not announce an update");

  /* --- offline navigation serves the cached shell --- */
  network.online = false; network.hits = [];
  e = evt();
  e.request = new FakeRequest("https://example.com/", { mode: "navigate" });
  await fire("fetch", e);
  let res = await e._promise();
  ok(res && res.body === "cached:./index.html", "offline page load serves the cached shell");
  ok(network.hits.length === 0, "cached shell is served without touching the network");
  network.online = true;

  /* --- a missing precache entry does not break install --- */
  network.missing = ["./icon-512.png"];
  cacheStore.clear();
  e = evt(); await fire("install", e);
  let threw = false; try { await e._promise(); } catch (x) { threw = true; }
  ok(!threw, "one unreachable file does not fail the whole install");
  network.missing = [];

  /* --- a missing core shell file must abort the update --- */
  cacheStore.clear();
  network.missing = ["./index.html"];
  e = evt(); await fire("install", e);
  threw = false; try { await e._promise(); } catch (x) { threw = true; }
  ok(threw, "an unreachable core shell file aborts installation");
  network.missing = [];

  /* --- an update replaces the old cache and announces itself --- */
  cacheStore.set("daily-task-manager-v0.9.0", new FakeCache());
  cacheStore.set("some-other-app-cache", new FakeCache());
  messages.length = 0;
  e = evt(); await fire("activate", e); await e._promise();
  ok(!cacheStore.has("daily-task-manager-v0.9.0"), "stale Daily Task Manager cache deleted");
  ok(cacheStore.has("some-other-app-cache"), "unrelated caches on the origin are left alone");
  ok(messages.length === 1 && messages[0].type === "updated", "open pages are told an update landed");

  /* --- non-GET and cross-origin are ignored --- */
  e = evt();
  e.request = new FakeRequest("https://example.com/", { method: "POST", mode: "navigate" });
  await fire("fetch", e);
  ok(e._promise() === undefined, "POST requests are not intercepted");

  e = evt();
  e.request = new FakeRequest("https://cdn.other.com/x.js", { mode: "cors" });
  await fire("fetch", e);
  ok(e._promise() === undefined, "cross-origin requests are not intercepted");

  /* --- a fetched same-origin asset gets cached --- */
  e = evt();
  e.request = new FakeRequest("https://example.com/later.png", { mode: "cors" });
  await fire("fetch", e);
  res = await e._promise();
  ok(res.body === "network:https://example.com/later.png", "uncached asset comes from the network");
  ok(await caches.match(e.request), "and is stored for next time");

  /* --- message handler --- */
  self._skipped = false;
  await handlers["message"]({ data: { type: "skipWaiting" } });
  ok(self._skipped === true, "skipWaiting message honoured");

  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
