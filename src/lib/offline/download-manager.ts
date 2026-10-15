/**
 * Download manager for offline lesson storage.
 *
 * Saves everything a lesson needs to play with no connection: the lesson
 * data, the sim (with `audio_url` nulled — signed URLs expire), the narration
 * audio, slide and activity images, the practice gate, a progress snapshot,
 * saved answers and the previous/next lessons. Nothing is marked downloaded
 * until all of it arrived; a failed re-download keeps the old copy (the new
 * audio goes under its own key until the record commits). Downloads run one
 * at a time to keep memory low on small phones.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SimPayload } from "@/lib/sim.types";
import type { Slide } from "@/lib/slides.types";
import { loadLessonNavigation } from "@/lib/lessons/path-navigation";
import {
  AssetDownloadError,
  cacheLessonAssets,
  collectSimAssetUrls,
  deleteAssetsFromCache,
  deleteUnreferencedAssets,
  pruneOrphanedAssets,
  type CachedAssets,
} from "./assets";
import { AUDIO_CACHE, offlineAudioKey } from "./cache-names";
import {
  StorageClearedError,
  audioKeyFor,
  cacheSimAudio,
  commitOfflineLesson,
  deleteCachedSimAudio,
  deleteDownloadState,
  getAllDownloadStates,
  getAllOfflineLessons,
  getCachedSimAudioSize,
  getOfflineLesson,
  getStorageEpoch,
  newOfflineAudioKey,
  onPrivateDataCleared,
  putLocalSlideResponses,
  removeOfflineLessonRecord,
  setDownloadState,
  updateOfflineLesson,
  type DownloadErrorCode,
  type DownloadState,
  type LocalSlideResponse,
  type OfflineLesson,
  type OfflineNeighbor,
  type OfflineOrigin,
  type SlideLanguageMode,
} from "./db";
import { adoptOwnerIfUnclaimed, getOwner, type OfflineOwner } from "./identity";
import { serverResponsesToLocal } from "./slide-responses";
import { canSaveOfflineHere } from "./support";
import { fetchPracticeGate, withTimeout } from "./sync";
import { warmOfflinePlayerChunks } from "./warm";

export type ProgressCallback = (state: DownloadState) => void;

export interface DownloadOptions {
  /** "auto" for Wi-Fi background downloads; a manual save of the same lesson always wins. */
  origin?: OfflineOrigin;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export const DOWNLOAD_ERROR_MESSAGES: Record<DownloadErrorCode, { en: string; ar: string }> = {
  offline: {
    en: "Connect to the internet to save this lesson.",
    ar: "اتصل بالإنترنت لحفظ هذا الدرس.",
  },
  signed_out: {
    en: "Open Amal while online and signed in, then try again.",
    ar: "افتح آمال وأنت متصل بالإنترنت ومسجّل الدخول، ثم حاول مرة أخرى.",
  },
  not_found: {
    en: "This lesson isn't available right now.",
    ar: "هذا الدرس غير متاح الآن.",
  },
  no_audio: {
    en: "This lesson can't be saved for offline yet.",
    ar: "لا يمكن حفظ هذا الدرس للمشاهدة بدون إنترنت بعد.",
  },
  network: {
    en: "The download stopped. Check your connection and try again.",
    ar: "توقف التنزيل. تحقق من اتصالك وحاول مرة أخرى.",
  },
  // "May": browsers can't tell how full the phone is, only that a write failed.
  storage_full: {
    en: "This phone may be full. Free some space or remove a saved lesson, then try again.",
    ar: "قد تكون مساحة هذا الهاتف ممتلئة. أفرغ بعض المساحة أو احذف درسًا محفوظًا، ثم حاول مرة أخرى.",
  },
  interrupted: {
    en: "Saving stopped because Amal was closed or the screen locked. Keep Amal open and try again.",
    ar: "توقف الحفظ لأن آمال أُغلق أو أُقفلت الشاشة. أبقِ آمال مفتوحًا وحاول مرة أخرى.",
  },
  unsupported: {
    en: "This browser can't keep lessons for offline. Open Amal in Safari, Chrome or the installed app.",
    ar: "لا يستطيع هذا المتصفح حفظ الدروس للمشاهدة بدون إنترنت. افتح آمال في Safari أو Chrome أو التطبيق المثبّت.",
  },
  unknown: {
    en: "Could not save this lesson. Try again.",
    ar: "تعذّر حفظ هذا الدرس. حاول مرة أخرى.",
  },
};

/** Shown on a saved lesson whose audio format this browser reported it can't play. */
export const AUDIO_FORMAT_WARNING = {
  en: "This phone may not be able to play this lesson's audio.",
  ar: "قد لا يتمكن هذا الهاتف من تشغيل صوت هذا الدرس.",
};

/** Shown on a saved lesson with images that are gone online too (`missingAssetUrls`). */
export const MISSING_IMAGES_WARNING = {
  en: "Some pictures in this lesson couldn't be saved.",
  ar: "تعذّر حفظ بعض الصور في هذا الدرس.",
};

