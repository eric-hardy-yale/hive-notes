/* Offline: keep the app's own files on the phone. Weather always goes to the network. */
const CACHE = "hive-notes-v8";
const FILES = ["./", "index.html", "app.css", "theme.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "js/data.js", "js/rules.js", "js/ui.js", "js/yard.js", "js/colony.js", "js/visit.js", "js/plan.js", "js/learn.js", "js/biz.js", "js/more.js", "js/ai.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Field test: opening the app while the free server was asleep showed the host's "waking up" page instead of
// the app. Only a response that is really the app replaces the saved copy; anything else falls back to it.
async function isApp(req, r) {
  if (!r || !r.ok) return false;
  const ct = r.headers.get("content-type") || "", path = new URL(req.url).pathname;
  if (req.mode === "navigate" || path.endsWith("/") || path.endsWith(".html")) return ct.includes("html") && (await r.clone().text()).includes("APP_VERSION");
  return !ct.includes("text/html");
}
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;   // weather, geocoding and AI: straight to the network
  // Network first (so updates arrive), but give up after 3 s on weak signal or a sleeping server and use the saved copy
  e.respondWith((async () => {
    const saved = await caches.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: "no-cache" }).then(async r => {
      if (await isApp(e.request, r)) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }
      if (saved) throw new Error("not the app");
      return r;
    });
    if (!saved) return net;
    return Promise.race([net.catch(() => saved), new Promise(res => setTimeout(() => res(saved), 3000))]);
  })());
});
