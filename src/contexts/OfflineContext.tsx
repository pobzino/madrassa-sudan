"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  getAllDownloadStates,
  getAllOfflineLessons,
  getQueuedUpdates,
  clearQueuedUpdates,
  type DownloadState,
} from "@/lib/offline/db";
import {
  downloadLesson as doDownload,
  cancelDownload as doCancel,
  deleteDownloadedLesson as doDelete,
  getStorageEstimate,
} from "@/lib/offline/download-manager";

interface OfflineContextValue {
  isOnline: boolean;
  downloads: Map<string, DownloadState>;
  downloadedLessonIds: Set<string>;
  storageUsed: number;
  storageQuota: number;
  downloadLesson: (lessonId: string) => Promise<void>;
  cancelDownload: (lessonId: string) => void;
  deleteLesson: (lessonId: string) => Promise<void>;
  isLessonDownloaded: (lessonId: string) => boolean;
  refreshDownloads: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(
    new Map()
  );
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const wasOffline = useRef(false);

  // Initialize
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    loadState();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      syncProgressQueue();
    }
  }, [isOnline]);

  async function loadState() {
    try {
      const [states, lessons, estimate] = await Promise.all([
        getAllDownloadStates(),
        getAllOfflineLessons(),
        getStorageEstimate(),
      ]);

      setDownloads(new Map(states.map((s) => [s.lessonId, s])));
      setDownloadedIds(new Set(lessons.map((l) => l.id)));
      setStorageUsed(estimate.used);
      setStorageQuota(estimate.quota);
    } catch {
      // IndexedDB not available
    }
  }

  async function syncProgressQueue() {
    try {
      const items = await getQueuedUpdates();
      if (items.length === 0) return;

      const supabase = createClient();
      const synced: number[] = [];

      for (const item of items) {
        try {
          if (item.table === "lesson_progress") {
            await supabase.from("lesson_progress").upsert(item.data as never, {
              onConflict: "student_id,lesson_id",
            });
          } else {
            await supabase.from(item.table as "lesson_question_responses").insert(item.data as never);
          }
          if (item.id) synced.push(item.id);
        } catch {
          // Skip failed items, will retry next time
        }
      }

      if (synced.length > 0) {
        await clearQueuedUpdates(synced);
        toast.success("تم مزامنة التقدم! — Progress synced!");
      }
    } catch {
      // Ignore sync errors
    }
  }

  const downloadLesson = useCallback(
    async (lessonId: string) => {
      const supabase = createClient();

      try {
        await doDownload(lessonId, supabase, (state) => {
          setDownloads((prev) => {
            const next = new Map(prev);
            next.set(lessonId, state);
            return next;
          });
        });

        setDownloadedIds((prev) => new Set(prev).add(lessonId));

        // Refresh storage estimate
        const estimate = await getStorageEstimate();
        setStorageUsed(estimate.used);
      } catch {
        // Error state already set by download manager
      }
    },
    []
  );

  const cancelDownloadFn = useCallback((lessonId: string) => {
    doCancel(lessonId);
    setDownloads((prev) => {
      const next = new Map(prev);
      next.delete(lessonId);
      return next;
    });
  }, []);

  const deleteLesson = useCallback(async (lessonId: string) => {
    await doDelete(lessonId);
    setDownloadedIds((prev) => {
      const next = new Set(prev);
      next.delete(lessonId);
      return next;
    });
    setDownloads((prev) => {
      const next = new Map(prev);
      next.delete(lessonId);
      return next;
    });

    const estimate = await getStorageEstimate();
    setStorageUsed(estimate.used);
  }, []);

  const isLessonDownloaded = useCallback(
    (lessonId: string) => downloadedIds.has(lessonId),
    [downloadedIds]
  );

  const refreshDownloads = useCallback(async () => {
    await loadState();
  }, []);

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOnline,
      downloads,
      downloadedLessonIds: downloadedIds,
      storageUsed,
      storageQuota,
      downloadLesson,
      cancelDownload: cancelDownloadFn,
      deleteLesson,
      isLessonDownloaded,
      refreshDownloads,
    }),
    [
      isOnline,
      downloads,
      downloadedIds,
      storageUsed,
      storageQuota,
      downloadLesson,
      cancelDownloadFn,
      deleteLesson,
      isLessonDownloaded,
      refreshDownloads,
    ]
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}
