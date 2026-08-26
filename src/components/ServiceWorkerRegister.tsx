"use client";

import { useEffect } from "react";

function canUseServiceWorker() {
  if (!("serviceWorker" in navigator)) return false;
  if (window.isSecureContext) return true;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!canUseServiceWorker()) return;

    // Development chunks are not content-hashed like production bundles. A
    // stale worker can otherwise mix old client code with fresh server HTML.
    if (process.env.NODE_ENV !== "production") {
      const disableDevelopmentWorker = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ("caches" in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(
            cacheNames
              .filter(
                (name) =>
                  name.startsWith("amal-sw-") ||
                  name.startsWith("amal-static-") ||
                  name.startsWith("amal-pages-"),
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
