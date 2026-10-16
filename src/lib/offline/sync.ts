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
 *     removed only after the server confirmed them, refused them for good,
 *     or failed them on its side about ten times over at least two weeks
 *     (time without a connection never counts). Server errors back off to
 *     once a day; items for a lesson the server refuses this account wait a
 *     day between tries, for up to a month.
 * <OfflineSyncRunner/> in the root layout calls syncOfflineQueue on app open
 * and on every `online` event; logout calls it before clearing.
 */

import { isAuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LEARNER_HEADER } from "@/lib/learners/types";
import { createClient } from "@/lib/supabase/client";
import {
  answerSupersedes,
  clearQueuedUpdates,
  countQueuedUpdates,
  getLocalProgress,
  getOfflineLesson,
  getQueuedUpdates,
  getStorageEpoch,
  localProgressKey,
  queueLessonCompleteItem,
  normalizeQueueItem,
  putMeta,
  queuedAnswerTime,
  removeQueueItemsIfUnchanged,
  saveLocalProgressAndQueue,
  setQueueItemsRetry,
  type LocalLessonProgress,
  type OfflineLesson,
  type OfflineProgressSnapshot,
  type OfflineQueueItem,
  type ProgressQueueItem,
  type QueueItemRetry,
} from "./db";
import { applyServerGrade, postSlideResponse } from "./slide-responses";

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
  /** Sent with a completion so the server marks it as synced from offline (measurement). */
  completion_source?: "offline_sync";
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
    ...(completeNow
      ? { completed: true as const, completed_at: clampActivityTime(queued.completedAt, now), completion_source: "offline_sync" as const }
      : {}),
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

/**
 * Lessons in the order to send them: those completed on the phone first,
 * earliest completion first, then the rest in queue order. The server's
 * streak counts each completion's day, and extending a streak one day at a
 * time only works when the days arrive in order.
 */
export function orderLessonsForSync<T extends { completedAt: string | null }>(lessons: T[]): T[] {
  const time = (lesson: T) => (lesson.completedAt ? Date.parse(lesson.completedAt) : Number.NaN);
  return lessons
    .map((lesson, index) => ({ lesson, index, at: time(lesson) }))
    .sort((left, right) => {
      const leftKnown = Number.isFinite(left.at);
      const rightKnown = Number.isFinite(right.at);
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
      if (leftKnown && left.at !== right.at) return left.at - right.at;
      return left.index - right.index;
    })
    .map(({ lesson }) => lesson);
}

// ── Retry rules (unit-tested) ────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Server errors (5xx) are retried at every sync at first, then less and less
// often: 30 min after the third, doubling up to once a day.
const FAILURES_BEFORE_BACKOFF = 3;
const BACKOFF_START_MS = HOUR_MS / 2;
const BACKOFF_MAX_MS = DAY_MS;
// An answer is given up only after the server failed it about ten times AND
// for at least two weeks. Time without a connection never counts.
const GIVE_UP_AFTER_FAILURES = 10;
const GIVE_UP_AFTER_MS = 14 * DAY_MS;
// While the server refuses the lesson (no access), try once a day, for a month.
const PARKED_RETRY_MS = DAY_MS;
const PARKED_EXPIRY_MS = 30 * DAY_MS;

function parsedTime(iso: string | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN;
}

/** Whether a queued item may be sent now (not waiting out a back-off or a refusal). */
export function isQueueItemDue(item: Pick<ProgressQueueItem, "retry">, now: Date = new Date()): boolean {
  const next = parsedTime(item.retry?.nextTryAt);
  return !Number.isFinite(next) || next <= now.getTime();
}

/** Waiting because the server refuses the lesson. */
export function isParked(item: Pick<ProgressQueueItem, "retry">): boolean {
  return typeof item.retry?.rejectedAt === "string";
}

/** Retry state after the server answered with an error (5xx). */
export function afterServerFailure(retry: QueueItemRetry | undefined, status: number, now: Date = new Date()): QueueItemRetry {
  const serverFailures = (retry?.serverFailures ?? 0) + 1;
  const next: QueueItemRetry = {
    serverFailures,
    lastStatus: status,
    firstFailedAt: retry?.firstFailedAt ?? now.toISOString(),
  };
  if (serverFailures >= FAILURES_BEFORE_BACKOFF) {
    const waitMs = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** (serverFailures - FAILURES_BEFORE_BACKOFF));
    next.nextTryAt = new Date(now.getTime() + waitMs).toISOString();
  }
  return next;
}

