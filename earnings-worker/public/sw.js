const CACHE_NAME = 'peg-sys-v1';
const urlsToCache = [
    '/',
    '/favicon.ico',
    '/js/client.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // Navigation preload response if supported (optional, sticking to simple cache-first or network-first)
    // For this app (dashboard), Network First is usually better for data, but Cache First for assets.
    // We'll use a simple Network First strategy for documents to ensure fresh data, 
    // but fall back to cache if offline.

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    return caches.match(event.request)
                        .then(response => {
                            if (response) return response;
                            // If the specific page isn't cached (e.g. /account), fallback to / (SPA pattern)
                            // return caches.match('/'); 
                        });
                })
        );
        return;
    }

    // For other resources (CSS, JS, Images), try cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});
