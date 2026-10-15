/**
 * Progress and activity answers saved on the phone, and sending them to the
 * server when the connection returns.
 *
 * Rules that keep a sync from damaging what the server already has:
 *   - progress values never go down (local records are seeded from the
 *     server snapshot saved with the download, and the server row is merged
 *     with max(), not overwritten);
 *   - completed is never sent as false, and playback never completes a
 *     practice-gated lesson (passing the Practice does that);
 *   - items are sent only for the verified user that queued them, and are
 *     removed only after the server confirmed them.
 * <OfflineSyncRunner/> in the root layout calls syncOfflineQueue on app open
 * and on every `online` event; logout calls it before clearing.
 */

import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import {
  addQueueItem,
  clearQueuedUpdates,
  countQueuedUpdates,
  getLocalProgress,
  getLocalSlideResponses,
  getOfflineLesson,
  getQueuedUpdates,
  getStorageEpoch,
  localProgressKey,
  normalizeQueueItem,
  putLocalSlideResponses,
  putMeta,
  removeQueueItemsIfUnchanged,
  saveLocalProgressAndQueue,
  type LocalLessonProgress,
  type OfflineLesson,
  type OfflineProgressSnapshot,
  type OfflineQueueItem,
  type ProgressQueueItem,
} from "./db";
import { postSlideResponse } from "./slide-responses";

export { normalizeQueueItem } from "./db";

const AUTH_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Completion times from the device are trusted only this far back.
const MAX_BACKDATE_MS = 14 * 24 * 60 * 60 * 1000;
// Another account's unsent items wait this long for it to sign in here again.
const KEEP_OTHER_ACCOUNTS_MS = 30 * 24 * 60 * 60 * 1000;

// ── Small helpers ────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(message = "Timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Rejects with TimeoutError when `promise` takes longer than `ms` (the work itself keeps running). */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function nonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

// ── Pure rules (unit-tested) ─────────────────────────────────────────────────

/**
 * Whether playback may complete this lesson. An explicit answer from the
 * caller wins; otherwise the saved lesson decides (`practice: null` means no
 * gate). Unknown — no record, or one saved before the gate was stored —
 * counts as gated, so a sync can never complete a lesson that needs Practice.
 */
export function resolvePracticeGated(
  record: Pick<OfflineLesson, "practice"> | null | undefined,
  explicit?: boolean
): boolean {
  if (typeof explicit === "boolean") return explicit;
  if (!record || record.practice === undefined) return true;
  return record.practice !== null;
}

export interface ProgressValues {
  last_position_seconds: number;
  total_watch_time_seconds: number;
  completed: boolean;
}

/** New local progress: the highest of what the phone had, the download's server snapshot and this update. */
export function mergeLocalProgress(
  previous: ProgressValues | null | undefined,
  snapshot: OfflineProgressSnapshot | null | undefined,
  update: { positionSec: number; watchSec: number; completedCandidate: boolean },
  gated: boolean
): ProgressValues {
  return {
    last_position_seconds: Math.max(
      nonNegative(previous?.last_position_seconds),
      nonNegative(snapshot?.last_position_seconds),
      nonNegative(update.positionSec)
    ),
    total_watch_time_seconds: Math.max(
      nonNegative(previous?.total_watch_time_seconds),
      nonNegative(snapshot?.total_watch_time_seconds),
      nonNegative(update.watchSec)
    ),
    completed:
      previous?.completed === true ||
      snapshot?.completed === true ||
      (update.completedCandidate && !gated),
  };
}

export function progressIncreased(previous: ProgressValues | null | undefined, next: ProgressValues): boolean {
  if (!previous) {
    return next.last_position_seconds > 0 || next.total_watch_time_seconds > 0 || next.completed;
  }
  return (
    next.last_position_seconds > previous.last_position_seconds ||
    next.total_watch_time_seconds > previous.total_watch_time_seconds ||
    (next.completed && !previous.completed)
  );
}

export interface ServerProgressRow {
  last_position_seconds: number | null;
  total_watch_time_seconds: number | null;
  completed: boolean | null;
  completed_at: string | null;
}

