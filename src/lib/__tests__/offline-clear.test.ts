import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// clearPrivateOfflineData against a minimal fake IndexedDB. Another tab can
// block a deletion indefinitely (and Safari drops a blocked deletion when
// the page navigates), so logout must empty the stores rather than rely on
// deleting the database. (Checked in real Chrome and WebKit too.)

type Row = Record<string, unknown>;

let stores: Record<string, Row[]>;
let openFails: boolean;
let deleteCalls: number;
let local: Map<string, string>;

function later(fn: () => void) {
  setTimeout(fn, 0);
}

function fakeDatabase() {
  return {
    objectStoreNames: Object.keys(stores),
    onversionchange: null as null | (() => void),
    close: vi.fn(),
    transaction(names: string[]) {
      const tx = {
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
        onabort: null as null | (() => void),
        error: null,
        objectStore(name: string) {
          return {
            clear() {
              stores[name] = [];
            },
            openCursor() {
              const request = { onsuccess: null as null | (() => void), result: null as unknown };
              const rows = [...stores[name]];
              let index = 0;
              const step = () => {
                if (index >= rows.length) {
                  request.result = null;
                } else {
                  const row = rows[index];
                  request.result = {
                    value: row,
                    delete: () => {
                      stores[name] = stores[name].filter((entry) => entry !== row);
                    },
                    continue: () => {
                      index += 1;
                      later(step);
                    },
                  };
                }
                request.onsuccess?.();
              };
              later(step);
              return request;
            },
          };
        },
      };
      void names;
      // Completes once the cursor walks above have finished.
      setTimeout(() => tx.oncomplete?.(), 50);
      return tx;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  stores = {
    lessons: [{ id: "L1", ownerId: "child-a" }],
    meta: [{ key: "owner", userId: "child-a", fullName: "Amna" }],
    "progress-queue": [
      { id: 1, lessonId: "L1", ownerId: "child-a", kind: "progress", data: {}, timestamp: "t" },
      { id: 2, lessonId: "L1", table: "unknown", data: {}, timestamp: "t" },
    ],
    responses: [{ key: "child-a:L1", bySlide: {} }],
  };
  openFails = false;
  deleteCalls = 0;
  local = new Map([["sim-resume:child-a:L1", "12"]]);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => void local.set(key, value),
      removeItem: (key: string) => void local.delete(key),
      key: (index: number) => [...local.keys()][index] ?? null,
      get length() {
        return local.size;
      },
    },
  });
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = {
        onsuccess: null as null | (() => void),
        onerror: null as null | (() => void),
        onupgradeneeded: null as null | (() => void),
        result: null as unknown,
        transaction: null,
      };
      later(() => {
        if (openFails) {
          request.onerror?.();
        } else {
          request.result = fakeDatabase();
          request.onsuccess?.();
        }
      });
      return request;
    },
    // Another tab never lets go: the deletion never finishes.
    deleteDatabase: () => {
      deleteCalls += 1;
      return { onsuccess: null, onerror: null, onblocked: null };
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function clear(options?: Parameters<typeof import("@/lib/offline/db").clearPrivateOfflineData>[0]) {
  const { clearPrivateOfflineData } = await import("@/lib/offline/db");
  const pending = clearPrivateOfflineData(options);
  await vi.advanceTimersByTimeAsync(10_000);
  return pending;
}

describe("clearPrivateOfflineData", () => {
  it("empties every store without deleting (nothing a blocking tab can stop)", async () => {
    const result = await clear();
    expect(result).toEqual({ ok: true, failures: [] });
    expect(Object.values(stores).every((rows) => rows.length === 0)).toBe(true);
    expect(deleteCalls).toBe(0);
    expect(local.has("sim-resume:child-a:L1")).toBe(false);
    expect(local.has("amal-offline-wipe-pending")).toBe(false);
  });

  it("account switch: keeps the queue items asked for, clears the rest", async () => {
    const result = await clear({ keepQueued: (item) => item.ownerId === "child-a" });
    expect(result.ok).toBe(true);
    expect(stores["progress-queue"].map((row) => row.id)).toEqual([1]);
    expect(stores.lessons).toEqual([]);
    expect(stores.meta).toEqual([]);
    expect(stores.responses).toEqual([]);
  });

  it("when the stores can't be emptied: tries deleting, reports it, and leaves a marker for the next open", async () => {
    openFails = true;
    const result = await clear();
    expect(deleteCalls).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.failures).toContain("database");
    expect(local.get("amal-offline-wipe-pending")).toBe("1");
  });

  it("an account switch that can't empty the stores leaves no marker (the switch fails instead)", async () => {
    openFails = true;
    const result = await clear({ keepQueued: () => true });
    expect(result.failures).toContain("database");
    expect(deleteCalls).toBe(0);
    expect(local.has("amal-offline-wipe-pending")).toBe(false);
  });

  it("tells this tab's listeners the clear was local", async () => {
    const { onPrivateDataCleared } = await import("@/lib/offline/db");
    const events: unknown[] = [];
    onPrivateDataCleared((event) => events.push(event));
    await clear();
    expect(events).toEqual([{ fromOtherTab: false }]);
  });
});
