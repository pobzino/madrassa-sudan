// Offline end-to-end check against a local production build (next build +
// next start). Seeds a synthetic saved lesson into IndexedDB and Cache
// Storage, then checks with no connection: a cold start lands on the saved-
// lessons hub, the lesson plays in the offline player (audio from the phone,
// slide image from the asset cache), progress is queued under the owner,
// /lessons/<id> redirects to the player, another account's copy stays hidden,
// and logging out offline wipes it all; a failed worker install is retried
// once back online; lie-fi (connected, but nothing answers) still opens saved
// lessons from an in-app tap and a cold start. Needs no Supabase.
//
//   AMAL_SITE_URL=http://localhost:3907 node scripts/offline-e2e.mjs
//
// Optional: BROWSER=webkit (Safari's engine; uses Playwright's WebKit build,
// WEBKIT_PATH overrides its location). Playwright's offline switch in WebKit
// also blocks the service worker, so WebKit runs need AMAL_SERVER_STOP_CMD and
// test "no connection" as "the server can't be reached" (navigator.onLine
// stays true). PLAYWRIGHT_CHANNEL (default "chrome", the installed Chrome),
// AMAL_SERVER_STOP_CMD (a shell command that stops the server, to also test
// "connected but the server can't be reached"), SHOTS (a directory for
// screenshots). Use a fresh server: the worker must install from this build.
// The browser talks to the site through a small proxy started here, which
// can stop answering (context.setOffline can't make a request hang).
import { execSync } from 'node:child_process';
import http from 'node:http';
import { homedir } from 'node:os';
import { chromium, webkit } from 'playwright';

const siteURL = new URL(process.env.AMAL_SITE_URL || 'http://localhost:3001');
const killCmd = process.env.AMAL_SERVER_STOP_CMD || '';

// 'up' passes requests through; 'hang' accepts them and never answers.
let network = 'up';
const hanging = new Set();
const proxy = http.createServer((req, res) => {
  if (network === 'hang') {
    hanging.add(res);
    return;
  }
  const upstream = http.request(
    { host: siteURL.hostname, port: siteURL.port, method: req.method, path: req.url, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    }
  );
  upstream.on('error', () => res.destroy());
  req.pipe(upstream);
});
await new Promise((resolve) => proxy.listen(0, resolve));
// localhost counts as a secure origin, so the worker registers.
const baseURL = `http://localhost:${proxy.address().port}`;
const LESSON_ID = '4f9c2a8e-1b2c-4d5e-8f90-123456789abc';
const OTHER_LESSON_ID = '11111111-2222-3333-4444-555555555555';
const OWNER_ID = 'e2e-owner-1';
const IMAGE_URL = 'https://cdn.amal-e2e.test/slide-1.png';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const engine = process.env.BROWSER === 'webkit' ? 'webkit' : 'chromium';
const browser =
  engine === 'webkit'
    ? await webkit.launch({
        executablePath: process.env.WEBKIT_PATH || `${homedir()}/Library/Caches/ms-playwright/webkit-2359/pw_run.sh`,
      })
    : await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
