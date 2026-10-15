/**
 * Download manager for offline lesson storage.
 *
 * Saves everything a lesson needs to play with no connection: the lesson
 * data, the sim (with `audio_url` nulled — signed URLs expire), the narration
 * audio, slide and activity images, the practice gate, a progress snapshot,
 * saved answers and the previous/next lessons. Nothing is marked downloaded
 * until all of it arrived; a failed re-download keeps the old copy where it
 * can. Downloads run one at a time to keep memory low on small phones.
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
  type CachedAssets,
} from "./assets";
import {
  StorageClearedError,
  cacheSimAudio,
  commitOfflineLesson,
  deleteCachedSimAudio,
  deleteDownloadState,
  getAllDownloadStates,
  getAllOfflineLessons,
  getCachedSimAudio,
  getOfflineLesson,
  getStorageEpoch,
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
    ar: "افتح أمل وأنت متصل بالإنترنت ومسجّل الدخول، ثم حاول مرة أخرى.",
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
  storage_full: {
    en: "Not enough space on this phone. Remove a saved lesson and try again.",
    ar: "لا توجد مساحة كافية على هذا الهاتف. احذف درسًا محفوظًا وحاول مرة أخرى.",
  },
  interrupted: {
    en: "The download was interrupted. Try again.",
    ar: "انقطع التنزيل. حاول مرة أخرى.",
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

function toDownloadError(error: unknown): DownloadError {
  if (error instanceof DownloadError) return error;
  if (isQuotaError(error)) return new DownloadError("storage_full");
  if (typeof navigator !== "undefined" && navigator.onLine === false) return new DownloadError("offline");
  if (error instanceof AssetDownloadError) return new DownloadError("network");
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "TypeError" || name === "TimeoutError" || name === "AbortError") return new DownloadError("network");
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
  // A state left by a download that died with the page has no controller.
  void deleteDownloadState(lessonId).catch(() => undefined);
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
 * Asks the browser not to evict downloads under storage pressure. Called
 * once per page session, from the first download (ideally still inside the
 * tap that started it). Resolves to whether storage is persistent.
 */
