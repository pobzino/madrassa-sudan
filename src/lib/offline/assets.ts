/**
 * Slide and activity images saved with a download.
 *
 * Images are stored in the ASSET_CACHE keyed by their original absolute URL,
 * and the service worker answers <img> requests for those URLs from it when
 * offline. Several lessons can share one image, so `meta` keeps which
 * downloaded lessons use each URL (see commitOfflineLesson and
 * removeOfflineLessonRecord in db.ts); an image is deleted only when the last
 * lesson using it is removed.
 */

import type { SimPayload } from "@/lib/sim.types";
import { ASSET_CACHE } from "./cache-names";
import { assetUrlFromMetaKey, getAllAssetRefs } from "./db";

export { addLessonToAssetRef, removeLessonFromAssetRef, assetMetaKey } from "./db";

// ── Collecting URLs (pure) ───────────────────────────────────────────────────

/**
 * An absolute http(s) URL for a stored image reference, or null for anything
 * that isn't fetched from the network (`owl:` illustrations, data: and blob:
 * URLs, empty values). Site-relative paths resolve against `baseUrl`.
 */
export function resolveAssetUrl(raw: unknown, baseUrl?: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^(owl|data|blob|javascript|about):/i.test(value)) return null;
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function defaultBaseUrl(): string | undefined {
  return typeof location !== "undefined" ? location.href : undefined;
}

/**
 * Every image the player can load for this sim: each slide's `image_url`,
 * each slide's `exploration_config.image_url` (image hotspots), and each
 * `exploration_gate` event's `config.image_url`. Absolute, deduped, in order.
 */
export function collectSimAssetUrls(
  payload: SimPayload | null | undefined,
  baseUrl: string | undefined = defaultBaseUrl()
): string[] {
  const urls = new Set<string>();
  const add = (raw: unknown) => {
    const url = resolveAssetUrl(raw, baseUrl);
    if (url) urls.add(url);
  };

  const sim = payload?.sim;
  if (!sim) return [];

  for (const slide of Array.isArray(sim.deck_snapshot) ? sim.deck_snapshot : []) {
    if (!slide || typeof slide !== "object") continue;
    add(slide.image_url);
    const config = slide.exploration_config as { image_url?: unknown } | null | undefined;
    if (config && typeof config === "object") add(config.image_url);
  }

  for (const event of Array.isArray(sim.events) ? sim.events : []) {
    if (!event || typeof event !== "object" || event.type !== "exploration_gate") continue;
    const config = event.config as { image_url?: unknown } | null | undefined;
    if (config && typeof config === "object") add(config.image_url);
  }

  return [...urls];
}

// ── Cache Storage ────────────────────────────────────────────────────────────

const FETCH_CONCURRENCY = 3;

// URLs a running download has cached but not yet committed references for;
// pruning must leave them alone.
const pendingAssetUrls = new Map<string, number>();

function markPending(urls: string[]) {
  for (const url of urls) pendingAssetUrls.set(url, (pendingAssetUrls.get(url) ?? 0) + 1);
}

function unmarkPending(urls: string[]) {
  for (const url of urls) {
    const count = (pendingAssetUrls.get(url) ?? 0) - 1;
    if (count > 0) pendingAssetUrls.set(url, count);
    else pendingAssetUrls.delete(url);
  }
}

export class AssetDownloadError extends Error {
  constructor(
    readonly url: string,
    readonly status?: number
  ) {
    super(status ? `Image download failed (HTTP ${status})` : "Image download failed");
    this.name = "AssetDownloadError";
  }
}

// A hung image request (lie-fi) fails the download instead of stalling it.
const ASSET_TIMEOUT_MS = 45_000;

/**
 * Our own site and Supabase storage always send CORS headers, so a failed CORS
 * fetch from them is a network blip, not a host without CORS. Falling back to
 * no-cors there would store an unreadable opaque copy (it can hide an error
 * page, and Chrome charges ~7 MB of quota for each one).
 */
function servesCors(url: string): boolean {
  try {
    const { origin } = new URL(url);
    if (typeof location !== "undefined" && origin === location.origin) return true;
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return Boolean(supabase) && origin === new URL(supabase as string).origin;
  } catch {
    return false;
  }
}

async function fetchAsset(url: string, parentSignal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ASSET_TIMEOUT_MS);
  const { signal } = controller;

  try {
    const fetchCors = async () => {
      const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
      if (!response.ok) throw new AssetDownloadError(url, response.status);
      return response;
    };
    try {
      return await fetchCors();
    } catch (error) {
      if (signal.aborted || error instanceof AssetDownloadError) throw error;
      if (servesCors(url)) {
        // One retry for a dropped connection, then the image (and the save) fails.
        try {
          return await fetchCors();
        } catch (retryError) {
          if (signal.aborted || retryError instanceof AssetDownloadError) throw retryError;
          throw new AssetDownloadError(url);
        }
      }
      // A host without CORS headers (a teacher-pasted hotspot image): an
      // opaque response still displays in <img> when the worker serves it.
      try {
        return await fetch(url, { mode: "no-cors", credentials: "omit", signal });
      } catch (fallbackError) {
        if (signal.aborted) throw fallbackError;
        throw new AssetDownloadError(url);
      }
    }
  } catch (error) {
    // Our timeout (not the caller cancelling) is a failed image.
    if (signal.aborted && !parentSignal?.aborted) throw new AssetDownloadError(url);
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}