/** True once an item has failed on the server often enough, for long enough, that it never will succeed. */
export function shouldGiveUp(retry: QueueItemRetry | undefined, now: Date = new Date()): boolean {
  if ((retry?.serverFailures ?? 0) < GIVE_UP_AFTER_FAILURES) return false;
  const first = parsedTime(retry?.firstFailedAt);
  return Number.isFinite(first) && now.getTime() - first >= GIVE_UP_AFTER_MS;
}

/** Retry state while the server refuses access to the lesson: wait a day; the first refusal is kept. */
export function afterAccessRefused(retry: QueueItemRetry | undefined, now: Date = new Date()): QueueItemRetry {
  return {
    ...retry,
    rejectedAt: retry?.rejectedAt ?? now.toISOString(),
    nextTryAt: new Date(now.getTime() + PARKED_RETRY_MS).toISOString(),
  };
}

/** Parked for a month: access isn't coming back. */
export function isParkedTooLong(retry: QueueItemRetry | undefined, now: Date = new Date()): boolean {
  const at = parsedTime(retry?.rejectedAt);
  return Number.isFinite(at) && now.getTime() - at >= PARKED_EXPIRY_MS;
}

/**
 * What a failed lesson_progress write means: 42501 (row-level security) is
 * the server refusing this account the lesson, 23503 (foreign key) a lesson
 * that was deleted; anything else may be temporary.
 */
export function classifyProgressError(error: unknown): "parked" | "gone" | "retry" {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "42501") return "parked";
  if (code === "23503") return "gone";
  return "retry";
}

/**
 * Per slide, the one queued answer to send (the one the server should end up
 * with) and the rest, which it supersedes. The queue keeps one per slide, but
 * items queued by older builds may hold several.
 */
export function pickAnswersToSend(items: OfflineQueueItem[]): { send: OfflineQueueItem[]; superseded: OfflineQueueItem[] } {
  const bySlide = new Map<unknown, OfflineQueueItem[]>();
  for (const item of items) {
    const list = bySlide.get(item.data.slideId) ?? [];
    list.push(item);
    bySlide.set(item.data.slideId, list);
  }
  const version = (item: OfflineQueueItem) => ({
    real: item.data.answer !== null && item.data.answer !== undefined,
    time: queuedAnswerTime(item),
  });
  const send: OfflineQueueItem[] = [];
  const superseded: OfflineQueueItem[] = [];
  for (const list of bySlide.values()) {
    const winner = list.reduce((best, item) => (answerSupersedes(version(item), version(best)) ? item : best));
    send.push(winner);
    superseded.push(...list.filter((item) => item !== winner));
  }
  send.sort((left, right) => (queuedAnswerTime(left) || 0) - (queuedAnswerTime(right) || 0));
  return { send, superseded };
}

// ── Queueing ─────────────────────────────────────────────────────────────────

export interface QueueLessonProgressInput {
  ownerId: string;
  learnerId?: string;
  lessonId: string;
  positionSec: number;
  watchSec: number;
  /** Playback reached the completion point (e.g. 80 %). Ignored for practice-gated lessons. */
  completedCandidate: boolean;
  /** Pass when the caller knows (the online lesson page); otherwise the saved lesson decides. */
  practiceGated?: boolean;
}

function snapshotOf(record: OfflineLesson | null, ownerId: string, learnerId = ownerId): OfflineProgressSnapshot | null {
  // v2 downloads stored the account learner's progress on the shared lesson
  // record. Preserve that snapshot for self after upgrade, but never seed a
  // child's progress from a family-shared legacy record.
  return record && record.ownerId === ownerId && learnerId === ownerId ? record.progress ?? null : null;
}

/**
 * Saves playback progress on the phone and queues it for sync. Values never
 * go down. Returns the progress now stored (unchanged when this update
 * wasn't ahead of it).
 */
