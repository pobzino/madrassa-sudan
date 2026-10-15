/**
 * IndexedDB wrapper for offline lesson storage.
 * Zero dependencies — uses raw IndexedDB API.
 *
 * Database: "amal-offline" v2
 * Stores:
 *   - lessons: Full lesson data + sim payload for offline playback
 *   - progress-queue: Progress and activity answers waiting to sync
 *   - downloads: Download state tracking per lesson
 *   - meta: Owner record, local progress, asset reference counts
 *   - responses: Activity answers saved on this phone, per owner + lesson
 *
 * Everything here belongs to one signed-in family and is wiped on logout.
 * Pages must go through this module rather than opening the database
 * themselves: an open without the upgrade below creates a store-less database
 * that breaks every later read and write on the device.
 */

import type { SimPayload } from "@/lib/sim.types";
import {
  ACCOUNT_CACHES,
  AUDIO_CACHE,
  LEGACY_PRIVATE_CACHES,
  OFFLINE_BROADCAST_CHANNEL,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_STORES,
  PRIVATE_LOCAL_STORAGE_KEYS,
  PRIVATE_LOCAL_STORAGE_PREFIXES,
  offlineAudioKey,
  type OfflineStoreName,
} from "./cache-names";

// ── Types ────────────────────────────────────────────────────────────────────

export type SlideLanguageMode = "ar" | "en" | "both";
export type OfflineOrigin = "manual" | "auto";

export interface OfflineNeighbor {
  id: string;
  title_ar: string;
  title_en: string;
}

export interface OfflineProgressSnapshot {
  last_position_seconds: number;
  total_watch_time_seconds: number;
  completed: boolean;
}

export interface OfflinePracticeGate {
  assignmentId: string;
  passed: boolean;
}

/**
 * One saved lesson. The fields after `downloadedAt` were added in schema 2;
 * they are optional so records saved before it still read back (those have
 * no `schema`). `sim.audio_url` is always null — the audio lives in Cache
 * Storage and signed URLs must never be persisted.
 */
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
  videoUrl?: string | null;
  audioSize: number; // bytes
  downloadedAt: string; // ISO date

  schema?: 2;
  /** Account that saved it. A record for anyone else is treated as not downloaded. */
  ownerId?: string;
  /** Build that saved it (NEXT_PUBLIC_RUNTIME_VERSION). */
  appVersion?: string;
  subject_id?: string;
  description_ar?: string | null;
  description_en?: string | null;
  quiz_settings?: unknown;
  lessonUpdatedAt?: string;
  simId?: string;
  simUpdatedAt?: string;
  slideLanguageMode?: SlideLanguageMode | null;
  audioMime?: string;
  /** True when this browser said it can't play `audioMime`; the UI warns. */
  audioMayNotPlay?: boolean;
  assetUrls?: string[];
  assetBytes?: number;
  /** Images that couldn't be saved because they are gone online too (a dead link); a re-save tries them again. */
  missingAssetUrls?: string[];
  /**
   * Where the audio is in AUDIO_CACHE: a key unique to the save that wrote
   * it, so an update never overwrites the copy that plays. Records saved
   * before it use the bare `/offline-audio/<id>` (see audioKeyFor).
   */
  audioKey?: string;
  /** null = no practice gate. Undefined (pre-schema-2 record) = unknown, treated as gated. */
  practice?: OfflinePracticeGate | null;
  /** Server progress when it was saved. */
  progress?: OfflineProgressSnapshot | null;
  neighbors?: { prev: OfflineNeighbor | null; next: OfflineNeighbor | null };
  origin?: OfflineOrigin;
  /** Set by checkForUpdates when the teacher re-recorded the lesson. */
  updateAvailable?: boolean;
}

export type QueueItemKind = "progress" | "slide_response" | "complete";

/**
 * Why a queued item is waiting. Kept outside `data` and `timestamp`, which
 * decide whether an item changed while it was being sent; a new write to the
 * item replaces it and so starts it fresh.
 */
export interface QueueItemRetry {
  /** Times the server answered with an error (5xx). No connection doesn't count. */
  serverFailures?: number;
  lastStatus?: number | null;
  firstFailedAt?: string;
  /** Not sent again before this time (ISO). */
  nextTryAt?: string;
  /** First time the server refused access to the lesson; the item waits ("parked") until access returns. */
  rejectedAt?: string;
}

/**
 * A stored queue item. Items written before schema 2 have `table` instead of
 * `kind` and no `ownerId`; normalizeQueueItem maps them.
 */
export interface ProgressQueueItem {
  id?: number; // auto-increment
  lessonId: string;
  ownerId?: string;
  kind?: QueueItemKind;
  /** v1 items only, e.g. "lesson_progress". */
  table?: string;
  data: Record<string, unknown>;
  timestamp: string;
  retry?: QueueItemRetry;
}

/** A queue item in the current shape. */
export interface OfflineQueueItem extends ProgressQueueItem {
  ownerId: string;
  kind: QueueItemKind;
}

export type DownloadStatus = "idle" | "downloading" | "completed" | "error";

export type DownloadErrorCode =
  | "offline"
  | "signed_out"
  | "not_found"
  | "no_audio"
  | "network"
  | "storage_full"
  | "interrupted"
  /** This browser can't open saved lessons offline (an iPhone in-app browser). */
  | "unsupported"
  | "unknown";

export interface DownloadState {
  lessonId: string;
  status: DownloadStatus;
  progress: number; // 0-100
  totalBytes: number;
  downloadedBytes: number;
  /** English message, kept for older UI; prefer `errorCode` with downloadErrorMessage(). */
  error?: string;
  errorCode?: DownloadErrorCode;
  title_ar?: string;
  title_en?: string;
  updatedAt?: string;
}

/** Progress kept on this phone, never lower than what it last knew. */
export interface LocalLessonProgress {
  key: string;
  ownerId: string;
  lessonId: string;
  last_position_seconds: number;
  total_watch_time_seconds: number;
  completed: boolean;
  updatedAt: string;
}

export interface LocalSlideResponse {
  answer: unknown;
  isCorrect: boolean | null;
  answeredAt?: string;
  /** Matches the queued/sent copy of this answer, so a server grade lands only on the answer it is for. */
  answerId?: string;
}

export interface LocalSlideResponses {
  key: string;
  ownerId: string;
  lessonId: string;
  bySlide: Record<string, LocalSlideResponse>;
}

/** Which downloaded lessons use one cached image, so a shared image outlives one lesson's removal. */
export interface AssetRef {
  key: string;
  lessons: string[];
  bytes: number;
}

