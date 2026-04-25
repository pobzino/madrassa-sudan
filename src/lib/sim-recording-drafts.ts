import type { SimRecording } from '@/hooks/useSimRecorder';
import type { Slide } from '@/lib/slides.types';

const DB_NAME = 'sim-recording-drafts';
const STORE_NAME = 'drafts';
const DB_VERSION = 1;
const DRAFT_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export interface SimRecordingDraft {
  lessonId: string;
  language: 'ar' | 'en';
  deckSnapshot: Slide[];
  recording: SimRecording;
  savedAt: number;
}

function canUseIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSimRecordingDraft(draft: SimRecordingDraft): Promise<void> {
  if (!canUseIndexedDB()) return;
  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft, draft.lessonId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadSimRecordingDraft(lessonId: string): Promise<SimRecordingDraft | null> {
  if (!canUseIndexedDB()) return null;
  try {
    const db = await openDraftDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(lessonId);
      request.onsuccess = () => {
        db.close();
        const draft = (request.result as SimRecordingDraft | undefined) ?? null;
        if (!draft || Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
          resolve(null);
          return;
        }
        resolve(draft);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function clearSimRecordingDraft(lessonId: string): Promise<void> {
  if (!canUseIndexedDB()) return;
  try {
    const db = await openDraftDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(lessonId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Draft cleanup is best-effort.
  }
}
