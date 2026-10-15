// The save pipeline end to end, with IndexedDB replaced by in-memory maps and
// Cache Storage, fetch and Supabase by small fakes. Timers are fake so stalls
// of minutes run in milliseconds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DownloadState, OfflineLesson } from "@/lib/offline/db";

const store = vi.hoisted(() => ({
  lessons: new Map<string, OfflineLesson>(),
  states: new Map<string, DownloadState>(),
  refs: new Map<string, { key: string; lessons: string[]; bytes: number }>(),
  failCommit: null as Error | null,
}));

vi.mock("@/lib/offline/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/db")>();
  return {
    ...actual,
    getOfflineLesson: async (id: string) => store.lessons.get(id) ?? null,
    getAllOfflineLessons: async () => [...store.lessons.values()],
    updateOfflineLesson: async (id: string, patch: Partial<OfflineLesson>) => {
      const current = store.lessons.get(id);
      if (!current) return null;
      const next = { ...current, ...patch, id };
      store.lessons.set(id, next);
      return next;
    },
    setDownloadState: async (state: DownloadState) => void store.states.set(state.lessonId, state),
    deleteDownloadState: async (id: string) => void store.states.delete(id),
    getAllDownloadStates: async () => [...store.states.values()],
    putLocalSlideResponses: async () => undefined,
    getAllAssetRefs: async () => [...store.refs.values()],
    commitOfflineLesson: async (
      lesson: OfflineLesson,
      { assetBytes, previousAssetUrls = [], state }: { assetBytes: Record<string, number>; previousAssetUrls?: string[]; state: DownloadState }
    ) => {
      if (store.failCommit) throw store.failCommit;
      const replacedAudioKey = actual.replacedAudioKey(store.lessons.get(lesson.id), lesson);
      store.lessons.set(lesson.id, lesson);
      store.states.set(lesson.id, state);
      const unreferencedUrls: string[] = [];
      for (const url of lesson.assetUrls ?? []) {
        const key = actual.assetMetaKey(url);
        store.refs.set(key, actual.addLessonToAssetRef(store.refs.get(key) ?? null, url, lesson.id, assetBytes[url] ?? 0));
      }
      for (const url of previousAssetUrls) {
        if (lesson.assetUrls?.includes(url)) continue;
        const key = actual.assetMetaKey(url);
        const ref = store.refs.get(key);
        if (!ref) continue;
        const next = actual.removeLessonFromAssetRef(ref, lesson.id);
        if (next) store.refs.set(key, next);
        else {
          store.refs.delete(key);
          unreferencedUrls.push(url);
        }
      }
      return { unreferencedUrls, replacedAudioKey };
    },
    removeOfflineLessonRecord: async (id: string) => {
      const record = store.lessons.get(id) ?? null;
      store.lessons.delete(id);
      store.states.delete(id);
      return { record, unreferencedUrls: [] };
    },
  };
});

vi.mock("@/lib/offline/identity", () => ({
  getOwner: async () => ({ key: "owner", userId: "user-1", fullName: "Test", role: "student", savedAt: "" }),
  adoptOwnerIfUnclaimed: async () => null,
}));

vi.mock("@/lib/offline/sync", () => ({
  fetchPracticeGate: async () => null,
  withTimeout: <T,>(promise: PromiseLike<T>) => Promise.resolve(promise),
}));

vi.mock("@/lib/offline/warm", () => ({ warmOfflinePlayerChunks: async () => undefined }));
// This test browser has no service worker; a real phone that can save does.
vi.mock("@/lib/offline/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/support")>()),
  canSaveOfflineHere: () => true,
}));

vi.mock("@/lib/offline/slide-responses", () => ({ serverResponsesToLocal: () => ({}) }));

// ── Fakes ────────────────────────────────────────────────────────────────────

const ORIGIN = "https://amal.test";
const AUDIO_URL = "https://sb.test/storage/v1/object/sign/sim-audio/a.webm?token=1";
const IMG = (n: number) => `https://sb.test/storage/v1/object/public/lessons/${n}.png`;

function absolute(input: RequestInfo | URL | { url: string }): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, ORIGIN).href;
}

