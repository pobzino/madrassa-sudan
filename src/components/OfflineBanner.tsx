"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/components/offline/useOnlineStatus";
import { OFFLINE_HUB_PATH } from "@/lib/offline/cache-names";

export default function OfflineBanner() {
  // Server render and hydration read "online", so connected families never
  // see an offline banner flash (and there's no hydration mismatch).
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!navigator.onLine) wasOfflineRef.current = true;
    const goOnline = () => {
      if (!wasOfflineRef.current) return;
      wasOfflineRef.current = false;
      setShowReconnected(true);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => setShowReconnected(false), 3000);
    };
    const goOffline = () => {
      wasOfflineRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setShowReconnected(false);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      className={`fixed top-0 left-0 right-0 z-[60] px-4 py-2 text-center text-sm font-medium transition-all ${
        isOnline
          ? "bg-emerald-500 text-white"
          : "bg-amber-500 text-white"
      }`}
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
          Back online! — عدت للاتصال!
        </span>
      ) : (
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l8.735 8.735m0 0a.374.374 0 11.53.53m-.53-.53l.53.53m0 0L21 21M14.652 9.348a3.75 3.75 0 010 5.304m2.121-7.425a6.75 6.75 0 010 9.546m2.121-11.667c3.808 3.807 3.808 9.98 0 13.788" />
            </svg>
            You&apos;re offline — أنت غير متصل
          </span>
          {/* A full page load: the saved-lessons hub works with no connection. */}
          <a href={OFFLINE_HUB_PATH} className="rounded-full bg-white/20 px-3 py-0.5 font-bold underline-offset-2 hover:bg-white/30 hover:underline">
            My saved lessons — دروسي المحفوظة
          </a>
        </span>
      )}
    </div>
  );
}
