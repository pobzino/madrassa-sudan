import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database, Profile } from "@/lib/database.types";

/**
 * - verified: the network confirmed this user.
 * - signed_out: the network (or the absence of any session) says nobody is signed in.
 * - offline: no answer — offline, a network error, or still nothing after
 *   AUTH_GIVE_UP_MS. `user` is the last user verified in this page session,
 *   if any. This is NOT signed out: never send the family to the login page for it.
 * - pending (getAuthStateOrPending only): online, but the server hasn't
 *   answered yet. A slow connection, not a missing one; `verification`
 *   resolves with one of the answers above.
 */
export type AuthStatus = "verified" | "signed_out" | "offline" | "pending";

export type AuthState =
  | { status: "verified"; user: User }
  | { status: "signed_out"; user: null }
  | { status: "offline"; user: User | null };

export type PendingAuthState = {
  status: "pending";
  user: User | null;
  verification: Promise<AuthState>;
};

// The page itself just loaded, so a check still running after this is a slow
// connection (a cold connection to Supabase on 2G/3G), not a missing one.
const AUTH_TIMEOUT_MS = 5_000;
// Lie-fi (connected but no internet) can leave auth calls hanging for
// minutes; past this we treat the network as unavailable. Matches the lesson
// page's own load limit.
const AUTH_GIVE_UP_MS = 30_000;
// While the browser says it's online, a slow profile query is far more often
// a slow connection than a dead one; give it about as long as the auth check.
const PROFILE_TIMEOUT_MS = 25_000;

/** Fired on window when a check that outlasted AUTH_TIMEOUT_MS finally answers. `detail` is its AuthStatus. */
export const AUTH_RESOLVED_EVENT = "amal:auth-resolved";

/** A check's answer before it is remembered (offline's user is filled in then). */
type Answer = { status: "verified"; user: User } | { status: "signed_out" } | { status: "offline" };

let cachedUser: User | null | undefined;
let cachedUserId: string | null | undefined;
let lastVerifiedUser: User | null = null;
let lastStatus: AuthStatus | undefined;
// The check talking to the server. A hung request can't be cancelled and
// auth-js runs them one at a time anyway, so every caller (a retry too) waits
// on this one until it answers, however late, instead of queueing another.
let runningCheck: Promise<AuthState> | null = null;
// The running check some caller was told is "pending"; its answer is announced.
let lateCheck: Promise<AuthState> | null = null;
// Bumped by clearAuthCache (log-out): an answer to a check started before
// that is about the old session.
let cacheGeneration = 0;
const profileCache = new Map<string, Profile | null>();
const profilePromises = new Map<string, Promise<Profile | null>>();

export function browserIsOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * True when an auth/data failure means "couldn't reach the server" rather
 * than "not signed in": the browser is offline, the request timed out or was
 * aborted, or it failed at the network level (incl. auth-js's retryable
 * fetch error and 5xx/429 responses).
 */
export function isOfflineLike(error?: unknown): boolean {
  if (browserIsOffline()) return true;
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return true;
  const name = (error as { name?: unknown }).name;
  if (name === "AuthTimeoutError" || name === "TimeoutError" || name === "AbortError") return true;
  if (name === "TypeError") return true; // fetch() network failure
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && (status === 0 || status === 408 || status === 429 || status >= 500);
}

/** True when the error positively says there is no valid session. */
function isSignedOutError(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  return (
    isAuthApiError(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  );
}

function remember(state: AuthState): AuthState {
  lastStatus = state.status;
  if (state.status === "verified") {
    cachedUser = state.user;
    cachedUserId = state.user.id;
    lastVerifiedUser = state.user;
  } else if (state.status === "signed_out") {
    cachedUser = null;
    cachedUserId = null;
    lastVerifiedUser = null;
  }
  return state;
}

function offlineState(): AuthState {
  return remember({ status: "offline", user: lastVerifiedUser });
}

function rememberAnswer(answer: Answer): AuthState {
  if (answer.status === "offline") return offlineState();
  if (answer.status === "signed_out") return remember({ status: "signed_out", user: null });
  return remember(answer);
}

/** Asks the server, with no time limit of its own (callers decide how long to wait). */
async function askServer(supabase: SupabaseClient<Database>): Promise<Answer> {
  let sessionUserId: string;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!data.session) {
      if (error && isOfflineLike(error)) return { status: "offline" };
      return { status: "signed_out" };
    }
    sessionUserId = data.session.user.id;
  } catch (error) {
    if (isOfflineLike(error)) return { status: "offline" };
    throw error;
  }

  if (cachedUser && cachedUserId === sessionUserId) {
    return { status: "verified", user: cachedUser };
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { status: "verified", user: data.user };
    // Only a definite "no valid session" answer means signed out; network
    // failures and unexpected errors must not send the family to login.
    if (error && !isSignedOutError(error)) return { status: "offline" };
    return { status: "signed_out" };
  } catch (error) {
    if (isOfflineLike(error)) return { status: "offline" };
    throw error;
  }
}