console.log(`Engine: ${engine}`);
if (engine === 'webkit' && !killCmd) {
  console.error('WebKit runs need AMAL_SERVER_STOP_CMD (see the note at the top).');
  process.exit(2);
}
let serverStopped = false;
/** No connection: Chrome's offline switch, or (WebKit) the server stopped for good. */
async function goOffline() {
  if (engine !== 'webkit') return context.setOffline(true);
  if (!serverStopped) {
    execSync(killCmd);
    serverStopped = true;
  }
}
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addInitScript(() => {
  localStorage.setItem('amal-school-has-selected-language', 'true');
  localStorage.setItem('amal-school-language', 'en');
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => {
  // With the server stopped, WebKit also reports requests the app catches
  // (warming the offline pages, the worker's update check) as page errors.
  if (serverStopped && engine === 'webkit' && /due to access control checks/.test(error.message)) return;
  pageErrors.push(error.message);
});

try {
  // 1. Online: open the hub; the worker installs and takes control.
  await page.goto(`${baseURL}/offline`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  const swUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  check('service worker controls the page', swUrl?.endsWith('/sw.js'), swUrl);

  const cacheSummary = () =>
    page.evaluate(async () => {
      const out = {};
      for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
      return out;
    });
  const versioned = (summary, prefix) => Object.entries(summary).find(([name]) => name.startsWith(prefix))?.[1] || [];
  // The on-demand chunks are cached just after install: give them a moment.
  let summary = await cacheSummary();
  for (let tries = 0, last = -1; tries < 20 && versioned(summary, 'amal-static-').length !== last; tries++) {
    last = versioned(summary, 'amal-static-').length;
    await page.waitForTimeout(500);
    summary = await cacheSummary();
  }
  const shell = versioned(summary, 'amal-shell-');
  const statics = versioned(summary, 'amal-static-');
  const fonts = statics.filter((path) => /\.(woff2?|ttf)$/.test(path));
  check('shell cache holds /offline and /offline/play', shell.includes('/offline') && shell.includes('/offline/play'), shell.join(', '));
  check('static cache precached build files (incl. lazy chunks)', statics.length >= 30, `${statics.length} files`);
  check('static cache skips font subsets the pages never load', fonts.length > 0 && fonts.length <= 6, fonts.join(', '));

  // Hub before seeding: empty state, no crash.
  await page.getByText('No saved lessons yet').waitFor({ timeout: 10000 });
  check('empty hub renders', true);

  // 2. Seed a synthetic downloaded lesson owned by OWNER_ID, plus another
  // account's lesson that must stay hidden.
  const seeded = await page.evaluate(
    async ({ LESSON_ID, OTHER_LESSON_ID, OWNER_ID, IMAGE_URL }) => {
      // 12 s mono 8 kHz 16-bit WAV with a quiet tone.
      const seconds = 12;
      const rate = 8000;
      const samples = seconds * rate;
      const buffer = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(buffer);
      const writeString = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      writeString(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); writeString(8, 'WAVE');
      writeString(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      writeString(36, 'data'); view.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 800), true);
      const audio = new Blob([buffer], { type: 'audio/wav' });

      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#007229'; ctx.fillRect(0, 0, 64, 48);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

      const audioCache = await caches.open('sim-audio-downloads');
      await audioCache.put(`/offline-audio/${LESSON_ID}`, new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(audio.size) } }));
      await audioCache.put(`/offline-audio/${OTHER_LESSON_ID}`, new Response(audio, { headers: { 'Content-Type': 'audio/wav' } }));
      const assetCache = await caches.open('amal-lesson-assets');
      await assetCache.put(IMAGE_URL, new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(png.size) } }));

      const slide = (id, sequence, title, image) => ({
        id, type: 'content', sequence, title_ar: title, title_en: title, body_ar: 'نص', body_en: 'Body text for ' + title,
        speaker_notes_ar: '', speaker_notes_en: '', visual_hint: '', bullets_ar: null, bullets_en: null,
        reveal_items_ar: null, reveal_items_en: null, image_url: image, layout: image ? 'image_right' : 'default',
      });
      const now = new Date().toISOString();
      const sim = (lessonId) => ({
        sim: {
          id: 'sim-' + lessonId, lesson_id: lessonId, duration_ms: seconds * 1000,
          deck_snapshot: [slide('s1', 1, 'Seeded slide one', IMAGE_URL), slide('s2', 2, 'Seeded slide two', null)],
          events: [{ t: 0, type: 'slide_change', slide_id: 's1' }, { t: 6000, type: 'slide_change', slide_id: 's2' }],
          audio_path: 'x.wav', audio_duration_ms: seconds * 1000, audio_mime: 'audio/wav', recorded_by: null,
          recorded_at: now, clip_segments: null, created_at: now, updated_at: now,
        },
        audio_url: null,
      });
      const record = (id, ownerId, title) => ({
        id, title_ar: title, title_en: title, subject_name_ar: 'رياضيات', subject_name_en: 'Maths', grade_level: 2,
        sim: sim(id), slides: [], questions: [], tasks: [], thumbnailUrl: null, videoUrl: null, audioSize: audio.size,
        downloadedAt: now, schema: 2, ownerId, simId: 'sim-' + id, simUpdatedAt: now, slideLanguageMode: 'en',
        audioMime: 'audio/wav', assetUrls: [IMAGE_URL], assetBytes: png.size, practice: null, progress: null,
        neighbors: { prev: null, next: null }, origin: 'manual',
      });

      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('amal-offline');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = [...db.objectStoreNames];
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['lessons', 'meta'], 'readwrite');
        tx.objectStore('meta').put({ key: 'owner', userId: OWNER_ID, fullName: 'Amina Test', role: 'student', savedAt: now });
        tx.objectStore('meta').put({ key: 'asset:' + IMAGE_URL, lessons: [LESSON_ID], bytes: png.size });
        tx.objectStore('lessons').put(record(LESSON_ID, OWNER_ID, 'Seeded offline lesson'));
        tx.objectStore('lessons').put(record(OTHER_LESSON_ID, 'someone-else', 'Other family lesson'));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return { stores, version: db.version };
    },
    { LESSON_ID, OTHER_LESSON_ID, OWNER_ID, IMAGE_URL }
  );
  check('hub created the v2 database with every store', seeded.version >= 2 && ['lessons', 'progress-queue', 'downloads', 'meta', 'responses'].every((s) => seeded.stores.includes(s)), JSON.stringify(seeded));

  // 3. Go offline (navigator.onLine false + no network).
  await goOffline();

  // Cold-start style: the installed app's start_url.
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'load' }).catch((e) => e);
  check('offline /dashboard lands on the hub', new URL(page.url()).pathname === '/offline', page.url());
  await page.getByText('Seeded offline lesson').waitFor({ timeout: 15000 });
  check('hub lists the owner’s saved lesson', true);
  check('hub hides another account’s lesson', (await page.getByText('Other family lesson').count()) === 0);
  check('hub shows the hidden-lessons note', (await page.getByText('Some lessons saved earlier').count()) === 1);
  check('hub shows owner name', (await page.getByText('Saved for Amina Test').count()) === 1);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${engine}-hub-en.png`, fullPage: true });

  // Tap the card: full navigation to the player.
  await page.getByRole('link', { name: /Play Seeded offline lesson/ }).click();
  await page.waitForURL(/\/offline\/play\?id=/, { timeout: 15000 });
  check('card opens /offline/play?id=', page.url().includes(`id=${LESSON_ID}`), page.url());
  await page.getByText('Seeded slide one').first().waitFor({ timeout: 20000 });
  check('player renders the saved deck', true);
  check('player shows "Playing from this phone"', (await page.getByText('Playing from this phone').count()) > 0);

  const image = await page.waitForFunction(
    (url) => {
      const img = [...document.images].find((el) => el.src === url);
      return img && img.complete ? { natural: img.naturalWidth } : null;
    },
    IMAGE_URL,
    { timeout: 15000 }
  ).then((h) => h.jsonValue()).catch(() => null);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${engine}-player-en.png`, fullPage: true });
  check('slide image loads from the asset cache offline', image && image.natural > 0, JSON.stringify(image));

  // Play with the player's own button: audio time advances from the blob URL.
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await page.waitForTimeout(3000);
  const audioInfo = await page.evaluate(() => {
    const audio = document.querySelector('audio');
    return audio ? { found: true, src: audio.src.slice(0, 5), time: audio.currentTime, paused: audio.paused } : { found: false };
  });
  check('audio plays from a blob: URL offline', audioInfo.found && audioInfo.src === 'blob:' && audioInfo.time > 1, JSON.stringify(audioInfo));

  // Pause → progress flushed to the queue under the owner id.
  await page.getByRole('button', { name: 'Pause', exact: true }).first().click();
  await page.waitForTimeout(1000);
  const queue = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('amal-offline');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['progress-queue', 'meta'], 'readonly');
      const items = tx.objectStore('progress-queue').getAll();
      const metas = tx.objectStore('meta').getAll();
      tx.oncomplete = () => { db.close(); resolve({ items: items.result, progress: metas.result.filter((m) => String(m.key).startsWith('progress:')) }); };
    };
    request.onerror = () => reject(request.error);
  }));
  const mine = queue.items.filter((item) => item.ownerId === OWNER_ID && item.lessonId === LESSON_ID && item.kind === 'progress');
  check('progress queued under the owner id', mine.length === 1 && mine[0].data.last_position_seconds > 0, JSON.stringify(queue.items.map((i) => ({ kind: i.kind, ownerId: i.ownerId, data: i.data }))));
  check('local progress record written', queue.progress.length === 1, JSON.stringify(queue.progress));

  // Offline /lessons/<id> → redirected to the player; someone else's → hub.
  await page.goto(`${baseURL}/lessons/${LESSON_ID}`, { waitUntil: 'load' }).catch((e) => e);
  check('offline /lessons/<id> opens the offline player', page.url() === `${baseURL}/offline/play?id=${LESSON_ID}`, page.url());
  await page.goto(`${baseURL}/lessons/${OTHER_LESSON_ID}`, { waitUntil: 'load' }).catch((e) => e);
  check('offline /lessons/<other account’s id> goes to the hub', new URL(page.url()).pathname === '/offline', page.url());

  // Player for another account's lesson: not downloaded.
  await page.goto(`${baseURL}/offline/play?id=${OTHER_LESSON_ID}`, { waitUntil: 'load' });
  await page.getByText("This lesson isn't saved on this phone").waitFor({ timeout: 15000 });
  check('player treats another account’s copy as not saved', true);

  // 4. Lie-fi: the browser says online and requests go out, but nothing answers.
  // (Uncached images wait too, so these steps don't wait for the load event.)
  await context.setOffline(false);
  await page.goto(`${baseURL}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.next?.router?.push), null, { timeout: 15000 });
  network = 'hang';
  let started = Date.now();
  // An in-app tap (next/link uses the same router call).
  await page.evaluate((id) => window.next.router.push(`/lessons/${id}`), LESSON_ID);
  const tapped = await page.waitForURL(/\/offline\/play\?id=/, { timeout: 25000, waitUntil: 'commit' }).then(() => true, () => false);
  check('lie-fi: an in-app tap on a saved lesson opens the player', tapped && page.url().includes(`id=${LESSON_ID}`), `${page.url()} in ${Date.now() - started} ms`);
  await page.getByText('Seeded slide one').first().waitFor({ timeout: 20000 }).catch(() => undefined);
  check('lie-fi: the player renders after the tap', (await page.getByText('Seeded slide one').count()) > 0);

  started = Date.now();
  await page.goto(`${baseURL}/offline`, { waitUntil: 'domcontentloaded' });
  check('lie-fi: the hub opens from the cache at once', Date.now() - started < 2500, `${Date.now() - started} ms`);

  // Cold start of the installed app (start_url /dashboard).
  started = Date.now();
  await page.goto(`${baseURL}/dashboard`, { waitUntil: 'commit', timeout: 30000 }).catch((e) => e);
  check('lie-fi: /dashboard lands on the hub', new URL(page.url()).pathname === '/offline', `${page.url()} in ${Date.now() - started} ms`);

  // A page with no offline copy keeps waiting rather than being swapped for the hub.
  const parents = await page.goto(`${baseURL}/parents`, { waitUntil: 'commit', timeout: 10000 }).then(() => 'loaded', () => 'still waiting');
  check('lie-fi: a page with no offline copy is not replaced by the hub', parents === 'still waiting' && new URL(page.url()).pathname !== '/parents', `${parents}, at ${page.url()}`);
  network = 'up';
  for (const res of hanging) res.destroy();
  hanging.clear();

  // 5. Browser says online but the server is gone.
  if (killCmd) {
    if (engine !== 'webkit') {
      await context.setOffline(false);
      execSync(killCmd);
      serverStopped = true;
    }
    await page.waitForTimeout(500);
    const started = Date.now();
    await page.goto(`${baseURL}/lessons/${LESSON_ID}`, { waitUntil: 'load' }).catch((e) => e);
    check('server down (navigator.onLine true): /lessons/<id> opens the player', page.url() === `${baseURL}/offline/play?id=${LESSON_ID}`, `${page.url()} in ${Date.now() - started} ms`);
    await page.getByText('Seeded slide one').first().waitFor({ timeout: 20000 });
    check('player renders with the server down', true);
    await page.goto(`${baseURL}/settings`, { waitUntil: 'load' }).catch((e) => e);
    await page.getByText('Seeded offline lesson').waitFor({ timeout: 15000 });
    check('server down: /settings lands on the hub with the list', new URL(page.url()).pathname === '/offline', page.url());
  }

  // 6. Arabic hub, then log out with no connection at all.
  await goOffline();
  await page.evaluate(() => {
    localStorage.setItem('amal-school-language', 'ar');
    // A well-formed (expired) session split over two chunks, as @supabase/ssr
    // stores it: "base64-" + base64url(JSON). A garbled value would make the
    // auth client throw while decoding it, which real cookies never do.
    const session = btoa(JSON.stringify({ access_token: 'e2e', refresh_token: 'e2e', expires_at: 1, token_type: 'bearer', user: { id: 'e2e-owner-1' } }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const value = 'base64-' + session;
    const half = Math.ceil(value.length / 2);
    document.cookie = `sb-e2etest-auth-token.0=${value.slice(0, half)}; path=/`;
    document.cookie = `sb-e2etest-auth-token.1=${value.slice(half)}; path=/`;
  });
  await context.addInitScript(() => localStorage.setItem('amal-school-language', 'ar'));
  await page.goto(`${baseURL}/offline`, { waitUntil: 'load' });
  await page.getByText('دروسك المحفوظة').waitFor({ timeout: 15000 });
  check('hub renders in Arabic, right-to-left', (await page.locator('main[dir=rtl]').count()) === 1);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${engine}-hub-ar.png`, fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'تبديل الحساب / تسجيل الخروج' }).click();
  const logoutStarted = Date.now();
  const navigated = page.waitForEvent('framenavigated', { timeout: 30000 }).catch(() => null);
  await navigated;
  await page.waitForLoadState('load').catch(() => undefined);
  check('offline logout finishes with a page load', true, `${Date.now() - logoutStarted} ms, now at ${page.url()}`);
  const after = await page.evaluate(async () => ({
    caches: await caches.keys(),
    databases: indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : null,
    cookies: document.cookie,
    resume: Object.keys(localStorage).filter((k) => k.startsWith('sim-resume:')),
  }));
  check('offline logout removes audio and image caches', !after.caches.includes('sim-audio-downloads') && !after.caches.includes('amal-lesson-assets'), JSON.stringify(after.caches));
  check('offline logout keeps the worker shells', after.caches.some((n) => n.startsWith('amal-shell-')), JSON.stringify(after.caches));
  check('offline logout removes the session cookies', !after.cookies.includes('sb-e2etest-auth-token'), after.cookies);
  check('offline logout removes resume positions', after.resume.length === 0, JSON.stringify(after.resume));
  check('offline logout lands somewhere usable', ['/', '/offline'].includes(new URL(page.url()).pathname), page.url());
  const reopened = await page.evaluate(async () => {
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
    if (!dbs.includes('amal-offline')) return { exists: false, lessons: 0 };
    return await new Promise((resolve) => {
      const r = indexedDB.open('amal-offline');
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('lessons')) { db.close(); resolve({ exists: true, lessons: -1 }); return; }
        const q = db.transaction('lessons').objectStore('lessons').count();
        q.onsuccess = () => { db.close(); resolve({ exists: true, lessons: q.result }); };
      };
    });
  });
  check('no saved lessons survive logout', reopened.lessons === 0, JSON.stringify({ ...reopened, databasesRightAfterLogout: after.databases }));

  // 6. A first worker install that fails (one dropped request) leaves no
  // worker: saved lessons must not count as ready (same rule as
  // isOfflinePlaybackReady), and the app registers again when the connection
  // comes back, without a reload. Needs the server, which step 4 stops.
  if (!killCmd) {
    const retryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let failShell = true;
    await retryContext.route('**/offline/play*', (route) =>
      route.request().serviceWorker() && failShell ? route.abort('internetdisconnected') : route.continue()
    );
    const retryPage = await retryContext.newPage();
    retryPage.on('pageerror', (error) => pageErrors.push(error.message));
    const offlinePagesReady = () => retryPage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) return false;
      const options = { ignoreSearch: true, ignoreVary: true };
      for (const name of (await caches.keys()).filter((n) => n.startsWith('amal-shell-'))) {
        const cache = await caches.open(name);
        if ((await cache.match('/offline', options)) && (await cache.match('/offline/play', options))) return true;
      }
      return false;
    });
    await retryPage.goto(`${baseURL}/privacy`, { waitUntil: 'load' });
    await retryPage.waitForTimeout(5000);
    check('failed worker install: offline pages not ready', !(await offlinePagesReady()));
    failShell = false;
    await retryPage.evaluate(() => window.dispatchEvent(new Event('online')));
    await retryPage.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 }).catch(() => undefined);
    check('back online: the worker installs without a reload', await offlinePagesReady());
    await retryContext.close();
  }
} catch (error) {
  check('script ran to completion', false, String(error && error.stack || error));
} finally {
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
  for (const res of hanging) res.destroy();
  proxy.closeAllConnections();
  proxy.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