/** Anything stored in `meta`: the owner record, local progress, asset references. */
export interface MetaRecord {
  key: string;
}

/** Thrown by a guarded write when logout cleared storage after the writer started. */
export class StorageClearedError extends Error {
  constructor() {
    super("Offline storage was cleared");
    this.name = "StorageClearedError";
  }
}

/**
 * The database didn't open in time. Almost always another Amal tab or window
 * from an older version still holds it; closing that one lets the open finish.
 */
export class OfflineDbBusyError extends Error {
  constructor() {
    super("The offline database is busy in another tab.");
    this.name = "OfflineDbBusyError";
  }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const OWNER_META_KEY = "owner";
const ASSET_META_PREFIX = "asset:";
const PROGRESS_META_PREFIX = "progress:";

export function assetMetaKey(url: string): string {
  return `${ASSET_META_PREFIX}${url}`;
}

export function localProgressKey(ownerId: string, lessonId: string): string {
  return `${PROGRESS_META_PREFIX}${ownerId}:${lessonId}`;
}

export function responsesKey(ownerId: string, lessonId: string): string {
  return `${ownerId}:${lessonId}`;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

const QUEUE_KINDS: readonly QueueItemKind[] = ["progress", "slide_response", "complete"];

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Maps a stored queue item to the current shape, or null when it can't be
 * synced (unknown v1 table, or no owner to check it against).
 */
export function normalizeQueueItem(raw: ProgressQueueItem): OfflineQueueItem | null {
  if (!raw || typeof raw.lessonId !== "string" || !raw.data || typeof raw.data !== "object") {
    return null;
  }
  const studentId = typeof raw.data.student_id === "string" ? raw.data.student_id : undefined;
  const ownerId = raw.ownerId || studentId;
  if (!ownerId) return null;

  if (raw.kind && QUEUE_KINDS.includes(raw.kind)) {
    return { ...raw, ownerId, kind: raw.kind };
  }

  if (raw.table === "lesson_progress") {
    return {
      id: raw.id,
      lessonId: raw.lessonId,
      ownerId,
      kind: "progress",
      timestamp: raw.timestamp,
      data: {
        last_position_seconds: finiteNumber(raw.data.last_position_seconds),
        total_watch_time_seconds: finiteNumber(raw.data.total_watch_time_seconds),
        completed: raw.data.completed === true,
        ...(typeof raw.data.completed_at === "string" ? { completed_at: raw.data.completed_at } : {}),
      },
      ...(raw.retry ? { retry: raw.retry } : {}),
    };
  }

  return null;
}

/** When a queued answer was given (ms): its `answeredAt`, else when it was queued (older items). NaN when unknown. */
export function queuedAnswerTime(item: Pick<ProgressQueueItem, "data" | "timestamp">): number {
  const at = typeof item.data?.answeredAt === "string" ? item.data.answeredAt : item.timestamp;
  return typeof at === "string" ? Date.parse(at) : Number.NaN;
}

export interface AnswerVersion {
  /** A real answer, not a skipped activity (null). */
  real: boolean;
  /** When it was given (ms); NaN when unknown. */
  time: number;
}

/**
 * Whether answer `a` should win over answer `b` for the same slide (the
 * server keeps one per slide): a real answer beats a skip, otherwise the one
 * given later. Unknown times never win. Mirrors the slide-responses route.
 */
export function answerSupersedes(a: AnswerVersion, b: AnswerVersion): boolean {
  if (a.real !== b.real) return a.real;
  return Number.isFinite(a.time) && Number.isFinite(b.time) && a.time > b.time;
}

function queuedAnswerVersion(item: Pick<ProgressQueueItem, "data" | "timestamp">): AnswerVersion {
  return { real: item.data?.answer !== null && item.data?.answer !== undefined, time: queuedAnswerTime(item) };
}

/** Data for a lesson's progress queue item replaced in place: the first `completed_at` is kept. */
export function nextProgressQueueData(
  existing: Pick<ProgressQueueItem, "data"> | null | undefined,
  queueData: Record<string, unknown>
): Record<string, unknown> {
  const completedAt = existing?.data?.completed_at;
  return typeof completedAt === "string" ? { ...queueData, completed_at: completedAt } : queueData;
}

function isSlideAnswerFor(item: ProgressQueueItem, ownerId: string, slideId: unknown): boolean {
  return item.kind === "slide_response" && item.ownerId === ownerId && item.data?.slideId === slideId;
}

export type SlideAnswerQueuePlan = { action: "skip" } | { action: "add" } | { action: "replace"; id: number };

/**
 * How to queue an activity answer, keeping at most one per owner + lesson +
 * slide (the server keeps one answer per slide too, so an older queued one
 * could only be overwritten, or, sent late, overwrite a newer one):
 *   - skip when another answer given on this phone for the slide (saved, or
 *     already queued) should win over it (answerSupersedes) — e.g. an old
 *     send that failed after a newer answer was given;
 *   - otherwise replace the queued one, or add.
 * Only the phone's own saved answers (they carry an answerId) are compared:
 * one copied from the server at download is timed by the server's clock.
 * `queued` is the lesson's queue items (any kind or owner).
 */
export function planSlideAnswerQueue(
  local: Pick<LocalSlideResponse, "answer" | "answeredAt" | "answerId"> | null | undefined,
  queued: ProgressQueueItem[],
  incoming: Pick<OfflineQueueItem, "ownerId" | "data" | "timestamp">
): SlideAnswerQueuePlan {
  const version = queuedAnswerVersion(incoming);
  if (
    typeof local?.answerId === "string" &&
    local.answerId !== incoming.data.answerId &&
    answerSupersedes({ real: local.answer !== null && local.answer !== undefined, time: Date.parse(local.answeredAt ?? "") }, version)
  ) {
    return { action: "skip" };
  }
  const existing = queued
    .filter((item) => isSlideAnswerFor(item, incoming.ownerId, incoming.data.slideId))
    .reduce<ProgressQueueItem | null>(
      (best, item) => (!best || answerSupersedes(queuedAnswerVersion(item), queuedAnswerVersion(best)) ? item : best),
      null
    );
  if (existing?.id === undefined) return { action: "add" };
  if (answerSupersedes(queuedAnswerVersion(existing), version)) return { action: "skip" };
  return { action: "replace", id: existing.id };
}

/** Ids of a slide's queued answers that `sent` (confirmed by the server) supersedes or equals. */
export function supersededQueuedAnswerIds(
  queued: ProgressQueueItem[],
  ownerId: string,
  slideId: string,
  sent: AnswerVersion
): number[] {
  return queued
    .filter((item) => item.id !== undefined && isSlideAnswerFor(item, ownerId, slideId))
    .filter((item) => !answerSupersedes(queuedAnswerVersion(item), sent))
    .map((item) => item.id as number);
}

export function addLessonToAssetRef(
  ref: AssetRef | null | undefined,
  url: string,
  lessonId: string,
  bytes: number
): AssetRef {
  const lessons = ref?.lessons ?? [];
  return {
    key: assetMetaKey(url),
    lessons: lessons.includes(lessonId) ? lessons : [...lessons, lessonId],
    bytes: bytes > 0 ? bytes : ref?.bytes ?? 0,
  };
}

/** Returns the updated ref, or null when no downloaded lesson uses the asset any more. */
export function removeLessonFromAssetRef(ref: AssetRef, lessonId: string): AssetRef | null {
  const lessons = ref.lessons.filter((id) => id !== lessonId);
  return lessons.length > 0 ? { ...ref, lessons } : null;
}

/** The cache key of a saved lesson's audio. */
export function audioKeyFor(lesson: Pick<OfflineLesson, "id" | "audioKey">): string {
  return lesson.audioKey || offlineAudioKey(lesson.id);
}

/** A fresh audio key for one save of a lesson: `/offline-audio/<id>?v=<nonce>`. */
export function newOfflineAudioKey(lessonId: string, now: number = Date.now()): string {
  const nonce = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${offlineAudioKey(lessonId)}?v=${nonce}`;
}

/** The audio key a commit of `next` leaves unused: the stored record's, when it differs. */
export function replacedAudioKey(
  stored: Pick<OfflineLesson, "id" | "audioKey"> | null | undefined,
  next: Pick<OfflineLesson, "id" | "audioKey">
): string | null {
  if (!stored) return null;
  const old = audioKeyFor(stored);
  return old === audioKeyFor(next) ? null : old;
}

export function assetUrlFromMetaKey(key: string): string | null {
  return key.startsWith(ASSET_META_PREFIX) ? key.slice(ASSET_META_PREFIX.length) : null;
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = OFFLINE_DB_NAME;
const DB_VERSION = OFFLINE_DB_VERSION;
// Long enough for a slow first open on a cheap phone; an open still waiting
// after this is held up by another tab.
const OPEN_TIMEOUT_MS = 10_000;
const DELETE_TIMEOUT_MS = 5_000;
// Emptying the stores never waits on other tabs, so this only catches a
// browser that doesn't answer at all.
const EMPTY_TIMEOUT_MS = 3_000;
/** Set when logout couldn't empty the database; the next open empties it before anything reads it. */
const WIPE_PENDING_KEY = "amal-offline-wipe-pending";
const ALL_STORES = Object.values(OFFLINE_STORES) as OfflineStoreName[];

let dbInstance: IDBDatabase | null = null;
// The open request in flight. IndexedDB can't cancel one and queues every
// later open behind it, so callers share this one (each with its own time
// limit), and its connection is used whenever it finally opens.
let pendingOpen: Promise<IDBDatabase> | null = null;
// pendingOpen already outlasted OPEN_TIMEOUT_MS: callers get OfflineDbBusyError
// right away instead of each waiting again.
let pendingOpenStuck = false;
// Logout's delete request, which later opens queue behind just the same.
let pendingDelete: Promise<boolean> | null = null;

// Bumped by every logout. Writers that started before it must not write
// (they would recreate the database with the previous account's data).
let storageEpoch = 0;

export interface PrivateDataClearedEvent {
  /** The clear came from another tab (its logout or account switch), not this one. */
  fromOtherTab: boolean;
}

const clearListeners = new Set<(event: PrivateDataClearedEvent) => void>();
let broadcast: BroadcastChannel | null = null;

export function getStorageEpoch(): number {
  return storageEpoch;
}

/** Runs `listener` whenever private data is cleared, in this tab or another. Returns an unsubscribe. */
export function onPrivateDataCleared(listener: (event: PrivateDataClearedEvent) => void): () => void {
  clearListeners.add(listener);
  return () => clearListeners.delete(listener);
}

function forgetConnection() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Already closed.
    }
  }
  dbInstance = null;
}

function markCleared(fromOtherTab = false) {
  storageEpoch += 1;
  for (const listener of clearListeners) {
    try {
      listener({ fromOtherTab });
    } catch {
      // A listener must not stop the others (or the logout).
    }
  }
  forgetConnection();
}

/**
 * Starts hearing other tabs' clears. openDB() does this itself; a page that
 * may never open the database (but shows the account) calls it directly.
 */
export function listenForClearsFromOtherTabs() {
  if (broadcast || typeof BroadcastChannel === "undefined") return;
  try {
    broadcast = new BroadcastChannel(OFFLINE_BROADCAST_CHANNEL);
    broadcast.onmessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "cleared") markCleared(true);
    };
  } catch {
    broadcast = null;
  }
}

function createMissingStores(db: IDBDatabase, tx: IDBTransaction | null) {
  if (!db.objectStoreNames.contains(OFFLINE_STORES.lessons)) {
    db.createObjectStore(OFFLINE_STORES.lessons, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(OFFLINE_STORES.queue)) {
    const store = db.createObjectStore(OFFLINE_STORES.queue, {
      keyPath: "id",
      autoIncrement: true,
    });
    store.createIndex("lessonId", "lessonId", { unique: false });
  } else if (tx) {
    const store = tx.objectStore(OFFLINE_STORES.queue);
    if (!store.indexNames.contains("lessonId")) {
      store.createIndex("lessonId", "lessonId", { unique: false });
    }
  }

  if (!db.objectStoreNames.contains(OFFLINE_STORES.downloads)) {
    db.createObjectStore(OFFLINE_STORES.downloads, { keyPath: "lessonId" });
  }

  if (!db.objectStoreNames.contains(OFFLINE_STORES.meta)) {
    db.createObjectStore(OFFLINE_STORES.meta, { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains(OFFLINE_STORES.responses)) {
    db.createObjectStore(OFFLINE_STORES.responses, { keyPath: "key" });
  }
}

function hasAllStores(db: IDBDatabase) {
  return ALL_STORES.every((name) => db.objectStoreNames.contains(name));
}

/** Opens at `version` (or whatever version exists, when omitted), creating any missing store. */
function openAtVersion(version: number | undefined, repairAttempt: boolean): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);

    request.onupgradeneeded = () => {
      createMissingStores(request.result, request.transaction);
    };

    // While another tab holds an old connection (one without our
    // versionchange handler) the request is "blocked" and simply waits. It is
    // not given up on: openDB's callers stop waiting after OPEN_TIMEOUT_MS,
    // and once that tab lets go this opens and becomes the connection.

    request.onsuccess = () => {
      const db = request.result;
      // A database at this version without every store (for example one an
      // old page created) gets one version bump to add what's missing.
      if (!hasAllStores(db) && !repairAttempt) {
        const nextVersion = db.version + 1;
        db.close();
        openAtVersion(nextVersion, true).then(resolve, reject);
        return;
      }
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

function openExisting(): Promise<IDBDatabase> {
  // After a repair bump the database can be newer than DB_VERSION; opening at
  // a lower version fails with VersionError, so retry at whatever exists.
  return openAtVersion(DB_VERSION, false).catch((error: unknown) => {
    if ((error as DOMException | null)?.name !== "VersionError") throw error;
    return openAtVersion(undefined, false);
  });
}

function isClosedConnectionError(error: unknown) {
  return (error as DOMException | null)?.name === "InvalidStateError";
}

/** db.transaction(), retried once on a fresh connection if this one was just closed (another tab's logout or upgrade). */
async function startTransaction(
  storeNames: OfflineStoreName | OfflineStoreName[],
  mode: IDBTransactionMode,
  epoch?: number
): Promise<IDBTransaction> {
  for (let attempt = 0; ; attempt += 1) {
    const db = await openDB();
    if (epoch !== undefined && epoch !== storageEpoch) throw new StorageClearedError();
    try {
      return db.transaction(storeNames, mode);
    } catch (error) {
      if (attempt > 0 || !isClosedConnectionError(error)) throw error;
      if (dbInstance === db) forgetConnection();
    }
  }
}

/** Issues the open (after any unfinished delete) and keeps its connection whenever it succeeds. */
function startOpen(): Promise<IDBDatabase> {
  const epochAtOpen = storageEpoch;
  const finished = (open: Promise<IDBDatabase>) => {
    if (pendingOpen !== open) return;
    pendingOpen = null;
    pendingOpenStuck = false;
  };
  // A delete still in progress would hold this request in the queue anyway;
  // wait for it here rather than stack a request behind it.
  const opened = pendingDelete ? pendingDelete.then(() => openExisting()) : openExisting();

  const open: Promise<IDBDatabase> = opened.then(
    async (db) => {
      try {
        if (wipeIsPending()) {
          // The last logout couldn't empty the database (another tab held it):
          // empty it now, before anything reads the previous account's data.
          try {
            await emptyAllStores(db);
          } catch (error) {
            db.close();
            throw error;
          }
          setWipePending(false);
        }
      } finally {
        finished(open);
      }
      if (epochAtOpen !== storageEpoch) {
        // Logout ran while this was opening; this connection would block the
        // deletion. Reopen, which waits for the deletion to finish.
        db.close();
        return openDB();
      }
      const forget = () => {
        if (dbInstance === db) dbInstance = null;
      };
      // Another tab deleting or upgrading the database: let go so it isn't blocked.
      db.onversionchange = () => {
        db.close();
        forget();
      };
      db.onclose = forget;
      dbInstance = db;
      return db;
    },
    (error: unknown) => {
      finished(open);
      throw error;
    }
  );
  return open;
}

/** The shared open's connection, or OfflineDbBusyError when it takes longer than OPEN_TIMEOUT_MS. */
function waitForOpen(open: Promise<IDBDatabase>): Promise<IDBDatabase> {
  if (pendingOpenStuck) return Promise.reject(new OfflineDbBusyError());
  return new Promise<IDBDatabase>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingOpen === open) pendingOpenStuck = true;
      reject(new OfflineDbBusyError());
    }, OPEN_TIMEOUT_MS);
    open.then(
      (db) => {
        clearTimeout(timer);
        resolve(db);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  listenForClearsFromOtherTabs();
  if (!pendingOpen) {
    pendingOpenStuck = false;
    pendingOpen = startOpen();
  }
  return waitForOpen(pendingOpen);
}

// ── Transaction helpers ──────────────────────────────────────────────────────

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Transaction aborted", "AbortError"));
  });
}

async function readStore<T>(
  storeName: OfflineStoreName,
  read: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const tx = await startTransaction(storeName, "readonly");
  return requestResult(read(tx.objectStore(storeName)));
}

/**
 * Opens a readwrite transaction and runs `body` synchronously inside it.
 * With `epoch`, refuses (StorageClearedError) when logout cleared storage
 * after the caller read that epoch.
 */
async function writeTransaction<T>(
  storeNames: OfflineStoreName | OfflineStoreName[],
  body: (tx: IDBTransaction) => T,
  epoch?: number
): Promise<T> {
  const tx = await startTransaction(storeNames, "readwrite", epoch);
  const done = transactionDone(tx);
  let result: T;
  try {
    result = body(tx);
  } catch (error) {
    done.catch(() => undefined);
    try {
      tx.abort();
    } catch {
      // Already finished.
    }
    throw error;
  }
  await done;
  return result;
}

// ── Lessons ──────────────────────────────────────────────────────────────────

export async function saveOfflineLesson(lesson: OfflineLesson, epoch?: number): Promise<void> {
  await writeTransaction(OFFLINE_STORES.lessons, (tx) => {
    tx.objectStore(OFFLINE_STORES.lessons).put(lesson);
  }, epoch);
}

export async function getOfflineLesson(
  id: string
): Promise<OfflineLesson | null> {
  const result = await readStore<OfflineLesson | undefined>(OFFLINE_STORES.lessons, (store) => store.get(id));
  return result ?? null;
}

export async function getAllOfflineLessons(): Promise<OfflineLesson[]> {
  const result = await readStore<OfflineLesson[]>(OFFLINE_STORES.lessons, (store) => store.getAll());
  return result ?? [];
}

export async function deleteOfflineLesson(id: string): Promise<void> {
  await writeTransaction(OFFLINE_STORES.lessons, (tx) => {
    tx.objectStore(OFFLINE_STORES.lessons).delete(id);
  });
}

/** Merges `patch` into a saved lesson. Returns the updated record, or null if it isn't saved. */
export async function updateOfflineLesson(
  id: string,
  patch: Partial<Omit<OfflineLesson, "id">>
): Promise<OfflineLesson | null> {
  let updated: OfflineLesson | null = null;
  await writeTransaction(OFFLINE_STORES.lessons, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.lessons);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as OfflineLesson | undefined;
      if (!current) return;
      updated = { ...current, ...patch, id };
      store.put(updated);
    };
  });
  return updated;
}

/**
 * Saves a downloaded lesson, its asset references and its completed state in
 * one transaction, so a crash can't leave a lesson whose images look unused
 * (and get pruned) or references for a lesson that was never saved.
 * Returns the asset URLs no downloaded lesson uses any more (from a
 * re-download whose images changed) for the caller to delete from the cache,
 * and the audio key of the record it replaced when that differs (read in the
 * same transaction, so an overlapping save's audio is never the one deleted).
 */
export async function commitOfflineLesson(
  lesson: OfflineLesson,
  {
    assetBytes,
    previousAssetUrls = [],
    state,
    epoch,
  }: {
    assetBytes: Record<string, number>;
    previousAssetUrls?: string[];
    state: DownloadState;
    epoch?: number;
  }
): Promise<{ unreferencedUrls: string[]; replacedAudioKey: string | null }> {
  const unreferencedUrls: string[] = [];
  const current = new Set(lesson.assetUrls ?? []);
  let replacedKey: string | null = null;

  await writeTransaction(
    [OFFLINE_STORES.lessons, OFFLINE_STORES.meta, OFFLINE_STORES.downloads],
    (tx) => {
      const meta = tx.objectStore(OFFLINE_STORES.meta);
      const lessons = tx.objectStore(OFFLINE_STORES.lessons);
      // Requests run in order: this reads the record before the put replaces it.
      const stored = lessons.get(lesson.id);
      stored.onsuccess = () => {
        replacedKey = replacedAudioKey(stored.result as OfflineLesson | undefined, lesson);
      };
      lessons.put(lesson);
      tx.objectStore(OFFLINE_STORES.downloads).put(state);

      for (const url of current) {
        const request = meta.get(assetMetaKey(url));
        request.onsuccess = () => {
          meta.put(addLessonToAssetRef(request.result as AssetRef | undefined, url, lesson.id, assetBytes[url] ?? 0));
        };
      }

      for (const url of previousAssetUrls) {
        if (current.has(url)) continue;
        const request = meta.get(assetMetaKey(url));
        request.onsuccess = () => {
          const ref = request.result as AssetRef | undefined;
          if (!ref) return;
          const next = removeLessonFromAssetRef(ref, lesson.id);
          if (next) {
            meta.put(next);
          } else {
            meta.delete(ref.key);
            unreferencedUrls.push(url);
          }
        };
      }
    },
    epoch
  );

  return { unreferencedUrls, replacedAudioKey: replacedKey };
}

/**
 * Removes a lesson record, its download state and its asset references in one
 * transaction. Scans every asset reference (not just the record's list) so
 * nothing leaks when the record is missing or older. Returns the removed
 * record and the asset URLs no downloaded lesson uses any more.
 */
export async function removeOfflineLessonRecord(
  lessonId: string
): Promise<{ record: OfflineLesson | null; unreferencedUrls: string[] }> {
  let record: OfflineLesson | null = null;
  const unreferencedUrls: string[] = [];

  await writeTransaction(
    [OFFLINE_STORES.lessons, OFFLINE_STORES.meta, OFFLINE_STORES.downloads],
    (tx) => {
      const lessons = tx.objectStore(OFFLINE_STORES.lessons);
      const getRequest = lessons.get(lessonId);
      getRequest.onsuccess = () => {
        record = (getRequest.result as OfflineLesson | undefined) ?? null;
      };
      lessons.delete(lessonId);
      tx.objectStore(OFFLINE_STORES.downloads).delete(lessonId);

      const range = IDBKeyRange.bound(ASSET_META_PREFIX, `${ASSET_META_PREFIX}￿`);
      const cursorRequest = tx.objectStore(OFFLINE_STORES.meta).openCursor(range);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const ref = cursor.value as AssetRef;
        if (ref.lessons?.includes(lessonId)) {
          const next = removeLessonFromAssetRef(ref, lessonId);
          if (next) {
            cursor.update(next);
          } else {
            cursor.delete();
            const url = assetUrlFromMetaKey(ref.key);
            if (url) unreferencedUrls.push(url);
          }
        }
        cursor.continue();
      };
    }
  );

  return { record, unreferencedUrls };
}

// ── Progress Queue ───────────────────────────────────────────────────────────

/**
 * Adds a queue item. Kept for callers written against v1: an item with
 * `table: "lesson_progress"` is stored in the current shape, owned by its
 * `data.student_id`. New code should use queueLessonProgress (sync.ts).
 */
export async function queueProgressUpdate(
  item: Omit<ProgressQueueItem, "id">
): Promise<void> {
  const normalized = normalizeQueueItem(item);
  await addQueueItem(normalized ? { ...normalized, table: undefined } : item);
}

export async function addQueueItem(item: Omit<ProgressQueueItem, "id">, epoch?: number): Promise<void> {
  const record = { ...item };
  delete (record as ProgressQueueItem).id;
  if (record.table === undefined) delete record.table;
  await writeTransaction(OFFLINE_STORES.queue, (tx) => {
    tx.objectStore(OFFLINE_STORES.queue).add(record);
  }, epoch);
}

/**
 * Writes the local progress record and keeps a single "progress" queue item
 * per owner + lesson (updated in place), so hours of offline watching don't
 * grow the queue. Both in one transaction. The item's first `completed_at`
 * survives later saves: it is the day the lesson was finished (streaks count
 * that day), not the day of the last re-watch.
 */
export async function saveLocalProgressAndQueue(
  progress: LocalLessonProgress,
  queueData: Record<string, unknown>,
  epoch?: number
): Promise<void> {
  await writeTransaction([OFFLINE_STORES.meta, OFFLINE_STORES.queue], (tx) => {
    tx.objectStore(OFFLINE_STORES.meta).put(progress);
    const queue = tx.objectStore(OFFLINE_STORES.queue);
    const request = queue.index("lessonId").getAll(progress.lessonId);
    request.onsuccess = () => {
      const items = (request.result ?? []) as ProgressQueueItem[];
      const existing = items.find((item) => item.kind === "progress" && item.ownerId === progress.ownerId);
      const next: ProgressQueueItem = {
        lessonId: progress.lessonId,
        ownerId: progress.ownerId,
        kind: "progress",
        data: nextProgressQueueData(existing, queueData),
        timestamp: progress.updatedAt,
      };
      if (existing?.id !== undefined) {
        queue.put({ ...next, id: existing.id });
      } else {
        queue.add(next);
      }
    };
  }, epoch);
}

export async function getQueuedUpdates(): Promise<ProgressQueueItem[]> {
  const result = await readStore<ProgressQueueItem[]>(OFFLINE_STORES.queue, (store) => store.getAll());
  return result ?? [];
}

export async function countQueuedUpdates(): Promise<number> {
  return readStore<number>(OFFLINE_STORES.queue, (store) => store.count());
}

export async function clearQueuedUpdates(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await writeTransaction(OFFLINE_STORES.queue, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.queue);
    for (const id of ids) {
      store.delete(id);
    }
  });
}

/**
 * Deletes items that were sent, unless they changed meanwhile (a progress item
 * is updated in place while the player runs; the newer value must still sync).
 */
export async function removeQueueItemsIfUnchanged(items: ProgressQueueItem[]): Promise<void> {
  const withIds = items.filter((item): item is ProgressQueueItem & { id: number } => typeof item.id === "number");
  if (withIds.length === 0) return;
  await writeTransaction(OFFLINE_STORES.queue, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.queue);
    for (const item of withIds) {
      const request = store.get(item.id);
      request.onsuccess = () => {
        const current = request.result as ProgressQueueItem | undefined;
        if (!current) return;
        if (current.timestamp === item.timestamp && JSON.stringify(current.data) === JSON.stringify(item.data)) {
          store.delete(item.id);
        }
      };
    }
  });
}

/** Records why items are waiting (back-off, refused access), unless they changed since they were read. */
export async function setQueueItemsRetry(updates: { item: ProgressQueueItem; retry: QueueItemRetry }[]): Promise<void> {
  const withIds = updates.filter((update) => typeof update.item.id === "number");
  if (withIds.length === 0) return;
  await writeTransaction(OFFLINE_STORES.queue, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.queue);
    for (const { item, retry } of withIds) {
      const request = store.get(item.id as number);
      request.onsuccess = () => {
        const current = request.result as ProgressQueueItem | undefined;
        if (!current) return;
        // A newer write replaced it: that one gets its own chance.
        if (current.timestamp !== item.timestamp || JSON.stringify(current.data) !== JSON.stringify(item.data)) return;
        store.put({ ...current, retry });
      };
    }
  });
}

/**
 * Queues an activity answer, keeping at most one per owner + lesson + slide
 * (see planSlideAnswerQueue). Reads the phone's saved answers in the same
 * transaction, so an answer saved meanwhile can't slip between the check and
 * the write. Returns whether the item was stored.
 */
export async function queueSlideResponseItem(
  item: Omit<OfflineQueueItem, "id" | "retry">,
  epoch?: number
): Promise<boolean> {
  const slideId = item.data.slideId;
  let stored = false;
  await writeTransaction(
    [OFFLINE_STORES.responses, OFFLINE_STORES.queue],
    (tx) => {
      const localRequest = tx.objectStore(OFFLINE_STORES.responses).get(responsesKey(item.ownerId, item.lessonId));
      localRequest.onsuccess = () => {
        const local =
          typeof slideId === "string"
            ? (localRequest.result as LocalSlideResponses | undefined)?.bySlide?.[slideId]
            : undefined;
        const queue = tx.objectStore(OFFLINE_STORES.queue);
        const request = queue.index("lessonId").getAll(item.lessonId);
        request.onsuccess = () => {
          const plan = planSlideAnswerQueue(local, (request.result ?? []) as ProgressQueueItem[], item);
          if (plan.action === "skip") return;
          const record: ProgressQueueItem = {
            lessonId: item.lessonId,
            ownerId: item.ownerId,
            kind: "slide_response",
            data: item.data,
            timestamp: item.timestamp,
          };
          if (plan.action === "replace") {
            queue.put({ ...record, id: plan.id });
          } else {
            queue.add(record);
          }
          stored = true;
        };
      };
    },
    epoch
  );
  return stored;
}

/**
 * Removes queued answers for one slide that `sent` (just confirmed by the
 * server) supersedes or equals: replayed later, they would overwrite it.
 */
export async function removeQueuedSlideResponses(
  ownerId: string,
  lessonId: string,
  slideId: string,
  sent: AnswerVersion
): Promise<void> {
  await writeTransaction(OFFLINE_STORES.queue, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.queue);
    const request = store.index("lessonId").getAll(lessonId);
    request.onsuccess = () => {
      const queued = (request.result ?? []) as ProgressQueueItem[];
      for (const id of supersededQueuedAnswerIds(queued, ownerId, slideId, sent)) store.delete(id);
    };
  });
}

// ── Download State ───────────────────────────────────────────────────────────

export async function setDownloadState(state: DownloadState, epoch?: number): Promise<void> {
  await writeTransaction(OFFLINE_STORES.downloads, (tx) => {
    tx.objectStore(OFFLINE_STORES.downloads).put(state);
  }, epoch);
}

export async function getDownloadState(
  lessonId: string
): Promise<DownloadState | null> {
  const result = await readStore<DownloadState | undefined>(OFFLINE_STORES.downloads, (store) => store.get(lessonId));
  return result ?? null;
}

export async function getAllDownloadStates(): Promise<DownloadState[]> {
  const result = await readStore<DownloadState[]>(OFFLINE_STORES.downloads, (store) => store.getAll());
  return result ?? [];
}

export async function deleteDownloadState(lessonId: string): Promise<void> {
  await writeTransaction(OFFLINE_STORES.downloads, (tx) => {
    tx.objectStore(OFFLINE_STORES.downloads).delete(lessonId);
  });
}

// ── Meta ─────────────────────────────────────────────────────────────────────

export async function getMeta<T extends MetaRecord = MetaRecord>(key: string): Promise<T | null> {
  const result = await readStore<T | undefined>(OFFLINE_STORES.meta, (store) => store.get(key) as IDBRequest<T | undefined>);
  return result ?? null;
}

export async function putMeta<T extends MetaRecord>(record: T, epoch?: number): Promise<void> {
  await writeTransaction(OFFLINE_STORES.meta, (tx) => {
    tx.objectStore(OFFLINE_STORES.meta).put(record);
  }, epoch);
}

/** Writes `record` only if nothing is stored under its key yet. Returns whether it was written. */
export async function putMetaIfAbsent<T extends MetaRecord>(record: T): Promise<boolean> {
  let added = false;
  await writeTransaction(OFFLINE_STORES.meta, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.meta);
    const request = store.getKey(record.key);
    request.onsuccess = () => {
      if (request.result !== undefined) return;
      store.add(record);
      added = true;
    };
  });
  return added;
}

export async function deleteMeta(key: string): Promise<void> {
  await writeTransaction(OFFLINE_STORES.meta, (tx) => {
    tx.objectStore(OFFLINE_STORES.meta).delete(key);
  });
}

export async function getMetaByPrefix<T extends MetaRecord = MetaRecord>(prefix: string): Promise<T[]> {
  const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
  const result = await readStore<T[]>(OFFLINE_STORES.meta, (store) => store.getAll(range) as IDBRequest<T[]>);
  return result ?? [];
}

export async function getAllAssetRefs(): Promise<AssetRef[]> {
  return getMetaByPrefix<AssetRef>(ASSET_META_PREFIX);
}

export async function getLocalProgress(ownerId: string, lessonId: string): Promise<LocalLessonProgress | null> {
  return getMeta<LocalLessonProgress>(localProgressKey(ownerId, lessonId));
}

/** Writes the owner id onto saved lessons that predate it (v1 downloads adopted by their owner). */
export async function stampLessonOwner(ownerId: string): Promise<void> {
  await writeTransaction(OFFLINE_STORES.lessons, (tx) => {
    const request = tx.objectStore(OFFLINE_STORES.lessons).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const lesson = cursor.value as OfflineLesson;
      if (!lesson.ownerId) cursor.update({ ...lesson, ownerId });
      cursor.continue();
    };
  });
}

/** True when anything account-specific is stored (lessons or queued items). */
export async function hasStoredPrivateData(): Promise<boolean> {
  const tx = await startTransaction([OFFLINE_STORES.lessons, OFFLINE_STORES.queue], "readonly");
  const [lessons, queued] = await Promise.all([
    requestResult(tx.objectStore(OFFLINE_STORES.lessons).count()),
    requestResult(tx.objectStore(OFFLINE_STORES.queue).count()),
  ]);
  return lessons + queued > 0;
}

// ── Local slide responses ────────────────────────────────────────────────────

export async function getLocalSlideResponses(
  ownerId: string,
  lessonId: string
): Promise<LocalSlideResponses | null> {
  const result = await readStore<LocalSlideResponses | undefined>(OFFLINE_STORES.responses, (store) =>
    store.get(responsesKey(ownerId, lessonId))
  );
  return result ?? null;
}

/**
 * Merges answers into the saved set for one owner + lesson. With
 * `keepExisting`, slides already answered on this phone are left alone (used
 * when seeding from the server at download: the phone's answer is newer).
 */
export async function putLocalSlideResponses(
  ownerId: string,
  lessonId: string,
  entries: Record<string, LocalSlideResponse>,
  { keepExisting = false, epoch }: { keepExisting?: boolean; epoch?: number } = {}
): Promise<void> {
  const key = responsesKey(ownerId, lessonId);
  await writeTransaction(OFFLINE_STORES.responses, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.responses);
    const request = store.get(key);
    request.onsuccess = () => {
      const current = (request.result as LocalSlideResponses | undefined)?.bySlide ?? {};
      const bySlide = keepExisting ? { ...entries, ...current } : { ...current, ...entries };
      const record: LocalSlideResponses = { key, ownerId, lessonId, bySlide };
      store.put(record);
    };
  }, epoch);
}

/**
 * Read-modify-write of one slide's saved answer in a single transaction.
 * `update` gets the current entry and returns the new one, or undefined to
 * leave it as it is. Returns whether it wrote.
 */
export async function updateLocalSlideResponse(
  ownerId: string,
  lessonId: string,
  slideId: string,
  update: (current: LocalSlideResponse | undefined) => LocalSlideResponse | undefined,
  epoch?: number
): Promise<boolean> {
  const key = responsesKey(ownerId, lessonId);
  let written = false;
  await writeTransaction(OFFLINE_STORES.responses, (tx) => {
    const store = tx.objectStore(OFFLINE_STORES.responses);
    const request = store.get(key);
    request.onsuccess = () => {
      const bySlide = (request.result as LocalSlideResponses | undefined)?.bySlide ?? {};
      const next = update(bySlide[slideId]);
      if (!next) return;
      const record: LocalSlideResponses = { key, ownerId, lessonId, bySlide: { ...bySlide, [slideId]: next } };
      store.put(record);
      written = true;
    };
  }, epoch);
  return written;
}

// ── Cache API Helpers ────────────────────────────────────────────────────────

const SIM_AUDIO_CACHE = AUDIO_CACHE;

function cacheStorageAvailable() {
  return typeof caches !== "undefined";
}

/**
 * The saved audio of a lesson: under `key`, else under the key its record
 * names. When the database can't be read, any copy of it will do.
 */
async function matchSimAudio(cache: Cache, lessonId: string, key?: string): Promise<Response | undefined> {
  if (key) return cache.match(key);
  let record: OfflineLesson | null;
  try {
    record = await getOfflineLesson(lessonId);
  } catch {
    return cache.match(offlineAudioKey(lessonId), { ignoreSearch: true });
  }
  return cache.match(audioKeyFor(record ?? { id: lessonId }));
}

/** Stores a lesson's audio under `key` (a fresh newOfflineAudioKey for downloads). */
export async function cacheSimAudio(
  lessonId: string,
  audioBlob: Blob,
  key: string = offlineAudioKey(lessonId)
): Promise<void> {
  if (!cacheStorageAvailable()) throw new Error("Cache Storage isn't available in this browser");
  const cache = await caches.open(SIM_AUDIO_CACHE);
  const response = new Response(audioBlob, {
    headers: {
      "Content-Type": audioBlob.type || "application/octet-stream",
      "Content-Length": String(audioBlob.size),
    },
  });
  await cache.put(key, response);
}

export async function getCachedSimAudio(
  lessonId: string,
  key?: string
): Promise<Blob | null> {
  try {
    if (!cacheStorageAvailable()) return null;
    const cache = await caches.open(SIM_AUDIO_CACHE);
    const response = await matchSimAudio(cache, lessonId, key);
    if (!response) return null;
    const blob = await response.blob();
    if (blob.size === 0) return null;
    // Some browsers drop the Blob type when reading back; restore it so
    // Safari's media loader recognises the format.
    const type = response.headers.get("content-type") || "";
    return blob.type || !type ? blob : new Blob([blob], { type });
  } catch {
    return null;
  }
}

/** Size of the cached audio in bytes (0 when missing), without reading it into memory where the header is present. */
export async function getCachedSimAudioSize(lessonId: string, key?: string): Promise<number> {
  try {
    if (!cacheStorageAvailable()) return 0;
    const cache = await caches.open(SIM_AUDIO_CACHE);
    const response = await matchSimAudio(cache, lessonId, key);
    if (!response) return 0;
    const header = Number(response.headers.get("content-length"));
    if (Number.isFinite(header) && header > 0) return header;
    return (await response.blob()).size;
  } catch {
    return 0;
  }
}

export async function hasCachedSimAudio(lessonId: string, key?: string): Promise<boolean> {
  try {
    if (!cacheStorageAvailable()) return false;
    const cache = await caches.open(SIM_AUDIO_CACHE);
    return Boolean(await matchSimAudio(cache, lessonId, key));
  } catch {
    return false;
  }
}

/** Deletes the audio under `key`, or without one every copy of the lesson's audio. */
export async function deleteCachedSimAudio(lessonId: string, key?: string): Promise<void> {
  try {
    if (!cacheStorageAvailable()) return;
    const cache = await caches.open(SIM_AUDIO_CACHE);
    if (key) {
      await cache.delete(key);
      return;
    }
    const requests = await cache.keys(offlineAudioKey(lessonId), { ignoreSearch: true });
    await Promise.all(requests.map((request) => cache.delete(request)));
  } catch {
    // Ignore cache errors
  }
}

// ── Logout ───────────────────────────────────────────────────────────────────

export interface ClearOfflineDataResult {
  ok: boolean;
  /** What could not be removed (e.g. "database", a cache name). */
  failures: string[];
}

type KeepQueued = (item: ProgressQueueItem) => boolean;

/** Empties every store of `db` in one transaction, keeping only the queue items `keepQueued` accepts. */
async function emptyAllStores(db: IDBDatabase, keepQueued?: KeepQueued): Promise<void> {
  const names = Array.from(db.objectStoreNames);
  if (names.length === 0) return;
  const tx = db.transaction(names, "readwrite");
  const done = transactionDone(tx);
  for (const name of names) {
    const store = tx.objectStore(name);
    if (keepQueued && name === OFFLINE_STORES.queue) {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (!keepQueued(cursor.value as ProgressQueueItem)) cursor.delete();
        cursor.continue();
      };
    } else {
      store.clear();
    }
  }
  await done;
}

/**
 * Empties the database without deleting it. Another tab's connection can
 * block a deletion indefinitely (an old build, or a suspended iPhone tab),
 * and Safari drops a blocked deletion when the page navigates away — the
 * previous account's lessons would survive the logout. An open with no
 * version and a readwrite transaction are never blocked by other tabs. A
 * database that doesn't exist isn't created. Resolves whether it worked.
 */
function emptyDatabase(keepQueued?: KeepQueued): Promise<boolean> {
  if (typeof indexedDB === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), EMPTY_TIMEOUT_MS);
    let nothingStored = false;
    try {
      const request = indexedDB.open(DB_NAME);
      request.onupgradeneeded = () => {
        // No database, so nothing to clear: don't create one.
        nothingStored = true;
        request.transaction?.abort();
      };
      request.onerror = () => finish(nothingStored);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        emptyAllStores(db, keepQueued).then(
          () => {
            db.close();
            finish(true);
          },
          () => {
            db.close();
            finish(false);
          }
        );
      };
    } catch {
      finish(false);
    }
  });
}

function wipeIsPending(): boolean {
  try {
    return window.localStorage.getItem(WIPE_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

function setWipePending(pending: boolean) {
  try {
    if (pending) window.localStorage.setItem(WIPE_PENDING_KEY, "1");
    else window.localStorage.removeItem(WIPE_PENDING_KEY);
  } catch {
    // Storage unavailable.
  }
}

function deleteDatabase(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return Promise.resolve(true);
  // Like an open, a delete can't be cancelled and later requests queue
  // behind it: a second logout waits on this same one, and openDB waits for
  // it before opening.
  if (!pendingDelete) {
    const started: Promise<boolean> = new Promise<boolean>((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    }).then((ok) => {
      if (pendingDelete === started) pendingDelete = null;
      return ok;
    });
    pendingDelete = started;
  }
  const deletion = pendingDelete;
  return new Promise<boolean>((resolve) => {
    // Blocked means another tab still has it open; our versionchange handler
    // closes those, so keep waiting for success up to the timeout.
    const timer = setTimeout(() => resolve(false), DELETE_TIMEOUT_MS);
    void deletion.then((ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  });
}

async function deleteCache(name: string): Promise<boolean> {
  if (!cacheStorageAvailable()) return true;
  try {
    await caches.delete(name);
    return true;
  } catch {
    return false;
  }
}

function clearPrivateLocalStorage(): boolean {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return true; // Storage blocked or absent: nothing was saved there.
  }
  try {
    for (const key of PRIVATE_LOCAL_STORAGE_KEYS) storage.removeItem(key);
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && PRIVATE_LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove account-scoped offline data when a user signs out or deletes an
 * account: stops downloads, empties the database, deletes the audio and image
 * caches, the v1 catch-all cache and per-account localStorage keys. Page
 * shells and build files (not personal) are left for the service worker.
 *
 * The stores are emptied (the database is deleted only if that fails).
 * "database" is reported as a failure only when the data itself couldn't be
 * removed; after a logout, the next open then empties the database before
 * anything reads it.
 *
 * `keepQueued` (an account switch) keeps the queue items it accepts.
 */
export async function clearPrivateOfflineData({
  keepQueued,
}: { keepQueued?: KeepQueued } = {}): Promise<ClearOfflineDataResult> {
  markCleared();
  try {
    broadcast?.postMessage({ type: "cleared" });
  } catch {
    // Other tabs still close their connection on versionchange.
  }

  const cacheNames = [...ACCOUNT_CACHES, ...LEGACY_PRIVATE_CACHES];
  const [databaseEmptied, ...cachesDeleted] = await Promise.all([
    emptyDatabase(keepQueued),
    ...cacheNames.map((name) => deleteCache(name)),
  ]);

  // Once emptied, the database itself stays: deleting it gains nothing, and
  // a deletion another tab blocks makes every later open wait until that tab
  // lets go (in Chrome even on the next page). Only when emptying failed is
  // deleting the remaining way to remove the data.
  let databaseCleared = databaseEmptied;
  if (!databaseEmptied && !keepQueued) databaseCleared = await deleteDatabase();

  const failures: string[] = [];
  if (!databaseCleared) failures.push("database");
  cachesDeleted.forEach((deleted, index) => {
    if (!deleted) failures.push(cacheNames[index]);
  });
  if (!clearPrivateLocalStorage()) failures.push("localStorage");
  if (!databaseCleared && !keepQueued) setWipePending(true);

  return { ok: failures.length === 0, failures };
}

/**
 * Clears offline data saved by a different account before `userId` uses it.
 * Kept for older callers; DashboardLayout should call saveOwner() (identity.ts),
 * which also records the owner's name for the offline pages.
 */
export async function prepareOfflineStorageForUser(userId: string): Promise<void> {
  const { ensureOfflineOwner } = await import("./identity");
  await ensureOfflineOwner(userId);
}