/** Shown while a save runs: a locked or closed app stops it, and it starts again from the beginning. */
export const KEEP_OPEN_WHILE_SAVING = {
  en: "Keep Amal open and the screen on until saving finishes.",
  ar: "أبقِ آمال مفتوحًا والشاشة مضاءة حتى ينتهي الحفظ.",
};

export function downloadErrorMessage(
  code: DownloadErrorCode | undefined,
  language: "ar" | "en"
): string {
  return DOWNLOAD_ERROR_MESSAGES[code ?? "unknown"][language];
}

export class DownloadError extends Error {
  constructor(readonly code: DownloadErrorCode) {
    super(DOWNLOAD_ERROR_MESSAGES[code].en);
    this.name = "DownloadError";
  }
}

/** Thrown when a download is cancelled (by the family, a newer download of the same lesson, or logout). */
export class DownloadCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "DownloadCancelledError";
  }
}

export function isDownloadCancelled(error: unknown): boolean {
  return error instanceof DownloadCancelledError;
}

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

const AUDIO_EXTENSION_MIME: Record<string, string> = {
  webm: "audio/webm",
  weba: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
};

function isMediaType(value: string | null | undefined): value is string {
  const base = value?.split(";")[0].trim().toLowerCase() ?? "";
  return base.startsWith("audio/") || base.startsWith("video/");
}

/**
 * The audio's real MIME type: the sim's recorded `audio_mime`, else the
 * response Content-Type, else the file extension. Null when none is known —
 * never a guessed default (Safari refuses blobs with the wrong type).
 */
export function pickAudioMime(
  simMime: string | null | undefined,
  responseType: string | null | undefined,
  pathOrUrl: string | null | undefined
): string | null {
  if (isMediaType(simMime)) return simMime.trim();
  if (isMediaType(responseType)) return responseType.trim();
  const path = (pathOrUrl ?? "").split(/[?#]/)[0];
  const extension = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "" : "";
  return AUDIO_EXTENSION_MIME[extension] ?? null;
}

/** True when the server's sim differs from the saved one (re-recorded or edited). */
export function isSimOutdated(
  saved: { simId?: string | null; simUpdatedAt?: string | null },
  server: { id: string; updated_at: string }
): boolean {
  if (!saved.simId || !saved.simUpdatedAt) return true;
  if (saved.simId !== server.id) return true;
  const savedTime = Date.parse(saved.simUpdatedAt);
  const serverTime = Date.parse(server.updated_at);
  if (Number.isFinite(savedTime) && Number.isFinite(serverTime)) return serverTime > savedTime;
  return saved.simUpdatedAt !== server.updated_at;
}

function isQuotaError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  const code = (error as { code?: unknown } | null)?.code;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22;
}

/**
 * The reason to show for a failed download. `writing`: it failed while saving
 * to the phone (from the images on), where an error that isn't the network
 * means storage: on a full phone Chrome often reports UnknownError or
 * InvalidStateError rather than QuotaExceededError. Exported for tests.
 */
export function toDownloadError(error: unknown, writing = false): DownloadError {
  if (error instanceof DownloadError) return error;
  if (isQuotaError(error)) return new DownloadError("storage_full");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new DownloadError("offline");
  if (error instanceof AssetDownloadError) return new DownloadError("network");
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TypeError" || name === "TimeoutError" || name === "AbortError") return new DownloadError("network");
  // Before the Supabase check: IndexedDB's DOMExceptions have a `code` too.
  if (writing) return new DownloadError("storage_full");
  // Supabase reports failures as plain { message, code } objects.
  if (error && typeof error === "object" && "message" in error && "code" in error) return new DownloadError("network");
  return new DownloadError("unknown");
}

// ── Active downloads ─────────────────────────────────────────────────────────

const activeDownloads = new Map<string, AbortController>();
let downloadChain: Promise<unknown> = Promise.resolve();
let persistRequested = false;

// Logout (in this tab or another) stops downloads before storage is wiped.
onPrivateDataCleared(() => abortAllDownloads());

function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = downloadChain.then(task, task);
  downloadChain = run.catch(() => undefined);
  return run;
}

export function cancelDownload(lessonId: string): void {
  const controller = activeDownloads.get(lessonId);
  if (controller) {
    controller.abort();
    return;
  }
  // A state left by a download that died with the page has no controller;
  // what that download stored but never committed can go too.
  void deleteDownloadState(lessonId)
    .catch(() => undefined)
    .then(() => pruneOrphanedStorage());
}

// Every download holds this lock (shared) while it runs, in every tab of the
// app; pruning takes it alone. So nothing deletes images or audio a download
// stored but hasn't committed yet — in this tab or another (the installed
// app and a browser tab share storage on Android).
const STORAGE_LOCK = "amal-offline-storage";

function lockManager(): LockManager | null {
  return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function" ? navigator.locks : null;
}

function withSharedStorageLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  // No Web Locks (iOS before 15.4): downloads run as before, and nothing prunes.
  if (!locks) return task();
  let started = false;
  const run = () => {
    started = true;
    return task();
  };
  // request() resolves with what the task resolves with. If the browser
  // refuses the lock itself, the download still runs.
  return (locks.request(STORAGE_LOCK, { mode: "shared" }, run) as unknown as Promise<T>).catch((error: unknown) => {
    if (started) throw error;
    return task();
  });
}