function withoutSearch(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

class MemCache {
  entries = new Map<string, { body: ArrayBuffer | null; headers: [string, string][]; opaque: boolean }>();
  puts: string[] = [];
  private find(input: RequestInfo | URL, options?: CacheQueryOptions) {
    const wanted = absolute(input);
    return [...this.entries.keys()].filter((key) =>
      options?.ignoreSearch ? withoutSearch(key) === withoutSearch(wanted) : key === wanted
    );
  }
  async match(input: RequestInfo | URL, options?: CacheQueryOptions) {
    const key = this.find(input, options)[0];
    const entry = key ? this.entries.get(key) : undefined;
    if (!entry) return undefined;
    return new Response(entry.body ? entry.body.slice(0) : null, { headers: entry.headers });
  }
  async put(input: RequestInfo | URL, response: Response) {
    const opaque = response.type === "opaque";
    const body = opaque ? null : await response.arrayBuffer();
    const key = absolute(input);
    this.puts.push(key);
    this.entries.set(key, { body, headers: opaque ? [] : [...response.headers.entries()], opaque });
  }
  async delete(input: RequestInfo | URL, options?: CacheQueryOptions) {
    const keys = this.find(input, options);
    for (const key of keys) this.entries.delete(key);
    return keys.length > 0;
  }
  async keys(input?: RequestInfo | URL, options?: CacheQueryOptions) {
    const keys = input ? this.find(input, options) : [...this.entries.keys()];
    return keys.map((url) => new Request(url));
  }
}

class MemCacheStorage {
  stores = new Map<string, MemCache>();
  async open(name: string) {
    let cache = this.stores.get(name);
    if (!cache) this.stores.set(name, (cache = new MemCache()));
    return cache;
  }
  async has(name: string) {
    return this.stores.has(name);
  }
  async delete(name: string) {
    return this.stores.delete(name);
  }
}

/** Web Locks for one name, shared and exclusive, per test (Node's own are process-wide). */
class FakeLocks {
  shared = 0;
  exclusive = false;
  private waiters: (() => void)[] = [];
  private free(mode: string) {
    return mode === "shared" ? !this.exclusive : !this.exclusive && this.shared === 0;
  }
  async request<T>(_name: string, options: { mode?: string; ifAvailable?: boolean }, task: (lock: object | null) => Promise<T>) {
    const mode = options.mode ?? "exclusive";
    if (!this.free(mode)) {
      if (options.ifAvailable) return task(null);
      await new Promise<void>((resolve) => {
        const retry = () => (this.free(mode) ? resolve() : this.waiters.push(retry));
        this.waiters.push(retry);
      });
    }
    if (mode === "shared") this.shared += 1;
    else this.exclusive = true;
    try {
      return await task({ name: _name, mode });
    } finally {
      if (mode === "shared") this.shared -= 1;
      else this.exclusive = false;
      for (const retry of this.waiters.splice(0)) retry();
    }
  }
}

/** A body sending `perTick` bytes every `tickMs` up to `total`; stops for good after `stallAfter`; errors on abort. */
function slowBody(total: number, perTick: number, tickMs: number, signal?: AbortSignal | null, stallAfter = Infinity) {
  let sent = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const onAbort = () => {
        clearTimeout(timer);
        try {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        } catch {
          // Already closed.
        }
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const tick = () => {
        if (sent >= total) return controller.close();
        if (sent >= stallAfter) return;
        const n = Math.min(perTick, total - sent);
        controller.enqueue(new Uint8Array(n));
        sent += n;
        timer = setTimeout(tick, tickMs);
      };
      timer = setTimeout(tick, tickMs);
    },
  });
}

type ImagePlan =
  | { kind: "ok"; bytes?: number; tickMs?: number; stallAfter?: number }
  | { kind: "status"; status: number }
  | { kind: "unreachable" };

interface Plan {
  images: Record<string, ImagePlan>;
  audioBytes: number;
  sim: "ok" | "none";
  log: string[];
}

let plan: Plan;
let cacheStorage: MemCacheStorage;

function simPayload(lessonId: string, imageUrls: string[]) {
  return {
    sim: {
      id: `sim-${lessonId}`,
      lesson_id: lessonId,
      duration_ms: 60000,
      deck_snapshot: imageUrls.map((url, i) => ({ id: `s${i}`, type: "content", image_url: url })),
      events: [],
      audio_path: `${lessonId}/a.webm`,
      audio_duration_ms: 60000,
      audio_mime: "audio/webm",
      recorded_by: null,
      recorded_at: "2026-10-01T00:00:00Z",
      clip_segments: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-01T00:00:00Z",
    },
    audio_url: AUDIO_URL,
  };
}

