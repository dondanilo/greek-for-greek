const CACHE_NAME = 'greek-app-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.js',
  './manifest.json'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Don't skipWaiting here — page will send SKIP_WAITING when ready
});

// Page tells us to take over (triggers controllerchange → page reloads)
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// Activate: delete old caches and claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Push notifications
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || 'IziGreek';
  const options = {
    body: data.body || 'Время для греческого! 🇬🇷',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || 'https://cabinet.izigreek.com' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://cabinet.izigreek.com';
  event.waitUntil(clients.openWindow(url));
});

// Fetch: network-first for app files, cache fallback
self.addEventListener('fetch', event => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache with fresh response
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(event.request);
      })
  );
});