/**
 * Deletes images and audio no saved lesson uses: what a download left when
 * the page died between storing them and saving the lesson record. Skipped
 * while any tab is downloading, and where the browser has no Web Locks
 * (pruning another tab's uncommitted files would leave a saved lesson with
 * holes, which is worse than the wasted space). Returns how many it removed.
 */
export async function pruneOrphanedStorage(): Promise<number> {
  const locks = lockManager();
  if (!locks || typeof caches === "undefined") return 0;
  try {
    return await locks.request(STORAGE_LOCK, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock || activeDownloads.size > 0) return 0;
      const epoch = getStorageEpoch();
      const isCurrent = () => epoch === getStorageEpoch();
      const images = await pruneOrphanedAssets(isCurrent);
      const audio = await pruneOrphanedAudio(isCurrent);
      return images + audio;
    });
  } catch {
    return 0;
  }
}

/** Audio entries no lesson record (of any account on this phone) points at. */
async function pruneOrphanedAudio(isCurrent: () => boolean): Promise<number> {
  try {
    // Logout deleted the cache: opening it would create it again.
    if (!(await caches.has(AUDIO_CACHE))) return 0;
    const cache = await caches.open(AUDIO_CACHE);
    // Keys before records: audio committed in between is then kept.
    const requests = await cache.keys();
    // Compared as path + query, both parsed the same way.
    const keyOf = (href: string) => {
      const url = new URL(href, "https://amal.invalid");
      return `${url.pathname}${url.search}`;
    };
    const kept = new Set((await getAllOfflineLessons()).map((lesson) => keyOf(audioKeyFor(lesson))));
    const prefix = offlineAudioKey("");
    const orphans = requests.filter(
      (request) => new URL(request.url).pathname.startsWith(prefix) && !kept.has(keyOf(request.url))
    );
    if (!isCurrent()) return 0;
    await Promise.all(orphans.map((request) => cache.delete(request).catch(() => false)));
    return orphans.length;
  } catch {
    // Couldn't read the records: delete nothing.
    return 0;
  }
}

export function abortAllDownloads(): void {
  for (const controller of activeDownloads.values()) controller.abort();
  activeDownloads.clear();
}

export function isDownloadActive(lessonId: string): boolean {
  return activeDownloads.has(lessonId);
}

/**
 * Downloads left "downloading" by a closed page, a reload or iOS suspending
 * the app have nothing running behind them; mark them interrupted so the UI
 * offers Retry instead of a stuck progress bar. Returns every state after.
 */
export async function reconcileInterruptedDownloads(): Promise<DownloadState[]> {
  const states = await getAllDownloadStates();
  const epoch = getStorageEpoch();
  return Promise.all(
    states.map(async (state) => {
      if (state.status !== "downloading" || activeDownloads.has(state.lessonId)) return state;
      const interrupted: DownloadState = {
        ...state,
        status: "error",
        errorCode: "interrupted",
        error: DOWNLOAD_ERROR_MESSAGES.interrupted.en,
        updatedAt: new Date().toISOString(),
      };
      await setDownloadState(interrupted, epoch).catch(() => undefined);
      return interrupted;
    })
  );
}

// ── Storage ──────────────────────────────────────────────────────────────────

/**
 * Asks the browser not to evict downloads under storage pressure. Downloads
 * call it once per page session (ideally still inside the tap that started
 * one); the "Keep my lessons safe" button passes `force`, since a browser that
 * said no earlier can say yes later (e.g. once the app is installed).
 * Resolves to whether storage is persistent.
 */
export function requestPersistentStorage({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  if ((persistRequested && !force) || typeof navigator === "undefined" || !navigator.storage?.persist) {
    return getPersistenceStatus().then((status) => status === "persisted");
  }
  persistRequested = true;
  return navigator.storage.persist().catch(() => false);
}

export async function getPersistenceStatus(): Promise<"persisted" | "best-effort" | "unsupported"> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
    return (await navigator.storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "unsupported";
  }
}

export async function getStorageEstimate(): Promise<{
  used: number;
  quota: number;
}> {
  try {
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
      };
    }
  } catch {
    // Some private modes throw; report unknown.
  }
  return { used: 0, quota: 0 };
}

const STORAGE_SAFETY_MARGIN = 5 * 1024 * 1024;

/**
 * Fails early when the browser's own allowance for this site would run out
 * (small on old iPhones and in-app browsers). It can't catch a full phone: no
 * browser reports free disk space (Chrome says usage + 10 GB whatever the
 * disk), so a full phone only shows when a write fails (see toDownloadError).
 * The images are already stored when this runs, so `used` counts them.
 */
async function ensureRoomFor(audioBytes: number) {
  const { used, quota } = await getStorageEstimate();
  if (!quota) return; // Unknown: let the writes find out.
  const needed = audioBytes + STORAGE_SAFETY_MARGIN;
  if (quota - used < needed) throw new DownloadError("storage_full");
}

