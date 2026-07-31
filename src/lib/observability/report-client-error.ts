'use client';

/**
 * Browser-side error reporting.
 *
 * Fire-and-forget by design: reporting must never delay the UI, never surface
 * anything to a child, and never throw. Uses sendBeacon where available so a
 * report survives the page being closed — which is exactly when the worst
 * errors happen (a tab dying mid-upload).
 */

const RECENT_WINDOW_MS = 10_000;
const seenRecently = new Map<string, number>();

/** Local de-duplication so a render loop does not fire hundreds of requests. */
function shouldSkip(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of seenRecently) {
    if (now - at > RECENT_WINDOW_MS) seenRecently.delete(k);
  }
  if (seenRecently.has(key)) return true;
  seenRecently.set(key, now);
  return false;
}

export interface ClientErrorReport {
  error: unknown;
  level?: 'error' | 'warn' | 'fatal';
  context?: Record<string, unknown>;
}

export function reportClientError({ error, level = 'error', context }: ClientErrorReport): void {
  if (typeof window === 'undefined') return;

  try {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown client error');
    const message = (err.message || 'Unknown client error').slice(0, 2000);
    const stack = err.stack ? err.stack.slice(0, 20000) : null;
    const route = window.location?.pathname ?? null;

    if (shouldSkip(`${message}|${route}`)) return;

    const body = JSON.stringify({
      message,
      stack,
      route,
      level,
      release: process.env.NEXT_PUBLIC_RUNTIME_VERSION ?? null,
      context,
    });

    // sendBeacon survives unload; fetch is the fallback (and keepalive helps).
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/errors', blob)) return;
    }
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    }).catch(() => {
      /* reporting is best-effort */
    });
  } catch {
    /* never let reporting break the page */
  }
}