export async function queueLessonProgress(input: QueueLessonProgressInput): Promise<ProgressValues> {
  const learnerId = input.learnerId ?? input.ownerId;
  const scoped = { ...input, learnerId };
  // A logout while this runs must not get the previous account's progress written back.
  const epoch = getStorageEpoch();
  const [record, previous] = await Promise.all([
    getOfflineLesson(input.lessonId).catch(() => null),
    getLocalProgress(input.ownerId, input.lessonId, learnerId),
  ]);
  const gated = resolvePracticeGated(record, input.practiceGated);
  const next = mergeLocalProgress(previous, snapshotOf(record, input.ownerId, learnerId), scoped, gated);

  // A copy saved before the gate was stored: the phone can't know whether
  // Practice must be passed, so it never shows the lesson finished, but it
  // still asks. The sync checks the gate on the server before completing
  // (and the database drops a gated completion anyway). The progress item
  // is replaced on every save, so a request once queued stays in it.
  const gateUnknown = typeof input.practiceGated !== "boolean" && record !== null && record.practice === undefined;
  let requestCompletion = next.completed && !gated;
  let changed = progressIncreased(previous, next);
  if (gateUnknown && !next.completed) {
    const alreadyRequested = await hasQueuedCompletion(input.ownerId, learnerId, input.lessonId).catch(() => false);
    requestCompletion = input.completedCandidate || alreadyRequested;
    if (input.completedCandidate && !alreadyRequested) changed = true;
  }
  if (!changed) return previous ?? next;

  const now = new Date().toISOString();
  const local: LocalLessonProgress = {
    key: localProgressKey(input.ownerId, input.lessonId, learnerId),
    ownerId: input.ownerId,
    learnerId,
    lessonId: input.lessonId,
    ...next,
    updatedAt: now,
  };
  // The queue keeps the first completed_at, so repeating a request is harmless.
  const completesNow = requestCompletion && previous?.completed !== true;
  await saveLocalProgressAndQueue(local, {
    last_position_seconds: next.last_position_seconds,
    total_watch_time_seconds: next.total_watch_time_seconds,
    completed: requestCompletion,
    // When it was finished, kept through later saves (the item's timestamp
    // moves on with every save; streaks count the day it was finished).
    ...(completesNow ? { completed_at: now } : {}),
  }, epoch);
  return next;
}

/** Whether a completion request for this lesson is already waiting to sync. */
async function hasQueuedCompletion(ownerId: string, learnerId: string, lessonId: string): Promise<boolean> {
  const items = await getQueuedUpdates();
  return items.some((item) => {
    const normalized = normalizeQueueItem(item);
    if (!normalized || normalized.ownerId !== ownerId || normalized.learnerId !== learnerId || normalized.lessonId !== lessonId) return false;
    return normalized.kind === "complete" || (normalized.kind === "progress" && normalized.data.completed === true);
  });
}

/**
 * "Mark complete" without a connection. Does nothing (returns false) for a
 * practice-gated lesson — passing the Practice completes those.
 */
