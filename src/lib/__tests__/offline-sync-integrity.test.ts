/**
 * Answers and progress sent late, out of order, twice, or to a lesson the
 * family lost access to. Runs the real slide-responses.ts, sync.ts and the
 * real /api/lessons/[id]/slide-responses route against an in-memory database
 * and an in-memory replacement for the IndexedDB plumbing in db.ts (the
 * queueing decisions are db.ts's own pure planners).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  // Phone (IndexedDB stand-in)
  queue: new Map<number, Record<string, unknown>>(),
  meta: new Map<string, Record<string, unknown>>(),
  responses: new Map<string, { key: string; ownerId: string; learnerId: string; lessonId: string; bySlide: Record<string, Record<string, unknown>> }>(),
  nextQueueId: 1,
  // Server
  tables: {} as Record<string, Record<string, unknown>[]>,
  userId: "u1",
  ownedLearnerIds: ["u1"] as string[],
  hiddenLessons: new Set<string>(),
  allowedTypes: null as Set<string> | null,
  writeError: null as { code: string; message: string } | null,
  progressWriteError: null as { code: string; message: string } | null,
  lessonLookupError: null as { code: string; message: string } | null,
  upserts: [] as Row[],
  learnerHeaders: [] as string[],
  nextRowId: 1,
}));

const clone = <T,>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

// ── In-memory database with just enough of the query builder ────────────────
function query(table: string, { asService = false }: { asService?: boolean } = {}) {
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let values: Row | null = null;
  const filters: [string, unknown][] = [];
  const visible = (row: Row) =>
    asService || table !== "lessons" || !state.hiddenLessons.has(String(row.id));
  const inFilters: [string, unknown[]][] = [];
  const matches = (row: Row) =>
    filters.every(([key, value]) => row[key] === value) &&
    inFilters.every(([key, list]) => list.includes(row[key])) &&
    visible(row);

  async function run(mode: "many" | "maybe" | "single") {
    const rows = (state.tables[table] ??= []);
    if (table === "lessons" && op === "select" && !asService && state.lessonLookupError) {
      return { data: null, error: state.lessonLookupError };
    }
    if (op === "insert" || op === "update" || op === "upsert") {
      if (table === "lesson_slide_responses") {
        if (state.writeError) return { data: null, error: state.writeError };
        const type = String(values?.interaction_type ?? "");
        if (state.allowedTypes && values?.interaction_type !== undefined && !state.allowedTypes.has(type)) {
          return { data: null, error: { code: "23514", message: "violates check constraint lesson_slide_responses_interaction_type_check" } };
        }
      }
      if (table === "lesson_progress" && op === "upsert") {
        if (state.progressWriteError) return { data: null, error: state.progressWriteError };
        state.upserts.push(clone(values as Row));
        const existing = rows.find((row) => row.student_id === values?.student_id && row.lesson_id === values?.lesson_id);
        if (existing) Object.assign(existing, clone(values));
        else rows.push({ id: `row-${state.nextRowId++}`, ...clone(values) });
        return { data: null, error: null };
      }
    }
    if (op === "insert") {
      const row = { id: `row-${state.nextRowId++}`, ...clone(values) } as Row;
      rows.push(row);
      return { data: mode === "many" ? [clone(row)] : clone(row), error: null };
    }
    if (op === "update") {
      const hit = rows.filter(matches);
      for (const row of hit) Object.assign(row, clone(values));
      return { data: mode === "many" ? clone(hit) : hit[0] ? clone(hit[0]) : null, error: null };
    }
    const hit = rows.filter(matches);
    if (mode === "many") return { data: clone(hit), error: null };
    if (mode === "maybe") return { data: hit[0] ? clone(hit[0]) : null, error: null };
    return hit.length === 1
      ? { data: clone(hit[0]), error: null }
      : { data: null, error: { code: "PGRST116", message: "no rows" } };
  }

  const api: Record<string, unknown> = {
    select: () => api,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return api;
    },
    is: (key: string, value: unknown) => {
      filters.push([key, value]);
      return api;
    },
    in: (key: string, list: unknown[]) => {
      inFilters.push([key, list]);
      return api;
    },
    not: () => api,
    limit: () => api,
    order: () => api,
    setHeader: (name: string, value: string) => {
      if (name === "x-amal-learner") state.learnerHeaders.push(value);
      return api;
    },
    abortSignal: () => api,
    insert: (row: Row) => ((op = "insert"), (values = row), api),
    update: (row: Row) => ((op = "update"), (values = row), api),
    upsert: (row: Row) => ((op = "upsert"), (values = row), api),
    maybeSingle: () => run("maybe"),
    single: () => run("single"),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => run("many").then(resolve, reject),
  };
  return api;
}

function client({ asService = false } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: state.userId } }, error: null }) },
    from: (table: string) => query(table, { asService }),
    // The learner can open every published lesson in these tests.
    rpc: async (fn: string) =>
      fn === "can_user_access_published_lesson" ? { data: true, error: null } : { data: null, error: { message: `unexpected rpc ${fn}` } },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
vi.mock("@/lib/supabase/service", () => ({
  hasServiceRoleConfig: () => true,
  createServiceClient: () => client({ asService: true }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => client() }));

// ── In-memory stand-in for db.ts's IndexedDB plumbing ───────────────────────
vi.mock("@/lib/offline/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/db")>();
  const items = () => [...state.queue.values()].map((item) => clone(item));
  const unchanged = (current: Record<string, unknown> | undefined, item: { timestamp?: unknown; data?: unknown }) =>
    current && current.timestamp === item.timestamp && JSON.stringify(current.data) === JSON.stringify(item.data);
  return {
    ...actual,
    addQueueItem: async (item: Record<string, unknown>) => {
      const id = state.nextQueueId++;
      state.queue.set(id, { ...clone(item), learnerId: item.learnerId ?? item.ownerId, id });
    },
    getQueuedUpdates: async () => items(),
    countQueuedUpdates: async () => state.queue.size,
    clearQueuedUpdates: async (ids: number[]) => ids.forEach((id) => state.queue.delete(id)),
    removeQueueItemsIfUnchanged: async (list: { id?: number; timestamp: string; data: unknown }[]) => {
      for (const item of list) if (item.id !== undefined && unchanged(state.queue.get(item.id), item)) state.queue.delete(item.id);
    },
    setQueueItemsRetry: async (updates: { item: { id?: number; timestamp: string; data: unknown }; retry: unknown }[]) => {
      for (const { item, retry } of updates) {
        const current = item.id !== undefined ? state.queue.get(item.id) : undefined;
        if (unchanged(current, item)) state.queue.set(item.id as number, { ...current, retry: clone(retry) });
      }
    },
    queueSlideResponseItem: async (item: import("@/lib/offline/db").OfflineQueueItem) => {
      const local = state.responses.get(actual.responsesKey(item.ownerId, item.lessonId, item.learnerId))?.bySlide[String(item.data.slideId)];
      const queued = items().filter((candidate) => candidate.lessonId === item.lessonId) as never[];
      const plan = actual.planSlideAnswerQueue(local as never, queued, item);
      if (plan.action === "skip") return false;
      const id = plan.action === "replace" ? plan.id : state.nextQueueId++;
      state.queue.set(id, { lessonId: item.lessonId, ownerId: item.ownerId, learnerId: item.learnerId, kind: "slide_response", data: clone(item.data), timestamp: item.timestamp, id });
      return true;
    },
    removeQueuedSlideResponses: async (ownerId: string, lessonId: string, slideId: string, sent: import("@/lib/offline/db").AnswerVersion) => {
      const queued = items().filter((item) => item.lessonId === lessonId) as never[];
      for (const id of actual.supersededQueuedAnswerIds(queued, ownerId, slideId, sent)) state.queue.delete(id);
    },
    getLocalSlideResponses: async (ownerId: string, lessonId: string) =>
      clone(state.responses.get(actual.responsesKey(ownerId, lessonId)) ?? null),
    updateLocalSlideResponse: async (
      ownerId: string,
      lessonId: string,
      slideId: string,
      update: (current: import("@/lib/offline/db").LocalSlideResponse | undefined) => import("@/lib/offline/db").LocalSlideResponse | undefined,
      _epoch?: number,
      learnerId = ownerId
    ) => {
      const scopedKey = actual.responsesKey(ownerId, lessonId, learnerId);
      const record: { key: string; ownerId: string; learnerId: string; lessonId: string; bySlide: Record<string, Record<string, unknown>> } = state.responses.get(scopedKey) ?? { key: scopedKey, ownerId, learnerId: learnerId ?? ownerId, lessonId, bySlide: {} };
      const next = update(clone(record.bySlide[slideId]) as never);
      if (!next) return false;
      state.responses.set(scopedKey, { ...record, bySlide: { ...record.bySlide, [slideId]: clone(next) as never } });
      return true;
    },
    saveLocalProgressAndQueue: async (progress: Record<string, unknown>, queueData: Record<string, unknown>) => {
      state.meta.set(String(progress.key), clone(progress));
      const existing = items().find(
        (item) => item.lessonId === progress.lessonId && item.kind === "progress" && item.ownerId === progress.ownerId && item.learnerId === progress.learnerId
      );
      const next = {
        lessonId: progress.lessonId,
        ownerId: progress.ownerId,
        learnerId: progress.learnerId,
        kind: "progress",
        data: actual.nextProgressQueueData(existing as never, queueData),
        timestamp: progress.updatedAt,
      };
      const id = (existing?.id as number | undefined) ?? state.nextQueueId++;
      state.queue.set(id, { ...clone(next), id });
    },
    getLocalProgress: async (ownerId: string, lessonId: string, learnerId = ownerId) =>
      clone(state.meta.get(actual.localProgressKey(ownerId, lessonId, learnerId)) ?? null),
    putMeta: async (record: { key: string }) => void state.meta.set(record.key, clone(record)),
    getOfflineLesson: async (id: string) => ({ id, practice: null }),
  };
});

import { POST } from "@/app/api/lessons/[id]/slide-responses/route";
import { countUnsyncedItems, queueLessonProgress, syncOfflineQueue } from "@/lib/offline/sync";
import {
  postSlideResponse,
  queueSlideResponse,
  saveSlideResponseOffline,
  submitSlideResponse,
} from "@/lib/offline/slide-responses";

// ── The phone's fetch goes to the real route ────────────────────────────────
type FetchHook = (call: number, run: () => Promise<Response>, init: RequestInit) => Promise<Response>;
let fetchHook: FetchHook | null = null;
let fetchCalls = 0;

function routeFetch(url: string, init: RequestInit = {}) {
  const lessonId = decodeURIComponent(url.split("/")[3]);
  const run = () =>
    POST(new Request(`http://app.test${url}`, { method: "POST", body: init.body as string }) as never, {
      params: Promise.resolve({ id: lessonId }),
    });
  fetchCalls += 1;
  return fetchHook ? fetchHook(fetchCalls, run, init) : run();
}

const LESSON = "lesson-1";
const owner = { ownerId: "u1", lessonId: LESSON };
const wrong = { type: "choose_correct", selected_index: 0 };
const right = { type: "choose_correct", selected_index: 2 };

describe("learner-scoped offline writes", () => {
  it("sends the explicit learner header with an online answer", async () => {
    let seenHeader: string | null = null;
    fetchHook = (_call, run, init) => {
      seenHeader = new Headers(init.headers).get("x-amal-learner");
      return run();
    };
    await postSlideResponse(LESSON, "s1", right, { learnerId: "child-a" });
    expect(seenHeader).toBe("child-a");
  });

  it("syncs a queued child's progress only while the fresh learner list owns that child", async () => {
    state.ownedLearnerIds = ["u1", "child-a"];
    await queueLessonProgress({
      ownerId: "u1",
      learnerId: "child-a",
      lessonId: LESSON,
      positionSec: 20,
      watchSec: 20,
      completedCandidate: false,
      practiceGated: false,
    });
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ synced: 1, remaining: 0 });
    expect(state.upserts[0]).toMatchObject({ student_id: "child-a", lesson_id: LESSON });
    expect(state.learnerHeaders).toContain("child-a");
  });

  it("drops a deleted learner's queue without sending it under the account identity", async () => {
    await queueLessonProgress({
      ownerId: "u1",
      learnerId: "deleted-child",
      lessonId: LESSON,
      positionSec: 20,
      watchSec: 20,
      completedCandidate: false,
      practiceGated: false,
    });
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 1, learnerDataDropped: 1, remaining: 0 });
    expect(state.upserts).toHaveLength(0);
  });
});

function seedServer() {
  state.tables = {
    profiles: [
      { id: "u1", auth_user_id: "u1", parent_account_id: null, role: "parent" },
    ],
    lessons: [
      { id: LESSON, is_published: true, created_by: "teacher" },
      { id: "lesson-2", is_published: true, created_by: "teacher" },
      { id: "lesson-3", is_published: true, created_by: "teacher" },
    ],
    lesson_slides: ["lesson-1", "lesson-2", "lesson-3"].map((lessonId) => ({
      lesson_id: lessonId,
      slides: [
        { id: "s1", type: "activity", interaction_type: "choose_correct", interaction_options_en: ["a", "b", "c"], interaction_correct_index: 2 },
        { id: "draw", type: "activity", interaction_type: "draw_answer" },
      ],
    })),
    lesson_slide_responses: [],
    lesson_progress: [],
    learning_path_steps: [],
    homework_assignments: [],
  };
}

function serverAnswer(slideId = "s1", lessonId = LESSON) {
  const row = state.tables.lesson_slide_responses.find((r) => r.slide_id === slideId && r.lesson_id === lessonId);
  return row ? { answer: (row.response_data as Row).answer, attempts: row.attempts, is_correct: row.is_correct } : null;
}

const localEntry = (slideId = "s1", lessonId = LESSON) =>
  state.responses.get(`u1:u1:${lessonId}`)?.bySlide[slideId] as Record<string, unknown> | undefined;
const queued = () => [...state.queue.values()] as unknown as import("@/lib/offline/db").ProgressQueueItem[];

beforeEach(() => {
  state.queue.clear();
  state.meta.clear();
  state.responses.clear();
  state.nextQueueId = 1;
  state.hiddenLessons.clear();
  state.allowedTypes = null;
  state.writeError = null;
  state.progressWriteError = null;
  state.lessonLookupError = null;
  state.upserts = [];
  state.learnerHeaders = [];
  seedServer();
  state.ownedLearnerIds = [state.userId];
  fetchHook = null;
  fetchCalls = 0;
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/learners"
      ? Promise.resolve(Response.json({ accountId: state.userId, learners: state.ownedLearnerIds.map((id) => ({ id, isSelf: id === state.userId })) }))
      : routeFetch(url, init)
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const failFetch = () => Promise.reject(new TypeError("Failed to fetch"));

describe("answers sent late or twice (OFF-24)", () => {
  it("a retry that got through is not overwritten by the earlier failed answer", async () => {
    fetchHook = (call, run) => (call === 1 ? failFetch() : run());
    await submitSlideResponse({ ...owner, slideId: "s1", answer: wrong, isCorrect: false });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const ok = await submitSlideResponse({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    expect(ok.ok).toBe(true);
    expect(queued()).toHaveLength(0); // the failed wrong answer was taken off the queue

    await syncOfflineQueue();
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
    expect(localEntry()).toMatchObject({ answer: right, isCorrect: true });
  });

  it("a slow first try that times out after a newer answer failed fast is not queued over it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchHook = (call, run, init) => {
      if (call === 1) {
        return new Promise((_, reject) =>
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        );
      }
      if (call === 2) return failFetch();
      return run();
    };
    const first = submitSlideResponse({ ...owner, slideId: "s1", answer: wrong, isCorrect: false });
    await vi.advanceTimersByTimeAsync(3_000);
    await submitSlideResponse({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    await vi.advanceTimersByTimeAsync(8_000);
    await first;
    vi.useRealTimers();

    expect(queued()).toHaveLength(1);
    expect(queued()[0].data).toMatchObject({ answer: 2 });
    await syncOfflineQueue();
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
    expect(localEntry()).toMatchObject({ answer: right, isCorrect: true });
  });

  it("a slow first try that fails after a newer answer got through is not queued at all", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchHook = (call, run, init) =>
      call === 1
        ? new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          )
        : run();
    const first = submitSlideResponse({ ...owner, slideId: "s1", answer: wrong, isCorrect: false });
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await submitSlideResponse({ ...owner, slideId: "s1", answer: right, isCorrect: true })).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await first).toMatchObject({ ok: false, outcome: "retry" });
    vi.useRealTimers();

    expect(queued()).toHaveLength(0);
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
    expect(localEntry()).toMatchObject({ answer: right, isCorrect: true });
  });

  it("an answer saved on lie-fi (reply lost) and sent again counts one attempt", async () => {
    fetchHook = async (call, run) => {
      const response = await run();
      if (call === 1) throw new TypeError("Failed to fetch");
      return response;
    };
    await submitSlideResponse({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    expect(queued()).toHaveLength(1);
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ synced: 1, remaining: 0 });
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
  });

  it("offline: wrong then right keeps one queued answer (the right one) and its grade", async () => {
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: wrong, isCorrect: false });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    expect(queued()).toHaveLength(1);

    await syncOfflineQueue();
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
    expect(localEntry()).toMatchObject({ answer: right, isCorrect: true });
  });

  it("an older answer arriving after a newer one leaves the server and the phone alone", async () => {
    const newer = new Date().toISOString();
    const older = new Date(Date.now() - 60_000).toISOString();
    await postSlideResponse(LESSON, "s1", right, { answeredAt: newer, answerId: "b" });
    const late = await postSlideResponse(LESSON, "s1", wrong, { answeredAt: older, answerId: "a" });
    expect(late).toEqual({ ok: true, isCorrect: null, stale: true });
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
  });

  it("a skip never replaces a real answer, on the phone's queue or on the server", async () => {
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await queueSlideResponse({ ...owner, slideId: "s1", answer: null });
    expect(queued()).toHaveLength(1);
    expect(queued()[0].data).toMatchObject({ answer: 2 });

    await syncOfflineQueue();
    const skip = await postSlideResponse(LESSON, "s1", null, { answeredAt: new Date().toISOString(), answerId: "skip" });
    expect(skip).toMatchObject({ ok: true, stale: true });
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 1, is_correct: true });
  });

  it("a real answer replaces a skip even when it was given earlier", async () => {
    await postSlideResponse(LESSON, "s1", null, { answeredAt: new Date().toISOString(), answerId: "skip" });
    const real = await postSlideResponse(LESSON, "s1", right, {
      answeredAt: new Date(Date.now() - 60_000).toISOString(),
      answerId: "real",
    });
    expect(real).toEqual({ ok: true, isCorrect: true });
    expect(serverAnswer()).toEqual({ answer: 2, attempts: 2, is_correct: true });
  });

  it("an online skip keeps the answer this phone already shows", async () => {
    await submitSlideResponse({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    await submitSlideResponse({ ...owner, slideId: "s1", answer: null, isCorrect: null });
    expect(localEntry()).toMatchObject({ answer: right, isCorrect: true });
  });
});

describe("answers the server can't take (OFF-07)", () => {
  const drawing = { type: "draw_answer", image_data_url: "data:image/png;base64,AAAA" };
  const oldTypes = new Set(["free_response", "choose_correct", "true_false", "tap_to_count", "match_pairs", "sequence_order", "sort_groups", "fill_missing_word"]);

  it("answering a slide again replaces its queued answer instead of adding one", async () => {
    for (let index = 0; index < 3; index += 1) {
      await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: { ...drawing, image_data_url: `data:,${index}` }, isCorrect: true });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(queued()).toHaveLength(1);
    expect(queued()[0].data).toMatchObject({ answer: "data:,2" });
  });

  it("an answer the database rejects for good (check constraint) is a 422 and is not resent", async () => {
    state.allowedTypes = oldTypes;
    await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: drawing, isCorrect: true });
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 1, remaining: 0 });
    expect(fetchCalls).toBe(1);
    await syncOfflineQueue();
    expect(fetchCalls).toBe(1);
    // The phone keeps its copy to show.
    expect(localEntry("draw")).toMatchObject({ answer: drawing });
  });

  it("drawings go through once the constraint accepts them", async () => {
    await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: drawing, isCorrect: true });
    expect(await syncOfflineQueue()).toMatchObject({ synced: 1, remaining: 0 });
    expect(serverAnswer("draw")).toMatchObject({ answer: "data:image/png;base64,AAAA", is_correct: true });
  });

  it("server errors back off and give up only after ten failures over two weeks", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T08:00:00Z"), shouldAdvanceTime: true });
    state.writeError = { code: "08006", message: "connection failure" };
    await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: drawing, isCorrect: true });

    await syncOfflineQueue();
    await syncOfflineQueue();
    expect(fetchCalls).toBe(2); // the first two failures retry at the next sync
    await syncOfflineQueue();
    expect(fetchCalls).toBe(3);
    expect(queued()[0].retry).toMatchObject({ serverFailures: 3, lastStatus: 500 });
    await syncOfflineQueue();
    expect(fetchCalls).toBe(3); // backing off: not sent again yet

    // Ten failures in ~3 days: still kept (not two weeks yet).
    for (let day = 0; day < 4; day += 1) {
      for (let hour = 0; hour < 24; hour += 1) {
        vi.setSystemTime(Date.now() + 60 * 60 * 1000);
        await syncOfflineQueue();
      }
    }
    expect(queued()[0]?.retry?.serverFailures).toBeGreaterThanOrEqual(10);
    expect(queued()).toHaveLength(1);

    // A month without a connection never counts.
    const failuresBefore = queued()[0].retry?.serverFailures;
    vi.stubGlobal("fetch", () => failFetch());
    vi.setSystemTime(new Date("2026-11-01T08:00:00Z"));
    await syncOfflineQueue();
    expect(queued()).toHaveLength(1);
    expect(queued()[0].retry?.serverFailures).toBe(failuresBefore);

    // The server failing it again, now weeks after the first failure: given up.
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    url === "/api/learners"
      ? Promise.resolve(Response.json({ accountId: state.userId, learners: [{ id: state.userId, isSelf: true }] }))
      : routeFetch(url, init)
  );
    const result = await syncOfflineQueue();
    expect(result.dropped).toBe(1);
    expect(queued()).toHaveLength(0);
  });

  it("a new answer to the slide starts it fresh", async () => {
    state.writeError = { code: "08006", message: "connection failure" };
    await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: drawing, isCorrect: true });
    await syncOfflineQueue();
    await syncOfflineQueue();
    await syncOfflineQueue();
    expect(queued()[0].retry).toBeDefined();
    await saveSlideResponseOffline({ ...owner, slideId: "draw", answer: { ...drawing, image_data_url: "data:,new" }, isCorrect: true });
    expect(queued()).toHaveLength(1);
    expect(queued()[0].retry).toBeUndefined();
  });
});

describe("a lesson the family lost access to (OFF-25)", () => {
  it("keeps progress and answers together, parked, and sends both when access returns", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-10T08:00:00Z"), shouldAdvanceTime: true });
    await queueLessonProgress({ ...owner, positionSec: 120, watchSec: 120, completedCandidate: false, practiceGated: false });
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    state.hiddenLessons.add(LESSON);
    state.progressWriteError = { code: "42501", message: "new row violates row-level security policy" };

    const first = await syncOfflineQueue();
    expect(first).toMatchObject({ synced: 0, dropped: 0, remaining: 2 });
    expect(fetchCalls).toBe(0); // answers wait with the progress, not sent to be refused
    expect(queued().every((item) => typeof (item.retry as Row | undefined)?.rejectedAt === "string")).toBe(true);
    expect(await countUnsyncedItems("u1")).toBe(0);

    // Within the day: nothing is tried.
    const upsertsBefore = state.upserts.length;
    await syncOfflineQueue();
    expect(state.upserts.length).toBe(upsertsBefore);

    // A teacher approves the family: next day both land.
    state.hiddenLessons.clear();
    state.progressWriteError = null;
    vi.setSystemTime(new Date("2026-10-11T09:00:00Z"));
    const second = await syncOfflineQueue();
    expect(second).toMatchObject({ synced: 2, remaining: 0 });
    expect(serverAnswer()).toMatchObject({ answer: 2, is_correct: true });
    expect(state.tables.lesson_progress[0]).toMatchObject({ last_position_seconds: 120 });
  });

  it("an answer refused with 403 no_access is parked, not deleted", async () => {
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    state.hiddenLessons.add(LESSON);
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 0, failed: 1, remaining: 1 });
    expect(typeof (queued()[0].retry as Row | undefined)?.rejectedAt).toBe("string");
  });

  it("gives up after a month of refusals", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T08:00:00Z"), shouldAdvanceTime: true });
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    state.hiddenLessons.add(LESSON);
    await syncOfflineQueue();
    vi.setSystemTime(new Date("2026-11-01T08:00:00Z"));
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 1, remaining: 0 });
  });

  it("drops progress for a deleted lesson (foreign key) and answers for a missing lesson (404)", async () => {
    await queueLessonProgress({ ...owner, positionSec: 30, watchSec: 30, completedCandidate: false, practiceGated: false });
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    state.tables.lessons = state.tables.lessons.filter((lesson) => lesson.id !== LESSON);
    state.progressWriteError = { code: "23503", message: "violates foreign key constraint" };
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 2, remaining: 0 });
  });

  it("a failed lesson lookup is retried, not treated as a missing lesson", async () => {
    await saveSlideResponseOffline({ ...owner, slideId: "s1", answer: right, isCorrect: true });
    state.lessonLookupError = { code: "57014", message: "canceling statement due to statement timeout" };
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ dropped: 0, failed: 1, remaining: 1 });
    state.lessonLookupError = null;
    expect(await syncOfflineQueue()).toMatchObject({ synced: 1, remaining: 0 });
  });
});

describe("slide-responses route statuses", () => {
  async function post(lessonId: string, body: Row) {
    const response = await POST(
      new Request(`http://app.test/api/lessons/${lessonId}/slide-responses`, { method: "POST", body: JSON.stringify(body) }) as never,
      { params: Promise.resolve({ id: lessonId }) }
    );
    return { status: response.status, body: (await response.json()) as Row };
  }

  it("tells a hidden lesson (403 no_access) from a missing one (404) and a failed lookup (503)", async () => {
    state.hiddenLessons.add(LESSON);
    expect(await post(LESSON, { slide_id: "s1", answer: 2 })).toMatchObject({ status: 403, body: { code: "no_access" } });
    expect((await post("nope", { slide_id: "s1", answer: 2 })).status).toBe(404);
    state.lessonLookupError = { code: "PGRST002", message: "Could not query the database for the schema cache" };
    expect((await post(LESSON, { slide_id: "s1", answer: 2 })).status).toBe(503);
    state.lessonLookupError = { code: "22P02", message: "invalid input syntax for type uuid" };
    expect((await post("not-a-uuid", { slide_id: "s1", answer: 2 })).status).toBe(404);
  });

  it("answers 422 for data the database refuses for good and 500 for anything else", async () => {
    state.writeError = { code: "23514", message: "check violation" };
    expect((await post(LESSON, { slide_id: "s1", answer: 2 })).status).toBe(422);
    state.writeError = { code: "08006", message: "connection failure" };
    expect((await post(LESSON, { slide_id: "s1", answer: 2 })).status).toBe(500);
  });

  it("stores the answer time and id, clamped to the last 14 days, and ignores an unreadable time", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T12:00:00Z"), shouldAdvanceTime: true });
    await post(LESSON, { slide_id: "s1", answer: 2, answered_at: "2019-01-01T00:00:00Z", client_answer_id: "x" });
    expect(state.tables.lesson_slide_responses[0].response_data).toEqual({
      answer: 2,
      answered_at: "2026-10-01T12:00:00.000Z",
      client_answer_id: "x",
    });
    expect((await post(LESSON, { slide_id: "draw", answer: null, answered_at: "garbage" })).status).toBe(200);
    expect(state.tables.lesson_slide_responses[1].response_data).toEqual({ answer: null });
  });
});

describe("completion days for streaks (OFF-26)", () => {
  it("keeps the first completion time through later progress saves", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T10:00:00Z"), shouldAdvanceTime: true });
    await queueLessonProgress({ ...owner, positionSec: 500, watchSec: 500, completedCandidate: true, practiceGated: false });
    vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
    await queueLessonProgress({ ...owner, positionSec: 590, watchSec: 590, completedCandidate: true, practiceGated: false });
    const [item] = queued();
    expect(item.timestamp).toBe("2026-10-14T18:00:00.000Z");
    expect(item.data).toMatchObject({ completed: true, completed_at: "2026-10-12T10:00:00.000Z", last_position_seconds: 590 });

    await syncOfflineQueue();
    expect(state.upserts[0]).toMatchObject({ completed: true, completed_at: "2026-10-12T10:00:00.000Z", completion_source: "offline_sync" });
  });

  it("sends lessons in the order they were finished", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T10:00:00Z"), shouldAdvanceTime: true });
    await queueLessonProgress({ ownerId: "u1", lessonId: "lesson-3", positionSec: 500, watchSec: 500, completedCandidate: true, practiceGated: false });
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    await queueLessonProgress({ ownerId: "u1", lessonId: "lesson-2", positionSec: 20, watchSec: 20, completedCandidate: false, practiceGated: false });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    await queueLessonProgress({ ownerId: "u1", lessonId: LESSON, positionSec: 500, watchSec: 500, completedCandidate: true, practiceGated: false });
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));

    await syncOfflineQueue();
    expect(state.upserts.map((row) => row.lesson_id)).toEqual([LESSON, "lesson-3", "lesson-2"]);
  });
});
