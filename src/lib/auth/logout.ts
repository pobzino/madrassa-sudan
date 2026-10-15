/**
 * The one log-out used everywhere (sidebar menu, Settings, pending approval,
 * the offline hub, account deletion). On a shared family phone it must leave
 * nothing of the previous account behind, with or without a connection —
 * and never delete progress or answers that weren't sent without asking:
 *   1. send what's queued first (online), then count what is still waiting,
 *      whatever the reason (no connection, lie-fi, a slow link, another tab
 *      syncing, the server refusing). If anything is, stop there — still
 *      fully signed in — and report it, so the caller can ask. `force` (the
 *      family chose "log out anyway") skips this step;
 *   2. unlink this phone from the account's reminders (needs the session);
 *   3. end this device's session — and when the server can't be reached,
 *      remove the session cookies on this device (auth-js keeps them when its
 *      network sign-out fails, which would leave the account signed in);
 *   4. wipe downloads, the queue, caches and per-account keys;
 *   5. full navigation home, so no in-memory state survives.
 * Log-out buttons use logOutWithUnsentCheck(), which does the asking.
 */

import posthog from "posthog-js";
import { createClient } from "@/lib/supabase/client";
import { clearAuthCache } from "@/lib/supabase/auth-cache";
import { clearPrivateOfflineData } from "@/lib/offline/db";
import { abortAllDownloads } from "@/lib/offline/download-manager";
import { countUnsyncedItems, syncOfflineQueue, withTimeout } from "@/lib/offline/sync";
import { unlinkRemindersOnLogout } from "@/lib/push-client";

export { countUnsyncedItems };

// Longer than the sync's own 5 s sign-in check plus a 10 s request, so a
// slow link gets its chance; whatever is still unsent after it is counted,
// not lost.
const SYNC_BUDGET_MS = 20_000;
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

let loggingOut = false;

/**
 * True while logOut() runs in this tab (and after, until the page goes), so
 * a SIGNED_OUT event meanwhile isn't handled as a sign-out elsewhere — that
 * would leave the page before this log-out has wiped the phone.
 */
export function isLoggingOut(): boolean {
  return loggingOut;
}

export type LogOutResult =
  | { status: "logged_out" }
  /** Nothing was changed: `count` items are still waiting to be sent. */
  | { status: "unsynced"; count: number };

/**
 * Logs out and navigates to `redirectTo` (default "/") with a full page load,
 * resolving just before navigating — unless items are still unsent and
 * `force` isn't set: then it resolves `unsynced` with everything left as it
 * was. Never rejects.
 */
export async function logOut({
  redirectTo = "/",
  force = false,
}: { redirectTo?: string; force?: boolean } = {}): Promise<LogOutResult> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  loggingOut = true;

  if (!force) {
    if (online) {
      await withTimeout(syncOfflineQueue(), SYNC_BUDGET_MS).catch(() => undefined);
    }
    // Every account's items count: the wipe below deletes them all.
    const count = await countUnsyncedItems();
    if (count > 0) {
      loggingOut = false;
      return { status: "unsynced", count };
    }
  }

  const supabase = createClient();
  await unlinkRemindersOnLogout();
  abortAllDownloads();
  supabase.auth.stopAutoRefresh().catch(() => undefined);

  // Only this device: signing out every device would also end the session
  // on a phone holding the account's unsent offline work.
  let signedOut = false;
  if (online) {
    try {
      const { error } = await withTimeout(supabase.auth.signOut({ scope: "local" }), SIGN_OUT_TIMEOUT_MS);
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

  // If the database couldn't be emptied (another tab holding it), this
  // leaves a marker so the next open empties it before anything is read.
  await clearPrivateOfflineData().catch(() => undefined);
  clearAuthCache();

  // A token refresh started before the logout (auth-js does one at start-up)
  // can write a fresh session cookie if the connection comes back meanwhile.
  if (hasAuthCookies()) clearLocalAuthSession();
  window.location.assign(redirectTo);
  return { status: "logged_out" };
}

export type LogOutPhase = "sending" | "logging_out";

/** Busy labels for log-out buttons. */
export const LOG_OUT_BUSY_LABELS: Record<"ar" | "en", Record<LogOutPhase, string>> = {
  en: { sending: "Sending your progress…", logging_out: "Logging out…" },
  ar: { sending: "جارٍ إرسال تقدّمك…", logging_out: "جارٍ تسجيل الخروج…" },
};

const UNSENT_CONFIRM = {
  en: (count: number) =>
    `Progress and answers saved on this phone haven't been sent yet (${count}). Logging out now deletes them from this phone. Log out anyway?`,
  ar: (count: number) =>
    `لم يُرسَل بعد التقدّم والإجابات المحفوظة على هذا الهاتف (${count}). تسجيل الخروج الآن سيحذفها من هذا الهاتف. هل تريد تسجيل الخروج على أي حال؟`,
};

/**
 * logOut() behind a log-out button. Sends what's waiting first; if anything
 * is still unsent afterwards, asks before deleting it, and on Cancel stays
 * signed in (and keeps trying to send in the background). Pass `force` when
 * the caller has already asked. `onPhase` drives the busy label; null means
 * the family chose to stay. Resolves true when the page is navigating away.
 */
export async function logOutWithUnsentCheck({
  language,
  force = false,
  onPhase,
}: {
  language: "ar" | "en";
  force?: boolean;
  onPhase: (phase: LogOutPhase | null) => void;
}): Promise<boolean> {
  onPhase("logging_out");
  if (!force && (await countUnsyncedItems()) > 0) onPhase("sending");
  const result = await logOut({ force });
  if (result.status === "logged_out") return true;

  onPhase(null);
  if (!window.confirm(UNSENT_CONFIRM[language](result.count))) {
    void syncOfflineQueue();
    return false;
  }
  onPhase("logging_out");
  await logOut({ force: true });
  return true;
}