function startCheck(supabase: SupabaseClient<Database>): Promise<AuthState> {
  if (runningCheck) return runningCheck;
  const startedIn = cacheGeneration;
  const check: Promise<AuthState> = askServer(supabase)
    .catch((): Answer => ({ status: "offline" }))
    .then((answer) => {
      const late = lateCheck === check;
      if (runningCheck === check) runningCheck = null;
      if (late) lateCheck = null;
      // Logged out while this ran: the answer is about the old session, so ask again.
      if (startedIn !== cacheGeneration) return startCheck(supabase);
      const state = rememberAnswer(answer);
      // Pages that gave up waiting (or were told "pending") can load now.
      if (late && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(AUTH_RESOLVED_EVENT, { detail: state.status }));
      }
      return state;
    });
  runningCheck = check;
  return check;
}

/** The check's answer, or null when it hasn't come within `ms` or the browser goes offline first. */
function answerWithin(check: Promise<AuthState>, ms: number): Promise<AuthState | null> {
  return new Promise<AuthState | null>((resolve) => {
    const hasWindow = typeof window !== "undefined";
    const finish = (state: AuthState | null) => {
      clearTimeout(timer);
      if (hasWindow) window.removeEventListener("offline", wentOffline);
      resolve(state);
    };
    const wentOffline = () => finish(null);
    const timer = setTimeout(() => finish(null), ms);
    if (hasWindow) window.addEventListener("offline", wentOffline);
    void check.then(finish);
  });
}

/**
 * Like getAuthState, but on a slow connection it doesn't make the caller
 * wait: after AUTH_TIMEOUT_MS (while the browser says it's online) it returns
 * "pending", so the page can say "still trying" and offer the saved lessons.
 */
export async function getAuthStateOrPending(
  supabase: SupabaseClient<Database>
): Promise<AuthState | PendingAuthState> {
  // Offline, getSession may try to refresh an expired token for ~25 s.
  if (browserIsOffline()) return offlineState();

  const check = startCheck(supabase);
  const answer = await answerWithin(check, AUTH_TIMEOUT_MS);
  if (answer) return answer;
  if (browserIsOffline()) return offlineState();

  lateCheck = check;
  return {
    status: "pending",
    user: lastVerifiedUser,
    verification: answerWithin(check, AUTH_GIVE_UP_MS - AUTH_TIMEOUT_MS).then(
      (lateAnswer) => lateAnswer ?? offlineState()
    ),
  };
}

/**
 * The signed-in user and how sure we are. Use this (not getCachedUser) when
 * the caller must tell "signed out" from "no connection". On a slow
 * connection it waits for the server (up to AUTH_GIVE_UP_MS) rather than
 * calling it offline.
 */
export async function getAuthState(supabase: SupabaseClient<Database>): Promise<AuthState> {
  const state = await getAuthStateOrPending(supabase);
  return state.status === "pending" ? state.verification : state;
}

/**
 * The verified user, or while offline the last user verified in this page
 * session. Returns null both when signed out and when offline with nobody
 * verified yet — check getLastAuthStatus() (or use getAuthState) before
 * treating null as signed out. Waits out a slow connection like getAuthState.
 */
export async function getCachedUser(
  supabase: SupabaseClient<Database>
): Promise<User | null> {
  const state = await getAuthState(supabase);
  return state.user;
}

/** Status of the most recent auth check, so callers of getCachedUser can tell why it returned null. */
export function getLastAuthStatus(): AuthStatus | undefined {
  return lastStatus;
}

/** The last user the network verified in this page session. */
export function getLastVerifiedUser(): User | null {
  return lastVerifiedUser;
}

export async function getCachedProfile(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Profile | null> {
  if (profileCache.has(userId)) {
    return profileCache.get(userId) ?? null;
  }

  const existingPromise = profilePromises.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  // Offline the query can't succeed; don't spend the auth lock trying.
  if (browserIsOffline()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);

  const profilePromise = Promise.resolve(
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .abortSignal(controller.signal)
      .single()
  )
    .then(({ data, error }) => {
      const profile = data ?? null;
      // A failed query (network, timeout) must not be remembered as "no
      // profile" — the next call should try again. "No row" (PGRST116) is a
      // real answer and is kept.
      if (!error || profile || error.code === "PGRST116") profileCache.set(userId, profile);
      return profile;
    })
    .catch(() => null)
    .finally(() => {
      clearTimeout(timer);
      profilePromises.delete(userId);
    });

  profilePromises.set(userId, profilePromise);
  return profilePromise;
}

export function primeCachedProfile(profile: Profile | null) {
  if (profile?.id) {
    profileCache.set(profile.id, profile);
  }
}

export function clearAuthCache() {
  cachedUser = undefined;
  cachedUserId = undefined;
  lastVerifiedUser = null;
  lastStatus = undefined;
  runningCheck = null;
  lateCheck = null;
  cacheGeneration += 1;
  profileCache.clear();
  profilePromises.clear();
}