export function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested || typeof navigator === "undefined" || !navigator.storage?.persist) {
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

// Images are usually under this; real sizes are only known once fetched.
const ASSET_SIZE_ESTIMATE = 1.5 * 1024 * 1024;
const STORAGE_SAFETY_MARGIN = 5 * 1024 * 1024;

async function ensureRoomFor(audioBytes: number, assetCount: number) {
  const { used, quota } = await getStorageEstimate();
  if (!quota) return; // Unknown: let the writes find out.
  const needed = audioBytes + 2 * assetCount * ASSET_SIZE_ESTIMATE + STORAGE_SAFETY_MARGIN;
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
const AUDIO_STALL_TIMEOUT_MS = 30_000;

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
  signal: AbortSignal
): Promise<LessonBundle> {
  const [lessonResult, simJson, slidesJson, questionsResult, tasksResult, gate, progressResult, responsesJson] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(
          "id, title_ar, title_en, description_ar, description_en, grade_level, subject_id, thumbnail_url, video_url_720p, quiz_settings, updated_at, subjects(name_ar, name_en)"
        )
        .eq("id", lessonId)
        .abortSignal(signal)
        .maybeSingle(),
      fetchJson<{ sim?: SimPayload | null }>(`/api/lessons/${encodeURIComponent(lessonId)}/sim`, signal),
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

  const sim = simJson.sim ?? null;
  if (!sim?.sim || !sim.audio_url) throw new DownloadError("no_audio");

  const lesson = lessonResult.data as unknown as LessonBundle["lesson"];
  const navigation = await loadLessonNavigation(supabase, lesson.subject_id, lessonId);

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
    neighbors: { prev: pickNeighbor(navigation.previous), next: pickNeighbor(navigation.next) },
  };
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
  assetCount: number,
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
    await ensureRoomFor(contentLength, assetCount);

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
        progress: 15 + Math.min(fraction, 1) * 65,
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

  return oneAtATime(() => runDownload(lessonId, supabase, options, controller, epoch, reporter)).finally(() => {
    if (activeDownloads.get(lessonId) === controller) activeDownloads.delete(lessonId);
  });
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
  let audioWritten = false;
  let previous: OfflineLesson | null = null;
  // Re-saving the same recording rewrites identical audio, so a failure then
  // leaves the old copy consistent.
  let sameRecording = false;

  try {
    checkCancelled();
    reporter.update({ progress: 1 }, true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new DownloadError("offline");

    const owner = await resolveDownloadOwner(supabase);
    checkCancelled();

    previous = await getOfflineLesson(lessonId).catch(() => null);
    if (previous && previous.ownerId !== owner.userId) previous = null;

    // 1. Everything except the big files. Any failure fails the download.
    const metadata = childSignal(signal, METADATA_TIMEOUT_MS);
    const bundle = await fetchLessonBundle(supabase, lessonId, owner.userId, metadata.signal)
      .catch((error: unknown) => {
        metadata.abort(); // Stop the other requests of this batch.
        throw error;
      })
      .finally(() => metadata.dispose());
    checkCancelled();
    reporter.update({ progress: 15, title_ar: bundle.lesson.title_ar, title_en: bundle.lesson.title_en }, true);
    sameRecording = Boolean(
      previous &&
        (previous.simId ?? previous.sim?.sim.id) === bundle.sim.sim.id &&
        (previous.simUpdatedAt ?? previous.sim?.sim.updated_at) === bundle.sim.sim.updated_at
    );

    // 2. Narration, held in memory until everything else arrived.
    assetUrls = collectSimAssetUrls(bundle.sim);
    const audio = await downloadAudio(bundle.sim, assetUrls.length, signal, reporter);
    checkCancelled();
    reporter.update({ progress: 80 }, true);

    // 3. Images, straight into the asset cache (shared by URL, so caching a
    // new image can't break the old copy of this lesson).
    assets = await cacheLessonAssets(assetUrls, {
      signal,
      onProgress: (done, total) => reporter.update({ progress: 80 + (done / Math.max(total, 1)) * 15 }),
    });
    checkCancelled();

    // 4. Write the audio and check it really landed. From here on a cancel
    // is ignored: stopping between the audio and the record would only
    // leave a mismatched pair.
    await cacheSimAudio(lessonId, audio.blob);
    audioWritten = true;
    const cachedAudio = await getCachedSimAudio(lessonId);
    if (!cachedAudio || cachedAudio.size !== audio.blob.size) throw new DownloadError("storage_full");

    // 5. The record last, with its asset references, in one transaction.
    const now = new Date().toISOString();
    const subject = bundle.lesson.subjects as { name_ar?: string; name_en?: string } | null;
    const origin: OfflineOrigin =
      options.origin === "auto" && (!previous || previous.origin === "auto") ? "auto" : "manual";
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
      assetUrls,
      assetBytes: assets.totalBytes,
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
    const { unreferencedUrls } = await commitOfflineLesson(record, {
      assetBytes: assets.bytesByUrl,
      previousAssetUrls: previous?.assetUrls ?? [],
      state: completed,
      epoch,
    });
    assets.release();
    void deleteAssetsFromCache(unreferencedUrls);

    reporter.update(completed, true);
    void warmOfflinePlayerChunks();
    return record;
  } catch (error) {
    assets?.release();
    // Logout wiped storage: write nothing more (it would recreate the database).
    const storageCleared = epoch !== getStorageEpoch();
    // A newer download of this lesson took over and will replace everything.
    const replaced = activeDownloadsHasOther(lessonId, controller);

    if (!storageCleared && !replaced) {
      // New audio next to the old record would play the wrong narration over
      // the old slides, so a half-replaced copy is removed rather than kept.
      if (audioWritten && !previous) {
        await deleteCachedSimAudio(lessonId);
      } else if (audioWritten && previous && !sameRecording) {
        await removeOfflineLessonRecord(lessonId)
          .then(({ unreferencedUrls }) => deleteAssetsFromCache(unreferencedUrls))
          .catch(() => undefined);
        await deleteCachedSimAudio(lessonId);
      }
      // Images this attempt cached that no saved lesson uses.
      void deleteUnreferencedAssets(assetUrls);
    }

    const cancelled =
      error instanceof DownloadCancelledError || error instanceof StorageClearedError || signal.aborted || storageCleared;
    if (cancelled) {
      if (!storageCleared && !replaced) await deleteDownloadState(lessonId).catch(() => undefined);
      throw new DownloadCancelledError();
    }

    const failure = toDownloadError(error);
    if (!storageCleared && !replaced) {
      reporter.update({ status: "error", errorCode: failure.code, error: failure.message }, true);
    }
    throw failure;
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
