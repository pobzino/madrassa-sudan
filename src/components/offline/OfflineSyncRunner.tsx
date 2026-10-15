"use client";

/**
 * Sends progress and activity answers saved without a connection, from any
 * route (the offline hub and player included): once when the app opens
 * online, after every `online` event (debounced — the first seconds of a
 * reconnect are often flaky), and when the app comes back to the foreground
 * (iPhone has no background sync, and a reopened home-screen app doesn't
 * reload). Mounted once in the root layout; OfflineContext doesn't sync.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { SyncResult } from "@/lib/offline/sync";
import { isStandalone } from "@/lib/pwa-install";

/** Fired on window after a sync that sent or dropped items, so pages can refresh their counts. */
export const OFFLINE_SYNCED_EVENT = "amal:offline-synced";

const ONLINE_DEBOUNCE_MS = 2_000;
// A foreground return syncs at most this often.
const FOREGROUND_MIN_INTERVAL_MS = 60_000;

// The queue also holds online writes that failed on a bad connection, so this
// can't promise the progress came from a saved lesson.
const COPY = {
  en: "Your progress has been saved to your account.",
  ar: "تم حفظ تقدّمكم في حسابكم.",
};

const LEARNER_SYNC_FAILURE_COPY = {
  en: "Some offline learning data could not sync because its learner profile was deleted.",
  ar: "تعذّر مزامنة بعض بيانات التعلّم المحفوظة دون اتصال لأن ملف المتعلّم حُذف.",
};

// The Supabase session cookie (sb-<project ref>-auth-token, or its .0/.1
// chunks); mirrors the pattern in src/lib/auth/logout.ts.
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)sb-[^=;\s]+-auth-token(?:\.\d+)?=/;

/**
 * Without a session cookie nothing can be sent (sync needs the signed-in
 * user), so visitors who aren't signed in skip it — and never load the
 * offline storage code or open its database.
 */
function hasSessionCookie(): boolean {
  try {
    return SESSION_COOKIE_PATTERN.test(document.cookie);
  } catch {
    return false;
  }
}

export default function OfflineSyncRunner() {
  const { language } = useLanguage();
  // Read when the toast shows, so a language switch doesn't restart the runner.
  const languageRef = useRef(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    let disposed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRunAt = 0;

    const run = async () => {
      if (disposed || !navigator.onLine) return;
      lastRunAt = Date.now();
      if (!hasSessionCookie()) return;
      // Loaded on demand (it only ever runs online) so every page of the site
      // doesn't carry the offline storage code.
      let result: SyncResult;
      try {
        const { syncOfflineQueue } = await import("@/lib/offline/sync");
        result = await syncOfflineQueue();
      } catch {
        return;
      }
      if (disposed) return;
      if (result.synced > 0 || result.dropped > 0) {
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNCED_EVENT, { detail: result }));
      }
      if (result.learnerDataDropped && result.learnerDataDropped > 0) {
        toast.error(LEARNER_SYNC_FAILURE_COPY[languageRef.current]);
      }
      if (result.synced > 0) {
        toast.success(COPY[languageRef.current]);
        // Sent once the phone is back online: nothing can be reported while offline.
        trackAnalyticsEvent("offline_progress_synced", {
          lessons: result.lessons ?? 0,
          answers: result.answers ?? 0,
          in_app: isStandalone(),
        });
      }
    };

    const scheduleRun = (delay: number) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void run();
      }, delay);
    };

    const handleOnline = () => scheduleRun(ONLINE_DEBOUNCE_MS);
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRunAt < FOREGROUND_MIN_INTERVAL_MS) return;
      scheduleRun(0);
    };

    // Let the page's own requests go first on app open.
    scheduleRun(ONLINE_DEBOUNCE_MS);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
