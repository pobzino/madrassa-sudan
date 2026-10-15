/**
 * Small pure helpers shared by the offline hub (/offline) and the offline
 * player (/offline/play). Kept free of browser APIs so they can be unit-tested.
 */

import type { OfflineLesson } from "@/lib/offline/db";

export type UiLanguage = "ar" | "en";

/**
 * The language a saved lesson's slides show in. A single-language deck always
 * uses its own language (showing it in the other one leaves slides empty);
 * a bilingual or unknown deck follows the app language.
 */
export function contentLanguageFor(
  lesson: Pick<OfflineLesson, "slideLanguageMode"> | null | undefined,
  uiLanguage: UiLanguage
): UiLanguage {
  const mode = lesson?.slideLanguageMode;
  return mode === "ar" || mode === "en" ? mode : uiLanguage;
}

/** Text in `language`, falling back to the other language when it's missing. */
export function pickLocalized(
  language: UiLanguage,
  arabic: string | null | undefined,
  english: string | null | undefined
): string {
  return language === "ar" ? arabic || english || "" : english || arabic || "";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function formatSavedDate(iso: string | null | undefined, language: UiLanguage): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ar" ? "ar" : "en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Space a saved lesson takes on the phone: its audio plus its images. */
export function savedLessonBytes(lesson: Pick<OfflineLesson, "audioSize" | "assetBytes">): number {
  const audio = Number.isFinite(lesson.audioSize) ? Math.max(0, lesson.audioSize) : 0;
  const assets = typeof lesson.assetBytes === "number" && Number.isFinite(lesson.assetBytes) ? Math.max(0, lesson.assetBytes) : 0;
  return audio + assets;
}

/** Length of the saved recording in whole seconds (0 when unknown). */
export function lessonDurationSec(lesson: Pick<OfflineLesson, "sim"> | null | undefined): number {
  const sim = lesson?.sim?.sim;
  const ms = sim?.duration_ms || sim?.audio_duration_ms || 0;
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** How far through the lesson `positionSec` is, 0–100. */
export function watchedPercent(positionSec: number, durationSec: number, completed = false): number {
  if (completed) return 100;
  if (!(durationSec > 0) || !(positionSec > 0)) return 0;
  return Math.min(100, Math.round((positionSec / durationSec) * 100));
}

/** Playback position (seconds) for a player progress percentage. */
export function positionForPercent(pct: number, durationSec: number): number {
  if (!(durationSec > 0) || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(durationSec, Math.floor((Math.min(100, Math.max(0, pct)) / 100) * durationSec)));
}

/** Watching this far (percent) counts as finishing the lesson, as on the online lesson page. */
export const COMPLETION_PERCENT = 80;

/** Seconds of new playback between progress saves while a lesson plays offline. */
export const PROGRESS_SAVE_STEP_SEC = 10;

export interface ProgressCheckpoint {
  positionSec: number;
  completedCandidate: boolean;
}

/**
 * Whether playback moved far enough past the last saved checkpoint to save
 * again: every PROGRESS_SAVE_STEP_SEC seconds, and as soon as the lesson
 * counts as finished. Keeps IndexedDB writes rare while the player reports
 * progress many times a second.
 */
export function shouldSaveProgress(last: ProgressCheckpoint | null, next: ProgressCheckpoint): boolean {
  if (next.completedCandidate && !last?.completedCandidate) return true;
  if (!last) return next.positionSec >= PROGRESS_SAVE_STEP_SEC;
  return next.positionSec >= last.positionSec + PROGRESS_SAVE_STEP_SEC;
}

/** Whether there's unsaved playback beyond the last checkpoint (used when pausing or leaving). */
export function hasUnsavedProgress(last: ProgressCheckpoint | null, next: ProgressCheckpoint | null): boolean {
  if (!next) return false;
  if (!last) return next.positionSec > 0 || next.completedCandidate;
  return next.positionSec > last.positionSec || (next.completedCandidate && !last.completedCandidate);
}
