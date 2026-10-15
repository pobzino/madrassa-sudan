/**
 * The service worker template runs in the browser as-is (no imports), so these
 * tests evaluate its source in a sandbox with fake `self`, `caches`, `fetch`
 * and `indexedDB`, then drive its event handlers directly.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/sw.js/route";
import * as names from "@/lib/offline/cache-names";
import { OWNER_META_KEY } from "@/lib/offline/db";

const TEMPLATE = readFileSync(path.join(process.cwd(), "src/sw/service-worker.template.js"), "utf8");
const PLACEHOLDER = "'__AMAL_VERSION__'";
const ORIGIN = "https://amal.test";
const LESSON_ID = "4f9c2a8e-1b2c-4d5e-8f90-123456789abc";

const INTERNALS = [
  "SHELL_CACHE",
  "STATIC_CACHE",
  "SHELL_CACHE_PREFIX",
  "STATIC_CACHE_PREFIX",
  "SW_META_CACHE",
  "SW_VERSIONS_KEY",
  "AUDIO_CACHE",
  "ASSET_CACHE",
  "OFFLINE_AUDIO_PREFIX",
  "LEGACY_SW_CACHES",
  "OFFLINE_DB_NAME",
  "LESSONS_STORE",
  "META_STORE",
  "OWNER_META_KEY",
  "OFFLINE_HUB_PATH",
  "OFFLINE_PLAYER_PATH",
  "offlinePlayerUrl",
  "classifyNavigation",
  "extractStaticAssetUrls",
  "extractLazyChunkUrls",
  "cachesToDelete",
  "lessonDownloadState",
  "isLessonDownloaded",
  "readOfflineRecords",
  "offlineFamily",
  "RSC_TIMEOUT_MS",
] as const;

type Internals = Record<(typeof INTERNALS)[number], any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
type MatchOptions = { ignoreSearch?: boolean; ignoreVary?: boolean; cacheName?: string };
type Key = string | { url: string };

// ── Fakes ────────────────────────────────────────────────────────────────────

function toUrl(key: Key): string {
  return new URL(typeof key === "string" ? key : key.url, ORIGIN).href;
}

function sameUrl(stored: string, wanted: string, ignoreSearch?: boolean): boolean {
  if (!ignoreSearch) return stored === wanted;
  const a = new URL(stored);
  const b = new URL(wanted);
  return a.origin + a.pathname === b.origin + b.pathname;
}

class FakeCache {
  entries = new Map<string, Response>();

  async put(key: Key, response: Response) {
    this.entries.set(toUrl(key), response);
  }

  async match(key: Key, options: MatchOptions = {}) {
    const wanted = toUrl(key);
    for (const [url, response] of this.entries) {
      if (sameUrl(url, wanted, options.ignoreSearch)) return response.clone();
    }
    return undefined;
  }

  has(key: string) {
    return this.entries.has(toUrl(key));
  }
}

class FakeCacheStorage {
  stores = new Map<string, FakeCache>();

  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return this.stores.get(name)!;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async has(name: string) {
    return this.stores.has(name);
  }

  async match(key: Key, options: MatchOptions = {}) {
    if (options.cacheName) return this.stores.get(options.cacheName)?.match(key, options);
    for (const cache of this.stores.values()) {
      const found = await cache.match(key, options);
      if (found) return found;
    }
    return undefined;
  }

  async seed(name: string, key: string, response: Response) {
    await (await this.open(name)).put(key, response);
  }
}

type Route = Response | Error | (() => Response | Promise<Response>);

/** Fake network: routes by path + search, then by path; anything else fails like offline. */
function fakeNetwork(routes: Record<string, Route> = {}) {
  return vi.fn(async (input: Key) => {
    const url = new URL(toUrl(input));
    const route = routes[url.pathname + url.search] ?? routes[url.pathname];
    if (route === undefined || route instanceof Error) throw new TypeError("Failed to fetch");
    if (typeof route === "function") return route();
    return route.clone();
  });
}

function html(body: string, init: ResponseInit = {}) {
  return new Response(`<!doctype html><html><body>${body}</body></html>`, {
    status: 200,
    ...init,
    headers: { "Content-Type": "text/html; charset=utf-8", ...(init.headers || {}) },
  });
}

function file(body: string, type: string) {
  return new Response(body, { status: 200, headers: { "Content-Type": type } });
}

function redirected(response: Response) {
  Object.defineProperty(response, "redirected", { value: true });
  return response;
}

// Node's Request can't be built with mode "navigate", so requests are plain
// objects with the fields the worker reads.
function request(
  url: string,
  {
    mode = "cors",
    destination = "",
    method = "GET",
    headers = {} as Record<string, string>,
    referrer = "about:client",
  } = {}
) {
  return {
    url: new URL(url, ORIGIN).href,
    mode,
    destination,
    method,
    cache: "default",
    headers: new Headers(headers),
    referrer: referrer.startsWith("about:") ? referrer : new URL(referrer, ORIGIN).href,
  };
}

function navigation(url: string, { referrer = "about:client" } = {}) {
  return request(url, { mode: "navigate", destination: "document", referrer });
}

function rsc(url: string, headers: Record<string, string> = {}) {
  return request(url, { headers: { RSC: "1", ...headers } });
}

/** A network that never answers (lie-fi), recording each request's abort signal. */
function hangingNetwork() {
  const signals: (AbortSignal | undefined)[] = [];
  const network = vi.fn((_input: Key, init?: RequestInit) => {
    signals.push(init?.signal ?? undefined);
    return new Promise<Response>(() => undefined);
  });
  return { network: network as unknown as ReturnType<typeof fakeNetwork>, signals };
}

/** Whether a promise has settled after the timers so far. */
function track<T>(promise: Promise<T>) {
  const state = { settled: false };
  void promise.then(
    () => (state.settled = true),
    () => (state.settled = true)
  );
  return state;
}

// Relative URLs resolve against the worker's location, as in a browser.
class WorkerRequest extends Request {
  constructor(input: string | Request, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
  }
}

