// Service worker: keeps a copy of the site so it works without internet, like in a gym with no Wi-Fi.
// It only ever saves the site's own files (and the Fredoka font), never anything about the person using it.
// Online, every request goes to the network first, so a new deploy shows up right away; the saved copy is used
// when the network fails or takes longer than NET_WAIT. Registered by saveForOffline() in js/library.js.

const CACHE = "hoops-v2";        // the site's files; change the name to throw the old copy away
const FONTS = "hoops-fonts-v1";  // Google Fonts' CSS and font files
const NET_WAIT = 4000;           // ms to wait for the network before using the saved copy

/* Saved when the worker installs, so the site works offline after the first visit.
   tests/offline.test.js checks that this lists every page, script and stylesheet. */
const SHELL = [
  "./", "index.html", "editor.html",
  "css/styles.css", "css/editor.css",
  "js/app.js", "js/court.js", "js/editor.js", "js/library.js", "js/playbook.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One file failing (say, a page that moved) shouldn't stop the rest from being saved
    await Promise.all(SHELL.map(url => cache.add(url).catch(() => {})));
    await savePlays(cache);
    await self.skipWaiting();
  })());
});

/* The plays: one bundle when the deploy made one, otherwise the separate files library.js falls back to */
async function savePlays(cache) {
  try { await cache.add("plays/bundle.json"); return; } catch { /* no bundle on this server */ }
  try {
    const ids = await (await fetch("plays/index.json")).json();
    await cache.add("plays/index.json");
    await Promise.all(["plays/paths.json", "plays/glossary.json", ...ids.map(id => `plays/${encodeURIComponent(id)}.json`)]
      .map(url => cache.add(url).catch(() => {})));
  } catch { /* nothing to save yet; the plays get saved as the page loads them */ }
}

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keep = [CACHE, FONTS];
    await Promise.all((await caches.keys()).filter(k => k.startsWith("hoops-") && !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin === self.location.origin) event.respondWith(networkFirst(req));
  else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") event.respondWith(savedFirst(req));
});

/* The network's answer when it comes in time (and save it), else the saved copy. A page that was never saved
   gets the saved home page, so the play list still opens offline; a play's share page (p/<id>/, from tools/share.js)
   goes straight to the play instead, since the home page's links wouldn't work from that folder. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  const res = await Promise.race([net, new Promise(ok => setTimeout(ok, NET_WAIT, null))]).catch(() => null);
  if (res) return res;
  const saved = await cache.match(req, { ignoreSearch: true });
  if (saved || req.mode !== "navigate") return saved || net;  // nothing saved: keep waiting for the network
  const play = new URL(req.url).pathname.match(/\/p\/([a-z0-9-]+)\/(index\.html)?$/);
  if (play) return new Response(`<!doctype html><meta charset="utf-8"><script>location.replace("../../#${play[1]}")</script>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  return await cache.match("./") || net;
}

/* Fonts never change, so use the saved copy when there is one */
async function savedFirst(req) {
  const cache = await caches.open(FONTS), saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone()).catch(() => {});
  return res;
}
