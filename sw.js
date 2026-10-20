self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('hilom-pwa-v2').then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './experience.html',
        './rooms.html',
        './booking.html',
        './contact.html',
        './kitchen.html',
        './public-style.css',
        './pos-style.css',
        './pos-billing.js',
        './inventory.js',
        './reports.js',
        './auth-nav.js',
        './firebase-init.js',
        './hilom.png'
      ]);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});