// Service worker: aplikace se načte i bez internetu (data STIS si drží aplikace sama v IndexedDB).
// Verzi doplní build.sh – každé nasazení tak má vlastní mezipaměť a stará se smaže.
const VER = "__VER__";
const CACHE = "mystis-" + VER;
const SHELL = ["./", "index.html", "main.js?v=" + VER, "main.css?v=" + VER, "config.js?v=" + VER, "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png", "icons/apple-touch-icon.png", "icons/favicon.ico"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // vždy nejdřív síť (bez HTTP mezipaměti prohlížeče), bez sítě uložená kopie
  e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" })
    .then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((ca) => ca.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const data = e.notification.data;
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    // zavřená aplikace: otevřít s parametry notifikace v adrese (aplikace je po načtení přečte)
    if (!cs.length) return self.clients.openWindow(data ? "./?n=" + encodeURIComponent(JSON.stringify(data)) : "./");
    if (data) cs[0].postMessage({ type: "notification", data });
    return cs[0].focus();
  }));
});
