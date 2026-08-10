// v=20260615-a — версия меняется при каждом деплое, заставляет браузер обновить SW
const VERSION = '20260809-b';
const CACHE = 'diary-' + VERSION;
const STATIC = [
  '/', '/index.html', '/manifest.json',
  '/css/tokens.css', '/css/layout.css', '/css/chat.css',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // API и динамика — всегда сеть
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Статика — сеть first, кеш как fallback (свежесть важнее offline)
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then(r => r || new Response('offline', { status: 503 })))
  );
});
