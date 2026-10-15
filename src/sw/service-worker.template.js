// Amal School service worker — offline lessons, app shell and lesson reminders.
//
// Served at /sw.js by src/app/sw.js/route.ts, which stamps the build version
// into VERSION below. Every deploy therefore ships new worker bytes, installs
// a fresh worker and gets its own shell and static caches. This file runs in
// the browser exactly as written: no imports, no build step.
//
// The cache names, database name and routes mirror src/lib/offline/cache-names.ts.
// Change both together (src/lib/__tests__/service-worker.test.ts checks them).

const VERSION = '__AMAL_VERSION__';

// Versioned caches: the /offline and /offline/play shells plus the public
// pages, and the build files. Neither holds personal data.
const SHELL_CACHE_PREFIX = 'amal-shell-';
const STATIC_CACHE_PREFIX = 'amal-static-';
const SHELL_CACHE = SHELL_CACHE_PREFIX + VERSION;
const STATIC_CACHE = STATIC_CACHE_PREFIX + VERSION;
// Remembers { current, previous } worker versions. Activate keeps the previous
// build's files so tabs still open on it can lazy-load their chunks.
const SW_META_CACHE = 'amal-sw-meta';
const SW_VERSIONS_KEY = '/__amal-sw/versions';
// Account caches, written by the download manager and deleted by logout. The
// worker only reads them: it never creates, fills or deletes them.
const AUDIO_CACHE = 'sim-audio-downloads';
const ASSET_CACHE = 'amal-lesson-assets';
const OFFLINE_AUDIO_PREFIX = '/offline-audio/';
// The v1 worker's caches. amal-sw-v2 also held Supabase JSON (personal data).
const LEGACY_SW_CACHES = ['amal-sw-v2', 'amal-static-v2', 'amal-pages-v2'];
const LEGACY_STATIC_CACHE = 'amal-static-v2';

const OFFLINE_DB_NAME = 'amal-offline';
const LESSONS_STORE = 'lessons';
const META_STORE = 'meta';
const OWNER_META_KEY = 'owner';

const OFFLINE_HUB_PATH = '/offline';
const OFFLINE_PLAYER_PATH = '/offline/play';
const SHELL_PATHS = [OFFLINE_HUB_PATH, OFFLINE_PLAYER_PATH];
const PUBLIC_PAGE_PATHS = ['/', '/privacy', '/terms'];

// Weak signal ("lie-fi") can leave a request hanging for a minute; after this
// long, a navigation falls back to the offline pages instead.
const NAVIGATION_TIMEOUT_MS = 4000;
// Other GETs keep waiting for the network, but a cached copy wins after this.
const CACHED_COPY_AFTER_MS = 4000;
const DB_TIMEOUT_MS = 1500;
// After a failed navigation, the offline shells open from the cache straight
// away for a while, so hub → player doesn't wait out the timeout again.
const RECENTLY_OFFLINE_MS = 60000;
const MAX_PRECACHE_FILES = 300;
const PRECACHE_CONCURRENCY = 6;

