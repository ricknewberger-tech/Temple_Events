const CACHE_NAME = 'nsc-v2';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/event.html',
    '/members.html',
    '/past-events.html',
    '/admin.html',
    '/css/styles.css',
    '/js/config.js',
    '/js/utils.js',
    '/js/airtable.js',
    '/js/events.js',
    '/js/event-detail.js',
    '/js/members.js',
    '/js/past-events.js',
    '/js/admin.js',
    '/favicon.svg',
    '/manifest.json'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Only handle http/https requests
    if (!request.url.startsWith('http')) return;

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // API calls - network only (don't cache dynamic data)
    if (request.url.includes('/api/')) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache when offline
                return caches.match(request);
            })
    );
});
