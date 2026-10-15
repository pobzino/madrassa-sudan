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
 *
 * On an https page an http: image becomes https:, the same upgrade Chrome and
 * Safari apply to <img>: fetch() would be blocked as mixed content, and the
 * player's <img> asks the service worker for the https: URL anyway.
 */
export function resolveAssetUrl(raw: unknown, baseUrl?: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^(owl|data|blob|javascript|about):/i.test(value)) return null;
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.protocol === "http:" && baseUrl && new URL(baseUrl).protocol === "https:") url.protocol = "https:";
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
    readonly status?: number,
    /** Both ways of fetching it failed outright: a dead link (bad host, no https) or the connection. */
    readonly unreachable = false
  ) {
    super(status ? `Image download failed (HTTP ${status})` : "Image download failed");
    this.name = "AssetDownloadError";
  }
}

/**
 * True for an HTTP status that every retry will get again (a deleted or
 * private image), as opposed to a passing problem (a timeout, rate limiting,
 * a server error). Such an image is missing online too.
 */
export function isPermanentAssetStatus(status: number | undefined): boolean {
  if (status === undefined) return false;
  return status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429;
}

/**
 * Our own site and Supabase storage always send CORS headers, so a failed CORS
 * fetch from them is a network blip, not a host without CORS. Falling back to
 * no-cors there would store an unreadable opaque copy (it can hide an error
 * page, and Chrome charges ~7 MB of quota for each one) or, if that fails too,
 * mark a working image as missing.
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

// A hung image request (lie-fi) fails the download instead of stalling it:
// the headers must arrive within ASSET_TIMEOUT_MS, then the body must keep
// moving (a large image arriving slowly on 2G is fine).
const ASSET_TIMEOUT_MS = 45_000;
const ASSET_STALL_TIMEOUT_MS = 30_000;
// An opaque (no-cors) body can't be read here, only handed to the cache, so
// storing it gets one overall limit instead.
const OPAQUE_ASSET_TIMEOUT_MS = 120_000;

/**
 * The controller behind one image request. It stays linked to the caller's
 * signal until the image is stored, so a cancel or a stall also stops the
 * body, not only the wait for the headers.
 */
function watchRequest(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) abort();
  let timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    /** Restarts the timer ("no progress for N ms"), optionally with a new limit. */
    touch(ms = timeoutMs) {
      timeoutMs = ms;
      clearTimeout(timer);
      timer = setTimeout(abort, ms);
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

type RequestWatch = ReturnType<typeof watchRequest>;

function cancelledError() {
  return new DOMException("Download cancelled", "AbortError");
}

/** The response headers, plus the watch the caller must dispose once the body is stored. */
async function fetchAsset(url: string, parentSignal?: AbortSignal): Promise<{ response: Response; watch: RequestWatch }> {
  const watch = watchRequest(parentSignal, ASSET_TIMEOUT_MS);
  const { signal } = watch;

  try {
    try {
      const response = await fetch(url, { mode: "cors", credentials: "omit", signal });
      if (!response.ok) throw new AssetDownloadError(url, response.status);
      return { response, watch };
    } catch (error) {
      if (signal.aborted || error instanceof AssetDownloadError) throw error;
      if (servesCors(url)) {
        // The connection, not the host: once more, then the image (and the
        // save, which can be retried) fails.
        const response = await fetch(url, { mode: "cors", credentials: "omit", signal }).catch((retryError) => {
          if (signal.aborted) throw retryError;
          throw new AssetDownloadError(url);
        });
        if (!response.ok) throw new AssetDownloadError(url, response.status);
        return { response, watch };
      }
      // A host without CORS headers (a teacher-pasted hotspot image): an
      // opaque response still displays in <img> when the worker serves it.
      try {
        return { response: await fetch(url, { mode: "no-cors", credentials: "omit", signal }), watch };
      } catch (fallbackError) {
        if (signal.aborted) throw fallbackError;
        throw new AssetDownloadError(url, undefined, true);
      }
    }
  } catch (error) {
    watch.dispose();
    // Our timeout (not the caller cancelling) is a failed image.
    if (signal.aborted && !parentSignal?.aborted) throw new AssetDownloadError(url);
    throw error;
  }
}

/** Reads a body chunk by chunk, restarting the stall timer on each one. */
async function readBody(url: string, response: Response, watch: RequestWatch): Promise<Blob> {
  const type = response.headers.get("content-type") || "";
  if (!response.body) return response.blob();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    watch.touch();
    chunks.push(value);
    received += value.length;
  }
  // A connection that drops mid-file can end the stream early without an error.
  const expected = Number(response.headers.get("content-length")) || 0;
  if (expected > 0 && received < expected) throw new AssetDownloadError(url);
  return new Blob(chunks as BlobPart[], type ? { type } : undefined);
}

/** Fetches one image and stores it under its URL. Returns its size (0 when the response is opaque). */
async function cacheAsset(cache: Cache, url: string, signal?: AbortSignal): Promise<number> {
  const { response, watch } = await fetchAsset(url, signal);
  try {
    if (response.type === "opaque") {
      // cache.put reads the body; aborting the request makes it fail.
      watch.touch(OPAQUE_ASSET_TIMEOUT_MS);
      if (signal?.aborted) throw cancelledError();
      await cache.put(url, response);
      return 0;
    }
    watch.touch(ASSET_STALL_TIMEOUT_MS);
    const blob = await readBody(url, response, watch);
    // A cancelled save writes nothing more.
    if (signal?.aborted) throw cancelledError();
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
  } catch (error) {
    // Our stall timer (not the caller cancelling) is a failed image.
    if (watch.signal.aborted && !signal?.aborted) throw new AssetDownloadError(url);
    throw error;
  } finally {
    watch.dispose();
  }
}