// Build files a shell refers to, including escaped URLs inside the inline
// flight data. The lookahead stops `.js` matching the start of `.json`.
const STATIC_ASSET_PATTERN = /\/_next\/static\/[^"'\s\\)<>]+?\.(?:js|css|woff2|woff|ttf)(?![\w-])/g;
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;
const FONT_PATH_PATTERN = /\.(?:woff2|woff|ttf)$/;
// Chunks a build file loads on demand (the activity widgets, the sync code),
// which Turbopack names as literal "static/chunks/<file>" strings. The HTML
// never lists them, so without this a widget first opened offline can't load.
const LAZY_CHUNK_PATTERN = /static\/chunks\/[A-Za-z0-9._~/-]+?\.(?:js|css)(?![\w-])/g;

let lastNavigationFailureAt = 0;

function noop() {}

function absoluteUrl(path) {
  return new URL(path, self.location.origin).href;
}

function redirectTo(path) {
  return Response.redirect(absoluteUrl(path), 302);
}

function offlinePlayerUrl(lessonId) {
  return OFFLINE_PLAYER_PATH + '?id=' + encodeURIComponent(lessonId);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// ── What a request is ────────────────────────────────────────────────────────

// React Server Component payloads are per user and per router state: never cache them.
function isRscRequest(request, url) {
  return (
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    url.pathname.endsWith('.rsc')
  );
}

function normalizePath(pathname) {
  if (pathname.length <= 1) return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function lessonIdFromPath(path) {
  const match = /^\/lessons\/([^/]+)$/.exec(path);
  if (!match) return null;
  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

function classifyNavigation(pathname) {
  const path = normalizePath(pathname);
  if (SHELL_PATHS.includes(path)) return { kind: 'shell', key: path };
  if (PUBLIC_PAGE_PATHS.includes(path)) return { kind: 'public', key: path };
  // Sign-in callbacks set the session cookie: never cut them short.
  if (path === '/auth' || path.startsWith('/auth/')) return { kind: 'auth' };
  const lessonId = lessonIdFromPath(path);
  if (lessonId) return { kind: 'lesson', id: lessonId };
  return { kind: 'other' };
}

function contentType(response) {
  return (response.headers.get('Content-Type') || '').toLowerCase();
}

// Constructed responses are 'default'; anything opaque or redirected is out.
function isPlainResponse(response) {
  return (
    Boolean(response) &&
    response.status === 200 &&
    !response.redirected &&
    (response.type === 'basic' || response.type === 'default')
  );
}

// A shell must be the real page: the proxy redirects some requests to the
// login page, and Safari refuses redirected responses for navigations.
function isShellResponse(response) {
  return isPlainResponse(response) && contentType(response).includes('text/html');
}

// Static cache: build files, icons and fonts. Never HTML (pages can be
// personal) and never something the server marked private.
function isCacheableAsset(response) {
  if (!isPlainResponse(response)) return false;
  if (contentType(response).includes('text/html')) return false;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cacheControl.includes('no-store') && !cacheControl.includes('private');
}

// ── Cache helpers ────────────────────────────────────────────────────────────

function putInCache(cacheName, key, response) {
  return caches
    .open(cacheName)
    .then((cache) => cache.put(key, response))
    .catch(noop);
}

// Reading with `cacheName` never creates the cache, so an account cache that
// logout deleted stays deleted.
function matchInCache(cacheName, request, options) {
  return caches
    .match(request, Object.assign({ cacheName }, options))
    .catch(() => undefined);
}

function matchAnyCache(request, options) {
  return caches.match(request, options).catch(() => undefined);
}

async function matchShell(path) {
  const options = { ignoreSearch: true, ignoreVary: true };
  // This build's copy first: CacheStorage searches older caches first.
  return (
    (await matchInCache(SHELL_CACHE, path, options)) ||
    (await matchAnyCache(path, options)) ||
    null
  );
}

function extractStaticAssetUrls(html) {
  const unescaped = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const urls = new Set(unescaped.match(STATIC_ASSET_PATTERN) || []);
  return Array.from(urls).slice(0, MAX_PRECACHE_FILES);
}

// Font files a stylesheet loads (`url(../media/x.woff2)`), as same-origin paths.
function extractCssFontUrls(css, cssPath) {
  const base = absoluteUrl(cssPath);
  const paths = new Set();
  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    let resolved;
    try {
      resolved = new URL(match[2], base);
    } catch {
      continue;
    }
    if (resolved.origin !== self.location.origin) continue;
    if (!resolved.pathname.startsWith('/_next/static/')) continue;
    if (FONT_PATH_PATTERN.test(resolved.pathname)) paths.add(resolved.pathname);
  }
  return Array.from(paths);
}

// On-demand chunks a build file refers to, as same-origin paths.
function extractLazyChunkUrls(js) {
  const paths = new Set();
  for (const match of js.matchAll(LAZY_CHUNK_PATTERN)) paths.add('/_next/' + match[0]);
  return Array.from(paths);
}

// ── Install: cache this build's offline shells and their build files ─────────

async function fetchShell(path) {
  const response = await fetch(new Request(path, { cache: 'reload', credentials: 'same-origin' }));
  if (!isShellResponse(response)) {
    throw new Error('Offline shell ' + path + ' could not be cached (' + response.status + ')');
  }
  return { path, response, html: await response.clone().text() };
}

// From this build's cache, an older cache (build files are content-hashed, so
// a copy is identical), or the network.
async function precacheFile(staticCache, path) {
  const existing = await staticCache.match(path);
  if (existing) return existing;
  const older = await matchAnyCache(path, { ignoreSearch: true, ignoreVary: true });
  if (older && older.ok) {
    await staticCache.put(path, older.clone());
    return older;
  }
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!isCacheableAsset(response)) {
    throw new Error('Build file ' + path + ' could not be cached (' + response.status + ')');
  }
  await staticCache.put(path, response.clone());
  return response;
}

async function precacheStaticFiles(paths) {
  const staticCache = await caches.open(STATIC_CACHE);
  const required = new Set(paths);
  const queue = Array.from(required);
  const seen = new Set(queue);

  const enqueue = (discovered) => {
    for (const found of discovered) {
      if (seen.has(found) || seen.size >= MAX_PRECACHE_FILES) continue;
      seen.add(found);
      queue.push(found);
    }
  };

  // The queue grows while it runs: each stylesheet adds the fonts it loads
  // and each script the chunks it loads on demand, so step by the batch
  // actually taken, not the batch size.
  for (let index = 0; index < queue.length; ) {
    const batch = queue.slice(index, index + PRECACHE_CONCURRENCY);
    index += batch.length;
    await Promise.all(
      batch.map(async (path) => {
        let response;
        try {
          response = await precacheFile(staticCache, path);
        } catch (error) {
          // Files reached only through another file are optional: fonts fall
          // back to the system font, and a widget that can't load shows
          // "Continue" (warm.ts also loads them while online). Everything a
          // shell lists is required.
          if (required.has(path)) throw error;
          return;
        }
        if (path.endsWith('.css')) {
          enqueue(extractCssFontUrls(await response.clone().text(), path));
        } else if (path.endsWith('.js')) {
          enqueue(extractLazyChunkUrls(await response.clone().text()));
        }
      })
    );
  }
}

async function precacheShells() {
  const shells = await Promise.all(SHELL_PATHS.map(fetchShell));
  await precacheStaticFiles(extractStaticAssetUrls(shells.map((shell) => shell.html).join('\n')));
  // Shells last, so a shell is never cached without its build files.
  const shellCache = await caches.open(SHELL_CACHE);
  await Promise.all(shells.map((shell) => shellCache.put(shell.path, shell.response)));
}

// Install — cache the offline shells and everything they load, then take over
// straight away so new handlers (like lesson reminders) work without closing
// every tab first. If any of it fails, install fails and the browser retries.
self.addEventListener('install', (event) => {
  event.waitUntil(precacheShells().then(() => self.skipWaiting()));
});

// ── Activate: keep this build and the previous one, drop the rest ────────────

async function readVersions() {
  try {
    const cache = await caches.open(SW_META_CACHE);
    const response = await cache.match(SW_VERSIONS_KEY);
    if (!response) return null;
    const data = await response.json();
    return data && typeof data.current === 'string' ? data : null;
  } catch {
    return null;
  }
}

async function recordActiveVersion() {
  const stored = await readVersions();
  const versions =
    stored && stored.current === VERSION
      ? { current: VERSION, previous: typeof stored.previous === 'string' ? stored.previous : null }
      : { current: VERSION, previous: stored ? stored.current : null };
  const cache = await caches.open(SW_META_CACHE);
  await cache.put(
    SW_VERSIONS_KEY,
    new Response(JSON.stringify(versions), { headers: { 'Content-Type': 'application/json' } })
  );
  return versions;
}

// Only this worker's own versioned caches and the v1 caches are ever deleted;
// account caches, the meta cache and unknown caches are left alone.
function cachesToDelete(names, versions) {
  const keep = new Set();
  for (const version of [versions.current, versions.previous]) {
    if (!version) continue;
    keep.add(SHELL_CACHE_PREFIX + version);
    keep.add(STATIC_CACHE_PREFIX + version);
  }
  return names.filter((name) => {
    // The v1 static cache stands in for "the previous build" until there is a
    // real one, so tabs still on the v1 build keep their cached chunks.
    if (name === LEGACY_STATIC_CACHE) return Boolean(versions.previous);
    if (LEGACY_SW_CACHES.includes(name)) return true;
    if (name.startsWith(SHELL_CACHE_PREFIX) || name.startsWith(STATIC_CACHE_PREFIX)) {
      return !keep.has(name);
    }
    return false;
  });
}

async function pruneCaches() {
  const versions = await recordActiveVersion();
  const names = await caches.keys();
  await Promise.all(cachesToDelete(names, versions).map((name) => caches.delete(name)));
}

// Activate — prune old caches, claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    pruneCaches()
      .catch(noop)
      .then(() => self.clients.claim())
  );
});