function loadWorker({
  version,
  network = fakeNetwork(),
  caches = new FakeCacheStorage(),
  indexedDB,
}: {
  version?: string;
  network?: ReturnType<typeof fakeNetwork>;
  caches?: FakeCacheStorage;
  indexedDB?: unknown;
} = {}) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => []), openWindow: vi.fn() },
    registration: { showNotification: vi.fn(async () => undefined) },
    navigator: {},
  };
  const source = version ? TEMPLATE.replaceAll(PLACEHOLDER, JSON.stringify(version)) : TEMPLATE;
  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "indexedDB",
    "Request",
    `${source}\nreturn { ${INTERNALS.join(", ")} };`
  );
  const internals = factory(self, caches, network, indexedDB, WorkerRequest) as Internals;
  return { self, handlers, caches, network, internals };
}

function dispatchFetch(worker: ReturnType<typeof loadWorker>, req: ReturnType<typeof request>) {
  let responded: Promise<Response> | undefined;
  const waits: Promise<unknown>[] = [];
  const event = {
    request: req,
    respondWith: vi.fn((value: Response | Promise<Response>) => {
      responded = Promise.resolve(value);
    }),
    waitUntil: vi.fn((value: Promise<unknown>) => {
      waits.push(Promise.resolve(value));
    }),
  };
  worker.handlers.fetch(event);
  return {
    event,
    response: () => {
      if (!responded) throw new Error("the worker did not respond");
      return responded;
    },
    settled: async () => {
      await responded?.catch(() => undefined);
      await Promise.all(waits);
    },
  };
}

async function runLifecycle(worker: ReturnType<typeof loadWorker>, type: "install" | "activate") {
  let pending: Promise<unknown> = Promise.resolve();
  worker.handlers[type]({ waitUntil: (value: Promise<unknown>) => (pending = value) });
  return pending;
}

/** IndexedDB stand-in. `stores: null` means the database doesn't exist yet. */
function fakeIndexedDB(stores: Record<string, Record<string, unknown>> | null) {
  const state = { aborted: false, closed: 0, versions: [] as unknown[], cursorSteps: 0 };
  const indexedDB = {
    open: vi.fn((name: string, version?: number) => {
      state.versions.push(version);
      const req: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      setTimeout(() => {
        if (!stores) {
          req.transaction = { abort: () => (state.aborted = true) };
          req.onupgradeneeded?.({});
          if (state.aborted) req.onerror?.({ preventDefault() {} });
          return;
        }
        req.result = {
          objectStoreNames: { contains: (store: string) => store in stores },
          close: () => (state.closed += 1),
          transaction: () => {
            // Requests answer in order; the transaction completes once none are left.
            const tx: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
            let pending = 0;
            const answer = (step: () => void) => {
              pending += 1;
              setTimeout(() => {
                step();
                pending -= 1;
                if (pending === 0) tx.oncomplete?.();
              });
            };
            tx.objectStore = (store: string) => ({
              get: (key: string) => {
                const read: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
                answer(() => {
                  read.result = stores[store]?.[key];
                  read.onsuccess?.({});
                });
                return read;
              },
              openCursor: () => {
                const read: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
                const values = Object.values(stores[store] ?? {});
                let index = 0;
                const step = () => {
                  state.cursorSteps += 1;
                  const advance = () => {
                    index += 1;
                    answer(step);
                  };
                  read.result = index < values.length ? { value: values[index], continue: advance } : null;
                  read.onsuccess?.({});
                };
                answer(step);
                return read;
              },
            });
            return tx;
          },
        };
        req.onsuccess?.({});
      });
      return req;
    }),
  };
  return { indexedDB, state };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Template and route ───────────────────────────────────────────────────────

describe("service worker template", () => {
  it("parses as a classic script and registers every handler", () => {
    expect(() => new Script(TEMPLATE)).not.toThrow();
    expect(TEMPLATE.split(PLACEHOLDER)).toHaveLength(2);
    expect(TEMPLATE).not.toMatch(/^\s*(import|export)\s/m);

    const { handlers } = loadWorker();
    expect(Object.keys(handlers).sort()).toEqual(
      ["activate", "fetch", "install", "message", "notificationclick", "push"].sort()
    );
  });

  it("mirrors the shared offline names", () => {
    const { internals } = loadWorker({ version: "abc" });
    expect(internals.AUDIO_CACHE).toBe(names.AUDIO_CACHE);
    expect(internals.ASSET_CACHE).toBe(names.ASSET_CACHE);
    expect(internals.SHELL_CACHE_PREFIX).toBe(names.SHELL_CACHE_PREFIX);
    expect(internals.STATIC_CACHE_PREFIX).toBe(names.STATIC_CACHE_PREFIX);
    expect(internals.SHELL_CACHE).toBe(`${names.SHELL_CACHE_PREFIX}abc`);
    expect(internals.STATIC_CACHE).toBe(`${names.STATIC_CACHE_PREFIX}abc`);
    expect(internals.SW_META_CACHE).toBe(names.SW_META_CACHE);
    expect(internals.LEGACY_SW_CACHES).toEqual([...names.LEGACY_SW_CACHES]);
    expect(internals.OFFLINE_DB_NAME).toBe(names.OFFLINE_DB_NAME);
    expect(internals.LESSONS_STORE).toBe(names.OFFLINE_STORES.lessons);
    expect(internals.META_STORE).toBe(names.OFFLINE_STORES.meta);
    expect(internals.OWNER_META_KEY).toBe(OWNER_META_KEY);
    expect(internals.OFFLINE_AUDIO_PREFIX + LESSON_ID).toBe(names.offlineAudioKey(LESSON_ID));
    expect(internals.OFFLINE_HUB_PATH).toBe(names.OFFLINE_HUB_PATH);
    expect(internals.OFFLINE_PLAYER_PATH).toBe(names.OFFLINE_PLAYER_PATH);
    expect(internals.offlinePlayerUrl("a b")).toBe(names.offlinePlayerUrl("a b"));
  });

  it("is served by /sw.js with the build version stamped in", async () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_VERSION", "3f2a9c1d");
    vi.stubEnv("DEPLOY_ID", "");
    const response = GET();
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");

    const script = await response.text();
    expect(script).toContain(`const VERSION = "3f2a9c1d";`);
    expect(script).not.toContain("__AMAL_VERSION__");
    expect(() => new Script(script)).not.toThrow();
  });

  it("skips a placeholder 'dev' version and strips unsafe characters", async () => {
    vi.stubEnv("DEPLOY_ID", "");
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_VERSION", "dev");
    vi.stubEnv("COMMIT_REF", " ab'c\"1</script> ");
    expect(await GET().text()).toContain(`const VERSION = "abc1script";`);

    vi.stubEnv("COMMIT_REF", "");
    expect(await GET().text()).toContain(`const VERSION = "dev";`);
  });

  it("gives each Netlify deploy its own worker, even for the same commit", async () => {
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_VERSION", "3f2a9c1d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b");
    vi.stubEnv("DEPLOY_ID", "6526f0a1b2c3d4e5f6a7b8c9");
    expect(await GET().text()).toContain(`const VERSION = "3f2a9c1d5e6f-6526f0a1b2c3d4e5f6a7b8c9";`);

    // No real version: still the plain "dev" (local builds).
    vi.stubEnv("NEXT_PUBLIC_RUNTIME_VERSION", "dev");
    vi.stubEnv("COMMIT_REF", "");
    expect(await GET().text()).toContain(`const VERSION = "dev";`);
  });
});

