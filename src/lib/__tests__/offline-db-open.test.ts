import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Just enough of IndexedDB to drive openDB and the logout delete by hand:
// each request fires only the events a test triggers.
type Handler = (() => void) | null;

class FakeRequest {
  result: unknown = undefined;
  transaction = null;
  error: unknown = null;
  onupgradeneeded: Handler = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onblocked: Handler = null;
}

function fakeConnection() {
  return {
    version: 2,
    objectStoreNames: { contains: () => true },
    close: vi.fn(),
    onversionchange: null as Handler,
    onclose: null as Handler,
  };
}

let opens: FakeRequest[];
let deletes: FakeRequest[];
let fakeIndexedDB: { open: ReturnType<typeof vi.fn>; deleteDatabase: ReturnType<typeof vi.fn> };

function succeed(request: FakeRequest) {
  const connection = fakeConnection();
  request.result = connection;
  request.onsuccess?.();
  return connection;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  opens = [];
  deletes = [];
  fakeIndexedDB = {
    open: vi.fn(() => {
      const request = new FakeRequest();
      opens.push(request);
      return request;
    }),
    deleteDatabase: vi.fn(() => {
      const request = new FakeRequest();
      deletes.push(request);
      return request;
    }),
  };
  vi.stubGlobal("indexedDB", fakeIndexedDB);
  vi.stubGlobal("BroadcastChannel", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("opening the offline database", () => {
  it("shares one open request between callers", async () => {
    const db = await import("@/lib/offline/db");
    const first = db.openDB();
    const second = db.openDB();
    expect(fakeIndexedDB.open).toHaveBeenCalledTimes(1);

    const connection = succeed(opens[0]);
    await expect(first).resolves.toBe(connection);
    await expect(second).resolves.toBe(connection);
  });

  it("reports busy when another tab holds the database, without stacking more opens", async () => {
    const db = await import("@/lib/offline/db");
    const first = expect(db.openDB()).rejects.toBeInstanceOf(db.OfflineDbBusyError);
    const second = expect(db.openDB()).rejects.toBeInstanceOf(db.OfflineDbBusyError);
    opens[0].onblocked?.();

    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    await second;
    // Known to be stuck now: the next caller is told straight away.
    await expect(db.openDB()).rejects.toBeInstanceOf(db.OfflineDbBusyError);
    expect(fakeIndexedDB.open).toHaveBeenCalledTimes(1);
  });

  it("uses the stuck request's connection once the other tab lets go", async () => {
    const db = await import("@/lib/offline/db");
    const waiting = expect(db.openDB()).rejects.toBeInstanceOf(db.OfflineDbBusyError);
    await vi.advanceTimersByTimeAsync(10_000);
    await waiting;

    const connection = succeed(opens[0]);
    await vi.advanceTimersByTimeAsync(0);
    await expect(db.openDB()).resolves.toBe(connection);
    expect(connection.close).not.toHaveBeenCalled();
    expect(fakeIndexedDB.open).toHaveBeenCalledTimes(1);
  });

  it("falls back to one shared delete when logout can't empty the database, and opens after it", async () => {
    const db = await import("@/lib/offline/db");
    const firstLogout = db.clearPrivateOfflineData();
    const secondLogout = db.clearPrivateOfflineData();
    await vi.advanceTimersByTimeAsync(0);
    // Logout empties the stores first; here the database won't even open.
    for (const request of opens) {
      request.error = new Error("broken profile");
      request.onerror?.();
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeIndexedDB.deleteDatabase).toHaveBeenCalledTimes(1);

    const opensBefore = fakeIndexedDB.open.mock.calls.length;
    const opening = db.openDB();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeIndexedDB.open).toHaveBeenCalledTimes(opensBefore);

    deletes[0].onsuccess?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakeIndexedDB.open).toHaveBeenCalledTimes(opensBefore + 1);
    const connection = succeed(opens[opens.length - 1]);
    await expect(opening).resolves.toBe(connection);
    await expect(firstLogout).resolves.toMatchObject({ ok: true });
    await expect(secondLogout).resolves.toMatchObject({ ok: true });
  });
});