// ── Is a lesson downloaded? (read-only IndexedDB check) ──────────────────────

function ownsLesson(lesson, owner) {
  return Boolean(
    lesson && owner && typeof owner.userId === 'string' && lesson.ownerId === owner.userId
  );
}

// 'yes' | 'no' | 'unknown'. Mirrors the player's rule: a lesson counts only if
// its record belongs to the owner on this phone. Never creates or upgrades the
// database: db.ts owns its schema, and an empty database made here would be
// opened later without its stores.
function lessonDownloadState(lessonId) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      resolve('unknown');
      return;
    }

    let settled = false;
    let db = null;
    let timer = null;
    const closeDb = () => {
      if (!db) return;
      try {
        db.close();
      } catch {
        // Already closed.
      }
      db = null;
    };
    const finish = (state) => {
      // Close straight after the read: an open connection would block
      // logout's deleteDatabase.
      closeDb();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(state);
    };
    timer = setTimeout(() => finish('unknown'), DB_TIMEOUT_MS);

    let request;
    try {
      // No version: opens the database as it is, never upgrades it.
      request = indexedDB.open(OFFLINE_DB_NAME);
    } catch {
      finish('unknown');
      return;
    }

    // Fires only when the database doesn't exist yet. Aborting the upgrade
    // means it is never created.
    request.onupgradeneeded = () => {
      try {
        request.transaction.abort();
      } catch {
        // Nothing to abort.
      }
      finish('no');
    };
    request.onerror = (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      finish('unknown');
    };
    request.onblocked = () => finish('unknown');
    request.onsuccess = () => {
      db = request.result;
      if (settled) {
        closeDb();
        return;
      }
      // Logout is deleting the database: let go at once.
      db.onversionchange = () => finish('unknown');

      // An old or broken database without these stores has no owned lessons.
      const names = db.objectStoreNames;
      if (!names.contains(LESSONS_STORE) || !names.contains(META_STORE)) {
        finish('no');
        return;
      }

      try {
        const tx = db.transaction([LESSONS_STORE, META_STORE], 'readonly');
        const lessonRequest = tx.objectStore(LESSONS_STORE).get(lessonId);
        const ownerRequest = tx.objectStore(META_STORE).get(OWNER_META_KEY);
        tx.oncomplete = () =>
          finish(ownsLesson(lessonRequest.result, ownerRequest.result) ? 'yes' : 'no');
        tx.onerror = () => finish('unknown');
        tx.onabort = () => finish('unknown');
      } catch {
        finish('unknown');
      }
    };
  });
}

