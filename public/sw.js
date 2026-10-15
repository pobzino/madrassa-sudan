// Amal School Service Worker — Offline Support
const CACHE_NAME = 'amal-sw-v2';
const STATIC_CACHE = 'amal-static-v2';
const PAGE_CACHE = 'amal-pages-v2';
const SIM_AUDIO_CACHE = 'sim-audio-downloads';
const OFFLINE_URL = '/offline';
const PUBLIC_PAGE_PATHS = new Set(['/', '/sample-lesson', '/privacy', '/terms', OFFLINE_URL]);

// Install — pre-cache offline fallback page, and take over straight away so
// new handlers (like lesson reminders) work without closing every tab first.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
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

  // Never put personalized React Server Component payloads in a shared cache.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') return;

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

  // 3. Explicit offline audio copies are safe to cache. Signed/private storage
  // responses stay network-only and are copied here only by the download manager.
  if (url.pathname.startsWith('/offline-audio/')) {
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

  if (url.pathname.includes('/storage/')) return;

  // 4. API routes — network-only
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 5. Public navigation requests may be cached. Authenticated pages are always
  // network-only so one family cannot see another account's cached dashboard on
  // a shared device after logout.
  if (request.mode === 'navigate') {
    if (!PUBLIC_PAGE_PATHS.has(url.pathname)) {
      event.respondWith(
        fetch(request).catch(() =>
          caches.open(PAGE_CACHE).then((cache) =>
            cache.match(OFFLINE_URL).then((cached) =>
              cached || new Response('Offline', { status: 503 })
            )
          )
        )
      );
      return;
    }

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

// Lesson reminders — show the notification and put a dot on the app icon.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const lang = data.lang === 'ar' ? 'ar' : 'en';
  const shown = self.registration.showNotification(data.title || 'Amal School', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag,
    // A large picture under the text, where supported (Android).
    image: typeof data.image === 'string' && data.image.startsWith('/') ? data.image : undefined,
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    data: { url: data.url || '/dashboard' },
  });
  const badged = self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => undefined) : Promise.resolve();
  event.waitUntil(Promise.all([shown, badged]));
});

// Tapping a reminder opens Amal on the right page, reusing an open window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((client) => (client && 'navigate' in client ? client.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    })
  );
});
