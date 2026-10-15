"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

/**
 * The browser's online flag. The server snapshot is "online", so prerendered
 * HTML matches the first client render (no hydration mismatch). It is only a
 * hint: it stays true on Wi-Fi without internet, so the offline pages never
 * hide saved lessons because of it.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