export interface QueuedProgressTotals {
  last_position_seconds: number;
  total_watch_time_seconds: number;
  /** Some queued item asked to complete the lesson. */
  completed: boolean;
  /** When it was completed on the phone (ISO), if known. */
  completedAt: string | null;
}

export interface ProgressWrite {
  last_position_seconds: number;
  total_watch_time_seconds: number;
  completed?: true;
  completed_at?: string;
}

/** A device timestamp clamped to [now − 14 days, now], so a wrong clock can't move completion far. */
export function clampActivityTime(iso: string | null | undefined, now: Date = new Date()): string {
  const nowMs = now.getTime();
  const parsed = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(parsed)) return now.toISOString();
  return new Date(Math.min(nowMs, Math.max(nowMs - MAX_BACKDATE_MS, parsed))).toISOString();
}

/**
 * What to write to lesson_progress: the higher position and watch time, and
 * completion only when the server row isn't complete yet, something queued
 * asked for it and the lesson has no practice gate. Never `completed: false`;
 * an existing completed_at is kept. Returns null when the server already has
 * everything.
 */
export function mergeProgressForSync(
  existing: ServerProgressRow | null,
  queued: QueuedProgressTotals,
  { gated, now = new Date() }: { gated: boolean; now?: Date }
): ProgressWrite | null {
  const existingPosition = nonNegative(existing?.last_position_seconds);
  const existingWatch = nonNegative(existing?.total_watch_time_seconds);
  const position = Math.max(existingPosition, nonNegative(queued.last_position_seconds));
  const watch = Math.max(existingWatch, nonNegative(queued.total_watch_time_seconds));
  const completeNow = existing?.completed !== true && queued.completed && !gated;

  if (existing && position === existingPosition && watch === existingWatch && !completeNow) {
    return null;
  }
  if (!existing && position === 0 && watch === 0 && !completeNow) {
    return null;
  }

  return {
    last_position_seconds: position,
    total_watch_time_seconds: watch,
    ...(completeNow ? { completed: true as const, completed_at: clampActivityTime(queued.completedAt, now) } : {}),
  };
}

/** Splits queue items into the verified user's, other accounts' and unreadable ones. */
export function partitionQueueByOwner(
  items: ProgressQueueItem[],
  userId: string
): { mine: OfflineQueueItem[]; foreign: ProgressQueueItem[]; invalid: ProgressQueueItem[] } {
  const mine: OfflineQueueItem[] = [];
  const foreign: ProgressQueueItem[] = [];
  const invalid: ProgressQueueItem[] = [];
  for (const item of items) {
    const normalized = normalizeQueueItem(item);
    if (!normalized) invalid.push(item);
    else if (normalized.ownerId === userId) mine.push(normalized);
    else foreign.push(item);
  }
  return { mine, foreign, invalid };
}

/** Whether another account's queued item has waited too long (30 days) to keep; an unreadable time counts as too long. */
export function otherAccountItemExpired(timestamp: string, now: Date = new Date()): boolean {
  return !(now.getTime() - Date.parse(timestamp) < KEEP_OTHER_ACCOUNTS_MS);
}

/** Combines a lesson's progress and complete items into one set of totals. */
export function summarizeProgressItems(items: OfflineQueueItem[]): QueuedProgressTotals {
  const totals: QueuedProgressTotals = {
    last_position_seconds: 0,
    total_watch_time_seconds: 0,
    completed: false,
    completedAt: null,
  };
  for (const item of items) {
    if (item.kind !== "progress" && item.kind !== "complete") continue;
    totals.last_position_seconds = Math.max(totals.last_position_seconds, nonNegative(item.data.last_position_seconds));
    totals.total_watch_time_seconds = Math.max(
      totals.total_watch_time_seconds,
      nonNegative(item.data.total_watch_time_seconds)
    );
    const wantsCompletion = item.kind === "complete" || item.data.completed === true;
    if (wantsCompletion) {
      totals.completed = true;
      const at = typeof item.data.completed_at === "string" ? item.data.completed_at : item.timestamp;
      // The earliest completion is the real one; later items are re-watches.
      if (!totals.completedAt || Date.parse(at) < Date.parse(totals.completedAt)) totals.completedAt = at;
    }
  }
  return totals;
}

// ── Queueing ─────────────────────────────────────────────────────────────────

