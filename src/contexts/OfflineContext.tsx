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
import { useOnlineStatus } from "@/components/offline/useOnlineStatus";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { createClient } from "@/lib/supabase/client";
import {
  getAllDownloadStates,
  onPrivateDataCleared,
  type DownloadErrorCode,
  type DownloadState,
  type OfflineLesson,
  type OfflineOrigin,
} from "@/lib/offline/db";
import { getOwnedOfflineLessons } from "@/lib/offline/identity";
import {
  DownloadError,
  downloadLesson as doDownload,
  cancelDownload as doCancel,
  checkForUpdates as doCheckForUpdates,
  deleteDownloadedLesson as doDelete,
  downloadErrorMessage,
  getStorageEstimate,
  isDownloadActive,
  isDownloadCancelled,
  pruneOrphanedStorage,
  reconcileInterruptedDownloads,
} from "@/lib/offline/download-manager";

/**
 * What this phone has saved for offline, for the signed-in dashboard.
 *
 * Everything here is read from IndexedDB with no auth call, so badges and
 * the Downloads page are right straight away, even offline. Only the
 * account that owns the phone's storage sees its lessons. Sending progress
 * saved offline is <OfflineSyncRunner/>'s job (root layout), not this one.
 */

export type DownloadResult =
  | { status: "saved"; lesson: OfflineLesson }
  | { status: "cancelled" }
  | { status: "failed"; code: DownloadErrorCode };

interface OfflineContextValue {
  isOnline: boolean;
  /** False until this phone's downloads were read once. */
  ready: boolean;
  downloads: Map<string, DownloadState>;
  downloadedLessonIds: Set<string>;
  /** Saved lessons the teacher re-recorded since (set by checkForUpdates). */
  updateAvailableIds: Set<string>;
  storageUsed: number;
  storageQuota: number;
  /** Never rejects: the result says whether the lesson was saved. */
  downloadLesson: (lessonId: string, options?: { origin?: OfflineOrigin }) => Promise<DownloadResult>;
  cancelDownload: (lessonId: string) => void;
  deleteLesson: (lessonId: string) => Promise<void>;
  isLessonDownloaded: (lessonId: string) => boolean;
  /** Online only: flags saved lessons whose recording changed. Returns their ids. */
  checkForUpdates: () => Promise<string[]>;
  refreshDownloads: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used within OfflineProvider");
  return ctx;
}

// navigator.onLine as React state (server snapshot "online"). One shared
// hook; re-exported for callers that already use this module.
export { useOnlineStatus };

// Give the page the connection first; the update check can wait.
const UPDATE_CHECK_DELAY_MS = 5_000;
const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;
// Cleaning up what interrupted downloads left can wait for the page to settle.
const PRUNE_DELAY_MS = 10_000;

/** What this phone holds. Each read is separate: one broken store must not hide the others. */
async function readOfflineState({ reconcile = false }: { reconcile?: boolean } = {}) {
  const [states, lessons] = await Promise.all([
    (reconcile ? reconcileInterruptedDownloads() : getAllDownloadStates()).catch(() => null),
    getOwnedOfflineLessons().catch(() => null),
  ]);
  return { states, lessons };
}

function withoutKey<K, V>(map: Map<K, V>, key: K): Map<K, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

