// Offline support: pages come from the network when possible (so updates arrive),
// everything else is served from the cache first and refreshed in the background.
const CACHE = 'builder-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === location.origin || FONT_HOSTS.includes(url.hostname);
  if (!cacheable) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // serve from the cache straight away, but refresh it in the background so replaced
  // files with fixed names (Nova's photos, icons) don't stay stale forever
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit && url.pathname.includes('/assets/')) return hit; // content-hashed: never changes
      const fresh = fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      });
      if (hit) fresh.catch(() => {});
      return hit ?? fresh;
    }),
  );
});
