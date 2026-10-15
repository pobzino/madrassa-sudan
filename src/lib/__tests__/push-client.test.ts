import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disableReminders,
  enableReminders,
  markRemindersAsked,
  refreshReminders,
  remindersAskCount,
  remindersWanted,
  shouldAskForReminders,
  unlinkRemindersOnLogout,
} from "@/lib/push-client";

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

// ── Turning reminders on while the worker is still installing ────────────────

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

/** A phone whose worker is either ready or still installing, with fake push and server. */
function fakePhone({ workerReady = true, permission = "default" as NotificationPermission } = {}) {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AQAB");
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());

  let subscription: { endpoint: string; toJSON: () => object; unsubscribe: () => Promise<boolean> } | null = null;
  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: vi.fn(async () => {
      subscription = {
        endpoint: "https://push.example/1",
        toJSON: () => ({ endpoint: "https://push.example/1" }),
        unsubscribe: async () => {
          subscription = null;
          return true;
        },
      };
      return subscription;
    }),
  };
  const registration = { pushManager, active: (workerReady ? {} : null) as object | null, installing: null, waiting: null };
  let resolveReady: (value: unknown) => void = () => undefined;
  const ready = new Promise((resolve) => (resolveReady = resolve));
  const finishInstall = () => {
    registration.active = {};
    resolveReady(registration);
  };
  if (workerReady) finishInstall();
  const serviceWorker = {
    ready,
    getRegistration: vi.fn(async () => (registration.active ? registration : undefined)),
    register: vi.fn(async () => registration),
  };
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = "granted";
      return "granted" as NotificationPermission;
    }),
  };
  vi.stubGlobal("navigator", { serviceWorker, userAgent: "Mozilla/5.0 (Linux; Android 14)" });
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("window", {
    PushManager: function PushManager() {},
    Notification: notification,
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
  });
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      posts.push({ method: init.method, ...JSON.parse(String(init.body)) });
      return new Response(null, { status: 200 });
    })
  );
  return { serviceWorker, pushManager, posts, finishInstall };
}

const confirmations = (posts: Record<string, unknown>[]) => posts.filter((post) => post.confirm === true);

describe("turning reminders on", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("keeps a yes the worker can't take yet, and finishes it once the worker is ready", async () => {
    vi.useFakeTimers();
    const phone = fakePhone({ workerReady: false });

    const outcome = enableReminders("ar");
    await vi.advanceTimersByTimeAsync(59_000);
    expect(phone.pushManager.subscribe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_100);
    expect(await outcome).toBe("pending");
    expect(remindersWanted()).toBe("ar");

    phone.finishInstall();
    await vi.advanceTimersByTimeAsync(10);
    expect(confirmations(phone.posts)).toEqual([
      { method: "POST", endpoint: "https://push.example/1", confirm: true, language: "ar" },
    ]);
    expect(remindersWanted()).toBeNull();

    // Done for this visit: no second "reminders are on" push.
    await refreshReminders();
    expect(confirmations(phone.posts)).toHaveLength(1);
  });

  it("tries again later when finishing fails, without using up the visit", async () => {
    const phone = fakePhone({ permission: "granted" });
    localStorage.setItem("amal-reminders-wanted", "en");
    // An iPhone may refuse to subscribe without a tap.
    phone.pushManager.subscribe.mockRejectedValueOnce(new Error("NotAllowedError"));

    await refreshReminders();
    expect(phone.posts).toHaveLength(0);
    expect(remindersWanted()).toBe("en");

    await refreshReminders();
    expect(confirmations(phone.posts)).toEqual([
      { method: "POST", endpoint: "https://push.example/1", confirm: true, language: "en" },
    ]);
    expect(remindersWanted()).toBeNull();
  });

  it("registers the worker again when its first install failed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const phone = fakePhone({ workerReady: false });
    phone.serviceWorker.register.mockImplementationOnce(async () => {
      phone.finishInstall();
      return {} as never;
    });
    expect(await enableReminders("en")).toBe("on");
    expect(phone.serviceWorker.register).toHaveBeenCalledWith("/sw.js");
  });

  it("sends one confirmation when the dashboard refreshes during the tap", async () => {
    // The card's "finish turning on" tap: already allowed, a yes unfinished.
    const phone = fakePhone({ permission: "granted" });
    localStorage.setItem("amal-reminders-wanted", "en");
    const [outcome] = await Promise.all([enableReminders("en"), refreshReminders()]);
    expect(outcome).toBe("on");
    expect(confirmations(phone.posts)).toHaveLength(1);
  });

  it("drops an unfinished yes when reminders are turned off", async () => {
    fakePhone({ permission: "granted" });
    localStorage.setItem("amal-reminders-wanted", "ar");
    expect(await disableReminders()).toBe(true);
    expect(remindersWanted()).toBeNull();
  });
});
