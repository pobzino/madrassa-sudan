"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OwlSad } from "@/components/illustrations";

interface OfflineLesson {
  id: string;
  title_ar: string;
  title_en: string;
}

export default function OfflinePage() {
  const [lessons, setLessons] = useState<OfflineLesson[]>([]);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine
  );

  const loadOfflineLessons = useCallback(async () => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("amal-offline", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = () => {}; // DB doesn't exist yet
      });

      const tx = db.transaction("lessons", "readonly");
      const store = tx.objectStore("lessons");
      const all = await new Promise<OfflineLesson[]>((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(
            (req.result || []).map((r: Record<string, string>) => ({
              id: r.id,
              title_ar: r.title_ar || "",
              title_en: r.title_en || "",
            }))
          );
        req.onerror = () => reject(req.error);
      });

      db.close();
      setLessons(all);
    } catch {
      // IndexedDB not initialized yet — no downloads
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Load downloaded lessons from IndexedDB
    queueMicrotask(() => {
      void loadOfflineLessons();
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadOfflineLessons]);

  if (isOnline) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re back online!</h1>
          <p className="text-gray-500 mb-6 text-sm">أنت متصل بالإنترنت مجدداً</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#007229] text-white font-semibold rounded-xl hover:bg-[#00913D] transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center max-w-sm w-full">
        <div className="w-20 h-20 mx-auto mb-4">
          <OwlSad className="w-full h-full" />
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re offline</h1>
        <p className="text-gray-500 mb-1 text-sm">أنت غير متصل بالإنترنت</p>
        <p className="text-gray-400 mb-6 text-xs">
          Check your connection and try again, or view your downloaded lessons below.
        </p>

        {lessons.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Downloaded Lessons / الدروس المحملة</h2>
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.id}`}
                  className="block p-3 bg-white rounded-xl border border-gray-200 text-start hover:border-emerald-300 transition-colors"
                >
                  <p className="font-medium text-gray-900 text-sm">{lesson.title_ar}</p>
                  {lesson.title_en && (
                    <p className="text-xs text-gray-500">{lesson.title_en}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Try Again
        </button>
      </div>
    </div>
  );
}
