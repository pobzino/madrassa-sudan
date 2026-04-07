/**
 * IndexedDB wrapper for offline lesson storage.
 * Zero dependencies — uses raw IndexedDB API.
 *
 * Database: "amal-offline" v1
 * Stores:
 *   - lessons: Full lesson data + sim payload for offline playback
 *   - progress-queue: Queued progress updates to sync when back online
 *   - downloads: Download state tracking per lesson
 */

import type { SimPayload } from "@/lib/sim.types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OfflineLesson {
  id: string;
  title_ar: string;
  title_en: string;
  subject_name_ar?: string;
  subject_name_en?: string;
  grade_level: number;
  sim: SimPayload | null;
  slides: unknown[] | null;
  questions: unknown[];
  tasks: unknown[];
  thumbnailUrl: string | null;
  audioSize: number; // bytes
  downloadedAt: string; // ISO date
}

export interface ProgressQueueItem {
  id?: number; // auto-increment
  lessonId: string;
  table: string; // e.g. "lesson_progress", "lesson_question_responses"
  data: Record<string, unknown>;
  timestamp: string;
}

export type DownloadStatus = "idle" | "downloading" | "completed" | "error";

export interface DownloadState {
  lessonId: string;
  status: DownloadStatus;
  progress: number; // 0-100
  totalBytes: number;
  downloadedBytes: number;
  error?: string;
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = "amal-offline";
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("lessons")) {
        db.createObjectStore("lessons", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("progress-queue")) {
        const store = db.createObjectStore("progress-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("lessonId", "lessonId", { unique: false });
      }

      if (!db.objectStoreNames.contains("downloads")) {
        db.createObjectStore("downloads", { keyPath: "lessonId" });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Lessons ──────────────────────────────────────────────────────────────────

export async function saveOfflineLesson(lesson: OfflineLesson): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readwrite");
    tx.objectStore("lessons").put(lesson);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineLesson(
  id: string
): Promise<OfflineLesson | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readonly");
    const req = tx.objectStore("lessons").get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflineLessons(): Promise<OfflineLesson[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readonly");
    const req = tx.objectStore("lessons").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineLesson(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("lessons", "readwrite");
    tx.objectStore("lessons").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Progress Queue ───────────────────────────────────────────────────────────

export async function queueProgressUpdate(
  item: Omit<ProgressQueueItem, "id">
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress-queue", "readwrite");
    tx.objectStore("progress-queue").add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedUpdates(): Promise<ProgressQueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress-queue", "readonly");
    const req = tx.objectStore("progress-queue").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearQueuedUpdates(ids: number[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress-queue", "readwrite");
    const store = tx.objectStore("progress-queue");
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Download State ───────────────────────────────────────────────────────────

export async function setDownloadState(state: DownloadState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readwrite");
    tx.objectStore("downloads").put(state);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDownloadState(
  lessonId: string
): Promise<DownloadState | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").get(lessonId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDownloadStates(): Promise<DownloadState[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readonly");
    const req = tx.objectStore("downloads").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDownloadState(lessonId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("downloads", "readwrite");
    tx.objectStore("downloads").delete(lessonId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Cache API Helpers ────────────────────────────────────────────────────────

const SIM_AUDIO_CACHE = "sim-audio-downloads";

export async function cacheSimAudio(
  lessonId: string,
  audioBlob: Blob
): Promise<void> {
  const cache = await caches.open(SIM_AUDIO_CACHE);
  const response = new Response(audioBlob, {
    headers: { "Content-Type": audioBlob.type || "audio/webm" },
  });
  await cache.put(`/offline-audio/${lessonId}`, response);
}

export async function getCachedSimAudio(
  lessonId: string
): Promise<Blob | null> {
  try {
    const cache = await caches.open(SIM_AUDIO_CACHE);
    const response = await cache.match(`/offline-audio/${lessonId}`);
    if (!response) return null;
    return response.blob();
  } catch {
    return null;
  }
}

export async function deleteCachedSimAudio(lessonId: string): Promise<void> {
  try {
    const cache = await caches.open(SIM_AUDIO_CACHE);
    await cache.delete(`/offline-audio/${lessonId}`);
  } catch {
    // Ignore cache errors
  }
}
