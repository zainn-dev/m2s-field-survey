// App-shell & static bundle cache only. Never caches /api/* responses or sensitive documents.
const SHELL = 'm2s-shell-v2';
const CORE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

const isStaticAsset = (url) =>
  url.origin === self.location.origin &&
  !url.pathname.startsWith('/api/') &&
  (url.pathname.startsWith('/assets/') || /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|webmanifest)$/.test(url.pathname));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (isStaticAsset(u) || e.request.mode === 'navigate')) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => undefined);
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)))
  );
});