export interface CachedAssets {
  /** Bytes per URL (0 for opaque responses, whose size can't be read). Missing images aren't in it. */
  bytesByUrl: Record<string, number>;
  totalBytes: number;
  /** Images that are gone for good (a 404, a dead host): the lesson is saved without them, as it plays online. */
  missingUrls: string[];
  /** Call once the lesson is committed (or the download failed): lets pruning see these URLs again. */
  release: () => void;
}

const MISSING = Symbol("missing");

/**
 * Downloads `urls` into the asset cache (a few at a time). Already-cached
 * URLs are reused. Until `release()` the URLs are protected from
 * pruneOrphanedAssets.
 *
 * Any failure throws — a lesson with half its images isn't complete — except
 * for an image that is missing online too: a permanent HTTP error, or a link
 * that can't be fetched at all while `confirmOnline` shows the connection
 * works. Those are left out and listed in `missingUrls`, so one dead link
 * can't make a lesson unsaveable. Without `confirmOnline` an unreachable
 * image fails the download (it may just be the connection).
 */
export async function cacheLessonAssets(
  urls: string[],
  {
    signal,
    onProgress,
    confirmOnline,
  }: {
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
    confirmOnline?: () => Promise<boolean>;
  } = {}
): Promise<CachedAssets> {
  markPending(urls);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    unmarkPending(urls);
  };
  // Stops every image of this call: on cancel, and when one image fails (its
  // siblings would otherwise keep using data and land in the cache after the
  // failed download cleaned up).
  const batch = new AbortController();
  const stopBatch = () => batch.abort();
  signal?.addEventListener("abort", stopBatch, { once: true });
  if (signal?.aborted) stopBatch();

  const fetchOne = async (cache: Cache, url: string): Promise<number | typeof MISSING> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await cacheAsset(cache, url, batch.signal);
      } catch (error) {
        if (!(error instanceof AssetDownloadError) || batch.signal.aborted) throw error;
        if (isPermanentAssetStatus(error.status)) return MISSING;
        if (!error.unreachable) throw error;
        // Unreachable: once more, then only call it dead if the connection
        // demonstrably works. Lie-fi and dropped connections look the same.
        if (attempt === 0) continue;
        if (typeof navigator !== "undefined" && navigator.onLine === false) throw error;
        const online = confirmOnline ? await confirmOnline().catch(() => false) : false;
        if (online && !batch.signal.aborted) return MISSING;
        throw error;
      }
    }
  };

  try {
    const bytesByUrl: Record<string, number> = {};
    const missingUrls: string[] = [];
    if (urls.length === 0) return { bytesByUrl, totalBytes: 0, missingUrls, release };

    const cache = await caches.open(ASSET_CACHE);
    let done = 0;
    for (let index = 0; index < urls.length; index += FETCH_CONCURRENCY) {
      const group = urls.slice(index, index + FETCH_CONCURRENCY);
      let failed = false;
      let failure: unknown = null;
      // Settle the whole group before throwing, so no image is still being
      // written when the caller cleans up after the failure.
      await Promise.allSettled(
        group.map(async (url) => {
          try {
            if (batch.signal.aborted) throw cancelledError();
            let existing = await cache.match(url);
            // An opaque copy of our own host is from an earlier blip: fetch it properly.
            if (existing?.type === "opaque" && servesCors(url)) existing = undefined;
            const result = existing
              ? Number(existing.headers.get("content-length")) || 0
              : await fetchOne(cache, url);
            if (result === MISSING) missingUrls.push(url);
            else bytesByUrl[url] = result;
            done += 1;
            onProgress?.(done, urls.length);
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
              batch.abort();
            }
          }
        })
      );
      if (failed) throw failure;
    }

    const totalBytes = Object.values(bytesByUrl).reduce((total, bytes) => total + bytes, 0);
    return { bytesByUrl, totalBytes, missingUrls, release };
  } catch (error) {
    release();
    throw error;
  } finally {
    signal?.removeEventListener("abort", stopBatch);
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
 *
 * Only safe while no download runs in any tab — another tab's images are
 * cached before their lesson is committed — so call it through
 * pruneOrphanedStorage (download-manager), which holds the storage lock.
 * `isCurrent` turning false (logout) stops it before it deletes anything.
 */
export async function pruneOrphanedAssets(isCurrent: () => boolean = () => true): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    // Logout deleted the cache: opening it would create it again.
    if (!(await caches.has(ASSET_CACHE))) return 0;
    const cache = await caches.open(ASSET_CACHE);
    // Keys before references: an image committed in between is then kept.
    const requests = await cache.keys();
    const refs = await getAllAssetRefs();
    const referenced = new Set(
      refs.filter((ref) => ref.lessons?.length > 0).map((ref) => assetUrlFromMetaKey(ref.key))
    );
    const orphans = requests
      .map((request) => request.url)
      .filter((url) => !referenced.has(url) && !pendingAssetUrls.has(url));
    if (!isCurrent()) return 0;
    await Promise.all(orphans.map((url) => cache.delete(url).catch(() => false)));
    return orphans.length;
  } catch {
    return 0;
  }
}
