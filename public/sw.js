// Amal School Service Worker — Offline Support
const CACHE_NAME = 'amal-sw-v2';
const STATIC_CACHE = 'amal-static-v2';
const PAGE_CACHE = 'amal-pages-v2';
const SIM_AUDIO_CACHE = 'sim-audio-downloads';
const OFFLINE_URL = '/offline';

// Install — pre-cache offline fallback page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL))
  );
});

// Activate — clean old caches, claim clients immediately
self.addEventListener('activate', (event) => {
  const KEEP = [CACHE_NAME, STATIC_CACHE, PAGE_CACHE, SIM_AUDIO_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http(s)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // 1. Static assets (/_next/static/) — cache-first (immutable hashed files)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cache.match(request).then((c) => c || new Response('', { status: 504 })));
        })
      )
    );
    return;
  }

  // 2. Other Next.js build assets (/_next/data/, /_next/image/) — network-first with cache fallback
  if (url.pathname.startsWith('/_next/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cache.match(request).then((c) => c || new Response('', { status: 504 })))
      )
    );
    return;
  }

  // 3. Sim audio / Supabase storage — cache-first
  if (url.pathname.startsWith('/offline-audio/') || url.pathname.includes('/storage/') || url.pathname.includes('/sim-audio/')) {
    event.respondWith(
      caches.open(SIM_AUDIO_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request);
        })
      )
    );
    return;
  }

  // 4. API routes — network-only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 5. Navigation requests — network-first, cache response, fallback to cached page then /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(PAGE_CACHE).then((cache) =>
        fetch(request).then((response) => {
          // Cache successful page loads for offline use
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() =>
          // Offline: try cached version of this page, then /offline fallback
          cache.match(request).then((cached) =>
            cached || cache.match(OFFLINE_URL).then((c) => c || new Response('Offline', { status: 503 }))
          )
        )
      )
    );
    return;
  }

  // 6. Everything else (fonts, images, etc.) — network-first with cache fallback
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cache.match(request).then((c) => c || new Response('', { status: 504 })))
    )
  );
});

// Message handler — SW updates
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
