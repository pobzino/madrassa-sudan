/**
 * Download manager for offline lesson storage.
 * Handles fetching lesson data + sim audio with progress tracking.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SimPayload } from "@/lib/sim.types";
import {
  saveOfflineLesson,
  deleteOfflineLesson,
  setDownloadState,
  deleteDownloadState,
  cacheSimAudio,
  deleteCachedSimAudio,
  type DownloadState,
  type OfflineLesson,
} from "./db";

export type ProgressCallback = (state: DownloadState) => void;

const activeDownloads = new Map<string, AbortController>();

export async function downloadLesson(
  lessonId: string,
  supabase: SupabaseClient<Database>,
  onProgress?: ProgressCallback
): Promise<void> {
  // Abort any existing download for this lesson
  activeDownloads.get(lessonId)?.abort();
  const controller = new AbortController();
  activeDownloads.set(lessonId, controller);

  const updateState = (partial: Partial<DownloadState>) => {
    const state: DownloadState = {
      lessonId,
      status: "downloading",
      progress: 0,
      totalBytes: 0,
      downloadedBytes: 0,
      ...partial,
    };
    setDownloadState(state);
    onProgress?.(state);
  };

  try {
    updateState({ status: "downloading", progress: 5 });

    // 1. Fetch lesson metadata
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("*, subjects(name_ar, name_en)")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) throw new Error("Lesson not found");
    if (controller.signal.aborted) throw new Error("Cancelled");

    updateState({ progress: 15 });

    // 2. Fetch sim payload
    const simRes = await fetch(`/api/lessons/${lessonId}/sim`, {
      signal: controller.signal,
    });
    const simData = await simRes.json();
    const simPayload: SimPayload | null = simData?.sim ?? null;

    updateState({ progress: 30 });

    // 3. Fetch slides
    const slidesRes = await fetch(`/api/lessons/${lessonId}/slides`, {
      signal: controller.signal,
    });
    const slidesData = await slidesRes.json();
    const slides = slidesData?.slideDeck?.slides ?? null;

    updateState({ progress: 40 });

    // 4. Fetch questions + tasks
    const [questionsRes, tasksRes] = await Promise.all([
      supabase
        .from("lesson_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("timestamp_seconds"),
      supabase
        .from("lesson_tasks")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("display_order"),
    ]);

    if (controller.signal.aborted) throw new Error("Cancelled");

    updateState({ progress: 50 });

    // 5. Download sim audio (the largest piece)
    let audioSize = 0;
    if (simPayload?.audio_url) {
      try {
        const audioRes = await fetch(simPayload.audio_url, {
          signal: controller.signal,
        });

        if (audioRes.ok && audioRes.body) {
          const contentLength = parseInt(
            audioRes.headers.get("content-length") || "0",
            10
          );
          const reader = audioRes.body.getReader();
          const chunks: Uint8Array[] = [];
          let downloaded = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            downloaded += value.length;
            audioSize = downloaded;

            const audioProgress = contentLength
              ? Math.round((downloaded / contentLength) * 45)
              : Math.min(Math.round((downloaded / (1024 * 1024)) * 10), 45);

            updateState({
              progress: 50 + audioProgress,
              totalBytes: contentLength || downloaded,
              downloadedBytes: downloaded,
            });
          }

          // Reconstruct blob and cache it
          const mimeType =
            audioRes.headers.get("content-type") || simPayload.sim.audio_mime || "audio/webm";
          const audioBlob = new Blob(chunks, { type: mimeType });
          await cacheSimAudio(lessonId, audioBlob);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") throw new Error("Cancelled");
        // Audio download failed — save lesson without audio
        console.warn("Audio download failed, saving lesson without audio:", e);
      }
    }

    updateState({ progress: 95 });

    // 6. Save all data to IndexedDB
    const subject = lesson.subjects as unknown as { name_ar: string; name_en: string } | null;

    const offlineLesson: OfflineLesson = {
      id: lessonId,
      title_ar: lesson.title_ar,
      title_en: lesson.title_en,
      subject_name_ar: subject?.name_ar,
      subject_name_en: subject?.name_en,
      grade_level: lesson.grade_level,
      sim: simPayload,
      slides,
      questions: questionsRes.data ?? [],
      tasks: tasksRes.data ?? [],
      thumbnailUrl: lesson.thumbnail_url,
      audioSize,
      downloadedAt: new Date().toISOString(),
    };

    await saveOfflineLesson(offlineLesson);

    // 7. Pre-cache page shells so the lesson renders offline
    await precachePageShells(lessonId);

    updateState({
      status: "completed",
      progress: 100,
      totalBytes: audioSize,
      downloadedBytes: audioSize,
    });
  } catch (e) {
    const message = (e as Error).message;
    if (message === "Cancelled") {
      await deleteDownloadState(lessonId);
    } else {
      updateState({ status: "error", error: message });
    }
    throw e;
  } finally {
    activeDownloads.delete(lessonId);
  }
}

export function cancelDownload(lessonId: string): void {
  activeDownloads.get(lessonId)?.abort();
}

export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  cancelDownload(lessonId);
  await Promise.all([
    deleteOfflineLesson(lessonId),
    deleteCachedSimAudio(lessonId),
    deleteDownloadState(lessonId),
  ]);
}

/**
 * Pre-cache the page shells needed for offline rendering.
 * Fetches the lesson page + key app pages so the SW caches them.
 */
async function precachePageShells(lessonId: string): Promise<void> {
  const PAGE_CACHE = "amal-pages-v2";
  const urls = [
    `/lessons/${lessonId}`,
    "/lessons",
    "/dashboard",
    "/downloads",
  ];

  try {
    const cache = await caches.open(PAGE_CACHE);
    await Promise.all(
      urls.map(async (url) => {
        try {
          // Only fetch if not already cached
          const existing = await cache.match(url);
          if (existing) return;
          const response = await fetch(url);
          if (response.ok) {
            await cache.put(url, response);
          }
        } catch {
          // Non-critical — page will use /offline fallback
        }
      })
    );
  } catch {
    // Cache API unavailable
  }
}

export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
}> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  }
  return { used: 0, quota: 0 };
}