export async function queueLessonComplete({
  ownerId,
  learnerId: requestedLearnerId,
  lessonId,
  positionSec = 0,
  practiceGated,
}: {
  ownerId: string;
  learnerId?: string;
  lessonId: string;
  positionSec?: number;
  practiceGated?: boolean;
}): Promise<boolean> {
  const learnerId = requestedLearnerId ?? ownerId;
  const epoch = getStorageEpoch();
  const [record, previous] = await Promise.all([
    getOfflineLesson(lessonId).catch(() => null),
    getLocalProgress(ownerId, lessonId, learnerId),
  ]);
  if (resolvePracticeGated(record, practiceGated)) return false;

  const next = mergeLocalProgress(
    previous,
    snapshotOf(record, ownerId, learnerId),
    { positionSec, watchSec: positionSec, completedCandidate: true },
    false
  );
  const now = new Date().toISOString();
  await putMeta({
    key: localProgressKey(ownerId, lessonId, learnerId),
    ownerId,
    learnerId,
    lessonId,
    ...next,
    updatedAt: now,
  } satisfies LocalLessonProgress, epoch);
  await queueLessonCompleteItem({
    lessonId,
    ownerId,
    learnerId,
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
export async function getEffectiveLessonProgress(ownerId: string, lessonId: string, learnerId = ownerId): Promise<ProgressValues> {
  const [record, local] = await Promise.all([
    getOfflineLesson(lessonId).catch(() => null),
    getLocalProgress(ownerId, lessonId, learnerId).catch(() => null),
  ]);
  return mergeLocalProgress(local, snapshotOf(record, ownerId, learnerId), { positionSec: 0, watchSec: 0, completedCandidate: false }, true);
}

/**
 * Items waiting to sync (for `ownerId` only, when given). Items parked
 * because the server refuses the lesson are left out: they can't be sent
 * until a teacher restores access, so they shouldn't hold up a "waiting"
 * notice or a logout. 0 when storage can't be read.
 */
export async function countUnsyncedItems(ownerId?: string): Promise<number> {
  try {
    const items = await getQueuedUpdates();
    return items.filter(
      (item) => !isParked(item) && (!ownerId || normalizeQueueItem(item)?.ownerId === ownerId)
    ).length;
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
  /**
   * Items removed without being saved by the server: unreadable, another
   * account's past 30 days, replaced by a newer answer to the same slide,
   * rejected for good, or given up on (see the rules at the top).
   */
  dropped: number;
  /** Lessons with progress or answers the server saved in this run (for analytics). */
  lessons?: number;
  /** Answers the server saved in this run. */
  answers?: number;
  /** Other accounts' items left queued for them to send when they sign in here (counted in `remaining`). */
  otherAccounts?: number;
  /** Queued writes discarded because the learner was deleted or no longer belongs to this family. */
  learnerDataDropped?: number;
  /** Why nothing was attempted, when that happened. */
  skipped?: "offline" | "signed_out" | "busy" | "learner_validation_failed";
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
  learnerId: string,
  lessonId: string,
  items: OfflineQueueItem[]
): Promise<void> {
  const totals = summarizeProgressItems(items);

  const { data: existing, error: readError } = await supabase
    .from("lesson_progress")
    .select("last_position_seconds, total_watch_time_seconds, completed, completed_at")
    .eq("student_id", learnerId)
    .eq("lesson_id", lessonId)
    .setHeader(LEARNER_HEADER, learnerId)
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
    .upsert({ student_id: learnerId, lesson_id: lessonId, ...write }, { onConflict: "student_id,lesson_id" })
    .setHeader(LEARNER_HEADER, learnerId)
    .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS));
  if (writeError) throw writeError;
}

/** The server's grade, onto the phone's copy only if that is still the answer that was sent. */
async function updateLocalGrade(item: OfflineQueueItem, slideId: string, isCorrect: boolean | null) {
  if (isCorrect === null) return;
  await applyServerGrade(item.ownerId, item.lessonId, slideId, item.data, isCorrect, undefined, item.learnerId).catch(() => undefined);
}

async function fetchOwnedLearnerIds(accountId: string): Promise<Set<string> | null> {
  try {
    const response = await fetch("/api/learners", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { accountId?: unknown; learners?: Array<{ id?: unknown }> };
    if (body.accountId !== accountId || !Array.isArray(body.learners)) return null;
    const ids = body.learners.map((learner) => learner.id).filter((id): id is string => typeof id === "string");
    return ids.includes(accountId) ? new Set(ids) : null;
  } catch {
    return null;
  }
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

  // Queue ownership is checked on every online sync. A deleted or foreign
  // child may never receive writes just because this device remembers its ID.
  const allowedLearners = await fetchOwnedLearnerIds(userId);
  if (!allowedLearners) return { ...empty, remaining: queued.length, skipped: "learner_validation_failed" };

  const { mine, foreign, invalid } = partitionQueueByOwner(queued, userId);
  // Removal compares against the stored item (normalizing rewrites v1 items).
  const storedById = new Map(queued.map((item) => [item.id, item]));
  const stored = (items: OfflineQueueItem[]) =>
    items.map((item) => storedById.get(item.id) ?? item);
  let dropped = 0;
  let learnerDataDropped = 0;
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

  const noLongerOwned = mine.filter((item) => !allowedLearners.has(item.learnerId));
  const noLongerOwnedIds = noLongerOwned.map((item) => item.id).filter((id): id is number => typeof id === "number");
  if (noLongerOwnedIds.length > 0) {
    await clearQueuedUpdates(noLongerOwnedIds).catch(() => undefined);
    dropped += noLongerOwnedIds.length;
    learnerDataDropped += noLongerOwnedIds.length;
  }

  let synced = 0;
  const syncedLessons = new Set<string>();
  let syncedAnswers = 0;
  let failed = 0;
  let networkDown = false;
  const now = new Date();

  const byLesson = new Map<string, OfflineQueueItem[]>();
  for (const item of mine.filter((candidate) => allowedLearners.has(candidate.learnerId))) {
    const key = `${item.learnerId}\u0000${item.lessonId}`;
    const list = byLesson.get(key) ?? [];
    list.push(item);
    byLesson.set(key, list);
  }
  const lessons = orderLessonsForSync(
    [...byLesson].map(([key, items]) => ({
      learnerId: items[0].learnerId,
      lessonId: key.slice(key.indexOf("\u0000") + 1),
      items,
      completedAt: summarizeProgressItems(items).completedAt,
    }))
  );

  const park = (items: OfflineQueueItem[]) =>
    setQueueItemsRetry(stored(items).map((item) => ({ item, retry: afterAccessRefused(item.retry, now) }))).catch(
      () => undefined
    );

  for (const { learnerId, lessonId, items: lessonItems } of lessons) {
    if (networkDown) {
      failed += lessonItems.length;
      continue;
    }

    // Refused for a month: the family won't get this lesson back.
    const expired = lessonItems.filter((item) => isParkedTooLong(item.retry, now));
    if (expired.length > 0) {
      await removeQueueItemsIfUnchanged(stored(expired)).catch(() => undefined);
      dropped += expired.length;
    }
    const items = lessonItems.filter((item) => !expired.includes(item));
    const progressItems = items.filter((item) => item.kind === "progress" || item.kind === "complete");
    const responseItems = items.filter((item) => item.kind === "slide_response");

    // A lesson's progress and answers wait (or go) together: while the server
    // refuses this account the lesson, its answers would be refused too.
    let lessonParked = false;
    if (progressItems.length > 0) {
      if (!progressItems.some((item) => isQueueItemDue(item, now))) {
        lessonParked = true;
      } else {
        try {
          await syncLessonProgress(supabase, learnerId, lessonId, progressItems);
          await removeQueueItemsIfUnchanged(stored(progressItems));
          synced += progressItems.length;
          syncedLessons.add(lessonId);
        } catch (error) {
          const outcome = classifyProgressError(error);
          if (outcome === "gone") {
            await removeQueueItemsIfUnchanged(stored(progressItems)).catch(() => undefined);
            dropped += progressItems.length;
          } else {
            if (outcome === "parked") {
              await park(progressItems);
              lessonParked = true;
            }
            failed += progressItems.length;
          }
        }
      }
    }

    if (lessonParked) {
      await park(responseItems.filter((item) => isQueueItemDue(item, now)));
      failed += responseItems.length;
      continue;
    }

    const { send, superseded } = pickAnswersToSend(responseItems);
    if (superseded.length > 0) {
      // Older answers to a slide with a newer one queued: the newer one replaces them on the server anyway.
      await removeQueueItemsIfUnchanged(stored(superseded)).catch(() => undefined);
      dropped += superseded.length;
    }

    for (const [index, item] of send.entries()) {
      if (!isQueueItemDue(item, now)) continue; // waiting out a back-off or a refusal
      const slideId = typeof item.data.slideId === "string" ? item.data.slideId : null;
      if (!slideId) {
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        dropped += 1;
        continue;
      }
      const answeredAt = queuedAnswerTime(item);
      const result = await postSlideResponse(lessonId, slideId, item.data.answer, {
        timeSpentSeconds: typeof item.data.timeSpentSeconds === "number" ? item.data.timeSpentSeconds : undefined,
        answeredAt: Number.isFinite(answeredAt) ? new Date(answeredAt).toISOString() : undefined,
        answerId: typeof item.data.answerId === "string" ? item.data.answerId : undefined,
        learnerId: item.learnerId,
      });
      if (result.ok) {
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        // `stale`: the server already had a newer answer; the phone's grade stays.
        if (!result.stale) await updateLocalGrade(item, slideId, result.isCorrect);
        synced += 1;
        syncedAnswers += 1;
        syncedLessons.add(lessonId);
      } else if (result.outcome === "gone") {
        // The slide was removed, the lesson deleted, or the answer refused for good.
        await removeQueueItemsIfUnchanged(stored([item])).catch(() => undefined);
        dropped += 1;
      } else if (result.outcome === "parked") {
        await park([item]);
        failed += 1;
      } else if (result.status === null) {
        // No connection after all: don't wait out a timeout per item.
        networkDown = true;
        failed += send.length - index;
        break;
      } else if (result.status >= 500) {
        // The server answered with an error: count it, back off, and give up
        // only after many failures over weeks (never for time offline).
        const [original] = stored([item]);
        const retry = afterServerFailure(item.retry, result.status, now);
        if (shouldGiveUp(retry, now)) {
          await removeQueueItemsIfUnchanged([original]).catch(() => undefined);
          dropped += 1;
        } else {
          await setQueueItemsRetry([{ item: original, retry }]).catch(() => undefined);
          failed += 1;
        }
      } else {
        // Signed out, timed out or rate limited: try again next time, uncounted.
        failed += 1;
      }
    }
  }

  return {
    synced,
    failed,
    dropped,
    lessons: syncedLessons.size,
    answers: syncedAnswers,
    otherAccounts,
    learnerDataDropped,
    remaining: await remainingCount(),
  };
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