export interface QueueLessonProgressInput {
  ownerId: string;
  lessonId: string;
  positionSec: number;
  watchSec: number;
  /** Playback reached the completion point (e.g. 80 %). Ignored for practice-gated lessons. */
  completedCandidate: boolean;
  /** Pass when the caller knows (the online lesson page); otherwise the saved lesson decides. */
  practiceGated?: boolean;
}

function snapshotOf(record: OfflineLesson | null, ownerId: string): OfflineProgressSnapshot | null {
  return record && record.ownerId === ownerId ? record.progress ?? null : null;
}

/**
 * Saves playback progress on the phone and queues it for sync. Values never
 * go down. Returns the progress now stored (unchanged when this update
 * wasn't ahead of it).
 */
export async function queueLessonProgress(input: QueueLessonProgressInput): Promise<ProgressValues> {
  // A logout while this runs must not get the previous account's progress written back.
  const epoch = getStorageEpoch();
  const [record, previous] = await Promise.all([
    getOfflineLesson(input.lessonId).catch(() => null),
    getLocalProgress(input.ownerId, input.lessonId),
  ]);
  const gated = resolvePracticeGated(record, input.practiceGated);
  const next = mergeLocalProgress(previous, snapshotOf(record, input.ownerId), input, gated);
  if (!progressIncreased(previous, next)) return previous ?? next;

  const now = new Date().toISOString();
  const local: LocalLessonProgress = {
    key: localProgressKey(input.ownerId, input.lessonId),
    ownerId: input.ownerId,
    lessonId: input.lessonId,
    ...next,
    updatedAt: now,
  };
  await saveLocalProgressAndQueue(local, {
    last_position_seconds: next.last_position_seconds,
    total_watch_time_seconds: next.total_watch_time_seconds,
    completed: next.completed && !gated,
  }, epoch);
  return next;
}

/**
 * "Mark complete" without a connection. Does nothing (returns false) for a
 * practice-gated lesson — passing the Practice completes those.
 */
export async function queueLessonComplete({
  ownerId,
  lessonId,
  positionSec = 0,
  practiceGated,
}: {
  ownerId: string;
  lessonId: string;
  positionSec?: number;
  practiceGated?: boolean;
}): Promise<boolean> {
  const epoch = getStorageEpoch();
  const [record, previous] = await Promise.all([
    getOfflineLesson(lessonId).catch(() => null),
    getLocalProgress(ownerId, lessonId),
  ]);
  if (resolvePracticeGated(record, practiceGated)) return false;

  const next = mergeLocalProgress(
    previous,
    snapshotOf(record, ownerId),
    { positionSec, watchSec: positionSec, completedCandidate: true },
    false
  );
  const now = new Date().toISOString();
  await putMeta({
    key: localProgressKey(ownerId, lessonId),
    ownerId,
    lessonId,
    ...next,
    updatedAt: now,
  } satisfies LocalLessonProgress, epoch);
  await addQueueItem({
    lessonId,
    ownerId,
    kind: "complete",
    timestamp: now,
    data: {
      completed_at: now,
      last_position_seconds: next.last_position_seconds,
      total_watch_time_seconds: next.total_watch_time_seconds,
    },
  }, epoch);
  return true;
}

/**
 * Progress to show or resume from: the higher of the download's server
 * snapshot and what was saved on the phone since.
 */
export async function getEffectiveLessonProgress(ownerId: string, lessonId: string): Promise<ProgressValues> {
  const [record, local] = await Promise.all([
    getOfflineLesson(lessonId).catch(() => null),
    getLocalProgress(ownerId, lessonId).catch(() => null),
  ]);
  return mergeLocalProgress(local, snapshotOf(record, ownerId), { positionSec: 0, watchSec: 0, completedCandidate: false }, true);
}

/** Items waiting to sync (for `ownerId` only, when given). 0 when storage can't be read. */
export async function countUnsyncedItems(ownerId?: string): Promise<number> {
  try {
    if (!ownerId) return await countQueuedUpdates();
    const items = await getQueuedUpdates();
    return items.filter((item) => normalizeQueueItem(item)?.ownerId === ownerId).length;
  } catch {
    return 0;
  }
}

