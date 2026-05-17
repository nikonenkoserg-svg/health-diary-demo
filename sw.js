const CACHE = 'diary-v18';
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
  '/js/assistant.js',
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
  // API calls — network only
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Static assets — cache first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