function installFetch() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const signal = init.signal ?? null;
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const sim = url.match(/^\/api\/lessons\/([^/]+)\/sim$/);
    if (sim) {
      plan.log.push(`sim ${sim[1]}`);
      return Response.json({ sim: plan.sim === "none" ? null : simPayload(sim[1], Object.keys(plan.images)) });
    }
    if (url.endsWith("/slides")) return Response.json({ slideDeck: null });
    if (url.endsWith("/slide-responses")) return Response.json({ responses: [] });
    if (url === AUDIO_URL) {
      plan.log.push("audio");
      return new Response(slowBody(plan.audioBytes, 1000, 10, signal), {
        headers: { "content-type": "audio/webm", "content-length": String(plan.audioBytes) },
      });
    }
    const image = plan.images[url];
    if (image) {
      plan.log.push(`${init.mode ?? "default"} ${url}`);
      if (image.kind === "unreachable") throw new TypeError("Failed to fetch");
      if (image.kind === "status") return new Response("nope", { status: image.status });
      const bytes = image.bytes ?? 2000;
      return new Response(slowBody(bytes, 1000, image.tickMs ?? 10, signal, image.stallAfter), {
        headers: { "content-type": "image/png", "content-length": String(bytes) },
      });
    }
    throw new TypeError(`unexpected fetch ${url}`);
  });
}

type Handler = (table: string, query: { cols: string; single: boolean }) => { data: unknown; error: unknown } | "hang";

const lessonRow = (id: string) => ({
  id,
  title_ar: "درس",
  title_en: `Lesson ${id}`,
  description_ar: null,
  description_en: null,
  grade_level: 1,
  subject_id: "subject-1",
  thumbnail_url: null,
  video_url_720p: null,
  quiz_settings: null,
  updated_at: "2026-10-01T00:00:00Z",
  subjects: { name_ar: "رياضيات", name_en: "Math" },
});

const defaultHandler: Handler = (table, { single }) => {
  if (table === "lessons" && single) return { data: lessonRow("L"), error: null };
  return { data: single ? null : [], error: null };
};

/** A PostgREST-like builder: an aborted request resolves with `{ error }`, like postgrest-js. */
function fakeSupabase(handler: Handler = defaultHandler) {
  const calls: string[] = [];
  const from = (table: string) => {
    let cols = "";
    let lessonId: string | null = null;
    let signal: AbortSignal | null = null;
    const aborted = () => ({ data: null, error: { message: "AbortError: aborted", code: "" } });
    const settle = (single: boolean) => {
      calls.push(`${table}${single ? ".single" : ""}`);
      if (signal?.aborted) return Promise.resolve(aborted());
      const result = handler(table, { cols, single });
      if (result === "hang") {
        return new Promise((resolve) => signal?.addEventListener("abort", () => resolve(aborted()), { once: true }));
      }
      if (table === "lessons" && single && lessonId && (result.data as { id?: string } | null)?.id) {
        return Promise.resolve({ ...result, data: { ...(result.data as object), id: lessonId, title_en: `Lesson ${lessonId}` } });
      }
      return Promise.resolve(result);
    };
    const builder: Record<string, unknown> = {};
    builder.select = (value: string) => ((cols = value), builder);
    builder.eq = (column: string, value: string) => {
      if (column === "id") lessonId = value;
      return builder;
    };
    for (const method of ["in", "order", "not", "limit", "neq", "is"]) builder[method] = () => builder;
    builder.setHeader = () => builder;
    builder.abortSignal = (value: AbortSignal) => ((signal = value), builder);
    builder.maybeSingle = () => settle(true);
    builder.single = () => settle(true);
    builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      settle(false).then(resolve, reject);
    return builder;
  };
  return {
    calls,
    client: {
      from,
      auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } }, error: null }) },
    } as never,
  };
}

/** Advances fake time in steps; between them lets real macrotasks run (a body chunk takes several to reach a reader). */
async function run(ms: number, step = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await vi.advanceTimersByTimeAsync(step);
    for (let k = 0; k < 20; k += 1) await new Promise((resolve) => setImmediate(resolve));
  }
}

let loaded: typeof import("@/lib/offline/download-manager") | null = null;

async function load() {
  vi.resetModules();
  loaded = await import("@/lib/offline/download-manager");
  return loaded;
}

/** Starts a download and records how it settled. */
function track<T>(promise: Promise<T>) {
  const outcome: { value?: T; error?: { name: string; code?: string }; settled: boolean } = { settled: false };
  promise.then(
    (value) => Object.assign(outcome, { value, settled: true }),
    (error: { name: string; code?: string }) => Object.assign(outcome, { error, settled: true })
  );
  return outcome;
}

