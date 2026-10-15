"use client";

import { useEffect } from "react";
import { LEGACY_SW_CACHES, SHELL_CACHE_PREFIX, STATIC_CACHE_PREFIX, SW_META_CACHE } from "@/lib/offline/cache-names";
// Imported here, in the root layout, so it catches the browser's one-tap
// install offer even if that arrives before any install button renders.
import { trackAppLaunch } from "@/lib/pwa-install";

function canUseServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  if (window.isSecureContext) return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    trackAppLaunch();
    // A reminder puts a dot on the app icon; opening Amal clears it.
    const clearBadge = () => {
      if (document.visibilityState !== "visible") return;
      (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => undefined);
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    return () => document.removeEventListener("visibilitychange", clearBadge);
  }, []);

  useEffect(() => {
    if (!canUseServiceWorker()) return;

    // Development chunks are not content-hashed like production bundles. A
    // stale worker can otherwise mix old client code with fresh server HTML.
    if (process.env.NODE_ENV !== "production") {
      const disableDevelopmentWorker = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        // Only the worker's own caches: downloaded lessons (audio, images)
        // stay, so offline downloads can be tried in development too.
        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(
            cacheNames
              .filter(
                (name) =>
                  name.startsWith(SHELL_CACHE_PREFIX) ||
                  name.startsWith(STATIC_CACHE_PREFIX) ||
                  name === SW_META_CACHE ||
                  (LEGACY_SW_CACHES as readonly string[]).includes(name),
              )
              .map((name) => window.caches.delete(name)),
          );
        }
      };

      void disableDevelopmentWorker();
      return;
    }

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;
        await registration.update().catch(() => undefined);
      } catch {
        // Offline mode is progressive enhancement; the app still works online.
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
