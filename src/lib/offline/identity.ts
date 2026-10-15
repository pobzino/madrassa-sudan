/**
 * Who the downloads on this phone belong to, without asking the network.
 *
 * DashboardLayout calls saveOwner() after a verified (network) getUser and
 * profile load. The offline hub, the offline player and sync read the owner
 * with getOwner(), which never touches the network — offline, an expired
 * access token makes supabase.auth calls retry for ~25 s and then report no
 * session, so they can't be used to decide whose lessons to show.
 */

import {
  OWNER_META_KEY,
  clearPrivateOfflineData,
  getAllOfflineLessons,
  getMeta,
  getOfflineLesson,
  getQueuedUpdates,
  normalizeQueueItem,
  putMeta,
  putMetaIfAbsent,
  stampLessonOwner,
  type OfflineLesson,
  type ProgressQueueItem,
} from "./db";
import { LEGACY_OWNER_KEY } from "./cache-names";

export interface OfflineOwner {
  key: typeof OWNER_META_KEY;
  userId: string;
  fullName: string;
  role: string | null;
  savedAt: string;
}

export interface OwnerProfile {
  id: string;
  full_name?: string | null;
  role?: string | null;
}

// Re-stamp savedAt at most this often when nothing else changed.
const REFRESH_SAVED_AT_MS = 60 * 60 * 1000;

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function buildOwnerRecord(profile: OwnerProfile, now: Date = new Date()): OfflineOwner {
  return {
    key: OWNER_META_KEY,
    userId: profile.id,
    fullName: profile.full_name?.trim() || "",
    role: profile.role ?? null,
    savedAt: now.toISOString(),
  };
}

/** True when the phone's downloads belong to someone other than `userId`. */
export function needsAccountSwitch(current: Pick<OfflineOwner, "userId"> | null, userId: string): boolean {
  return Boolean(current && current.userId !== userId);
}

/** A record counts as downloaded only for the account that saved it. */
export function ownsRecord(
  record: { ownerId?: string } | null | undefined,
  owner: Pick<OfflineOwner, "userId"> | null | undefined
): boolean {
  return Boolean(record && owner && record.ownerId === owner.userId);
}

/**
 * With no owner record, stored data is kept only when every lesson and queued
 * item can be attributed to `userId`; anything else may be another family's.
 */
export function storedDataBelongsTo(
  userId: string,
  lessons: Pick<OfflineLesson, "ownerId">[],
  queue: ProgressQueueItem[]
): boolean {
  return (
    lessons.every((lesson) => lesson.ownerId === userId) &&
    queue.every((item) => normalizeQueueItem(item)?.ownerId === userId)
  );
}

function ownerUnchanged(current: OfflineOwner, next: OfflineOwner, now: Date) {
  return (
    current.userId === next.userId &&
    current.fullName === next.fullName &&
    current.role === next.role &&
    now.getTime() - Date.parse(current.savedAt) < REFRESH_SAVED_AT_MS
  );
}

// ── Storage ──────────────────────────────────────────────────────────────────

function readLegacyOwner(): string | null {
  try {
    return window.localStorage.getItem(LEGACY_OWNER_KEY);
  } catch {
    return null;
  }
}

function removeLegacyOwner() {
  try {
    window.localStorage.removeItem(LEGACY_OWNER_KEY);
  } catch {
    // Storage unavailable; logout removes it too.
  }
}

/** Like getOwner, but a storage failure throws instead of reading as "no owner". */
async function readOwnerStrict(): Promise<OfflineOwner | null> {
  const record = await getMeta<OfflineOwner>(OWNER_META_KEY);
  return record && typeof record.userId === "string" ? record : null;
}

/** The owner of this phone's downloads, or null. Local only — never calls the network. */
export async function getOwner(): Promise<OfflineOwner | null> {
  try {
    return await readOwnerStrict();
  } catch {
    return null;
  }
}

let claim: { userId: string; promise: Promise<OfflineOwner | null> } | null = null;

/**
 * Makes `userId` the owner of offline storage, clearing anything saved by a
 * different account first. Returns the existing owner record when it is
 * already `userId`, otherwise null (the caller writes a new one).
 */