describe("service worker helpers", () => {
  const { internals } = loadWorker({ version: "v1" });

  it("finds every build file a shell refers to, including escaped flight data", () => {
    const page = [
      '<script src="/_next/static/chunks/0-66vw.js" async></script>',
      '<link rel="stylesheet" href="/_next/static/chunks/23_l6.css"/>',
      '<link rel="preload" href="/_next/static/media/5d52-s.p.0ez3.woff2" as="font"/>',
      'self.__next_f.push([1,"\\/_next\\/static\\/chunks\\/3kch.js"])',
      '"\\u002F_next\\u002Fstatic\\u002Fchunks\\u002Fturbopack-19us.js"',
      '<script src="/_next/static/chunks/0-66vw.js"></script>',
      '"/_next/static/chunks/data.json"',
    ].join("\n");
    expect(internals.extractStaticAssetUrls(page).sort()).toEqual(
      [
        "/_next/static/chunks/0-66vw.js",
        "/_next/static/chunks/23_l6.css",
        "/_next/static/chunks/3kch.js",
        "/_next/static/chunks/turbopack-19us.js",
        "/_next/static/media/5d52-s.p.0ez3.woff2",
      ].sort()
    );
  });

  it("finds the chunks a script loads on demand", () => {
    const js =
      'e.v(t=>Promise.all(["static/chunks/0wchs6.js","static/chunks/w-1.css"].map(t=>e.l(t))))' +
      '"/_next/static/chunks/abs.js";"static/chunks/data.json";//# sourceMappingURL=x.js.map';
    expect(internals.extractLazyChunkUrls(js).sort()).toEqual(
      ["/_next/static/chunks/0wchs6.js", "/_next/static/chunks/abs.js", "/_next/static/chunks/w-1.css"].sort()
    );
  });

  it("classifies page loads", () => {
    expect(internals.classifyNavigation("/offline")).toEqual({ kind: "shell", key: "/offline" });
    expect(internals.classifyNavigation("/offline/")).toEqual({ kind: "shell", key: "/offline" });
    expect(internals.classifyNavigation("/offline/play")).toEqual({ kind: "shell", key: "/offline/play" });
    expect(internals.classifyNavigation("/")).toEqual({ kind: "public", key: "/" });
    expect(internals.classifyNavigation("/terms")).toEqual({ kind: "public", key: "/terms" });
    expect(internals.classifyNavigation("/parents")).toEqual({ kind: "public", key: "/parents" });
    expect(internals.classifyNavigation("/sample-lesson")).toEqual({ kind: "public", key: "/sample-lesson" });
    expect(internals.classifyNavigation("/tutor")).toEqual({ kind: "other" });
    expect(internals.classifyNavigation("/practice/abc")).toEqual({ kind: "other" });
    expect(internals.classifyNavigation(`/lessons/${LESSON_ID}`)).toEqual({ kind: "lesson", id: LESSON_ID });
    expect(internals.classifyNavigation(`/lessons/${LESSON_ID}/`)).toEqual({ kind: "lesson", id: LESSON_ID });
    expect(internals.classifyNavigation(`/lessons/${LESSON_ID}/edit`)).toEqual({ kind: "other" });
    expect(internals.classifyNavigation("/lessons/%E0%A4%A")).toEqual({ kind: "other" });
    expect(internals.classifyNavigation("/lessons/a%2Fb")).toEqual({ kind: "other" });
    expect(internals.classifyNavigation("/lessons")).toEqual({ kind: "other" });
    expect(internals.classifyNavigation("/auth/callback")).toEqual({ kind: "auth" });
    expect(internals.classifyNavigation("/dashboard")).toEqual({ kind: "other" });
  });

  it("deletes only old versioned caches and the v1 caches", () => {
    const all = [
      "amal-shell-v3",
      "amal-static-v3",
      "amal-shell-v2b",
      "amal-static-v2b",
      "amal-shell-v1",
      "amal-static-v1",
      "amal-sw-v2",
      "amal-static-v2",
      "amal-pages-v2",
      "amal-sw-meta",
      "sim-audio-downloads",
      "amal-lesson-assets",
      "someone-elses-cache",
    ];
    expect(internals.cachesToDelete(all, { current: "v3", previous: "v2b" }).sort()).toEqual(
      ["amal-shell-v1", "amal-static-v1", "amal-sw-v2", "amal-static-v2", "amal-pages-v2"].sort()
    );
    // The first versioned worker keeps the v1 build files for tabs still on v1.
    expect(internals.cachesToDelete(all, { current: "v3", previous: null }).sort()).toEqual(
      ["amal-shell-v2b", "amal-static-v2b", "amal-shell-v1", "amal-static-v1", "amal-sw-v2", "amal-pages-v2"].sort()
    );
  });
});

// ── Lifecycle ────────────────────────────────────────────────────────────────

