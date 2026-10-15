// Downloads the next lesson in the background while a family is on Wi-Fi, so
// it plays later without using mobile data. Only Android browsers report the
// connection type, so iPhones keep the manual download button. Keeps the last
// few automatic downloads and removes older ones; manual downloads are never
// touched.

const SETTING_KEY = "amal-auto-download";
const AUTO_IDS_KEY = "amal-auto-downloaded";
const KEEP_AUTO_DOWNLOADS = 3;
// Leave room on the phone: skip when less than this is free.
const MIN_FREE_BYTES = 200 * 1024 * 1024;

type NetworkInformation = { type?: string; saveData?: boolean };

export function isAutoDownloadEnabled() {
  try {
    return localStorage.getItem(SETTING_KEY) !== "off";
  } catch {
    return false;
  }
}

export function setAutoDownloadEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SETTING_KEY, enabled ? "on" : "off");
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
  return connection.type === "wifi" || connection.type === "ethernet";
}

function autoIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTO_IDS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveAutoIds(ids: string[]) {
  try {
    localStorage.setItem(AUTO_IDS_KEY, JSON.stringify(ids));
  } catch {
    // See above.
  }
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
    download: (lessonId: string) => Promise<void>;
    remove: (lessonId: string) => Promise<void>;
    isDownloaded: (lessonId: string) => boolean;
    keepId?: string;
  },
) {
  if (!isAutoDownloadEnabled() || !navigator.onLine || !onUnmeteredConnection()) return;
  if (isDownloaded(lessonId) || !(await hasRoom())) return;

  await download(lessonId);
  if (!isDownloaded(lessonId) && !(await stillSaved(lessonId))) return;

  const ids = [...autoIds().filter((id) => id !== lessonId), lessonId];
  const stale = ids.slice(0, Math.max(0, ids.length - KEEP_AUTO_DOWNLOADS)).filter((id) => id !== keepId);
  for (const id of stale) await remove(id).catch(() => undefined);
  saveAutoIds(ids.filter((id) => !stale.includes(id)));
}

async function stillSaved(lessonId: string) {
  const { getOfflineLesson } = await import("./db");
  return Boolean(await getOfflineLesson(lessonId).catch(() => null));
}