function savedRecord(id: string, overrides: Partial<OfflineLesson> = {}): OfflineLesson {
  return {
    id,
    title_ar: "درس",
    title_en: `Lesson ${id}`,
    grade_level: 1,
    sim: null,
    slides: null,
    questions: [],
    tasks: [],
    thumbnailUrl: null,
    audioSize: 3,
    downloadedAt: "2026-09-01T00:00:00Z",
    schema: 2,
    ownerId: "user-1",
    simId: "sim-old",
    simUpdatedAt: "2026-09-01T00:00:00Z",
    assetUrls: [],
    ...overrides,
  };
}

async function audioCache() {
  return cacheStorage.open("sim-audio-downloads");
}

async function assetCache() {
  return cacheStorage.open("amal-lesson-assets");
}

beforeEach(() => {
  store.lessons.clear();
  store.states.clear();
  store.refs.clear();
  store.failCommit = null;
  plan = { images: {}, audioBytes: 3000, sim: "ok", log: [] };
  cacheStorage = new MemCacheStorage();
  vi.stubGlobal("caches", cacheStorage);
  vi.stubGlobal("navigator", { locks: new FakeLocks() });
  installFetch();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  // Stop whatever a test left running, so it can't reach the next one's fakes.
  loaded?.abortAllDownloads();
  loaded = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("save pipeline", { timeout: 60_000 }, () => {
  it("saves a lesson: images first, then the audio under a key of its own", async () => {
    const dm = await load();
    plan.images = { [IMG(1)]: { kind: "ok" }, [IMG(2)]: { kind: "ok" } };
    const save = track(dm.downloadLesson("L1", fakeSupabase().client));
    await run(2_000);

    expect(save.error).toBeUndefined();
    expect(save.value?.audioKey).toMatch(/^\/offline-audio\/L1\?v=/);
    expect(plan.log.indexOf("audio")).toBeGreaterThan(plan.log.lastIndexOf(`cors ${IMG(2)}`));
    const audio = await audioCache();
    expect([...audio.entries.keys()]).toEqual([`${ORIGIN}${save.value?.audioKey}`]);
    expect(store.lessons.get("L1")?.assetUrls).toEqual([IMG(1), IMG(2)]);
    expect(store.states.get("L1")?.status).toBe("completed");
  });

  describe("images (OFF-08)", () => {
    it("fails a save whose image stops arriving, instead of hanging, and frees the queue", async () => {
      const dm = await load();
      plan.images = {
        // Stops after 2 KB for good.
        [IMG(1)]: { kind: "ok", bytes: 64_000, stallAfter: 2000 },
        // Healthy but slow: still arriving when the other one is given up on.
        [IMG(2)]: { kind: "ok", bytes: 100_000, tickMs: 1_000 },
      };
      const first = track(dm.downloadLesson("L1", fakeSupabase().client));
      // Queued behind it.
      track(dm.downloadLesson("L2", fakeSupabase().client));
      await run(29_000);
      expect(first.settled).toBe(false);
      await run(5_000);

      expect(first.error?.name).toBe("DownloadError");
      expect(first.error?.code).toBe("network");
      // No audio was fetched for it, and the sibling was stopped rather than stored later.
      expect(plan.log).not.toContain("audio");
      await run(100_000, 1_000);
      expect((await assetCache()).puts).not.toContain(IMG(2));
      // The queue moved on.
      expect(plan.log).toContain("sim L2");
    });

    it("stops a stalled image as soon as the save is cancelled and stores nothing", async () => {
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "ok", bytes: 64_000, stallAfter: 2000 } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(3_000);
      dm.cancelDownload("L1");
      await run(500);

      expect(save.error?.name).toBe("DownloadCancelledError");
      expect((await assetCache()).puts).toEqual([]);
      expect(store.states.has("L1")).toBe(false);
    });

    it("keeps a slow image that is still arriving (the limit is per chunk, not per image)", async () => {
      const dm = await load();
      // 60 chunks, one every 2 s: two minutes in all.
      plan.images = { [IMG(1)]: { kind: "ok", bytes: 60_000, tickMs: 2_000 } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(130_000, 1_000);
      expect(save.error).toBeUndefined();
      expect(save.value?.assetUrls).toEqual([IMG(1)]);
    });
  });

  describe("broken image links (OFF-09)", () => {
    it("saves the lesson without an image that is gone (404), never fetching audio twice", async () => {
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "ok" }, [IMG(2)]: { kind: "status", status: 404 } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(2_000);

      expect(save.error).toBeUndefined();
      expect(save.value?.missingAssetUrls).toEqual([IMG(2)]);
      expect(save.value?.assetUrls).toEqual([IMG(1)]);
      expect(store.refs.has(`asset:${IMG(2)}`)).toBe(false);
      expect(plan.log.filter((entry) => entry === "audio")).toHaveLength(1);
    });

    it("treats an unreachable image as missing only when the server answers", async () => {
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "unreachable" } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(2_000);

      expect(save.error).toBeUndefined();
      expect(save.value?.missingAssetUrls).toEqual([IMG(1)]);
      // Retried once (cors, then no-cors, twice) before calling it dead.
      expect(plan.log.filter((entry) => entry.endsWith(IMG(1)))).toHaveLength(4);
    });

    it("fails without fetching the audio when the connection is down too", async () => {
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "unreachable" } };
      // The bundle's lesson row works; the later "is the server there?" check hangs.
      let lessonReads = 0;
      const supabase = fakeSupabase((table, query) => {
        if (table === "lessons" && query.single) return (lessonReads += 1) === 1 ? { data: lessonRow("L1"), error: null } : "hang";
        return { data: query.single ? null : [], error: null };
      });
      const save = track(dm.downloadLesson("L1", supabase.client));
      await run(15_000);

      expect(save.error?.code).toBe("network");
      expect(plan.log).not.toContain("audio");
    });

    it("fails on a passing server error, before the audio", async () => {
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "status", status: 503 } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(2_000);
      expect(save.error?.code).toBe("network");
      expect(plan.log).not.toContain("audio");
    });

    it("classifies statuses", async () => {
      const { isPermanentAssetStatus } = await import("@/lib/offline/assets");
      expect([400, 401, 403, 404, 410].every(isPermanentAssetStatus)).toBe(true);
      expect([408, 425, 429, 500, 503, undefined].some(isPermanentAssetStatus)).toBe(false);
    });
  });

  describe("previous/next lookup (OFF-28)", () => {
    const stalledPaths: Handler = (table, query) => (table === "learning_paths" ? "hang" : defaultHandler(table, query));

    it("saves without waiting for a stalled lookup, keeping the old copy's neighbours", async () => {
      const dm = await load();
      const neighbors = { prev: { id: "L0", title_ar: "أ", title_en: "A" }, next: null };
      store.lessons.set("L1", savedRecord("L1", { neighbors }));
      const save = track(dm.downloadLesson("L1", fakeSupabase(stalledPaths).client));
      const queued = track(dm.downloadLesson("L2", fakeSupabase().client));
      await run(14_000);
      expect(save.settled).toBe(false);
      await run(3_000);

      expect(save.value?.neighbors).toEqual(neighbors);
      await run(2_000);
      expect(queued.value?.id).toBe("L2");
    });

    it("cancels during a stalled lookup", async () => {
      const dm = await load();
      const save = track(dm.downloadLesson("L1", fakeSupabase(stalledPaths).client));
      await run(3_000);
      dm.cancelDownload("L1");
      await run(500);
      expect(save.error?.name).toBe("DownloadCancelledError");
    });
  });

  describe("automatic downloads (OFF-27)", () => {
    it("never takes over a manual save of the same lesson", async () => {
      const dm = await load();
      plan.audioBytes = 50_000; // 0.5 s of audio
      const manual = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(200);
      const progress: number[] = [];
      const auto = track(dm.downloadLesson("L1", fakeSupabase().client, (state) => progress.push(state.progress), { origin: "auto" }));
      await run(3_000);

      expect(auto.error?.name).toBe("DownloadCancelledError");
      expect(progress).toEqual([]);
      expect(manual.value?.origin).toBe("manual");
      expect(plan.log.filter((entry) => entry === "audio")).toHaveLength(1);
    });
  });

  describe("updates (OFF-29)", () => {
    it("keeps the working copy when saving the update fails", async () => {
      const dm = await load();
      const old = savedRecord("L1", { audioKey: "/offline-audio/L1?v=old" });
      store.lessons.set("L1", old);
      await (await audioCache()).put("/offline-audio/L1?v=old", new Response("old"));
      store.failCommit = new DOMException("full", "QuotaExceededError");

      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(2_000);

      expect(save.error?.code).toBe("storage_full");
      expect(store.lessons.get("L1")).toEqual(old);
      expect([...(await audioCache()).entries.keys()]).toEqual([`${ORIGIN}/offline-audio/L1?v=old`]);
    });

    it("deletes the replaced audio once the update is saved, including a pre-versioning copy", async () => {
      const dm = await load();
      store.lessons.set("L1", savedRecord("L1"));
      await (await audioCache()).put("/offline-audio/L1", new Response("old"));

      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(2_000);

      expect(save.error).toBeUndefined();
      expect([...(await audioCache()).entries.keys()]).toEqual([`${ORIGIN}${save.value?.audioKey}`]);
    });

    it("picks the key to delete from the record being replaced", async () => {
      const { audioKeyFor, replacedAudioKey } = await import("@/lib/offline/db");
      expect(audioKeyFor({ id: "a" })).toBe("/offline-audio/a");
      expect(replacedAudioKey(null, { id: "a", audioKey: "/offline-audio/a?v=2" })).toBeNull();
      expect(replacedAudioKey({ id: "a" }, { id: "a", audioKey: "/offline-audio/a?v=2" })).toBe("/offline-audio/a");
      expect(replacedAudioKey({ id: "a", audioKey: "/offline-audio/a?v=2" }, { id: "a", audioKey: "/offline-audio/a?v=2" })).toBeNull();
    });
  });

  describe("lessons with no recording (OFF-31)", () => {
    it("fails at once with no_audio, cancels the rest of the batch and leaves no Retry row", async () => {
      const dm = await load();
      plan.sim = "none";
      const supabase = fakeSupabase((table, query) => (table === "lesson_tasks" ? "hang" : defaultHandler(table, query)));
      const save = track(dm.downloadLesson("L1", supabase.client));
      await run(500);

      expect(save.error?.code).toBe("no_audio");
      expect(store.states.has("L1")).toBe(false);
    });
  });

  describe("screen locked during a save (OFF-30)", () => {
    it("reports an interrupted save, not a connection problem", async () => {
      const listeners = new Set<() => void>();
      const doc = {
        visibilityState: "visible",
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
        createElement: () => ({ canPlayType: () => "maybe" }),
      };
      vi.stubGlobal("document", doc);
      const dm = await load();
      plan.images = { [IMG(1)]: { kind: "ok", bytes: 64_000, stallAfter: 2000 } };
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(1_000);
      doc.visibilityState = "hidden";
      for (const listener of listeners) listener();
      await run(40_000);

      expect(save.error?.code).toBe("interrupted");
      expect(store.states.get("L1")?.errorCode).toBe("interrupted");
    });
  });

  describe("orphan cleanup (OFF-45)", () => {
    it("removes images and audio no saved lesson uses, and keeps the rest", async () => {
      const dm = await load();
      store.lessons.set("L1", savedRecord("L1", { audioKey: "/offline-audio/L1?v=1", assetUrls: [IMG(1)] }));
      store.refs.set(`asset:${IMG(1)}`, { key: `asset:${IMG(1)}`, lessons: ["L1"], bytes: 1 });
      const audio = await audioCache();
      await audio.put("/offline-audio/L1?v=1", new Response("kept"));
      await audio.put("/offline-audio/L1?v=0", new Response("left by a dead page"));
      await audio.put("/offline-audio/L9", new Response("no record"));
      const assets = await assetCache();
      await assets.put(IMG(1), new Response("kept"));
      await assets.put(IMG(2), new Response("orphan"));

      const pruning = track(dm.pruneOrphanedStorage());
      await run(200);

      expect(pruning.value).toBe(3);
      expect([...audio.entries.keys()]).toEqual([`${ORIGIN}/offline-audio/L1?v=1`]);
      expect([...assets.entries.keys()]).toEqual([IMG(1)]);
    });

    it("leaves everything alone while a download runs", async () => {
      const dm = await load();
      plan.audioBytes = 200_000; // 2 s of audio
      const assets = await assetCache();
      await assets.put(IMG(9), new Response("not committed yet, maybe by another tab"));
      const save = track(dm.downloadLesson("L1", fakeSupabase().client));
      await run(300);
      const pruning = track(dm.pruneOrphanedStorage());
      await run(200);

      expect(pruning.value).toBe(0);
      expect(assets.entries.has(IMG(9))).toBe(true);
      await run(20_000);
      expect(save.settled).toBe(true);
    });

    it("never recreates a cache that logout deleted", async () => {
      const dm = await load();
      const pruning = track(dm.pruneOrphanedStorage());
      await run(100);
      expect(pruning.value).toBe(0);
      expect(cacheStorage.stores.size).toBe(0);
    });
  });
});
