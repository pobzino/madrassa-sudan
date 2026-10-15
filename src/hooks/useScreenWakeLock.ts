"use client";

import { useEffect } from "react";

type WakeLockSentinel = { release(): Promise<void>; released: boolean };
type WakeLockApi = { request(type: "screen"): Promise<WakeLockSentinel> };

/**
 * Keeps the screen on while `active` (e.g. while a lesson is playing), so the
 * phone doesn't dim and lock mid-lesson. Browsers drop the lock when the page
 * is hidden, so it's taken again when the page comes back.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!active || !wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const lock = await wakeLock.request("screen");
        if (cancelled) await lock.release();
        else sentinel = lock;
      } catch {
        // Low battery mode or the browser said no; the lesson still plays.
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