// ── Server lookups ───────────────────────────────────────────────────────────

/**
 * The lesson's Practice gate: the learning-path step's practice, else a
 * published practice made for the lesson. Throws when a lookup fails —
 * callers must not read a failure as "no gate".
 */
export async function fetchPracticeGate(
  supabase: SupabaseClient<Database>,
  lessonId: string,
  signal: AbortSignal = timeoutSignal(REQUEST_TIMEOUT_MS)
): Promise<{ assignmentId: string } | null> {
  const { data: step, error: stepError } = await supabase
    .from("learning_path_steps")
    .select("practice_assignment_id")
    .eq("lesson_id", lessonId)
    .not("practice_assignment_id", "is", null)
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();
  if (stepError) throw stepError;
  if (step?.practice_assignment_id) return { assignmentId: step.practice_assignment_id };

  const { data: practice, error: practiceError } = await supabase
    .from("homework_assignments")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("is_practice", true)
    .eq("is_published", true)
    .limit(1)
    .abortSignal(signal)
    .maybeSingle();
  if (practiceError) throw practiceError;
  return practice ? { assignmentId: practice.id } : null;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  /** Items the server confirmed (now removed). */
  synced: number;
  /** Items that failed this time and stay queued. */
  failed: number;
  /** Items still queued afterwards. */
  remaining: number;
  /** Items removed without sending: unreadable, another account's past 30 days, or rejected for good by the server. */
  dropped: number;
  /** Other accounts' items left queued for them to send when they sign in here (counted in `remaining`). */
  otherAccounts?: number;
  /** Why nothing was attempted, when that happened. */
  skipped?: "offline" | "signed_out" | "busy";
}

async function remainingCount() {
  return countQueuedUpdates().catch(() => 0);
}

async function verifiedUserId(supabase: SupabaseClient<Database>): Promise<string | null | "offline"> {
  try {
    const { data, error } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    if (data.user) return data.user.id;
    if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) return "offline";
    return null;
  } catch {
    return "offline";
  }
}

/** Merges a lesson's queued progress into its lesson_progress row. Throws on any failure. */
async function syncLessonProgress(
  supabase: SupabaseClient<Database>,
  userId: string,
  lessonId: string,
  items: OfflineQueueItem[]
): Promise<void> {
  const totals = summarizeProgressItems(items);

  const { data: existing, error: readError } = await supabase
    .from("lesson_progress")
    .select("last_position_seconds, total_watch_time_seconds, completed, completed_at")
    .eq("student_id", userId)
    .eq("lesson_id", lessonId)
    .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
    .maybeSingle();
  if (readError) throw readError;

  // Check the gate on the server, not only the phone's copy: a Practice may
  // have been attached since the download.
  const wantsCompletion = totals.completed && existing?.completed !== true;
  const gated = wantsCompletion ? Boolean(await fetchPracticeGate(supabase, lessonId)) : true;

  const write = mergeProgressForSync(existing, totals, { gated });
  if (!write) return;
  const { error: writeError } = await supabase
    .from("lesson_progress")
    .upsert({ student_id: userId, lesson_id: lessonId, ...write }, { onConflict: "student_id,lesson_id" })
    .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS));
  if (writeError) throw writeError;
}

async function updateLocalGrade(item: OfflineQueueItem, slideId: string, isCorrect: boolean | null) {
  if (isCorrect === null) return;
  const local = await getLocalSlideResponses(item.ownerId, item.lessonId).catch(() => null);
  const entry = local?.bySlide[slideId];
  if (!entry || entry.isCorrect === isCorrect) return;
  await putLocalSlideResponses(item.ownerId, item.lessonId, { [slideId]: { ...entry, isCorrect } }).catch(
    () => undefined
  );
}

