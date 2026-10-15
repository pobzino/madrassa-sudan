/**
 * The one log-out used everywhere (sidebar menu, Settings, pending approval,
 * the offline hub). On a shared family phone it must leave nothing of the
 * previous account behind, with or without a connection:
 *   1. online: send what's queued first (otherwise it would be lost);
 *   2. end the session — and when the server can't be reached, remove the
 *      session cookies on this device (auth-js keeps them when its network
 *      sign-out fails, which would leave the account signed in);
 *   3. wipe downloads, the queue, caches and per-account keys;
 *   4. full navigation home, so no in-memory state survives.
 * Callers show a busy state while this runs, and confirm first when
 * countUnsyncedItems() > 0 and the phone is offline.
 */

import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { clearAuthCache } from "@/lib/supabase/auth-cache";
import { clearPrivateOfflineData } from "@/lib/offline/db";
import { abortAllDownloads } from "@/lib/offline/download-manager";
import { countUnsyncedItems, syncOfflineQueue, withTimeout } from "@/lib/offline/sync";

export { countUnsyncedItems };

const SYNC_TIMEOUT_MS = 4_000;
const SIGN_OUT_TIMEOUT_MS = 5_000;
// A local sign-out still waits for the auth lock (and may try a token
// refresh), so it gets only a short wait before the cookies go directly.
const LOCAL_SIGN_OUT_TIMEOUT_MS = 2_000;

// sb-<project ref>-auth-token, its chunks (.0, .1, …) and the PKCE verifier.
const AUTH_COOKIE_PATTERN = /^sb-[^=;\s]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

/** Names of the Supabase session cookies in a `document.cookie` string. Pure, for tests. */
export function authCookieNamesToClear(cookieString: string): string[] {
  const names = cookieString
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => AUTH_COOKIE_PATTERN.test(name));
  return [...new Set(names)];
}

function hasAuthCookies(): boolean {
  try {
    return authCookieNamesToClear(document.cookie).length > 0;
  } catch {
    return false;
  }
}

/** Removes the session from this device without the network. */
export function clearLocalAuthSession(): void {
  try {
    for (const name of authCookieNamesToClear(document.cookie)) {
      document.cookie = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
    }
  } catch {
    // No document (not in a browser).
  }
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && AUTH_COOKIE_PATTERN.test(key)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable.
  }
}

/**
 * Logs out and navigates to `redirectTo` (default "/") with a full page load.
 * Resolves just before navigating; never rejects.
 */
export async function logOut({ redirectTo = "/" }: { redirectTo?: string } = {}): Promise<void> {
  const supabase = createClient();
  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  if (online) {
    await withTimeout(syncOfflineQueue({ supabase }), SYNC_TIMEOUT_MS).catch(() => undefined);
  }

  abortAllDownloads();
  supabase.auth.stopAutoRefresh().catch(() => undefined);

  let signedOut = false;
  if (online) {
    try {
      const { error } = await withTimeout(supabase.auth.signOut(), SIGN_OUT_TIMEOUT_MS);
      signedOut = !error;
    } catch {
      signedOut = false;
    }
  }
  if (!signedOut) {
    await withTimeout(supabase.auth.signOut({ scope: "local" }), LOCAL_SIGN_OUT_TIMEOUT_MS).catch(() => undefined);
  }
  if (hasAuthCookies()) clearLocalAuthSession();

  try {
    if (posthog.__loaded) posthog.reset();
  } catch {
    // Analytics must never block logging out.
  }

  await clearPrivateOfflineData().catch(() => undefined);
  clearAuthCache();

  // A token refresh started before the logout (auth-js does one at start-up)
  // can write a fresh session cookie if the connection comes back meanwhile.
  if (hasAuthCookies()) clearLocalAuthSession();
  window.location.assign(redirectTo);
}
