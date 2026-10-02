self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('hilom-pwa-v1').then((cache) => {
      return cache.addAll([
        './index.html',
        './kitchen.html',
        './style.css',
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
    // Always try to fetch the newest version from the internet first
    fetch(e.request).catch(() => {
      // If the internet is down, fall back to the cached version
      return caches.match(e.request);
    })
  );
});