/** Fetches one image and stores it under its URL. Returns its size (0 when the response is opaque). */
async function cacheAsset(cache: Cache, url: string, signal?: AbortSignal): Promise<number> {
  const response = await fetchAsset(url, signal);
  if (response.type === "opaque") {
    await cache.put(url, response);
    return 0;
  }
  const blob = await response.blob();
  // Re-wrap with only the headers that matter: the original Vary/Set-Cookie
  // headers would make offline matches miss or keep needless data.
  await cache.put(
    url,
    new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": blob.type || response.headers.get("content-type") || "application/octet-stream",
        "Content-Length": String(blob.size),
      },
    })
  );
  return blob.size;
}

export interface CachedAssets {
  /** Bytes per URL (0 for opaque responses, whose size can't be read). */
  bytesByUrl: Record<string, number>;
  totalBytes: number;
  /** Call once the lesson is committed (or the download failed): lets pruning see these URLs again. */
  release: () => void;
}

/**
 * Downloads `urls` into the asset cache (a few at a time). Any failure throws
 * — a lesson with missing images isn't complete. Already-cached URLs are
 * reused. Until `release()` the URLs are protected from pruneOrphanedAssets.
 */
export async function cacheLessonAssets(
  urls: string[],
  {
    signal,
    onProgress,
  }: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}
): Promise<CachedAssets> {
  markPending(urls);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    unmarkPending(urls);
  };

  try {
    const bytesByUrl: Record<string, number> = {};
    if (urls.length === 0) return { bytesByUrl, totalBytes: 0, release };

    const cache = await caches.open(ASSET_CACHE);
    let done = 0;
    for (let index = 0; index < urls.length; index += FETCH_CONCURRENCY) {
      const batch = urls.slice(index, index + FETCH_CONCURRENCY);
      await Promise.all(
        batch.map(async (url) => {
          if (signal?.aborted) throw new DOMException("Download cancelled", "AbortError");
          let existing = await cache.match(url);
          // An opaque copy of a CORS host is from an earlier blip: fetch it properly.
          if (existing?.type === "opaque" && servesCors(url)) existing = undefined;
          if (existing) {
            bytesByUrl[url] = Number(existing.headers.get("content-length")) || 0;
          } else {
            bytesByUrl[url] = await cacheAsset(cache, url, signal);
          }
          done += 1;
          onProgress?.(done, urls.length);
        })
      );
    }

    const totalBytes = Object.values(bytesByUrl).reduce((total, bytes) => total + bytes, 0);
    return { bytesByUrl, totalBytes, release };
  } catch (error) {
    release();
    throw error;
  }
}

export async function deleteAssetsFromCache(urls: string[]): Promise<void> {
  if (urls.length === 0 || typeof caches === "undefined") return;
  try {
    const cache = await caches.open(ASSET_CACHE);
    await Promise.all(
      urls.filter((url) => !pendingAssetUrls.has(url)).map((url) => cache.delete(url).catch(() => false))
    );
  } catch {
    // A leftover image is harmless; logout deletes the whole cache.
  }
}

/**
 * Deletes those of `urls` that no saved lesson references (images a failed
 * download cached). Leaves anything another download is still using.
 */
export async function deleteUnreferencedAssets(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    const refs = await getAllAssetRefs();
    const referenced = new Set(
      refs.filter((ref) => ref.lessons?.length > 0).map((ref) => assetUrlFromMetaKey(ref.key))
    );
    await deleteAssetsFromCache(urls.filter((url) => !referenced.has(url)));
  } catch {
    // Leftovers are harmless and go with the next prune or logout.
  }
}

/**
 * Deletes cached images no downloaded lesson references (left by a download
 * that was interrupted after caching images). Returns how many were removed.
 */
export async function pruneOrphanedAssets(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const [cache, refs] = await Promise.all([caches.open(ASSET_CACHE), getAllAssetRefs()]);
    const referenced = new Set(
      refs.filter((ref) => ref.lessons?.length > 0).map((ref) => assetUrlFromMetaKey(ref.key))
    );
    const requests = await cache.keys();
    const orphans = requests
      .map((request) => request.url)
      .filter((url) => !referenced.has(url) && !pendingAssetUrls.has(url));
    await Promise.all(orphans.map((url) => cache.delete(url).catch(() => false)));
    return orphans.length;
  } catch {
    return 0;
  }
}
