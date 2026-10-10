const CACHE_NAME = 'hilom-pos-cache-v1';

// 1. Install Event - Cache your main files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll([
                './',
                './pos.html',
                './style.css',
                './pos-billing.js',
                './inventory.js',
                './rooms.js',
                './reports.js',
                './firebase-init.js',
                './hilom.png'
            ]);
        })
    );
});

// 2. Fetch Event - The fix for your error
self.addEventListener('fetch', event => {
    // Only intercept standard GET requests (ignore Firebase API calls)
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // If the file is in the cache, return it immediately
            if (cachedResponse) {
                return cachedResponse;
            }

            // If not in cache, try fetching from the live network
            return fetch(event.request).then(networkResponse => {
                return networkResponse;
            }).catch(error => {
                console.warn('Network fetch failed, serving fallback:', error);
                
                // CRITICAL FIX: If the network fails and it's not in the cache, 
                // we MUST return a constructed Response to prevent the TypeError crash.
                if (event.request.mode === 'navigate') {
                    // If they are trying to load a page, force load the cached pos.html
                    return caches.match('./pos.html');
                }
                
                // For missing images or scripts, return a generic blank response
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({ 'Content-Type': 'text/plain' })
                });
            });
        })
    );
});

// 3. Activate Event - Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});