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
    fetch(e.request)
      .then((response) => {
        // Optional: dynamically cache successful fresh requests
        return response;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          // If found in cache, return it. Otherwise, return a safe fallback Response.
          if (cachedResponse) {
            return cachedResponse;
          }
          // Fallback response for un-cached assets/pages when offline
          if (e.request.headers.get('accept').includes('text/html')) {
            return caches.match('./booking.html'); // Fallback page
          }
          return new Response('Network unavailable and asset not cached.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});