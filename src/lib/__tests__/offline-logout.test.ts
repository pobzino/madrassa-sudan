import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// logOut() with the real sync, against a fake queue and a fake server: it
// must never wipe progress or answers that weren't sent without being told
// to (`force`), whatever the connection does.

const OWNER = "child-a";
const LESSON = "lesson-1";

let queue: Array<Record<string, unknown>> = [];
const calls: string[] = [];

function seedQueue(answers: number) {
  queue = [
    {
      id: 1,
      lessonId: LESSON,
      ownerId: OWNER,
      kind: "progress",
      timestamp: new Date().toISOString(),
      data: { last_position_seconds: 300, total_watch_time_seconds: 320, completed: false },
    },
    ...Array.from({ length: answers }, (_, index) => ({
      id: 10 + index,
      lessonId: LESSON,
      ownerId: OWNER,
      kind: "slide_response",
      timestamp: new Date().toISOString(),
      data: { slideId: `slide-${index}`, answer: "B" },
    })),
  ];
}

vi.mock("@/lib/offline/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/offline/db")>();
  return {
    ...original,
    getQueuedUpdates: vi.fn(async () => queue.map((item) => ({ ...item }))),
    countQueuedUpdates: vi.fn(async () => queue.length),
    clearQueuedUpdates: vi.fn(async (ids: number[]) => {
      queue = queue.filter((item) => !ids.includes(item.id as number));
    }),
    removeQueueItemsIfUnchanged: vi.fn(async (items: Array<{ id: number }>) => {
      const ids = items.map((item) => item.id);
      queue = queue.filter((item) => !ids.includes(item.id as number));
    }),
    getLocalSlideResponses: vi.fn(async () => null),
    putLocalSlideResponses: vi.fn(async () => undefined),
    clearPrivateOfflineData: vi.fn(async () => {
      calls.push(`clear with ${queue.length} queued`);
      queue = [];
      return { ok: true, failures: [] };
    }),
  };
});

vi.mock("@/lib/offline/download-manager", () => ({ abortAllDownloads: vi.fn(() => calls.push("abortAllDownloads")) }));
vi.mock("@/lib/push-client", () => ({ unlinkRemindersOnLogout: vi.fn(async () => void calls.push("unlinkReminders")) }));
vi.mock("posthog-js", () => ({ default: { __loaded: false, reset: vi.fn() } }));

type Network = "fast" | "hang" | "posts-hang";
let network: Network = "fast";
const never = () => new Promise<never>(() => undefined);

function query(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "limit", "in", "order"]) builder[method] = () => builder;
  builder.setHeader = () => builder;
  builder.abortSignal = () => builder;
  builder.maybeSingle = async () => {
    if (network === "hang") await never();
    return { data: result, error: null };
  };
  builder.upsert = () => ({
    setHeader: () => ({
      abortSignal: async () => {
        if (network === "hang") await never();
        return { error: null };
      },
    }),
    abortSignal: async () => {
      if (network === "hang") await never();
      return { error: null };
    },
  });
  return builder;
}

const supabase = {
  auth: {
    getUser: vi.fn(async () => {
      if (network === "hang") await never();
      return { data: { user: { id: OWNER } }, error: null };
    }),
    stopAutoRefresh: vi.fn(async () => undefined),
    signOut: vi.fn(async (options?: { scope?: string }) => {
      calls.push(`signOut ${options?.scope ?? "global"}`);
      return { error: null };
    }),
  },
  from: () => query({ last_position_seconds: 100, total_watch_time_seconds: 100, completed: false, completed_at: null }),
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabase }));

const fetchMock = vi.fn(async (_url: string, init: { body?: string }) => {
  if (_url === "/api/learners") return Response.json({ accountId: OWNER, learners: [{ id: OWNER, isSelf: true }] });
  if (network !== "fast") await never();
  calls.push(`sent ${JSON.parse(init.body ?? "{}").slide_id}`);
  return new Response(JSON.stringify({ is_correct: true }), { status: 200 });
});

let confirmAnswer = true;
const confirmMock = vi.fn(() => confirmAnswer);

