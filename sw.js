// KILL SWITCH — этот SW удаляет все кеши, отрегистрирует сам себя и
// форсированно перезагружает открытые вкладки. Включено 2026-06-09 чтобы
// гарантированно сбросить кеш chat.js / rag.js / core-style.js.
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try { client.navigate(client.url); } catch (_) {}
    }
  })());
});

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request).catch(() => new Response('offline', { status: 503 })));
});
