import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markRemindersAsked, remindersAskCount, shouldAskForReminders, unlinkRemindersOnLogout } from "@/lib/push-client";

const DAY = 24 * 60 * 60 * 1000;

describe("when to ask for reminders", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("asks straight away the first time", () => {
    expect(shouldAskForReminders(Date.now())).toBe(true);
  });

  it("waits three days between asks", () => {
    const start = Date.UTC(2026, 9, 16);
    markRemindersAsked(start);
    expect(shouldAskForReminders(start + 2 * DAY)).toBe(false);
    expect(shouldAskForReminders(start + 3 * DAY)).toBe(true);
  });

  it("stops after four asks", () => {
    let time = Date.UTC(2026, 9, 16);
    for (let i = 0; i < 4; i++) {
      expect(shouldAskForReminders(time)).toBe(true);
      markRemindersAsked(time);
      time += 4 * DAY;
    }
    expect(remindersAskCount()).toBe(4);
    expect(shouldAskForReminders(time + 30 * DAY)).toBe(false);
  });
});

describe("unlinking reminders on logout", () => {
  let session: Map<string, string>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    session = new Map([["amal-push-refreshed", "1"]]);
    globalThis.sessionStorage = {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => void session.set(key, value),
      removeItem: (key: string) => void session.delete(key),
      clear: () => session.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubWorker(subscription: { endpoint: string } | null, onLine = true) {
    vi.stubGlobal("navigator", {
      onLine,
      serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) },
    });
  }

  it("tells the server to stop, keeps the browser subscription, and lets the next account relink", async () => {
    stubWorker({ endpoint: "https://push.example/abc" });
    await unlinkRemindersOnLogout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/push/subscribe");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ endpoint: "https://push.example/abc" });
    expect(session.has("amal-push-refreshed")).toBe(false);
  });

  it("offline: only forgets this visit's refresh", async () => {
    stubWorker({ endpoint: "https://push.example/abc" }, false);
    await unlinkRemindersOnLogout();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(session.has("amal-push-refreshed")).toBe(false);
  });

  it("does nothing on the network without a subscription", async () => {
    stubWorker(null);
    await unlinkRemindersOnLogout();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up after its time limit and never throws", async () => {
    vi.useFakeTimers();
    stubWorker({ endpoint: "https://push.example/abc" });
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    let done = false;
    const pending = unlinkRemindersOnLogout(2_500).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2_400);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(done).toBe(true);

    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: { getRegistration: async () => Promise.reject(new Error("no worker")) },
    });
    await expect(unlinkRemindersOnLogout()).resolves.toBeUndefined();
  });
});