// ── Progress reporting ───────────────────────────────────────────────────────

const UI_UPDATE_INTERVAL_MS = 250;
const STATE_WRITE_INTERVAL_MS = 1000;

function createReporter(lessonId: string, epoch: number, onProgress?: ProgressCallback) {
  let state: DownloadState = {
    lessonId,
    status: "downloading",
    progress: 0,
    totalBytes: 0,
    downloadedBytes: 0,
  };
  let lastEmit = 0;
  let lastEmittedProgress = -1;
  let lastWrite = 0;

  const persist = () => {
    if (epoch !== getStorageEpoch()) return;
    lastWrite = Date.now();
    void setDownloadState(state, epoch).catch(() => undefined);
  };

  return {
    get state() {
      return state;
    },
    update(partial: Partial<DownloadState>, force = false) {
      state = { ...state, ...partial, lessonId, updatedAt: new Date().toISOString() };
      const now = Date.now();
      const progressStep = Math.floor(state.progress) !== Math.floor(lastEmittedProgress);
      if (force || (progressStep && now - lastEmit >= UI_UPDATE_INTERVAL_MS)) {
        lastEmit = now;
        lastEmittedProgress = state.progress;
        onProgress?.(state);
      }
      if (force || now - lastWrite >= STATE_WRITE_INTERVAL_MS) persist();
    },
  };
}

type Reporter = ReturnType<typeof createReporter>;

// ── Fetching ─────────────────────────────────────────────────────────────────

// Lie-fi can leave a request hanging for minutes. Past these limits the
// download fails as a network error (cancelling stays a separate thing).
const METADATA_TIMEOUT_MS = 45_000;
// Previous/next links are a nicety: a slow lookup (3-6 queries in a row on
// 2G) saves the lesson without them rather than holding the queue.
const NAVIGATION_TIMEOUT_MS = 15_000;
const AUDIO_STALL_TIMEOUT_MS = 30_000;
// How long the "is the connection really up?" check may take before an
// unreachable image counts as the connection's fault.
const ONLINE_CHECK_TIMEOUT_MS = 10_000;

/** A signal that aborts with `parent`, or on its own via `abort()`; `dispose()` unhooks it. */
function childSignal(parent: AbortSignal, timeoutMs?: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | null = timeoutMs ? setTimeout(abort, timeoutMs) : null;
  return {
    signal: controller.signal,
    abort,
    /** Restarts the timeout (for "no progress for N seconds"). */
    touch() {
      if (!timeoutMs) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(abort, timeoutMs);
    },
    dispose() {
      parent.removeEventListener("abort", abort);
      if (timer) clearTimeout(timer);
    },
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, credentials: "same-origin" });
  if (response.status === 401) throw new DownloadError("signed_out");
  if (response.status === 403 || response.status === 404) throw new DownloadError("not_found");
  if (!response.ok) throw new DownloadError("network");
  return (await response.json()) as T;
}

const AUTH_TIMEOUT_MS = 5_000;

/**
 * The owner record for the signed-in account. When DashboardLayout hasn't
 * saved one yet (a tap right after the page opened), the user is verified on
 * the network and adopted — unless another account's downloads are on the
 * phone, which only saveOwner may clear.
 */
async function resolveDownloadOwner(supabase: SupabaseClient<Database>): Promise<OfflineOwner> {
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS);
    const sessionUserId = data.session?.user.id;
    if (!sessionUserId) throw new DownloadError("signed_out");

    const owner = await getOwner();
    if (owner?.userId === sessionUserId) return owner;
    if (owner) throw new DownloadError("signed_out");

    const { data: verified } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    const user = verified.user;
    if (!user || user.id !== sessionUserId) throw new DownloadError("signed_out");
    const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
    const adopted = await adoptOwnerIfUnclaimed({ id: user.id, full_name: fullName });
    if (!adopted) throw new DownloadError("signed_out");
    return adopted;
  } catch (error) {
    throw error instanceof DownloadError ? error : new DownloadError("network");
  }
}

interface LessonBundle {
  lesson: {
    id: string;
    title_ar: string;
    title_en: string;
    description_ar: string | null;
    description_en: string | null;
    grade_level: number;
    subject_id: string;
    thumbnail_url: string | null;
    video_url_720p: string | null;
    quiz_settings: unknown;
    updated_at: string;
    subjects: unknown;
  };
  sim: SimPayload;
  slides: unknown[] | null;
  slideLanguageMode: SlideLanguageMode | null;
  questions: unknown[];
  tasks: unknown[];
  practiceAssignmentId: string | null;
  progress: { last_position_seconds: number; total_watch_time_seconds: number; completed: boolean } | null;
  responses: Record<string, LocalSlideResponse>;
  neighbors: { prev: OfflineNeighbor | null; next: OfflineNeighbor | null };
}

function pickNeighbor(lesson: { id: string; title_ar: string; title_en: string } | null): OfflineNeighbor | null {
  return lesson ? { id: lesson.id, title_ar: lesson.title_ar, title_en: lesson.title_en } : null;
}

