const CACHE = 'diary-v38';
const ASSETS = [
  '/',
  '/index.html',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/chat.css',
  '/js/storage.js',
  '/js/theme.js',
  '/js/voice.js',
  '/knowledge/core-style.js',
  '/js/engine.js',
  '/js/chart.js',
  '/js/assistant.js',
  '/js/onboarding.js',
  '/js/chat.js',
  '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // API — только сеть
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Всё остальное — сеть первой, кеш только запасной для офлайна
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        // Обновляем кеш свежей версией
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
