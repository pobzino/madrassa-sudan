import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressQueueItem } from "@/lib/offline/db";
import { otherAccountItemExpired } from "@/lib/offline/sync";

// Another account's unsent offline work on a shared phone: kept for it when
// someone else signs in (its session can end without logOut, e.g. a logout
// or password change on another phone), never sent for anyone else.

const DAY = 24 * 60 * 60 * 1000;
const A = "child-a";
const B = "child-b";

let queue: ProgressQueueItem[] = [];
let owner: Record<string, unknown> | null = null;
let clearResult = { ok: true, failures: [] as string[] };

vi.mock("@/lib/offline/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/offline/db")>();
  return {
    ...original,
    getQueuedUpdates: vi.fn(async () => queue.map((item) => ({ ...item }))),
    countQueuedUpdates: vi.fn(async () => queue.length),
    clearQueuedUpdates: vi.fn(async (ids: number[]) => {
      queue = queue.filter((item) => !ids.includes(item.id as number));
    }),
    removeQueueItemsIfUnchanged: vi.fn(async (items: ProgressQueueItem[]) => {
      const ids = items.map((item) => item.id);
      queue = queue.filter((item) => !ids.includes(item.id));
    }),
    getAllOfflineLessons: vi.fn(async () => []),
    getLocalSlideResponses: vi.fn(async () => null),
    putLocalSlideResponses: vi.fn(async () => undefined),
    getMeta: vi.fn(async (key: string) => (key === "owner" ? owner : null)),
    putMeta: vi.fn(async (record: Record<string, unknown>) => {
      if (record.key === "owner") owner = record;
    }),
    clearPrivateOfflineData: vi.fn(async (options?: { keepQueued?: (item: ProgressQueueItem) => boolean }) => {
      if (!clearResult.failures.includes("database")) {
        queue = options?.keepQueued ? queue.filter(options.keepQueued) : [];
        owner = null;
      }
      return clearResult;
    }),
  };
});

const supabase = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: B } }, error: null })) },
  from: () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "limit", "abortSignal"]) builder[method] = () => builder;
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.upsert = () => ({ abortSignal: async () => ({ error: null }) });
    return builder;
  },
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabase }));

const item = (id: number, ownerId: string | undefined, ageMs = 0, extra: Partial<ProgressQueueItem> = {}): ProgressQueueItem => ({
  id,
  lessonId: "lesson-1",
  ...(ownerId ? { ownerId } : {}),
  kind: "slide_response",
  timestamp: new Date(Date.now() - ageMs).toISOString(),
  data: { slideId: `slide-${id}`, answer: "B" },
  ...extra,
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  queue = [];
  owner = null;
  clearResult = { ok: true, failures: [] };
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/learners")) {
        return new Response(JSON.stringify({ accountId: B, learners: [{ id: B, isSelf: true }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ is_correct: true }), { status: 200 });
    })
  );
});

describe("otherAccountItemExpired", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  it("keeps another account's items for 30 days", () => {
    expect(otherAccountItemExpired("2026-10-14T12:00:00.000Z", now)).toBe(false);
    expect(otherAccountItemExpired("2026-09-15T12:00:01.000Z", now)).toBe(false);
    expect(otherAccountItemExpired("2026-09-15T11:59:59.000Z", now)).toBe(true);
  });
  it("treats an unreadable time as expired", () => {
    expect(otherAccountItemExpired("not a date", now)).toBe(true);
  });
});

describe("sync on a phone with another account's items", () => {
  it("sends only the signed-in account's, keeps recent ones of other accounts, drops old and unreadable ones", async () => {
    queue = [
      item(1, B),
      item(2, A, 2 * DAY),
      item(3, A, 40 * DAY),
      { id: 4, lessonId: "lesson-1", table: "unknown", timestamp: new Date().toISOString(), data: {} },
    ];
    const { syncOfflineQueue } = await import("@/lib/offline/sync");
    const result = await syncOfflineQueue();
    expect(result).toMatchObject({ synced: 1, dropped: 2, otherAccounts: 1, remaining: 1 });
    expect(queue.map((entry) => entry.id)).toEqual([2]);
    const sent = vi.mocked(fetch).mock.calls
      .map(([, init]) => (init as RequestInit | undefined)?.body)
      .filter((body): body is BodyInit => typeof body === "string")
      .map((body) => JSON.parse(body as string).slide_id);
    expect(sent).toEqual(["slide-1"]);
  });
});

describe("account switch", () => {
  it("clears the previous account's data but keeps its readable unsent items", async () => {
    owner = { key: "owner", userId: A, fullName: "Amna", role: "student", savedAt: new Date().toISOString() };
    queue = [item(1, A), { id: 2, lessonId: "lesson-1", table: "unknown", timestamp: "t", data: {} }];
    const { saveOwner, countOtherAccountsItems } = await import("@/lib/offline/identity");
    const { clearPrivateOfflineData } = await import("@/lib/offline/db");
    const saved = await saveOwner({ id: B, full_name: "Badr", role: "student" });
    expect(saved.userId).toBe(B);
    expect(vi.mocked(clearPrivateOfflineData)).toHaveBeenCalledWith({ keepQueued: expect.any(Function) });
    expect(queue.map((entry) => entry.id)).toEqual([1]);
    expect(await countOtherAccountsItems(B)).toBe(1);
    expect(await countOtherAccountsItems(A)).toBe(0);
  });

  it("doesn't hand the phone to the new account when the old data couldn't be cleared", async () => {
    owner = { key: "owner", userId: A, fullName: "Amna", role: "student", savedAt: new Date().toISOString() };
    clearResult = { ok: false, failures: ["database"] };
    const { saveOwner } = await import("@/lib/offline/identity");
    await expect(saveOwner({ id: B, full_name: "Badr" })).rejects.toThrow();
    expect(owner?.userId).toBe(A);
  });

  it("a cache that couldn't be deleted doesn't stop the switch", async () => {
    owner = { key: "owner", userId: A, fullName: "Amna", role: "student", savedAt: new Date().toISOString() };
    clearResult = { ok: false, failures: ["amal-lesson-assets"] };
    const { saveOwner } = await import("@/lib/offline/identity");
    expect((await saveOwner({ id: B })).userId).toBe(B);
  });

  it("Delete removes only other accounts' items", async () => {
    queue = [item(1, B), item(2, A), item(3, "child-c")];
    const { deleteOtherAccountsItems } = await import("@/lib/offline/identity");
    await deleteOtherAccountsItems(B);
    expect(queue.map((entry) => entry.id)).toEqual([1]);
  });

  it("keeps readable items only", async () => {
    const { keptAcrossAccountSwitch } = await import("@/lib/offline/identity");
    expect(keptAcrossAccountSwitch(item(1, A))).toBe(true);
    expect(keptAcrossAccountSwitch(item(2, undefined))).toBe(false);
    expect(
      keptAcrossAccountSwitch({ lessonId: "l", table: "lesson_progress", data: { student_id: A }, timestamp: "t" })
    ).toBe(true);
  });
});
