// Downloads the next lesson in the background while a family is on Wi-Fi, so
// it plays later without using mobile data. Only Android browsers report the
// connection type, so iPhones keep the manual save button. Automatic
// downloads are marked `origin: "auto"` on their record; the last few are
// kept and older ones removed. Saving a lesson by hand makes it manual, and
// manual downloads are never removed here. Off unless switched on (on the
// Downloads page) until offline lessons have been checked on real phones.

import { AUTO_DOWNLOAD_SETTING_KEY, LEGACY_AUTO_DOWNLOADED_KEY } from "./cache-names";
import type { OfflineLesson, OfflineOrigin } from "./db";

const KEEP_AUTO_DOWNLOADS = 3;
// Leave room on the phone: skip when less than this is free.
const MIN_FREE_BYTES = 200 * 1024 * 1024;

type NetworkInformation = { type?: string; saveData?: boolean; effectiveType?: string };

export function isAutoDownloadEnabled() {
  try {
    return localStorage.getItem(AUTO_DOWNLOAD_SETTING_KEY) === "on";
  } catch {
    return false;
  }
}

export function setAutoDownloadEnabled(enabled: boolean) {
  try {
    localStorage.setItem(AUTO_DOWNLOAD_SETTING_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be unavailable in private or locked-down browsers.
  }
}

/** True when this browser can tell it's on Wi-Fi (Android), so the setting applies. */
export function canDetectWifi() {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return typeof connection?.type === "string";
}

function onUnmeteredConnection() {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection || connection.saveData) return false;
  // A phone hotspot also reports "wifi"; a very slow link is the most common
  // sign of one (or of Wi-Fi too weak to finish a lesson anyway).
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return false;
  return connection.type === "wifi" || connection.type === "ethernet";
}

async function hasRoom() {
  try {
    const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return !quota || quota - usage > MIN_FREE_BYTES;
  } catch {
    return true;
  }
}

/**
 * Automatic downloads to remove: every "auto" lesson beyond the newest
 * `keep`, never one in `protectedIds`. Pure, for tests.
 */
export function pickAutoDownloadsToEvict(
  lessons: Pick<OfflineLesson, "id" | "origin" | "downloadedAt">[],
  { keep = KEEP_AUTO_DOWNLOADS, protectedIds = [] }: { keep?: number; protectedIds?: string[] } = {}
): string[] {
  return lessons
    .filter((lesson) => lesson.origin === "auto")
    .sort((left, right) => Date.parse(right.downloadedAt) - Date.parse(left.downloadedAt))
    .slice(keep)
    .map((lesson) => lesson.id)
    .filter((id) => !protectedIds.includes(id));
}

/** v1 kept automatic downloads in a localStorage list; move that onto the records once. */
async function migrateLegacyAutoIds() {
  let ids: string[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_AUTO_DOWNLOADED_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return;
  }
  const { getOfflineLesson, updateOfflineLesson } = await import("./db");
  for (const id of ids) {
    const lesson = await getOfflineLesson(id).catch(() => null);
    if (lesson && !lesson.origin) await updateOfflineLesson(id, { origin: "auto" }).catch(() => null);
  }
  try {
    localStorage.removeItem(LEGACY_AUTO_DOWNLOADED_KEY);
  } catch {
    // Logout removes it too.
  }
}

/**
 * Downloads `lessonId` if the family is on Wi-Fi with room to spare, then
 * removes automatic downloads beyond the last few (never `keepId`).
 */
export async function autoDownloadLesson(
  lessonId: string,
  {
    download,
    remove,
    isDownloaded,
    keepId,
  }: {
    download: (lessonId: string, options?: { origin?: OfflineOrigin }) => Promise<unknown>;
    remove: (lessonId: string) => Promise<void>;
    isDownloaded: (lessonId: string) => boolean;
    keepId?: string;
  },
) {
  if (!isAutoDownloadEnabled() || !navigator.onLine || !onUnmeteredConnection()) return;
  if (isDownloaded(lessonId) || !(await hasRoom())) return;

  try {
    await download(lessonId, { origin: "auto" });
  } catch {
    return; // The download's own state shows the failure.
  }

  await migrateLegacyAutoIds().catch(() => undefined);
  const { getOwnedOfflineLessons } = await import("./identity");
  const lessons = await getOwnedOfflineLessons().catch(() => []);
  if (!lessons.some((lesson) => lesson.id === lessonId)) return;

  const stale = pickAutoDownloadsToEvict(lessons, {
    protectedIds: [lessonId, ...(keepId ? [keepId] : [])],
  });
  for (const id of stale) await remove(id).catch(() => undefined);
}
