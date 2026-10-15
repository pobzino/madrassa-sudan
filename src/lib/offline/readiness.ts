/**
 * Whether lessons saved on this phone can really be opened offline.
 *
 * A saved lesson needs more than its own files: with no connection, only the
 * service worker can answer /offline and /offline/play. Its install is
 * all-or-nothing (both pages and every build file they load), so on a bad
 * connection it can fail, or still be running, while the lesson itself saved
 * fine. Until it's done the save controls say "Almost ready" rather than
 * "Saved on this phone".
 */

import { OFFLINE_HUB_PATH, OFFLINE_PLAYER_PATH, SHELL_CACHE_PREFIX } from "./cache-names";

export const SERVICE_WORKER_URL = "/sw.js";

/** Service workers need a secure page (localhost counts, for development). */
export function canUseServiceWorker(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (window.isSecureContext) return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

/**
 * True when a service worker is active and one of its shell caches holds
 * both offline pages. Never throws.
 */
export async function isOfflinePlaybackReady(): Promise<boolean> {
  // Development unregisters the worker on purpose (ServiceWorkerRegister).
  if (isDevelopment()) return true;
  if (!canUseServiceWorker() || typeof caches === "undefined") return false;
  try {
    // Not `controller`: a hard-reloaded page has none even when a worker is active.
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active) return false;
    // Only this worker's versioned shell caches: the first offline version's
    // leftover copy of /offline must not count while the new install fails.
    const names = (await caches.keys()).filter((name) => name.startsWith(SHELL_CACHE_PREFIX));
    const options = { ignoreSearch: true, ignoreVary: true };
    for (const name of names) {
      const cache = await caches.open(name);
      const [hub, player] = await Promise.all([
        cache.match(OFFLINE_HUB_PATH, options),
        cache.match(OFFLINE_PLAYER_PATH, options),
      ]);
      if (hub && player) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Registers the worker again, so a failed first install gets another go.
 * register(), not update(): after a failed first install there's no
 * registration left to update. Costs nothing when the same worker is already
 * registered. Never throws.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (isDevelopment() || !canUseServiceWorker()) return null;
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    if (!registration.active && !registration.installing && !registration.waiting) {
      await registration.update().catch(() => undefined);
    }
    return registration;
  } catch {
    return null;
  }
}