async function claimStorage(userId: string): Promise<OfflineOwner | null> {
  // Strict reads: a failed read must never be mistaken for "nothing stored"
  // (that would hand another family's downloads to this account).
  const existing = await readOwnerStrict();
  if (existing) {
    if (!needsAccountSwitch(existing, userId)) return existing;
    await clearPrivateOfflineData();
    return null;
  }

  // No owner record: storage from before schema 2 (marked in localStorage),
  // or a phone that never saved anything.
  const legacyOwner = readLegacyOwner();
  if (legacyOwner && legacyOwner !== userId) {
    await clearPrivateOfflineData();
    return null;
  }
  if (legacyOwner === userId) {
    await stampLessonOwner(userId);
    removeLegacyOwner();
    return null;
  }

  const [lessons, queue] = await Promise.all([getAllOfflineLessons(), getQueuedUpdates()]);
  if (!storedDataBelongsTo(userId, lessons, queue)) await clearPrivateOfflineData();
  return null;
}

function claimOnce(userId: string): Promise<OfflineOwner | null> {
  if (claim?.userId === userId) return claim.promise;
  const promise = claimStorage(userId).finally(() => {
    if (claim?.promise === promise) claim = null;
  });
  claim = { userId, promise };
  return promise;
}

/**
 * Records the verified user as the owner of this phone's downloads. Call only
 * after a network-verified getUser and profile load. On an account switch,
 * the previous account's downloads, queue and caches are cleared first.
 * Rejects if offline storage can't be read (callers should catch and move on).
 */
export async function saveOwner(profile: OwnerProfile): Promise<OfflineOwner> {
  const now = new Date();
  const existing = await claimOnce(profile.id);
  const next = buildOwnerRecord(profile, now);
  if (existing && ownerUnchanged(existing, next, now)) return existing;
  await putMeta(next);
  return next;
}

/**
 * Clears storage saved by a different account, without writing a new owner
 * record (no profile available). For older callers via
 * prepareOfflineStorageForUser; prefer saveOwner.
 */
export async function ensureOfflineOwner(userId: string): Promise<void> {
  await claimOnce(userId);
}

/**
 * Records `profile` (a network-verified user) as the owner only when that
 * needs no clearing: no owner yet and nothing stored from anyone else.
 * Returns the owner record, or null when an account switch is needed —
 * that is saveOwner's job (it clears first), never a download's. Lets a
 * download started before DashboardLayout's saveOwner finished go ahead.
 */
export async function adoptOwnerIfUnclaimed(profile: OwnerProfile): Promise<OfflineOwner | null> {
  const existing = await readOwnerStrict();
  if (existing) return existing.userId === profile.id ? existing : null;

  const legacyOwner = readLegacyOwner();
  if (legacyOwner && legacyOwner !== profile.id) return null;
  if (legacyOwner === profile.id) {
    await stampLessonOwner(profile.id);
  } else {
    const [lessons, queue] = await Promise.all([getAllOfflineLessons(), getQueuedUpdates()]);
    if (!storedDataBelongsTo(profile.id, lessons, queue)) return null;
  }

  const record = buildOwnerRecord(profile);
  // Don't overwrite a fuller record saveOwner wrote meanwhile.
  if (!(await putMetaIfAbsent(record))) {
    const current = await getOwner();
    return current?.userId === profile.id ? current : null;
  }
  removeLegacyOwner();
  return record;
}

/** A saved lesson, only if it belongs to the current owner (otherwise treated as not downloaded). */
export async function getOwnedOfflineLesson(lessonId: string): Promise<OfflineLesson | null> {
  const [owner, lesson] = await Promise.all([getOwner(), getOfflineLesson(lessonId)]);
  return ownsRecord(lesson, owner) ? lesson : null;
}

/** Every saved lesson that belongs to the current owner. */
export async function getOwnedOfflineLessons(): Promise<OfflineLesson[]> {
  const [owner, lessons] = await Promise.all([getOwner(), getAllOfflineLessons()]);
  return lessons.filter((lesson) => ownsRecord(lesson, owner));
}