function shellNetwork(overrides: Record<string, Route> = {}) {
  return fakeNetwork({
    "/offline": html(
      '<script src="/_next/static/chunks/hub.js"></script><link rel="stylesheet" href="/_next/static/chunks/app.css">'
    ),
    "/offline/play": html(
      '<script src="/_next/static/chunks/player.js"></script>' +
        '<script>self.__next_f.push([1,"\\/_next\\/static\\/chunks\\/sim.js"])</script>'
    ),
    "/_next/static/chunks/hub.js": file("hub()", "application/javascript"),
    "/_next/static/chunks/player.js": file(
      'player();e.l("static/chunks/widget.js");e.l("static/chunks/gone.js")',
      "application/javascript"
    ),
    "/_next/static/chunks/widget.js": file("widget()", "application/javascript"),
    "/_next/static/chunks/sim.js": file("sim()", "application/javascript"),
    "/_next/static/chunks/app.css": file(
      "@font-face{src:url(../media/f.woff2)}@font-face{src:url(../media/missing.woff2)}",
      "text/css"
    ),
    "/_next/static/media/f.woff2": file("font", "font/woff2"),
    ...overrides,
  });
}

describe("install", () => {
  it("caches both shells and every build file they list, then takes over", async () => {
    const caches = new FakeCacheStorage();
    await caches.seed("amal-static-v1", "/_next/static/chunks/hub.js", file("hub()", "application/javascript"));
    const worker = loadWorker({ version: "v2", network: shellNetwork(), caches });

    await runLifecycle(worker, "install");

    const shell = caches.stores.get("amal-shell-v2")!;
    expect(shell.has("/offline")).toBe(true);
    expect(shell.has("/offline/play")).toBe(true);
    const staticCache = caches.stores.get("amal-static-v2")!;
    for (const file of ["chunks/hub.js", "chunks/player.js", "chunks/sim.js", "chunks/app.css"]) {
      expect(staticCache.has(`/_next/static/${file}`), file).toBe(true);
    }
    // Copied from the older build's cache rather than downloaded again.
    const fetched = worker.network.mock.calls.map(([input]) => new URL(toUrl(input)).pathname);
    expect(fetched).not.toContain("/_next/static/chunks/hub.js");
    // The font subsets a stylesheet lists are never fetched online either
    // (the pages preload the ones they use), so they aren't cached.
    expect(fetched).not.toContain("/_next/static/media/f.woff2");
    expect(worker.self.skipWaiting).toHaveBeenCalled();

    // On-demand chunks follow once install is done; any page request keeps the
    // worker alive until they are cached. The missing gone.js is optional.
    const page = dispatchFetch(worker, request("/icons/icon-192.png", { destination: "image" }));
    await page.settled();
    expect(staticCache.has("/_next/static/chunks/widget.js")).toBe(true);
    expect(staticCache.has("/_next/static/chunks/gone.js")).toBe(false);
  });

  it("doesn't wait for the on-demand chunks, so reminders get a ready worker sooner", async () => {
    const caches = new FakeCacheStorage();
    const network = shellNetwork({
      "/_next/static/chunks/widget.js": () => new Promise<Response>(() => undefined),
    });
    const worker = loadWorker({ version: "v2", network, caches });

    await runLifecycle(worker, "install");
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    expect(caches.stores.get("amal-shell-v2")!.has("/offline/play")).toBe(true);
    expect(caches.stores.get("amal-static-v2")!.has("/_next/static/chunks/widget.js")).toBe(false);
  });

  it("fails rather than cache a login redirect as the offline shell", async () => {
    const caches = new FakeCacheStorage();
    const network = shellNetwork({ "/offline/play": () => redirected(html("Log in")) });
    const worker = loadWorker({ version: "v2", network, caches });

    await expect(runLifecycle(worker, "install")).rejects.toThrow(/offline\/play/);
    expect(caches.stores.get("amal-shell-v2")?.entries.size ?? 0).toBe(0);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("fails when a build file a shell needs is missing", async () => {
    const worker = loadWorker({
      version: "v2",
      network: shellNetwork({ "/_next/static/chunks/sim.js": new Error("offline") }),
    });
    await expect(runLifecycle(worker, "install")).rejects.toThrow();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });
});

describe("activate", () => {
  it("records versions, keeps the previous build and never touches account caches", async () => {
    const caches = new FakeCacheStorage();
    for (const name of [
      "amal-sw-v2",
      "amal-static-v2",
      "amal-pages-v2",
      "sim-audio-downloads",
      "amal-lesson-assets",
      "amal-shell-a",
      "amal-static-a",
      "someone-elses-cache",
    ]) {
      await caches.open(name);
    }

    const first = loadWorker({ version: "a", caches });
    await runLifecycle(first, "activate");
    expect(first.self.clients.claim).toHaveBeenCalled();
    expect((await caches.keys()).sort()).toEqual(
      [
        "amal-static-v2",
        "sim-audio-downloads",
        "amal-lesson-assets",
        "amal-shell-a",
        "amal-static-a",
        "someone-elses-cache",
        "amal-sw-meta",
      ].sort()
    );

    await caches.open("amal-shell-b");
    await caches.open("amal-static-b");
    const second = loadWorker({ version: "b", caches });
    await runLifecycle(second, "activate");
    const versions = await (await caches.match("/__amal-sw/versions", { cacheName: "amal-sw-meta" }))!.json();
    expect(versions).toEqual({ current: "b", previous: "a" });
    expect((await caches.keys()).sort()).toEqual(
      [
        "sim-audio-downloads",
        "amal-lesson-assets",
        "amal-shell-a",
        "amal-static-a",
        "amal-shell-b",
        "amal-static-b",
        "someone-elses-cache",
        "amal-sw-meta",
      ].sort()
    );
  });
});

// ── Fetch routing ────────────────────────────────────────────────────────────

describe("fetch routing", () => {
  it("leaves personal and live requests to the browser", () => {
    const worker = loadWorker({ version: "v1" });
    const untouched = [
      request("/api/lessons/1/sim"),
      request("/api/lessons/1/slide-responses", { method: "POST" }),
      request("/sw.js"),
      request("/dashboard?_rsc=abc"),
      rsc("/practice/1"),
      rsc("/lessons/1", { "Next-Router-Prefetch": "1" }),
      rsc(`/lessons/${LESSON_ID}/edit`),
      request("/auth/callback?code=x"),
      request("/clip.mp4", { headers: { Range: "bytes=0-" } }),
      request("https://ref.supabase.co/rest/v1/profiles?select=*"),
      request("https://ref.supabase.co/auth/v1/user"),
    ];
    for (const req of untouched) {
      expect(dispatchFetch(worker, req).event.respondWith, req.url).not.toHaveBeenCalled();
    }
    expect(worker.network).not.toHaveBeenCalled();
  });

  it("serves saved lesson images by their original URL and caches nothing cross-origin", async () => {
    const image = "https://ref.supabase.co/storage/v1/object/public/slides/a.png";
    const caches = new FakeCacheStorage();
    await caches.seed("amal-lesson-assets", image, file("png", "image/png"));
    const network = fakeNetwork({ "/storage/v1/object/public/slides/b.png": file("b", "image/png") });
    const worker = loadWorker({ version: "v1", caches, network });

    const hit = dispatchFetch(worker, request(image, { mode: "no-cors", destination: "image" }));
    expect(await (await hit.response()).text()).toBe("png");
    expect(network).not.toHaveBeenCalled();

    const other = image.replace("a.png", "b.png");
    const miss = dispatchFetch(worker, request(other, { mode: "no-cors", destination: "image" }));
    expect(await (await miss.response()).text()).toBe("b");
    await miss.settled();
    expect(await caches.match(other)).toBeUndefined();
  });

  it("serves saved audio from the cache only", async () => {
    const caches = new FakeCacheStorage();
    await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}`, file("audio", "audio/mp4"));
    const worker = loadWorker({ version: "v1", caches });

    const hit = dispatchFetch(worker, request(`/offline-audio/${LESSON_ID}`, { destination: "audio" }));
    expect(await (await hit.response()).text()).toBe("audio");
    const miss = dispatchFetch(worker, request("/offline-audio/other", { destination: "audio" }));
    expect((await miss.response()).status).toBe(404);
    expect(worker.network).not.toHaveBeenCalled();
  });

  it("serves build files cache-first and stores new ones in this build's cache", async () => {
    const caches = new FakeCacheStorage();
    await caches.seed("amal-static-v0", "/_next/static/chunks/old.js", file("old()", "application/javascript"));
    const network = fakeNetwork({ "/_next/static/chunks/new.js": file("new()", "application/javascript") });
    const worker = loadWorker({ version: "v1", caches, network });

    const cached = dispatchFetch(worker, request("/_next/static/chunks/old.js?dpl=x", { destination: "script" }));
    expect(await (await cached.response()).text()).toBe("old()");

    const fresh = dispatchFetch(worker, request("/_next/static/chunks/new.js", { destination: "script" }));
    expect(await (await fresh.response()).text()).toBe("new()");
    await fresh.settled();
    expect(caches.stores.get("amal-static-v1")!.has("/_next/static/chunks/new.js")).toBe(true);

    const offline = dispatchFetch(worker, request("/_next/static/chunks/gone.js", { destination: "script" }));
    expect((await offline.response()).status).toBe(504);
  });

  it("caches icons but never HTML, and falls back to the cached icon offline", async () => {
    const caches = new FakeCacheStorage();
    const network = fakeNetwork({
      "/icons/icon-192.png": file("icon", "image/png"),
      "/page-fragment": html("Hello Amna"),
    });
    const worker = loadWorker({ version: "v1", caches, network });

    const icon = dispatchFetch(worker, request("/icons/icon-192.png", { destination: "image", mode: "no-cors" }));
    await icon.settled();
    const page = dispatchFetch(worker, request("/page-fragment"));
    await page.settled();
    const staticCache = caches.stores.get("amal-static-v1")!;
    expect(staticCache.has("/icons/icon-192.png")).toBe(true);
    expect(staticCache.has("/page-fragment")).toBe(false);

    const offline = loadWorker({ version: "v1", caches });
    const again = dispatchFetch(offline, request("/icons/icon-192.png", { destination: "image", mode: "no-cors" }));
    expect(await (await again.response()).text()).toBe("icon");
  });

  it("never stores a shell the warm-up fetches: it could be a newer deploy's", async () => {
    const caches = new FakeCacheStorage();
    await caches.seed("amal-shell-v1", "/offline/play", html("this build's player"));
    const network = fakeNetwork({ "/offline/play": html("next deploy's player") });
    const worker = loadWorker({ version: "v1", caches, network });

    const warm = dispatchFetch(worker, request("/offline/play"));
    expect(await (await warm.response()).text()).toContain("next deploy's player");
    await warm.settled();
    expect(await (await caches.match("/offline/play", { cacheName: "amal-shell-v1" }))!.text()).toContain(
      "this build's player"
    );

    // Offline, the warm-up still gets the cached copy.
    const offline = dispatchFetch(loadWorker({ version: "v1", caches }), request("/offline/play"));
    expect(await (await offline.response()).text()).toContain("this build's player");
  });
});

describe("in-app taps on a lesson (RSC)", () => {
  const owner = { key: "owner", userId: "user-a", fullName: "Amna", role: "student" };

  async function liFiWorker({ saved = true } = {}) {
    const caches = new FakeCacheStorage();
    await caches.seed("amal-shell-v1", "/offline", html("hub"));
    await caches.seed("amal-shell-v1", "/offline/play", html("player"));
    const db = fakeIndexedDB({
      lessons: saved ? { [LESSON_ID]: { id: LESSON_ID, ownerId: "user-a" } } : {},
      meta: { owner },
    });
    const { network, signals } = hangingNetwork();
    return { ...loadWorker({ version: "v1", caches, network, indexedDB: db.indexedDB }), signals };
  }

  it("cuts off a downloaded lesson's hanging request, so the router loads the page in full", async () => {
    vi.useFakeTimers();
    const worker = await liFiWorker();
    expect(worker.internals.RSC_TIMEOUT_MS).toBe(6000);

    const tap = dispatchFetch(worker, rsc(`/lessons/${LESSON_ID}?_rsc=x1`));
    const state = track(tap.response());
    await vi.advanceTimersByTimeAsync(5900);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    const response = await tap.response();
    expect(response.type).toBe("error");
    // The hung request is let go, and nothing was cached.
    expect(worker.signals[0]?.aborted).toBe(true);
    for (const name of await worker.caches.keys()) {
      for (const key of worker.caches.stores.get(name)!.entries.keys()) expect(key).not.toContain("_rsc");
    }

    // The full page load that follows opens the player straight away (the
    // database answers in a few ms), without another 4 s wait.
    const load = dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`));
    await vi.advanceTimersByTimeAsync(50);
    const redirect = await load.response();
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("Location")).toBe(`${ORIGIN}/offline/play?id=${LESSON_ID}`);
    expect(worker.network).toHaveBeenCalledTimes(1);

    // Only once: a later load of the full lesson tries the network again.
    const again = track(dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`)).response());
    await vi.advanceTimersByTimeAsync(100);
    expect(again.settled).toBe(false);
    expect(worker.network).toHaveBeenCalledTimes(2);
  });

  it("lets go of a tap the router dropped, without marking the lesson", async () => {
    vi.useFakeTimers();
    const worker = await liFiWorker();
    const page = new AbortController();
    const tap = dispatchFetch(worker, { ...rsc(`/lessons/${LESSON_ID}?_rsc=x4`), signal: page.signal } as never);
    const state = track(tap.response());
    await vi.advanceTimersByTimeAsync(1000);
    page.abort();
    await vi.advanceTimersByTimeAsync(7000);
    expect(worker.signals[0]?.aborted).toBe(true);
    // Its hanging fetch was never failed with a network error...
    expect(state.settled).toBe(false);

    // ...and a later full load of the lesson still tries the network first.
    const load = track(dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`)).response());
    await vi.advanceTimersByTimeAsync(100);
    expect(load.settled).toBe(false);
    expect(worker.network).toHaveBeenCalledTimes(2);
  });

  it("leaves a lesson that isn't downloaded to the network, however slow", async () => {
    vi.useFakeTimers();
    const caches = new FakeCacheStorage();
    const slow = vi.fn(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(file("payload", "text/x-component")), 10000))
    );
    const db = fakeIndexedDB({ lessons: {}, meta: { owner } });
    const worker = loadWorker({ version: "v1", caches, network: slow as never, indexedDB: db.indexedDB });

    const tap = dispatchFetch(worker, rsc(`/lessons/${LESSON_ID}?_rsc=x2`));
    const state = track(tap.response());
    await vi.advanceTimersByTimeAsync(9000);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await (await tap.response()).text()).toBe("payload");
    expect([...caches.stores.values()].every((cache) => cache.entries.size === 0)).toBe(true);
  });

  it("passes a quick answer straight through without reading the database", async () => {
    const db = fakeIndexedDB({ lessons: {}, meta: { owner } });
    const network = fakeNetwork({ [`/lessons/${LESSON_ID}`]: file("payload", "text/x-component") });
    const worker = loadWorker({ version: "v1", network, indexedDB: db.indexedDB });
    const tap = dispatchFetch(worker, rsc(`/lessons/${LESSON_ID}?_rsc=x3`));
    expect(await (await tap.response()).text()).toBe("payload");
    expect(db.indexedDB.open).not.toHaveBeenCalled();
  });
});

