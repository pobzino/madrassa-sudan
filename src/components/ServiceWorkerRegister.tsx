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
