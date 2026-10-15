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
// The same for every visitor, so a cached copy can stand in offline.
const PUBLIC_PAGE_PATHS = ['/', '/privacy', '/terms', '/parents', '/sample-lesson'];

// Weak signal ("lie-fi") can leave a request hanging for a minute. A page load
// only gives up on the network when there is something useful to show
// instead: a downloaded lesson or a cached page after this long...
const NAVIGATION_TIMEOUT_MS = 4000;
// ...other app pages (the dashboard, Settings) after this long, and only when
// the hub has saved lessons to offer...
const APP_PAGE_TIMEOUT_MS = 8000;
// ...and a page opened from the hub or the player (the family asked to try
// the internet) after this long. Anything else waits as long as the browser does.
const RETRY_TIMEOUT_MS = 20000;
// An in-app tap on a downloaded lesson (the router's RSC request).
const RSC_TIMEOUT_MS = 6000;
// How long after that the router's fallback page load goes straight to the player.
const RSC_GAVE_UP_MS = 15000;
// Other GETs keep waiting for the network, but a cached copy wins after this.
const CACHED_COPY_AFTER_MS = 4000;
const DB_TIMEOUT_MS = 1500;
const MAX_PRECACHE_FILES = 300;
const PRECACHE_CONCURRENCY = 6;

// Build files a shell refers to, including escaped URLs inside the inline
// flight data. The lookahead stops `.js` matching the start of `.json`.
const STATIC_ASSET_PATTERN = /\/_next\/static\/[^"'\s\\)<>]+?\.(?:js|css|woff2|woff|ttf)(?![\w-])/g;
// Chunks a build file loads on demand (the activity widgets, the sync code),
// which Turbopack names as literal "static/chunks/<file>" strings. The HTML
// never lists them, so without this a widget first opened offline can't load.
const LAZY_CHUNK_PATTERN = /static\/chunks\/[A-Za-z0-9._~/-]+?\.(?:js|css)(?![\w-])/g;

// The on-demand chunks install found, still being cached after install.
let backgroundPrecache = null;
// A downloaded lesson whose in-app request was cut off: { id, at }.
let rscGaveUp = null;
const TIMED_OUT = new Error('timeout');

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

// The network's answer, however long it takes, unless it is still pending
// after `ms` and `giveUp()` then says an offline copy is worth showing: then
// it rejects with TIMED_OUT. The timer starts with the request and the check
// runs only once it fires, so a quick answer never waits on it. `ms` null
// means no time limit.
function networkUnlessSlow(network, ms, giveUp) {
  if (ms === null) return network;
  return new Promise((resolve, reject) => {
    let pending = true;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(giveUp)
        .catch(() => false)
        .then((yes) => {
          if (!yes || !pending) return;
          pending = false;
          reject(TIMED_OUT);
        });
    }, ms);
    network.then(
      (response) => {
        if (!pending) return;
        pending = false;
        clearTimeout(timer);
        resolve(response);
      },
      (error) => {
        if (!pending) return;
        pending = false;
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

// Caches `paths` and, as each script arrives, the chunks it loads on demand.
// With `required`, any of those failing throws; anything else is optional: a
// widget that can't load shows "Continue" (warm.ts also loads them online).
// Returns the on-demand chunks it found but didn't cache, when `followLazy` is off.
async function precacheStaticFiles(paths, { required = false, followLazy = true } = {}) {
  const staticCache = await caches.open(STATIC_CACHE);
  const queue = Array.from(new Set(paths)).slice(0, MAX_PRECACHE_FILES);
  const seen = new Set(queue);
  const found = new Set();

  const enqueue = (discovered) => {
    for (const path of discovered) {
      if (seen.has(path) || seen.size >= MAX_PRECACHE_FILES) continue;
      seen.add(path);
      if (followLazy) queue.push(path);
      else found.add(path);
    }
  };

  // The queue grows while it runs, so step by the batch actually taken, not
  // the batch size. Stylesheets aren't read: the fonts the pages need are
  // the ones the HTML preloads (Latin and Arabic), and the other subsets in
  // the CSS (Cyrillic, Greek, Vietnamese...) are never fetched online either.
  for (let index = 0; index < queue.length; ) {
    const batch = queue.slice(index, index + PRECACHE_CONCURRENCY);
    index += batch.length;
    await Promise.all(
      batch.map(async (path) => {
        let response;
        try {
          response = await precacheFile(staticCache, path);
        } catch (error) {
          if (required) throw error;
          return;
        }
        if (path.endsWith('.js')) enqueue(extractLazyChunkUrls(await response.clone().text()));
      })
    );
  }
  return Array.from(found);
}

// The shells and every build file they list, which install waits for. The
// chunks those load on demand come after, so the worker (and with it
// reminders, which need an active worker) is ready sooner on a slow link.
async function precacheShells() {
  const shells = await Promise.all(SHELL_PATHS.map(fetchShell));
  const lazyChunks = await precacheStaticFiles(
    extractStaticAssetUrls(shells.map((shell) => shell.html).join('\n')),
    { required: true, followLazy: false }
  );
  // Shells last, so a shell is never cached without its build files.
  const shellCache = await caches.open(SHELL_CACHE);
  await Promise.all(shells.map((shell) => shellCache.put(shell.path, shell.response)));
  return lazyChunks;
}

// Install — cache the offline shells and the files they list, then take over
// straight away so new handlers (like lesson reminders) work without closing
// every tab first. If any of it fails, install fails and the browser retries.
self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheShells().then((lazyChunks) => {
      // Not in activate's waitUntil either: page loads wait for activation.
      // Each fetch event keeps the worker alive until this is done.
      backgroundPrecache = precacheStaticFiles(lazyChunks)
        .catch(noop)
        .then(() => {
          backgroundPrecache = null;
        });
      return self.skipWaiting();
    })
  );
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

function isOwnerRecord(owner) {
  return Boolean(owner && typeof owner.userId === 'string');
}

function ownsLesson(lesson, owner) {
  return Boolean(lesson && isOwnerRecord(owner) && lesson.ownerId === owner.userId);
}

const NO_RECORDS = { owner: false, owned: false };

// 'unknown', or { owner, owned }: whether a family signed in on this phone
// (the owner record), and whether that owner saved `lessonId` (with no id:
// any lesson). Mirrors the player's rule: a lesson counts only if its record
// belongs to the owner on this phone. Never creates or upgrades the database:
// db.ts owns its schema, and an empty database made here would be opened
// later without its stores.
function readOfflineRecords(lessonId) {
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
      finish(NO_RECORDS);
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
        finish(NO_RECORDS);
        return;
      }

      try {
        const tx = db.transaction([LESSONS_STORE, META_STORE], 'readonly');
        const ownerRequest = tx.objectStore(META_STORE).get(OWNER_META_KEY);
        const lessonRequest = lessonId ? tx.objectStore(LESSONS_STORE).get(lessonId) : null;
        let ownsAny = false;
        if (!lessonRequest) {
          // There's no owner index, so walk the lessons until one is theirs.
          ownerRequest.onsuccess = () => {
            const owner = ownerRequest.result;
            if (!isOwnerRecord(owner)) return;
            const cursorRequest = tx.objectStore(LESSONS_STORE).openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              if (ownsLesson(cursor.value, owner)) ownsAny = true;
              else cursor.continue();
            };
          };
        }
        tx.oncomplete = () =>
          finish({
            owner: isOwnerRecord(ownerRequest.result),
            owned: lessonRequest ? ownsLesson(lessonRequest.result, ownerRequest.result) : ownsAny,
          });
        tx.onerror = () => finish('unknown');
        tx.onabort = () => finish('unknown');
      } catch {
        finish('unknown');
      }
    };
  });
}