async function fetchLessonBundle(
  supabase: SupabaseClient<Database>,
  lessonId: string,
  ownerId: string,
  signal: AbortSignal,
  {
    fallbackNeighbors,
    onLesson,
  }: {
    /** Kept when the previous/next lookup is cut short (a re-save keeps what the old copy had). */
    fallbackNeighbors: LessonBundle["neighbors"] | null;
    /** The lesson row arrived (its title can be shown while the rest loads). */
    onLesson?: (lesson: { title_ar: string; title_en: string }) => void;
  }
): Promise<LessonBundle> {
  const [lessonResult, sim, slidesJson, questionsResult, tasksResult, gate, progressResult, responsesJson] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(
          "id, title_ar, title_en, description_ar, description_en, grade_level, subject_id, thumbnail_url, video_url_720p, quiz_settings, updated_at, subjects(name_ar, name_en)"
        )
        .eq("id", lessonId)
        .abortSignal(signal)
        .maybeSingle()
        .then((result) => {
          if (result.data) onLesson?.(result.data);
          return result;
        }),
      fetchJson<{ sim?: SimPayload | null }>(`/api/lessons/${encodeURIComponent(lessonId)}/sim`, signal).then(
        (json) => {
          // No recording: fail as soon as this answers, which also cancels
          // the rest of the batch. (A recording whose audio couldn't be
          // signed lands here too.)
          if (!json.sim?.sim || !json.sim.audio_url) throw new DownloadError("no_audio");
          return json.sim;
        }
      ),
      fetchJson<{ slideDeck?: { slides?: unknown; language_mode?: unknown } | null }>(
        `/api/lessons/${encodeURIComponent(lessonId)}/slides`,
        signal
      ),
      supabase
        .from("lesson_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("timestamp_seconds")
        .abortSignal(signal),
      supabase
        .from("lesson_tasks")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("display_order")
        .abortSignal(signal),
      fetchPracticeGate(supabase, lessonId, signal),
      supabase
        .from("lesson_progress")
        .select("last_position_seconds, total_watch_time_seconds, completed")
        .eq("student_id", ownerId)
        .eq("lesson_id", lessonId)
        .abortSignal(signal)
        .maybeSingle(),
      fetchJson<{ responses?: unknown }>(`/api/lessons/${encodeURIComponent(lessonId)}/slide-responses`, signal),
    ]);

  if (lessonResult.error) throw lessonResult.error;
  if (!lessonResult.data) throw new DownloadError("not_found");
  if (questionsResult.error) throw questionsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (progressResult.error) throw progressResult.error;

  const lesson = lessonResult.data as unknown as LessonBundle["lesson"];
  // Bounded and cancellable (a child of the metadata signal, so cancel and
  // logout reach it): a stalled lookup must not hold the one-at-a-time queue.
  const lookup = childSignal(signal, NAVIGATION_TIMEOUT_MS);
  const navigation = await loadLessonNavigation(supabase, lesson.subject_id, lessonId, lookup.signal)
    .catch(() => null)
    .finally(() => lookup.dispose());
  // An aborted query comes back as an error, so a cut-short lookup reads as
  // "no neighbours": keep what a previous save of this lesson had instead.
  const neighbors =
    navigation && !lookup.signal.aborted
      ? { prev: pickNeighbor(navigation.previous), next: pickNeighbor(navigation.next) }
      : fallbackNeighbors ?? { prev: null, next: null };

  const deck = slidesJson.slideDeck ?? null;
  const languageMode = deck?.language_mode;
  const deckSlides = Array.isArray(sim.sim.deck_snapshot) ? (sim.sim.deck_snapshot as Slide[]) : [];

  return {
    lesson,
    sim,
    slides: Array.isArray(deck?.slides) ? (deck.slides as unknown[]) : null,
    slideLanguageMode: languageMode === "ar" || languageMode === "en" || languageMode === "both" ? languageMode : null,
    questions: questionsResult.data ?? [],
    tasks: tasksResult.data ?? [],
    practiceAssignmentId: gate?.assignmentId ?? null,
    progress: progressResult.data
      ? {
          last_position_seconds: progressResult.data.last_position_seconds ?? 0,
          total_watch_time_seconds: progressResult.data.total_watch_time_seconds ?? 0,
          completed: progressResult.data.completed === true,
        }
      : null,
    responses: serverResponsesToLocal(responsesJson.responses, deckSlides),
    neighbors,
  };
}

// Progress: metadata to 15 %, images to 30 %, audio to 95 %, writing to 100 %.
const IMAGES_PROGRESS_START = 15;
const AUDIO_PROGRESS_START = 30;
const AUDIO_PROGRESS_END = 95;

/**
 * Whether Supabase answers right now. Tells "this image's link is dead"
 * apart from "the connection dropped", which look the same to fetch().
 */
async function canReachServer(
  supabase: SupabaseClient<Database>,
  lessonId: string,
  signal: AbortSignal
): Promise<boolean> {
  const check = childSignal(signal, ONLINE_CHECK_TIMEOUT_MS);
  try {
    const { error } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", lessonId)
      .abortSignal(check.signal)
      .maybeSingle();
    return !error && !check.signal.aborted;
  } catch {
    return false;
  } finally {
    check.dispose();
  }
}