describe("page loads", () => {
  const owner = { key: "owner", userId: "user-a", fullName: "Amna", role: "student" };

  /** "visitor": nobody signed in here; "owner": signed in, nothing saved; "saved": owner + a saved lesson. */
  function family(kind: "visitor" | "owner" | "saved") {
    if (kind === "visitor") return fakeIndexedDB(null).indexedDB;
    return fakeIndexedDB({
      lessons: kind === "saved" ? { [LESSON_ID]: { id: LESSON_ID, ownerId: "user-a" } } : {},
      meta: { owner },
    }).indexedDB;
  }

  async function offlineWorker({
    shells = true,
    audio = false,
    indexedDB,
    network,
  }: { shells?: boolean; audio?: boolean; indexedDB?: unknown; network?: ReturnType<typeof fakeNetwork> } = {}) {
    const caches = new FakeCacheStorage();
    if (shells) {
      await caches.seed("amal-shell-v1", "/offline", html("hub"));
      await caches.seed("amal-shell-v1", "/offline/play", html("player"));
      await caches.seed("amal-shell-v1", "/privacy", html("privacy"));
    }
    if (audio) await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}`, file("a", "audio/mp4"));
    return loadWorker({ version: "v1", caches, indexedDB, network });
  }

  it("opens the offline shells from this build's cache, without waiting on the network", async () => {
    const { network } = hangingNetwork();
    const worker = await offlineWorker({ network });
    await worker.caches.seed("amal-shell-v0", "/offline/play", html("older build's player"));

    const player = await dispatchFetch(worker, navigation(`/offline/play?id=${LESSON_ID}`)).response();
    expect(await player.text()).toContain("<body>player");
    const hub = await dispatchFetch(worker, navigation("/offline/")).response();
    expect(await hub.text()).toContain("hub");
    expect(network).not.toHaveBeenCalled();
  });

  it("fetches a shell missing from this build's cache, but never stores it", async () => {
    const caches = new FakeCacheStorage();
    const worker = loadWorker({ version: "v1", caches, network: fakeNetwork({ "/offline": html("fresh hub") }) });
    const load = dispatchFetch(worker, navigation("/offline"));
    expect(await (await load.response()).text()).toContain("fresh hub");
    await load.settled();
    expect(caches.stores.get("amal-shell-v1")?.has("/offline") ?? false).toBe(false);
  });

  it("keeps the public pages fresh", async () => {
    const caches = new FakeCacheStorage();
    const network = fakeNetwork({ "/parents": html("for parents"), "/practice/1": html("Practice for Amna") });
    const worker = loadWorker({ version: "v1", caches, network });
    for (const url of ["/parents", "/practice/1"]) await dispatchFetch(worker, navigation(url)).settled();
    expect(caches.stores.get("amal-shell-v1")!.has("/parents")).toBe(true);
    expect(caches.stores.get("amal-shell-v1")!.has("/practice/1")).toBe(false);
  });

  it("sends a downloaded lesson to the offline player", async () => {
    const worker = await offlineWorker({ audio: true });
    const response = await dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`)).response();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/offline/play?id=${LESSON_ID}`);
  });

  it("sends a lesson that isn't downloaded, and other app pages, to the hub when a family is signed in", async () => {
    const worker = await offlineWorker({ indexedDB: family("owner") });
    for (const url of [`/lessons/${LESSON_ID}`, "/dashboard", "/downloads", "/auth/login", "/terms"]) {
      const response = await dispatchFetch(worker, navigation(url)).response();
      expect(response.status, url).toBe(302);
      expect(response.headers.get("Location"), url).toBe(`${ORIGIN}/offline`);
    }
  });

  it("never sends a visitor to the saved-lessons hub", async () => {
    const worker = await offlineWorker({ indexedDB: family("visitor") });
    for (const url of ["/dashboard", "/practice/1", `/lessons/${LESSON_ID}`, "/terms", "/sample-lesson"]) {
      const response = await dispatchFetch(worker, navigation(url)).response();
      expect(response.status, url).toBe(503);
      expect(await response.text(), url).toContain("You're offline");
    }
    const privacy = await dispatchFetch(worker, navigation("/privacy")).response();
    expect(await privacy.text()).toContain("privacy");
  });

  it("serves the cached shells and public pages", async () => {
    const worker = await offlineWorker();
    const player = await dispatchFetch(worker, navigation(`/offline/play?id=${LESSON_ID}`)).response();
    expect(await player.text()).toContain("player");
    const hub = await dispatchFetch(worker, navigation("/offline")).response();
    expect(await hub.text()).toContain("hub");
    const privacy = await dispatchFetch(worker, navigation("/privacy?ref=x")).response();
    expect(await privacy.text()).toContain("privacy");
  });

  it("shows a bilingual offline page when nothing is cached", async () => {
    const worker = await offlineWorker({ shells: false, audio: true });
    for (const url of ["/dashboard", "/offline", `/lessons/${LESSON_ID}`]) {
      const response = await dispatchFetch(worker, navigation(url)).response();
      expect(response.status, url).toBe(503);
      const body = await response.text();
      expect(body).toContain("You're offline");
      expect(body).toContain('dir="rtl"');
      expect(body).toContain("أنت غير متصل بالإنترنت");
    }
  });

  describe("when the network hangs (lie-fi)", () => {
    async function hangingWorker(kind: "visitor" | "owner" | "saved") {
      vi.useFakeTimers();
      const { network } = hangingNetwork();
      return offlineWorker({ network, indexedDB: family(kind) });
    }

    it("opens a downloaded lesson in the player after 4 s", async () => {
      const worker = await hangingWorker("saved");
      const load = dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`));
      const state = track(load.response());
      await vi.advanceTimersByTimeAsync(3900);
      expect(state.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect((await load.response()).headers.get("Location")).toBe(`${ORIGIN}/offline/play?id=${LESSON_ID}`);
    });

    it("sends other app pages to the hub after 8 s, when there are saved lessons to show", async () => {
      const worker = await hangingWorker("saved");
      const load = dispatchFetch(worker, navigation("/dashboard"));
      const state = track(load.response());
      await vi.advanceTimersByTimeAsync(7900);
      expect(state.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect((await load.response()).headers.get("Location")).toBe(`${ORIGIN}/offline`);
    });

    it("gives a page opened from the hub or the player 20 s", async () => {
      const worker = await hangingWorker("saved");
      const retry = dispatchFetch(worker, navigation("/dashboard", { referrer: "/offline" }));
      const full = dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`, { referrer: `/offline/play?id=${LESSON_ID}` }));
      const states = [track(retry.response()), track(full.response())];
      await vi.advanceTimersByTimeAsync(19900);
      expect(states.map((state) => state.settled)).toEqual([false, false]);
      await vi.advanceTimersByTimeAsync(200);
      expect((await retry.response()).headers.get("Location")).toBe(`${ORIGIN}/offline`);
      expect((await full.response()).headers.get("Location")).toBe(`${ORIGIN}/offline/play?id=${LESSON_ID}`);
    });

    it("keeps waiting when there's nothing useful offline", async () => {
      const visitor = await hangingWorker("visitor");
      const owner = await offlineWorker({ network: hangingNetwork().network, indexedDB: family("owner") });
      const loads = [
        // A visitor's marketing and app pages.
        dispatchFetch(visitor, navigation("/parents")),
        dispatchFetch(visitor, navigation("/practice/1")),
        dispatchFetch(visitor, navigation("/dashboard")),
        // A family with nothing saved: the dashboard, and a lesson they didn't save.
        dispatchFetch(owner, navigation("/dashboard")),
        dispatchFetch(owner, navigation(`/lessons/${LESSON_ID}`)),
      ];
      const states = loads.map((load) => track(load.response()));
      await vi.advanceTimersByTimeAsync(30000);
      expect(states.map((state) => state.settled)).toEqual([false, false, false, false, false]);
    });

    it("serves a cached public page after 4 s", async () => {
      const worker = await hangingWorker("visitor");
      const load = dispatchFetch(worker, navigation("/privacy"));
      const state = track(load.response());
      await vi.advanceTimersByTimeAsync(3900);
      expect(state.settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(await (await load.response()).text()).toContain("privacy");
    });

    it("still returns a slow page that arrives before the time limit", async () => {
      vi.useFakeTimers();
      const slow = vi.fn(
        () => new Promise<Response>((resolve) => setTimeout(() => resolve(html("your dashboard")), 6000))
      );
      const worker = await offlineWorker({ network: slow as never, indexedDB: family("saved") });
      const load = dispatchFetch(worker, navigation("/dashboard"));
      await vi.advanceTimersByTimeAsync(6100);
      expect(await (await load.response()).text()).toContain("your dashboard");
    });
  });
});

describe("downloaded-lesson check", () => {
  const owner = { key: "owner", userId: "user-a", fullName: "Amna", role: "student" };

  it("never creates the database when it doesn't exist", async () => {
    const { indexedDB, state } = fakeIndexedDB(null);
    const caches = new FakeCacheStorage();
    await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}`, file("a", "audio/mp4"));
    const { internals } = loadWorker({ version: "v1", caches, indexedDB });

    expect(await internals.lessonDownloadState(LESSON_ID)).toBe("no");
    expect(await internals.isLessonDownloaded(LESSON_ID)).toBe(false);
    expect(state.aborted).toBe(true);
    expect(state.versions.every((version) => version === undefined)).toBe(true);
  });

  it("counts a lesson only when the owner on this phone saved it", async () => {
    const owned = fakeIndexedDB({
      lessons: { [LESSON_ID]: { id: LESSON_ID, ownerId: "user-a" } },
      meta: { owner },
      "progress-queue": {},
    });
    const worker = loadWorker({ version: "v1", indexedDB: owned.indexedDB });
    expect(await worker.internals.lessonDownloadState(LESSON_ID)).toBe("yes");
    expect(await worker.internals.lessonDownloadState("someone-else")).toBe("no");
    expect(owned.state.closed).toBe(2);

    const foreign = fakeIndexedDB({
      lessons: { [LESSON_ID]: { id: LESSON_ID, ownerId: "user-b" } },
      meta: { owner },
    });
    expect(await loadWorker({ version: "v1", indexedDB: foreign.indexedDB }).internals.lessonDownloadState(LESSON_ID)).toBe(
      "no"
    );
  });

  it("treats an old database without the owner store as having no downloads", async () => {
    const legacy = fakeIndexedDB({ lessons: { [LESSON_ID]: { id: LESSON_ID } } });
    expect(await loadWorker({ version: "v1", indexedDB: legacy.indexedDB }).internals.lessonDownloadState(LESSON_ID)).toBe(
      "no"
    );
    const empty = fakeIndexedDB({});
    expect(await loadWorker({ version: "v1", indexedDB: empty.indexedDB }).internals.lessonDownloadState(LESSON_ID)).toBe(
      "no"
    );
  });

  it("falls back to the saved audio when the database can't be read", async () => {
    const broken = { open: vi.fn(() => { throw new Error("SecurityError"); }) };
    const caches = new FakeCacheStorage();
    await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}`, file("a", "audio/mp4"));
    const { internals } = loadWorker({ version: "v1", caches, indexedDB: broken });
    expect(await internals.lessonDownloadState(LESSON_ID)).toBe("unknown");
    expect(await internals.isLessonDownloaded(LESSON_ID)).toBe(true);
    expect(await internals.isLessonDownloaded("other")).toBe(false);
  });

  it("finds audio saved under a per-save key when the database can't be read", async () => {
    const broken = { open: vi.fn(() => { throw new Error("SecurityError"); }) };
    const caches = new FakeCacheStorage();
    await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}?v=abc123`, file("a", "audio/mp4"));
    const { internals } = loadWorker({ version: "v1", caches, indexedDB: broken });
    expect(await internals.isLessonDownloaded(LESSON_ID)).toBe(true);
  });

  it("tells whether a family is signed in here and has saved anything", async () => {
    const mixed = fakeIndexedDB({
      lessons: {
        a: { id: "a", ownerId: "user-b" },
        b: { id: "b", ownerId: "user-a" },
        c: { id: "c", ownerId: "user-a" },
      },
      meta: { owner },
    });
    expect(await loadWorker({ version: "v1", indexedDB: mixed.indexedDB }).internals.offlineFamily()).toEqual({
      owner: true,
      owned: true,
    });
    // Stops at the first lesson that is theirs.
    expect(mixed.state.cursorSteps).toBe(2);

    const foreign = fakeIndexedDB({ lessons: { a: { id: "a", ownerId: "user-b" } }, meta: { owner } });
    expect(await loadWorker({ version: "v1", indexedDB: foreign.indexedDB }).internals.offlineFamily()).toEqual({
      owner: true,
      owned: false,
    });

    const signedOut = fakeIndexedDB({ lessons: { a: { id: "a", ownerId: "user-a" } }, meta: {} });
    expect(await loadWorker({ version: "v1", indexedDB: signedOut.indexedDB }).internals.offlineFamily()).toEqual({
      owner: false,
      owned: false,
    });

    const missing = fakeIndexedDB(null);
    expect(await loadWorker({ version: "v1", indexedDB: missing.indexedDB }).internals.readOfflineRecords(null)).toEqual({
      owner: false,
      owned: false,
    });
    expect(missing.state.aborted).toBe(true);
  });

  it("falls back to the saved audio for the whole phone when the database can't be read", async () => {
    const broken = { open: vi.fn(() => { throw new Error("SecurityError"); }) };
    const caches = new FakeCacheStorage();
    expect(await loadWorker({ version: "v1", caches, indexedDB: broken }).internals.offlineFamily()).toEqual({
      owner: false,
      owned: false,
    });
    await caches.seed("sim-audio-downloads", `/offline-audio/${LESSON_ID}`, file("a", "audio/mp4"));
    expect(await loadWorker({ version: "v1", caches, indexedDB: broken }).internals.offlineFamily()).toEqual({
      owner: true,
      owned: true,
    });
  });

  it("redirects an owned lesson to the player using the database", async () => {
    const owned = fakeIndexedDB({ lessons: { [LESSON_ID]: { id: LESSON_ID, ownerId: "user-a" } }, meta: { owner } });
    const caches = new FakeCacheStorage();
    await caches.seed("amal-shell-v1", "/offline", html("hub"));
    await caches.seed("amal-shell-v1", "/offline/play", html("player"));
    const worker = loadWorker({ version: "v1", caches, indexedDB: owned.indexedDB });
    const response = await dispatchFetch(worker, navigation(`/lessons/${LESSON_ID}`)).response();
    expect(response.headers.get("Location")).toBe(`${ORIGIN}/offline/play?id=${LESSON_ID}`);
  });
});
