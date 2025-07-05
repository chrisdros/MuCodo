const CACHE_NAME = 'countdown-timer-v14'; // Cache-Version erhöht
const urlsToCache = [
    '/',
    '/countdown',
    '/admin',
    '/static/index.html',
    '/static/countdown.html',
    '/static/admin.html',
    '/static/style.css',
    '/static/script.js',
    '/static/manifest.webmanifest',
    '/static/service-worker.js',
    '/static/config.json'
];

// Install event: cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch event: serve from cache, then network, and update cache
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname === '/api/config/upload' && event.request.method === 'POST') {
        return fetch(event.request);
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log('Serving from cache:', event.request.url);
                    return response;
                }
                console.log('Fetching from network:', event.request.url);
                return fetch(event.request)
                    .then(networkResponse => {
                        return caches.open(CACHE_NAME).then(cache => {
                            if (networkResponse.ok && event.request.method === 'GET' && !url.pathname.startsWith('/api/')) {
                                cache.put(event.request, networkResponse.clone());
                            }
                            return networkResponse;
                        });
                    })
                    .catch(() => {
                        console.log('Fetch failed, request:', event.request.url);
                    });
            })
    );
});