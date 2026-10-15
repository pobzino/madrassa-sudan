/**
 * Names shared by the offline code and the service worker. The worker can't
 * import this module, so src/sw/service-worker.template.js mirrors these
 * values — change both together, or logout stops clearing a cache and the
 * worker's activate step may delete one it doesn't recognise.
 */

// ── IndexedDB ────────────────────────────────────────────────────────────────

export const OFFLINE_DB_NAME = "amal-offline";
export const OFFLINE_DB_VERSION = 2;

export const OFFLINE_STORES = {
  lessons: "lessons",
  queue: "progress-queue",
  downloads: "downloads",
  meta: "meta",
  responses: "responses",
} as const;

export type OfflineStoreName = (typeof OFFLINE_STORES)[keyof typeof OFFLINE_STORES];

// ── Cache Storage ────────────────────────────────────────────────────────────

/** Downloaded lesson audio, keyed by `offlineAudioKey(lessonId)`. Name kept from v1 so existing downloads survive. */
export const AUDIO_CACHE = "sim-audio-downloads";
/** Downloaded slide and activity images, keyed by their original absolute URL. */
export const ASSET_CACHE = "amal-lesson-assets";

/** Account caches: the service worker never deletes these; logout does. */
export const ACCOUNT_CACHES = [AUDIO_CACHE, ASSET_CACHE] as const;

/** The v1 worker's catch-all cache, which also stored Supabase JSON. Personal, so logout deletes it. */
export const LEGACY_PRIVATE_CACHES = ["amal-sw-v2"] as const;

/** Versioned worker caches (`<prefix><version>`): page shells and static build files. Not personal. */
export const SHELL_CACHE_PREFIX = "amal-shell-";
export const STATIC_CACHE_PREFIX = "amal-static-";
/** Holds `{ current, previous }` worker versions so activate keeps the previous build's files. */
export const SW_META_CACHE = "amal-sw-meta";
/** v1 worker caches deleted on activate. */
export const LEGACY_SW_CACHES = ["amal-sw-v2", "amal-static-v2", "amal-pages-v2"] as const;

export function offlineAudioKey(lessonId: string): string {
  return `/offline-audio/${lessonId}`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export const OFFLINE_HUB_PATH = "/offline";
export const OFFLINE_PLAYER_PATH = "/offline/play";

export function offlinePlayerUrl(lessonId: string): string {
  return `${OFFLINE_PLAYER_PATH}?id=${encodeURIComponent(lessonId)}`;
}

// ── Browser storage keys ─────────────────────────────────────────────────────

/** v1 owner marker. Read once to migrate, then replaced by the owner record in IndexedDB. */
export const LEGACY_OWNER_KEY = "amal-offline-owner";
export const AUTO_DOWNLOAD_SETTING_KEY = "amal-auto-download";
/** v1 list of automatic downloads; the record's `origin` replaces it. */
export const LEGACY_AUTO_DOWNLOADED_KEY = "amal-auto-downloaded";

/** Exact localStorage keys removed on logout. */
export const PRIVATE_LOCAL_STORAGE_KEYS = [
  LEGACY_OWNER_KEY,
  AUTO_DOWNLOAD_SETTING_KEY,
  LEGACY_AUTO_DOWNLOADED_KEY,
] as const;

/** localStorage key prefixes removed on logout (resume positions, saved answers). */
export const PRIVATE_LOCAL_STORAGE_PREFIXES = ["sim-resume:", "lesson-slide-interactions:"] as const;

/** Other tabs of this origin hear about logout here, so they stop writing old-account data. */
export const OFFLINE_BROADCAST_CHANNEL = "amal-offline";