function withoutItem<T>(set: Set<T>, item: T): Set<T> {
  if (!set.has(item)) return set;
  const next = new Set(set);
  next.delete(item);
  return next;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const isOnline = useOnlineStatus();
  const [ready, setReady] = useState(false);
  const [downloads, setDownloads] = useState<Map<string, DownloadState>>(() => new Map());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(() => new Set());
  const [updateIds, setUpdateIds] = useState<Set<string>>(() => new Set());
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const updateCheck = useRef<{ promise: Promise<string[]> | null; at: number }>({ promise: null, at: 0 });
  // Saves the family started by hand and is waiting on. The screen stays on
  // meanwhile: a locked phone suspends the page and the save starts over.
  // Wi-Fi background saves don't hold it (nobody may be watching).
  const [manualSaves, setManualSaves] = useState(0);
  useScreenWakeLock(manualSaves > 0);

  const refreshEstimate = useCallback(async () => {
    const estimate = await getStorageEstimate();
    setStorageUsed(estimate.used);
    setStorageQuota(estimate.quota);
  }, []);

  const applyLessons = useCallback((lessons: OfflineLesson[]) => {
    setDownloadedIds(new Set(lessons.map((lesson) => lesson.id)));
    setUpdateIds(new Set(lessons.filter((lesson) => lesson.updateAvailable).map((lesson) => lesson.id)));
  }, []);

  const applyState = useCallback(
    ({ states, lessons }: { states: DownloadState[] | null; lessons: OfflineLesson[] | null }) => {
      if (states) setDownloads(new Map(states.map((state) => [state.lessonId, state])));
      if (lessons) applyLessons(lessons);
      setReady(true);
      void refreshEstimate();
    },
    [applyLessons, refreshEstimate]
  );

  const loadState = useCallback(
    () => readOfflineState().then(applyState),
    [applyState]
  );

  const checkForUpdates = useCallback(
    async ({ force = true }: { force?: boolean } = {}) => {
      if (!navigator.onLine) return [];
      const check = updateCheck.current;
      if (check.promise) return check.promise;
      if (!force && Date.now() - check.at < UPDATE_CHECK_MIN_INTERVAL_MS) return [];
      const promise = doCheckForUpdates(createClient())
        .catch(() => [] as string[])
        .then(async (ids) => {
          const lessons = await getOwnedOfflineLessons().catch(() => null);
          if (lessons) applyLessons(lessons);
          return ids;
        })
        .finally(() => {
          updateCheck.current = { promise: null, at: Date.now() };
        });
      updateCheck.current = { promise, at: check.at };
      return promise;
    },
    [applyLessons]
  );

  // Load what this phone holds first, with no auth call: offline, an expired
  // session makes auth calls retry for ~25 s before giving up. A download
  // left "downloading" by a closed page becomes "interrupted" (with Retry).
  useEffect(() => {
    let cancelled = false;
    let pruneTimer: number | undefined;
    void readOfflineState({ reconcile: true }).then((state) => {
      if (cancelled) return;
      applyState(state);
      // Images and audio a download stored before its page died.
      pruneTimer = window.setTimeout(() => void pruneOrphanedStorage(), PRUNE_DELAY_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(pruneTimer);
    };
  }, [applyState]);

  // Online: see whether any saved lesson was re-recorded since.
  useEffect(() => {
    if (!isOnline || !ready || downloadedIds.size === 0) return;
    const timer = window.setTimeout(() => void checkForUpdates({ force: false }), UPDATE_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isOnline, ready, downloadedIds.size, checkForUpdates]);

  // Logout (here or in another tab) wiped storage: forget what we showed.
  useEffect(
    () =>
      onPrivateDataCleared(() => {
        setDownloads(new Map());
        setDownloadedIds(new Set());
        setUpdateIds(new Set());
      }),
    []
  );

  const downloadLesson = useCallback(
    async (lessonId: string, options: { origin?: OfflineOrigin } = {}): Promise<DownloadResult> => {
      const manual = options.origin !== "auto";
      if (manual) setManualSaves((count) => count + 1);
      try {
        const lesson = await doDownload(
          lessonId,
          createClient(),
          (state) => setDownloads((prev) => new Map(prev).set(lessonId, state)),
          { origin: options.origin }
        );
        setDownloadedIds((prev) => new Set(prev).add(lessonId));
        setUpdateIds((prev) => withoutItem(prev, lessonId));
        void refreshEstimate();
        return { status: "saved", lesson };
      } catch (error) {
        if (isDownloadCancelled(error)) {
          // Cancelled, replaced by a newer download of the same lesson, or
          // stopped by logout: not a failure, so no error row. A newer run
          // of this lesson keeps its own progress entry.
          if (!isDownloadActive(lessonId)) setDownloads((prev) => withoutKey(prev, lessonId));
          return { status: "cancelled" };
        }
        const code = error instanceof DownloadError ? error.code : "unknown";
        if (code === "no_audio") {
          // Nothing to save, so nothing to retry: the caller's message says
          // why, and no Retry row is left behind (the manager stored none).
          if (!isDownloadActive(lessonId)) setDownloads((prev) => withoutKey(prev, lessonId));
          return { status: "failed", code };
        }
        // The manager stored the error state; mirror it here in case its
        // last progress report was throttled away.
        setDownloads((prev) => {
          const current = prev.get(lessonId);
          return new Map(prev).set(lessonId, {
            lessonId,
            progress: current?.progress ?? 0,
            totalBytes: current?.totalBytes ?? 0,
            downloadedBytes: current?.downloadedBytes ?? 0,
            ...current,
            status: "error",
            errorCode: code,
            error: downloadErrorMessage(code, "en"),
          });
        });
        // A failed re-download keeps the old copy; re-read so the badges match storage.
        const lessons = await getOwnedOfflineLessons().catch(() => null);
        if (lessons) applyLessons(lessons);
        return { status: "failed", code };
      } finally {
        if (manual) setManualSaves((count) => count - 1);
      }
    },
    [applyLessons, refreshEstimate]
  );

  const cancelDownloadFn = useCallback((lessonId: string) => {
    // Also clears a stored state with no download running behind it.
    doCancel(lessonId);
    setDownloads((prev) => withoutKey(prev, lessonId));
  }, []);

  const deleteLesson = useCallback(
    async (lessonId: string) => {
      await doDelete(lessonId);
      setDownloadedIds((prev) => withoutItem(prev, lessonId));
      setUpdateIds((prev) => withoutItem(prev, lessonId));
      setDownloads((prev) => withoutKey(prev, lessonId));
      await refreshEstimate();
    },
    [refreshEstimate]
  );

  const isLessonDownloaded = useCallback(
    (lessonId: string) => downloadedIds.has(lessonId),
    [downloadedIds]
  );

  const refreshDownloads = useCallback(() => loadState(), [loadState]);
  const checkForUpdatesNow = useCallback(() => checkForUpdates(), [checkForUpdates]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOnline,
      ready,
      downloads,
      downloadedLessonIds: downloadedIds,
      updateAvailableIds: updateIds,
      storageUsed,
      storageQuota,
      downloadLesson,
      cancelDownload: cancelDownloadFn,
      deleteLesson,
      isLessonDownloaded,
      checkForUpdates: checkForUpdatesNow,
      refreshDownloads,
    }),
    [
      isOnline,
      ready,
      downloads,
      downloadedIds,
      updateIds,
      storageUsed,
      storageQuota,
      downloadLesson,
      cancelDownloadFn,
      deleteLesson,
      isLessonDownloaded,
      checkForUpdatesNow,
      refreshDownloads,
    ]
  );

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
}
