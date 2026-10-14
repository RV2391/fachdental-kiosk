// Service Worker: cached Videos für Offline-Betrieb
const CACHE_NAME = "fachdental-kiosk-v8";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./qr-fachdental.png",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    // Alte Caches löschen (vorherige Versionen)
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Cache-First für alles im Cache, sonst Network und ablegen
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Nur erfolgreiche cross-origin Videos cachen
        if (res.ok && (e.request.url.endsWith(".mp4") || e.request.url.endsWith(".webm"))) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || Response.error());
    })
  );
});

// Explizites Video-Caching mit Progress-Report
self.addEventListener("message", async (e) => {
  if (e.data && e.data.type === "CACHE_VIDEOS") {
    const urls = e.data.urls;
    const cache = await caches.open(CACHE_NAME);
    let done = 0;
    const total = urls.length;

    // Report initial 0/N
    e.source.postMessage({ type: "CACHE_PROGRESS", done, total });

    for (const url of urls) {
      try {
        const existing = await cache.match(url);
        if (existing) {
          done++;
          e.source.postMessage({ type: "CACHE_PROGRESS", done, total });
          continue;
        }
        const resp = await fetch(url, { mode: "cors" });
        if (resp.ok) {
          await cache.put(url, resp.clone());
        }
      } catch (err) {
        console.log("Cache fail:", url, err);
      }
      done++;
      e.source.postMessage({ type: "CACHE_PROGRESS", done, total });
    }
  }
});
