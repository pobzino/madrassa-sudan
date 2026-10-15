import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  AUTH_RESOLVED_EVENT,
  clearAuthCache,
  getAuthState,
  getAuthStateOrPending,
  getCachedUser,
  getLastAuthStatus,
} from "@/lib/supabase/auth-cache";

const user = { id: "user-a" } as User;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type GetUserResult = { data: { user: User | null }; error: unknown };

/** A Supabase client whose session is on the phone and whose getUser answers when the test says. */
function fakeClient(getUser: () => Promise<GetUserResult>) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { user } as unknown }, error: null })),
    getUser: vi.fn(getUser),
  };
  return { client: { auth } as unknown as SupabaseClient<Database>, auth };
}

function listenForResolved() {
  const resolved = vi.fn();
  window.addEventListener(AUTH_RESOLVED_EVENT, (event) => resolved((event as CustomEvent).detail));
  return resolved;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("window", new EventTarget());
  clearAuthCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("auth check on a slow connection", () => {
  it("says pending (not offline) after 5 s while online, then gives the late answer", async () => {
    const late = deferred<GetUserResult>();
    const { client } = fakeClient(() => late.promise);
    const resolved = listenForResolved();

    const first = getAuthStateOrPending(client);
    await vi.advanceTimersByTimeAsync(5_000);
    const state = await first;
    expect(state.status).toBe("pending");
    expect(state.user).toBeNull();
    expect(getLastAuthStatus()).toBeUndefined();
    if (state.status !== "pending") return;

    late.resolve({ data: { user }, error: null });
    await expect(state.verification).resolves.toEqual({ status: "verified", user });
    expect(resolved).toHaveBeenCalledWith("verified");
    expect(getLastAuthStatus()).toBe("verified");
  });

  it("makes a retry wait on the same request instead of asking again", async () => {
    const late = deferred<GetUserResult>();
    const { client, auth } = fakeClient(() => late.promise);

    const first = getAuthStateOrPending(client);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await first).status).toBe("pending");

    const retry = getAuthState(client);
    await vi.advanceTimersByTimeAsync(2_000);
    late.resolve({ data: { user }, error: null });
    await expect(retry).resolves.toEqual({ status: "verified", user });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("lets getAuthState and getCachedUser wait out a slow answer", async () => {
    const late = deferred<GetUserResult>();
    const { client } = fakeClient(() => late.promise);

    const state = getAuthState(client);
    const cachedUser = getCachedUser(client);
    await vi.advanceTimersByTimeAsync(12_000);
    late.resolve({ data: { user }, error: null });
    await expect(state).resolves.toEqual({ status: "verified", user });
    await expect(cachedUser).resolves.toBe(user);
  });

  it("gives up after 30 s, and still uses an answer that comes later", async () => {
    const late = deferred<GetUserResult>();
    const { client, auth } = fakeClient(() => late.promise);

    const state = getAuthState(client);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(state).resolves.toEqual({ status: "offline", user: null });
    expect(getLastAuthStatus()).toBe("offline");

    const resolved = listenForResolved();
    late.resolve({ data: { user }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toHaveBeenCalledWith("verified");
    await expect(getAuthState(client)).resolves.toEqual({ status: "verified", user });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("stops waiting as soon as the browser goes offline", async () => {
    const { client } = fakeClient(() => new Promise<GetUserResult>(() => undefined));

    const state = getAuthStateOrPending(client);
    await vi.advanceTimersByTimeAsync(1_000);
    vi.stubGlobal("navigator", { onLine: false });
    window.dispatchEvent(new Event("offline"));
    await expect(state).resolves.toEqual({ status: "offline", user: null });
  });

  it("answers offline at once, without asking the server, when the browser is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { client, auth } = fakeClient(async () => ({ data: { user }, error: null }));

    await expect(getAuthStateOrPending(client)).resolves.toEqual({ status: "offline", user: null });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("tells a missing session (signed out) from a network failure (offline)", async () => {
    const signedOut = fakeClient(async () => ({ data: { user: null }, error: new AuthSessionMissingError() }));
    await expect(getAuthState(signedOut.client)).resolves.toEqual({ status: "signed_out", user: null });

    clearAuthCache();
    const failing = fakeClient(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(getAuthState(failing.client)).resolves.toEqual({ status: "offline", user: null });
  });

  it("doesn't keep an answer about a session that was logged out meanwhile", async () => {
    const late = deferred<GetUserResult>();
    const { client, auth } = fakeClient(() => late.promise);

    const state = getAuthState(client);
    await vi.advanceTimersByTimeAsync(1_000);
    clearAuthCache();
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    late.resolve({ data: { user }, error: null });
    await expect(state).resolves.toEqual({ status: "signed_out", user: null });
  });
});