function canPlayAudio(mime: string | null): boolean {
  if (!mime || typeof document === "undefined") return false;
  try {
    return document.createElement("audio").canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

async function downloadAudio(
  sim: SimPayload,
  signal: AbortSignal,
  reporter: Reporter
): Promise<{ blob: Blob; mime: string | null }> {
  // Fails the download when no bytes arrive for a while.
  const watchdog = childSignal(signal, AUDIO_STALL_TIMEOUT_MS);
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  let contentLength = 0;
  let responseType: string | null = null;

  try {
    const response = await fetch(sim.audio_url as string, { signal: watchdog.signal });
    if (!response.ok || !response.body) throw new DownloadError("network");
    responseType = response.headers.get("content-type");

    contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10) || 0;
    await ensureRoomFor(contentLength);

    const reader = response.body.getReader();
    watchdog.touch();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      watchdog.touch();
      chunks.push(value);
      downloaded += value.length;
      const fraction = contentLength ? downloaded / contentLength : Math.min(downloaded / (20 * 1024 * 1024), 0.95);
      reporter.update({
        progress: AUDIO_PROGRESS_START + Math.min(fraction, 1) * (AUDIO_PROGRESS_END - AUDIO_PROGRESS_START),
        totalBytes: contentLength || downloaded,
        downloadedBytes: downloaded,
      });
    }
  } finally {
    watchdog.dispose();
  }

  // A connection that drops mid-file can end the stream early without an error.
  if (downloaded === 0 || (contentLength > 0 && downloaded < contentLength)) {
    throw new DownloadError("network");
  }

  const mime = pickAudioMime(sim.sim.audio_mime, responseType, sim.sim.audio_path || sim.audio_url);
  const blob = new Blob(chunks as BlobPart[], mime ? { type: mime } : undefined);
  chunks.length = 0;
  return { blob, mime };
}

// ── Download ─────────────────────────────────────────────────────────────────

/**
 * Saves a lesson for offline playback. Requires a connection and a verified
 * owner: the owner record saveOwner wrote for the signed-in account, or the
 * network-verified user when no account owns the phone's storage yet.
 * Resolves with the saved record; rejects with DownloadError (see `code`)
 * or DownloadCancelledError. The persisted DownloadState carries the same
 * `errorCode`. Re-downloading a saved lesson replaces it.
 */
export function downloadLesson(
  lessonId: string,
  supabase: SupabaseClient<Database>,
  onProgress?: ProgressCallback,
  options: DownloadOptions = {}
): Promise<OfflineLesson> {
  // A background download never takes over a save already running or queued
  // for this lesson: it would restart it from zero and save it as "auto"
  // (which later gets removed). Nothing is reported, so its progress stays.
  if (options.origin === "auto" && activeDownloads.has(lessonId)) {
    return Promise.reject(new DownloadCancelledError());
  }

  // Start the persistence request now, while this may still be the tap's gesture.
  void requestPersistentStorage();

  // Register before aborting an older run, so its cleanup sees it was replaced.
  const older = activeDownloads.get(lessonId);
  const controller = new AbortController();
  activeDownloads.set(lessonId, controller);
  older?.abort();
  const epoch = getStorageEpoch();
  const reporter = createReporter(lessonId, epoch, onProgress);
  reporter.update({ status: "downloading", progress: 0 }, true);

  return oneAtATime(() =>
    withSharedStorageLock(() => runDownload(lessonId, supabase, options, controller, epoch, reporter))
  ).finally(() => {
    if (activeDownloads.get(lessonId) === controller) activeDownloads.delete(lessonId);
  });
}

/** Notes whether the page was hidden (screen locked, app switched) at any point until `stop()`. */
function watchVisibility() {
  if (typeof document === "undefined") return { hidden: () => false, stop: () => undefined };
  let wasHidden = document.visibilityState === "hidden";
  const onChange = () => {
    if (document.visibilityState === "hidden") wasHidden = true;
  };
  document.addEventListener("visibilitychange", onChange);
  return {
    hidden: () => wasHidden,
    stop: () => document.removeEventListener("visibilitychange", onChange),
  };
}