// 'yes' | 'no' | 'unknown'.
async function lessonDownloadState(lessonId) {
  const records = await readOfflineRecords(lessonId);
  if (records === 'unknown') return 'unknown';
  return records.owned ? 'yes' : 'no';
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

// { owner, owned } for the phone as a whole: is a family signed in here, and
// have they saved any lesson?
async function offlineFamily() {
  let records;
  try {
    records = await readOfflineRecords(null);
  } catch {
    records = 'unknown';
  }
  if (records !== 'unknown') return records;
  // Couldn't read the database: saved audio is the next best sign of both.
  const audio = await caches.has(AUDIO_CACHE).catch(() => false);
  return { owner: audio, owned: audio };
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
  // Only for a family signed in on this phone: a visitor would just see
  // "Your saved lessons … log out".
  if (
    !(route.kind === 'shell' && route.key === OFFLINE_HUB_PATH) &&
    (await matchShell(OFFLINE_HUB_PATH)) &&
    (await offlineFamily()).owner
  ) {
    return redirectTo(OFFLINE_HUB_PATH);
  }
  return offlinePage();
}

// Whether giving up on a slow network leaves something worth showing.
async function hasUsefulOfflineCopy(route) {
  if (route.kind === 'shell' || route.kind === 'public') return Boolean(await matchShell(route.key));
  if (route.kind === 'lesson') {
    return (await isLessonDownloaded(route.id)) && Boolean(await matchShell(OFFLINE_PLAYER_PATH));
  }
  if (route.kind === 'other') {
    const family = await offlineFamily();
    return family.owner && family.owned && Boolean(await matchShell(OFFLINE_HUB_PATH));
  }
  return false;
}

// The hub's "Try the internet again" and the player's links to the full
// lesson or Practice: the family asked for the internet, so give it longer.
function openedFromOfflinePages(request) {
  try {
    const referrer = new URL(request.referrer);
    return referrer.origin === self.location.origin && SHELL_PATHS.includes(normalizePath(referrer.pathname));
  } catch {
    return false;
  }
}

function navigationTimeoutMs(request, route) {
  // Sign-in callbacks wait as long as the browser does.
  if (route.kind === 'auth') return null;
  if (route.kind !== 'shell' && openedFromOfflinePages(request)) return RETRY_TIMEOUT_MS;
  return route.kind === 'other' ? APP_PAGE_TIMEOUT_MS : NAVIGATION_TIMEOUT_MS;
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

// An in-app tap on a lesson (the router's RSC request). The router has no time
// limit of its own and falls back to a full page load only when its request
// fails, so on lie-fi a downloaded lesson would never open. For a downloaded
// lesson, a request still hanging after RSC_TIMEOUT_MS is cut off, and the
// page load that follows goes straight to the player. Nothing is cached, and
// nothing else is cut off: a slow but working connection still gets its page.
async function lessonPayload(request, lessonId) {
  const controller = new AbortController();
  // The router dropped the tap (another tap came first): drop the request too.
  const pageSignal = request.signal;
  if (pageSignal && pageSignal.aborted) controller.abort();
  else if (pageSignal) pageSignal.addEventListener('abort', () => controller.abort(), { once: true });
  const network = fetch(request, { signal: controller.signal });
  try {
    return await networkUnlessSlow(network, RSC_TIMEOUT_MS, async () => {
      if (pageSignal && pageSignal.aborted) return false;
      return isLessonDownloaded(lessonId);
    });
  } catch (error) {
    if (error !== TIMED_OUT) throw error;
    controller.abort();
    rscGaveUp = { id: lessonId, at: Date.now() };
    // A network error: the router then loads the page in full.
    return Response.error();
  }
}

// True once, for the page load that follows a cut-off in-app tap.
function takeRscGaveUp(route) {
  const gaveUp = rscGaveUp;
  if (!gaveUp || route.kind !== 'lesson' || gaveUp.id !== route.id) return false;
  rscGaveUp = null;
  return Date.now() - gaveUp.at < RSC_GAVE_UP_MS;
}

async function respondToNavigation(request, route, network) {
  try {
    return await networkUnlessSlow(network, navigationTimeoutMs(request, route), () =>
      hasUsefulOfflineCopy(route)
    );
  } catch {
    return offlineNavigationResponse(route);
  }
}

// The offline shells come from this build's own cache, with no network at
// all: they are prerendered once per build, the same for everyone, and cached
// at install together with their build files. A copy fetched later could be a
// newer deploy's, whose build files this worker never cached.
async function respondToShellNavigation(request, route) {
  const cached = await matchInCache(SHELL_CACHE, route.key, { ignoreSearch: true, ignoreVary: true });
  return cached || respondToNavigation(request, route, fetch(request));
}

// The network already timed out on the in-app tap: don't wait out another one.
async function openDownloadedLesson(request, route) {
  if ((await isLessonDownloaded(route.id)) && (await matchShell(OFFLINE_PLAYER_PATH))) {
    return redirectTo(offlinePlayerUrl(route.id));
  }
  return respondToNavigation(request, route, fetch(request));
}

function handleNavigation(event, request, url) {
  const route = classifyNavigation(url.pathname);
  if (route.kind === 'shell') {
    event.respondWith(respondToShellNavigation(request, route));
    return;
  }
  if (takeRscGaveUp(route)) {
    event.respondWith(openDownloadedLesson(request, route));
    return;
  }

  const network = fetch(request);
  if (route.kind === 'public') {
    // Keep the public pages fresh, even when the answer arrives after the timeout.
    event.waitUntil(
      network
        .then((response) =>
          isShellResponse(response) ? putInCache(SHELL_CACHE, route.key, response.clone()) : undefined
        )
        .catch(noop)
    );
  }
  event.respondWith(respondToNavigation(request, route, network));
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
  // Install's on-demand chunks are still being cached: stay alive for them.
  if (backgroundPrecache) event.waitUntil(backgroundPrecache);

  // 1. Cross-origin (Supabase data, storage, CDNs): untouched, except lesson
  // images a download saved.
  if (url.origin !== self.location.origin) {
    if (request.destination === 'image') event.respondWith(savedAssetOrNetwork(request));
    return;
  }

  // 2. Personal or live: RSC payloads, API routes, and this script itself.
  // Never cached; only an in-app tap on a lesson gets a time limit (prefetches don't).
  if (isRscRequest(request, url)) {
    const lessonId = lessonIdFromPath(normalizePath(url.pathname));
    if (lessonId && !request.headers.has('Next-Router-Prefetch')) {
      event.respondWith(lessonPayload(request, lessonId));
    }
    return;
  }
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

  // 5. Page loads — the offline shells from the cache; other pages from the
  // network, giving up on it only when there is an offline copy to show.
  if (request.mode === 'navigate') {
    handleNavigation(event, request, url);
    return;
  }

  // Media byte ranges and sign-in routes go straight to the network.
  if (request.headers.has('Range')) return;
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) return;

  // 6. The offline shells fetched as plain GETs (the warm-up after a download):
  // network first, cached copy as the fallback. Never written: install is the
  // only writer, so the shell cache never holds a newer deploy's HTML whose
  // build files this worker doesn't have.
  const shellPath = normalizePath(url.pathname);
  if (SHELL_PATHS.includes(shellPath)) {
    event.respondWith(
      networkFirst(event, request, {
        cacheName: SHELL_CACHE,
        cacheKey: shellPath,
        isCacheable: () => false,
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