function stubBrowser(navigatorStub: Record<string, unknown>) {
  vi.stubGlobal("navigator", navigatorStub);
  vi.stubGlobal("window", {
    location: { assign: (url: string) => calls.push(`navigate ${url}`) },
    confirm: confirmMock,
  });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  calls.length = 0;
  network = "fast";
  confirmAnswer = true;
  queue = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function loadLogout() {
  return import("@/lib/auth/logout");
}

describe("logOut with unsent items", () => {
  it("lie-fi (online, nothing answers): stops, still signed in, nothing wiped", async () => {
    vi.useFakeTimers();
    seedQueue(2);
    network = "hang";
    stubBrowser({ onLine: true });
    const { logOut } = await loadLogout();
    const pending = logOut();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toEqual({ status: "unsynced", count: 3 });
    expect(calls).toEqual([]);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("a link too slow to finish: waits its budget, then reports what's left instead of wiping", async () => {
    vi.useFakeTimers();
    seedQueue(3);
    network = "posts-hang";
    stubBrowser({ onLine: true });
    const { logOut } = await loadLogout();
    let settled = false;
    const pending = logOut().finally(() => {
      settled = true;
    });
    // More than the old 4 s cap: the sync is still being given its chance.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000);
    // The progress item got through; the three answers didn't.
    expect(await pending).toEqual({ status: "unsynced", count: 3 });
    expect(calls).toEqual([]);
  });

  it("another tab holds the sync lock: reports the items, wipes nothing", async () => {
    seedQueue(3);
    stubBrowser({
      onLine: true,
      locks: { request: (_name: string, _options: unknown, callback: (lock: unknown) => unknown) => Promise.resolve(callback(null)) },
    });
    const { logOut, isLoggingOut } = await loadLogout();
    expect(await logOut()).toEqual({ status: "unsynced", count: 4 });
    expect(calls).toEqual([]);
    // Still signed in, so a sign-out elsewhere is news again.
    expect(isLoggingOut()).toBe(false);
  });

  it("offline: asks straight away, without touching the network", async () => {
    seedQueue(1);
    stubBrowser({ onLine: false });
    const { logOut } = await loadLogout();
    expect(await logOut()).toEqual({ status: "unsynced", count: 2 });
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("a working link: sends everything, then logs out (reminders unlinked before the session ends)", async () => {
    seedQueue(2);
    stubBrowser({ onLine: true });
    const { logOut, isLoggingOut } = await loadLogout();
    expect(await logOut()).toEqual({ status: "logged_out" });
    expect(calls).toEqual([
      "sent slide-0",
      "sent slide-1",
      "unlinkReminders",
      "abortAllDownloads",
      "signOut local",
      "clear with 0 queued",
      "navigate /",
    ]);
    expect(isLoggingOut()).toBe(true);
  });

  it("force: logs out at once and wipes what's left", async () => {
    seedQueue(2);
    stubBrowser({ onLine: true });
    const { logOut } = await loadLogout();
    expect(await logOut({ force: true })).toEqual({ status: "logged_out" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(calls).toContain("clear with 3 queued");
    expect(calls.at(-1)).toBe("navigate /");
  });

  it("force offline: ends the session locally and wipes", async () => {
    seedQueue(1);
    stubBrowser({ onLine: false });
    const { logOut } = await loadLogout();
    expect(await logOut({ force: true })).toEqual({ status: "logged_out" });
    expect(calls).toEqual(["unlinkReminders", "abortAllDownloads", "signOut local", "clear with 2 queued", "navigate /"]);
  });
});

describe("logOutWithUnsentCheck", () => {
  it("Cancel keeps the family signed in with everything kept", async () => {
    seedQueue(1);
    confirmAnswer = false;
    stubBrowser({ onLine: false });
    const { logOutWithUnsentCheck } = await loadLogout();
    const phases: Array<string | null> = [];
    const left = await logOutWithUnsentCheck({ language: "en", onPhase: (phase) => phases.push(phase) });
    expect(left).toBe(false);
    expect(phases).toEqual(["logging_out", "sending", null]);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0])).toContain("(2)");
    expect(calls).toEqual([]);
    expect(queue).toHaveLength(2);
  });

  it("OK logs out anyway and wipes", async () => {
    seedQueue(1);
    stubBrowser({ onLine: false });
    const { logOutWithUnsentCheck } = await loadLogout();
    const phases: Array<string | null> = [];
    const left = await logOutWithUnsentCheck({ language: "ar", onPhase: (phase) => phases.push(phase) });
    expect(left).toBe(true);
    expect(phases).toEqual(["logging_out", "sending", null, "logging_out"]);
    expect(calls).toContain("clear with 2 queued");
  });

  it("asks nothing when everything was sent", async () => {
    seedQueue(1);
    stubBrowser({ onLine: true });
    const { logOutWithUnsentCheck } = await loadLogout();
    const left = await logOutWithUnsentCheck({ language: "en", onPhase: () => undefined });
    expect(left).toBe(true);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(calls).toContain("clear with 0 queued");
  });

  it("force (the caller already asked) doesn't ask again", async () => {
    seedQueue(1);
    stubBrowser({ onLine: false });
    const { logOutWithUnsentCheck } = await loadLogout();
    const phases: Array<string | null> = [];
    expect(await logOutWithUnsentCheck({ language: "en", force: true, onPhase: (phase) => phases.push(phase) })).toBe(true);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(phases).toEqual(["logging_out"]);
    expect(calls).toContain("clear with 2 queued");
  });
});
