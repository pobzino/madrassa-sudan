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
 * - offline: no answer — offline, a network error or a timeout. `user` is the
 *   last user verified in this page session, if any. This is NOT signed out:
 *   never send the family to the login page for it.
 */
export type AuthStatus = "verified" | "signed_out" | "offline";

export type AuthState =
  | { status: "verified"; user: User }
  | { status: "signed_out"; user: null }
  | { status: "offline"; user: User | null };

// Lie-fi (connected but no internet) can leave auth calls hanging; past this
// we treat the network as unavailable.
const AUTH_TIMEOUT_MS = 5_000;
const PROFILE_TIMEOUT_MS = 8_000;

let cachedUser: User | null | undefined;
let cachedUserId: string | null | undefined;
let lastVerifiedUser: User | null = null;
let lastStatus: AuthStatus | undefined;
let authPromise: Promise<AuthState> | null = null;
const profileCache = new Map<string, Profile | null>();
const profilePromises = new Map<string, Promise<Profile | null>>();

class AuthTimeoutError extends Error {
  constructor() {
    super("Auth check timed out");
    this.name = "AuthTimeoutError";
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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

async function resolveAuthState(supabase: SupabaseClient<Database>): Promise<AuthState> {
  // Offline, getSession may try to refresh an expired token for ~25 s.
  if (browserIsOffline()) return offlineState();

  let sessionUserId: string;
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS);
    if (!data.session) {
      if (error && isOfflineLike(error)) return offlineState();
      return remember({ status: "signed_out", user: null });
    }
    sessionUserId = data.session.user.id;
  } catch (error) {
    if (isOfflineLike(error)) return offlineState();
    throw error;
  }

  if (cachedUser && cachedUserId === sessionUserId) {
    return remember({ status: "verified", user: cachedUser });
  }

  try {
    const { data, error } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    if (data.user) return remember({ status: "verified", user: data.user });
    // Only a definite "no valid session" answer means signed out; network
    // failures and unexpected errors must not send the family to login.
    if (error && !isSignedOutError(error)) return offlineState();
    return remember({ status: "signed_out", user: null });
  } catch (error) {
    if (isOfflineLike(error)) return offlineState();
    throw error;
  }
}

/**
 * The signed-in user and how sure we are. Use this (not getCachedUser) when
 * the caller must tell "signed out" from "no connection".
 */
export async function getAuthState(supabase: SupabaseClient<Database>): Promise<AuthState> {
  if (authPromise) return authPromise;
  authPromise = resolveAuthState(supabase)
    .catch(() => offlineState())
    .finally(() => {
      authPromise = null;
    });
  return authPromise;
}

/**
 * The verified user, or while offline the last user verified in this page
 * session. Returns null both when signed out and when offline with nobody
 * verified yet — check getLastAuthStatus() (or use getAuthState) before
 * treating null as signed out.
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
  authPromise = null;
  profileCache.clear();
  profilePromises.clear();
}