async function runSync(supabase: SupabaseClient<Database>): Promise<SyncResult> {
  const empty = { synced: 0, failed: 0, dropped: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ...empty, remaining: await remainingCount(), skipped: "offline" };
  }

  const queued = await getQueuedUpdates().catch(() => [] as ProgressQueueItem[]);
  if (queued.length === 0) return { ...empty, remaining: 0 };

  const userId = await verifiedUserId(supabase);
  if (userId === "offline") return { ...empty, remaining: queued.length, skipped: "offline" };
  if (!userId) return { ...empty, remaining: queued.length, skipped: "signed_out" };

  const { mine, foreign, invalid } = partitionQueueByOwner(queued, userId);
  // Removal compares against the stored item (normalizing rewrites v1 items).
  const storedById = new Map(queued.map((item) => [item.id, item]));
  const stored = (items: OfflineQueueItem[]) =>
    items.map((item) => storedById.get(item.id) ?? item);
  let dropped = 0;
  // Another account's items stay for that account (its session may have
  // ended without logOut, e.g. a logout or password change on another
  // phone) unless they have waited 30 days. Unreadable ones never sync.
  const expired = foreign.filter((item) => otherAccountItemExpired(item.timestamp));
  const otherAccounts = foreign.length - expired.length;
  const unusable = [...expired, ...invalid].map((item) => item.id).filter((id): id is number => typeof id === "number");
  if (unusable.length > 0) {
    await clearQueuedUpdates(unusable).catch(() => undefined);
    dropped += unusable.length;
  }

  let synced = 0;
  let failed = 0;
  let networkDown = false;

  const byLesson = new Map<string, OfflineQueueItem[]>();
  for (const item of mine) {
    const list = byLesson.get(item.lessonId) ?? [];
    list.push(item);
    byLesson.set(item.lessonId, list);
  }

  for (const [lessonId, items] of byLesson) {
    const progressItems = items.filter((item) => item.kind === "progress" || item.kind === "complete");
    const responseItems = items
      .filter((item) => item.kind === "slide_response")
      .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    if (networkDown) {
      failed += items.length;
      continue;
    }

    if (progressItems.length > 0) {
      try {
        await syncLessonProgress(supabase, userId, lessonId, progressItems);
        await removeQueueItemsIfUnchanged(stored(progressItems));
        synced += progressItems.length;
      } catch {
        failed += progressItems.length;
      }
    }

    for (const [index, item] of responseItems.entries()) {
      const slideId = typeof item.data.slideId === "string" ? item.data.slideId : null;
      if (!slideId) {
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        dropped += 1;
        continue;
      }
      const result = await postSlideResponse(lessonId, slideId, item.data.answer, {
        timeSpentSeconds: typeof item.data.timeSpentSeconds === "number" ? item.data.timeSpentSeconds : undefined,
      });
      if (result.ok) {
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        await updateLocalGrade(item, slideId, result.isCorrect);
        synced += 1;
      } else if (!result.retryable) {
        // The slide was removed or the lesson unpublished: it can never succeed.
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        dropped += 1;
      } else {
        failed += 1;
        if (result.status === null) {
          // No connection after all: don't wait out a timeout per item.
          networkDown = true;
          failed += responseItems.length - index - 1;
          break;
        }
      }
    }
  }

  return { synced, failed, dropped, otherAccounts, remaining: await remainingCount() };
}

let syncInFlight: Promise<SyncResult> | null = null;

/**
 * Sends everything queued on this phone for the verified user. Safe to call
 * from several places at once (one run is shared, and other tabs are skipped
 * while one is syncing). Never throws.
 */
export function syncOfflineQueue({
  supabase,
}: { supabase?: SupabaseClient<Database> } = {}): Promise<SyncResult> {
  if (syncInFlight) return syncInFlight;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // Don't even create the auth client offline: its start-up refresh of an
    // expired token retries for ~25 s and holds the auth lock meanwhile.
    return remainingCount().then((remaining) => ({ synced: 0, failed: 0, dropped: 0, remaining, skipped: "offline" }));
  }

  const run = async (): Promise<SyncResult> => {
    const client = supabase ?? createClient();
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks?.request) return runSync(client);
    return locks.request("amal-offline-sync", { ifAvailable: true }, async (lock) => {
      if (!lock) return { synced: 0, failed: 0, dropped: 0, remaining: await remainingCount(), skipped: "busy" as const };
      return runSync(client);
    });
  };

  const promise = run()
    .catch(async () => ({ synced: 0, failed: 0, dropped: 0, remaining: await remainingCount() }))
    .finally(() => {
      if (syncInFlight === promise) syncInFlight = null;
    });
  syncInFlight = promise;
  return promise;
}