async function runDownload(
  lessonId: string,
  supabase: SupabaseClient<Database>,
  options: DownloadOptions,
  controller: AbortController,
  epoch: number,
  reporter: Reporter
): Promise<OfflineLesson> {
  const { signal } = controller;
  const checkCancelled = () => {
    if (signal.aborted || epoch !== getStorageEpoch()) throw new DownloadCancelledError();
  };

  let assets: CachedAssets | null = null;
  let assetUrls: string[] = [];
  // From the images on, failures can come from saving to the phone.
  let writing = false;
  let previous: OfflineLesson | null = null;
  // Each attempt writes its audio under its own key, so the copy that plays
  // is never overwritten: it is deleted only after the new record commits.
  const audioKey = newOfflineAudioKey(lessonId);
  let audioWritten = false;
  let committed = false;
  const visibility = watchVisibility();

  try {
    checkCancelled();
    reporter.update({ progress: 1 }, true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new DownloadError("offline");
    // Saved here, the lesson could never open offline (and would use up mobile data).
    if (!canSaveOfflineHere()) throw new DownloadError("unsupported");

    const owner = await resolveDownloadOwner(supabase);
    checkCancelled();

    previous = await getOfflineLesson(lessonId).catch(() => null);
    if (previous && previous.ownerId !== owner.userId) previous = null;

    // 1. Everything except the big files. Any failure fails the download.
    const metadata = childSignal(signal, METADATA_TIMEOUT_MS);
    const bundle = await fetchLessonBundle(supabase, lessonId, owner.userId, metadata.signal, {
      fallbackNeighbors: previous?.neighbors ?? null,
      onLesson: ({ title_ar, title_en }) => reporter.update({ title_ar, title_en }),
    })
      .catch((error: unknown) => {
        metadata.abort(); // Stop the other requests of this batch.
        throw error;
      })
      .finally(() => metadata.dispose());
    checkCancelled();
    reporter.update(
      { progress: IMAGES_PROGRESS_START, title_ar: bundle.lesson.title_ar, title_en: bundle.lesson.title_en },
      true
    );

    // 2. Images first, straight into the asset cache (shared by URL, so
    // caching a new image can't break the old copy of this lesson). A
    // failure here then costs only the images, never the audio.
    assetUrls = collectSimAssetUrls(bundle.sim);
    writing = true;
    assets = await cacheLessonAssets(assetUrls, {
      signal,
      confirmOnline: () => canReachServer(supabase, lessonId, signal),
      onProgress: (done, total) =>
        reporter.update({
          progress:
            IMAGES_PROGRESS_START + (done / Math.max(total, 1)) * (AUDIO_PROGRESS_START - IMAGES_PROGRESS_START),
        }),
    });
    checkCancelled();
    reporter.update({ progress: AUDIO_PROGRESS_START }, true);

    // 3. Narration, held in memory until it is written.
    const audio = await downloadAudio(bundle.sim, signal, reporter);
    checkCancelled();
    reporter.update({ progress: AUDIO_PROGRESS_END }, true);

    // 4. Write the audio and check it really landed. From here on a cancel
    // is ignored: the record is what makes the new audio the one that plays.
    await cacheSimAudio(lessonId, audio.blob, audioKey);
    audioWritten = true;
    if ((await getCachedSimAudioSize(lessonId, audioKey)) !== audio.blob.size) {
      throw new DownloadError("storage_full");
    }

    // 5. The record last, with its asset references, in one transaction.
    const now = new Date().toISOString();
    const subject = bundle.lesson.subjects as { name_ar?: string; name_en?: string } | null;
    const origin: OfflineOrigin =
      options.origin === "auto" && (!previous || previous.origin === "auto") ? "auto" : "manual";
    const missing = new Set(assets.missingUrls);
    const record: OfflineLesson = {
      id: lessonId,
      title_ar: bundle.lesson.title_ar,
      title_en: bundle.lesson.title_en,
      subject_name_ar: subject?.name_ar,
      subject_name_en: subject?.name_en,
      grade_level: bundle.lesson.grade_level,
      sim: { ...bundle.sim, audio_url: null },
      slides: bundle.slides,
      questions: bundle.questions,
      tasks: bundle.tasks,
      thumbnailUrl: bundle.lesson.thumbnail_url,
      videoUrl: bundle.lesson.video_url_720p,
      audioSize: audio.blob.size,
      downloadedAt: now,
      schema: 2,
      ownerId: owner.userId,
      appVersion: process.env.NEXT_PUBLIC_RUNTIME_VERSION || undefined,
      subject_id: bundle.lesson.subject_id,
      description_ar: bundle.lesson.description_ar,
      description_en: bundle.lesson.description_en,
      quiz_settings: bundle.lesson.quiz_settings,
      lessonUpdatedAt: bundle.lesson.updated_at,
      simId: bundle.sim.sim.id,
      simUpdatedAt: bundle.sim.sim.updated_at,
      slideLanguageMode: bundle.slideLanguageMode,
      audioMime: audio.mime ?? undefined,
      audioMayNotPlay: !canPlayAudio(audio.mime),
      audioKey,
      // Only stored images get references; missing ones are listed apart.
      assetUrls: assetUrls.filter((url) => !missing.has(url)),
      assetBytes: assets.totalBytes,
      missingAssetUrls: missing.size > 0 ? [...missing] : undefined,
      practice: bundle.practiceAssignmentId
        ? { assignmentId: bundle.practiceAssignmentId, passed: bundle.progress?.completed === true }
        : null,
      progress: bundle.progress,
      neighbors: bundle.neighbors,
      origin,
      updateAvailable: false,
    };
    const totalBytes = audio.blob.size + assets.totalBytes;
    const completed: DownloadState = {
      ...reporter.state,
      status: "completed",
      progress: 100,
      totalBytes,
      downloadedBytes: totalBytes,
      error: undefined,
      errorCode: undefined,
      updatedAt: now,
    };

    // Answers given on this phone are newer than the server's; keep them.
    await putLocalSlideResponses(owner.userId, lessonId, bundle.responses, { keepExisting: true, epoch });
    const { unreferencedUrls, replacedAudioKey } = await commitOfflineLesson(record, {
      assetBytes: assets.bytesByUrl,
      previousAssetUrls: previous?.assetUrls ?? [],
      state: completed,
      epoch,
    });
    committed = true;
    assets.release();
    void deleteAssetsFromCache(unreferencedUrls);
    // The copy this one replaced: nothing points at it any more.
    if (replacedAudioKey) void deleteCachedSimAudio(lessonId, replacedAudioKey);

    reporter.update(completed, true);
    void warmOfflinePlayerChunks();
    return record;
  } catch (error) {
    assets?.release();
    // Logout wiped storage: write nothing more (it would recreate the database).
    const storageCleared = epoch !== getStorageEpoch();
    // A newer download of this lesson took over and will replace everything.
    const replaced = activeDownloadsHasOther(lessonId, controller);

    if (!storageCleared) {
      // The saved copy (record and audio) is left as it was. Only this
      // attempt's audio goes: no record points at it and no other save uses
      // its key, so this holds even when a newer run took over.
      if (audioWritten && !committed) await deleteCachedSimAudio(lessonId, audioKey);
      // Images this attempt cached that no saved lesson uses (a newer run of
      // this lesson reuses them instead).
      if (!replaced) void deleteUnreferencedAssets(assetUrls);
    }

    const cancelled =
      error instanceof DownloadCancelledError || error instanceof StorageClearedError || signal.aborted || storageCleared;
    if (cancelled) {
      if (!storageCleared && !replaced) await deleteDownloadState(lessonId).catch(() => undefined);
      throw new DownloadCancelledError();
    }

    let failure = toDownloadError(error, writing);
    // Cut off while the screen was locked or the app was in the background:
    // say so, rather than blaming the connection.
    if (failure.code === "network" && visibility.hidden()) failure = new DownloadError("interrupted");
    if (!storageCleared && !replaced) {
      if (failure.code === "no_audio") {
        // Nothing to retry: the toast says why, and no broken row is kept.
        await deleteDownloadState(lessonId).catch(() => undefined);
      } else {
        reporter.update({ status: "error", errorCode: failure.code, error: failure.message }, true);
      }
    }
    throw failure;
  } finally {
    visibility.stop();
  }
}

function activeDownloadsHasOther(lessonId: string, controller: AbortController): boolean {
  const current = activeDownloads.get(lessonId);
  return Boolean(current && current !== controller);
}

// ── Removal and updates ──────────────────────────────────────────────────────

/** Removes a saved lesson: its record, audio, download state, and images no other saved lesson uses. */
export async function deleteDownloadedLesson(lessonId: string): Promise<void> {
  const controller = activeDownloads.get(lessonId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(lessonId);
  }
  const { unreferencedUrls } = await removeOfflineLessonRecord(lessonId);
  await Promise.all([deleteCachedSimAudio(lessonId), deleteAssetsFromCache(unreferencedUrls)]);
}

/**
 * Online: flags saved lessons whose recording changed on the server
 * (`updateAvailable`) and clears the flag where it no longer applies.
 * Returns the ids with an update. Leaves flags alone if the lookup fails.
 */
export async function checkForUpdates(supabase: SupabaseClient<Database>): Promise<string[]> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];
  const owner = await getOwner();
  if (!owner) return [];
  const lessons = (await getAllOfflineLessons()).filter((lesson) => lesson.ownerId === owner.userId);
  if (lessons.length === 0) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { data, error } = await supabase
      .from("lesson_sims")
      .select("id, lesson_id, updated_at")
      .in(
        "lesson_id",
        lessons.map((lesson) => lesson.id)
      )
      .abortSignal(controller.signal);
    if (error || !data) return [];

    const latest = new Map<string, { id: string; updated_at: string }>();
    for (const row of data) {
      const current = latest.get(row.lesson_id);
      if (!current || Date.parse(row.updated_at) > Date.parse(current.updated_at)) latest.set(row.lesson_id, row);
    }

    const outdated: string[] = [];
    for (const lesson of lessons) {
      const server = latest.get(lesson.id);
      // No row: unpublished or removed. Keep the copy as it is.
      if (!server) continue;
      // A copy saved before schema 2 has no pictures and no practice gate,
      // so it can't show itself finished either: saving it again fixes both.
      const stale =
        lesson.schema !== 2 ||
        isSimOutdated(
          {
            simId: lesson.simId ?? lesson.sim?.sim.id,
            simUpdatedAt: lesson.simUpdatedAt ?? lesson.sim?.sim.updated_at,
          },
          server
        );
      if (stale) outdated.push(lesson.id);
      if (stale !== (lesson.updateAvailable === true)) {
        await updateOfflineLesson(lesson.id, { updateAvailable: stale }).catch(() => null);
      }
    }
    return outdated;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