async function isLessonDownloaded(lessonId) {
  let state;
  try {
    state = await lessonDownloadState(lessonId);
  } catch {
    state = 'unknown';
  }
  if (state !== 'unknown') return state === 'yes';
  // Couldn't read the database: the saved audio is the next best sign (any
  // version of it: each save stores it as /offline-audio/<id>?v=…).
  return Boolean(await matchInCache(AUDIO_CACHE, OFFLINE_AUDIO_PREFIX + lessonId, { ignoreSearch: true }));
}

// ── Offline responses ────────────────────────────────────────────────────────

function offlinePage() {
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Amal School · offline</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'padding:16px;box-sizing:border-box;background:#f6faf7;color:#1c2b22;text-align:center;' +
    'font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}' +
    'main{max-width:420px}h1{color:#007229;font-size:1.35rem;margin:0 0 8px}' +
    'p{margin:0 0 20px;line-height:1.6}' +
    'a{display:inline-block;padding:10px 20px;border-radius:999px;background:#007229;' +
    'color:#fff;text-decoration:none;font-weight:600}' +
    '@media (prefers-color-scheme:dark){body{background:#0f1712;color:#e4efe7}h1{color:#4cc27a}}' +
    '</style></head><body><main>' +
    "<h1>You're offline</h1><p>Connect to the internet and try again.</p>" +
    '<div lang="ar" dir="rtl"><h1>أنت غير متصل بالإنترنت</h1>' +
    '<p>اتصل بالإنترنت وحاول مرة أخرى.</p></div>' +
    '<a href="">Try again · حاول مرة أخرى</a>' +
    '</main></body></html>';
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function offlineNavigationResponse(route) {
  if (route.kind === 'shell' || route.kind === 'public') {
    const cached = await matchShell(route.key);
    if (cached) return cached;
  }

  if (
    route.kind === 'lesson' &&
    (await isLessonDownloaded(route.id)) &&
    (await matchShell(OFFLINE_PLAYER_PATH))
  ) {
    return redirectTo(offlinePlayerUrl(route.id));
  }

  // Everything else goes to the saved-lessons hub, as a real redirect so the
  // address bar (and the router) show /offline rather than the failed URL.
  if (!(route.kind === 'shell' && route.key === OFFLINE_HUB_PATH)) {
    if (await matchShell(OFFLINE_HUB_PATH)) return redirectTo(OFFLINE_HUB_PATH);
  }
  return offlinePage();
}

// ── Fetch strategies ─────────────────────────────────────────────────────────

// Cross-origin: only lesson images saved by a download, served by their
// original URL. Nothing cross-origin is ever written to a cache.
async function savedAssetOrNetwork(request) {
  const cached = await matchInCache(ASSET_CACHE, request, { ignoreVary: true, ignoreSearch: false });
  // An opaque copy can only answer a no-cors request (a plain <img>).
  if (cached && (cached.type !== 'opaque' || request.mode === 'no-cors')) return cached;
  return fetch(request);
}

// Build files are content-hashed, so any cached copy is the right one.
async function staticFromCacheOrNetwork(event, request) {
  const cached = await matchAnyCache(request, { ignoreSearch: true, ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheableAsset(response)) {
      event.waitUntil(putInCache(STATIC_CACHE, request, response.clone()));
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

// Saved audio only, never the network. The player plays it from a blob: URL;
// this route stays for older pages that point at it.
async function savedAudio(request) {
  const cached = await matchInCache(AUDIO_CACHE, request, { ignoreSearch: true, ignoreVary: true });
  return cached || new Response('', { status: 404, statusText: 'Not Found' });
}

// Network first, cached copy on failure, or once the network has taken
// CACHED_COPY_AFTER_MS. Without a cached copy it keeps waiting for the network.
function networkFirst(event, request, { cacheName, cacheKey, isCacheable }) {
  const network = fetch(request);
  event.waitUntil(
    network
      .then((response) =>
        isCacheable(response) ? putInCache(cacheName, cacheKey, response.clone()) : undefined
      )
      .catch(noop)
  );

  return new Promise((resolve) => {
    let done = false;
    const settle = (response) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(response);
    };
    const timer = setTimeout(() => {
      matchAnyCache(cacheKey, { ignoreVary: true }).then((cached) => {
        if (cached) settle(cached);
      });
    }, CACHED_COPY_AFTER_MS);
    network.then(settle, () =>
      matchAnyCache(cacheKey, { ignoreVary: true }).then((cached) =>
        settle(cached || new Response('', { status: 504, statusText: 'Offline' }))
      )
    );
  });
}

async function respondToNavigation(network, route) {
  if (route.kind === 'shell' && Date.now() - lastNavigationFailureAt < RECENTLY_OFFLINE_MS) {
    const cached = await matchShell(route.key);
    if (cached) return cached;
  }
  try {
    // Sign-in callbacks wait as long as the browser does.
    const response = await (route.kind === 'auth' ? network : withTimeout(network, NAVIGATION_TIMEOUT_MS));
    lastNavigationFailureAt = 0;
    return response;
  } catch {
    lastNavigationFailureAt = Date.now();
    return offlineNavigationResponse(route);
  }
}

function handleNavigation(event, request, url) {
  const route = classifyNavigation(url.pathname);
  const cacheKey = route.kind === 'shell' || route.kind === 'public' ? route.key : null;
  const network = fetch(request);
  // Keep the shell fresh, even when the answer arrives after the timeout.
  event.waitUntil(
    network
      .then((response) => {
        lastNavigationFailureAt = 0;
        if (cacheKey && isShellResponse(response)) {
          return putInCache(SHELL_CACHE, cacheKey, response.clone());
        }
        return undefined;
      })
      .catch(noop)
  );
  event.respondWith(respondToNavigation(network, route));
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // fetch() rejects these outside DevTools; let the browser handle them.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  // 1. Cross-origin (Supabase data, storage, CDNs): untouched, except lesson
  // images a download saved.
  if (url.origin !== self.location.origin) {
    if (request.destination === 'image') event.respondWith(savedAssetOrNetwork(request));
    return;
  }

  // 2. Personal or live: RSC payloads, API routes, and this script itself.
  if (isRscRequest(request, url)) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  // 3. Build files — cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticFromCacheOrNetwork(event, request));
    return;
  }

  // 4. Saved lesson audio — cache only.
  if (url.pathname.startsWith(OFFLINE_AUDIO_PREFIX)) {
    event.respondWith(savedAudio(request));
    return;
  }

  // 5. Page loads — network with a timeout, then the offline shells.
  if (request.mode === 'navigate') {
    handleNavigation(event, request, url);
    return;
  }

  // Media byte ranges and sign-in routes go straight to the network.
  if (request.headers.has('Range')) return;
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return;

  // 6. The offline shells fetched as plain GETs (the warm-up after a download)
  // refresh the shell cache.
  const shellPath = normalizePath(url.pathname);
  if (SHELL_PATHS.includes(shellPath)) {
    event.respondWith(
      networkFirst(event, request, {
        cacheName: SHELL_CACHE,
        cacheKey: shellPath,
        isCacheable: isShellResponse,
      })
    );
    return;
  }

  // 7. Everything else (icons, fonts, images) — network first, cached copy as
  // the fallback. Same-origin lesson images saved by a download are found here too.
  event.respondWith(
    networkFirst(event, request, {
      cacheName: STATIC_CACHE,
      cacheKey: request,
      isCacheable: isCacheableAsset,
    })
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
