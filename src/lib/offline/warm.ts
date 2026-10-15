/**
 * Loads, while online, the code the offline player needs later, so the
 * service worker has it cached when there's no connection:
 *   - every exploration widget chunk (React.lazy loads them on first use,
 *     and a widget first needed offline would otherwise fail);
 *   - fresh copies of the /offline and /offline/play shells plus the build
 *     files they reference (the worker refreshes its shell cache from these).
 * Called after each successful download and by the offline player when online.
 */

import { EXPLORATION_WIDGET_LOADERS } from "@/lib/explorations/registry";
import { OFFLINE_HUB_PATH, OFFLINE_PLAYER_PATH } from "./cache-names";

const SHELL_PATHS = [OFFLINE_PLAYER_PATH, OFFLINE_HUB_PATH];
// Build files referenced by a shell, including the escaped URLs inside the
// inline flight data (`\/_next\/static\/...` or `/_next...`). Same pattern as
// the service worker's; the lookahead stops `.js` matching the start of `.json`.
const STATIC_ASSET_PATTERN = /\/_next\/static\/[^"'\s\\)<>]+?\.(?:js|css|woff2|woff|ttf)(?![\w-])/g;
const MAX_STATIC_FILES = 200;
const FETCH_CONCURRENCY = 4;
// Don't repeat the whole warm-up for every lesson in a batch of downloads.
const MIN_INTERVAL_MS = 60_000;

let warming: Promise<void> | null = null;
let lastWarmedAt = 0;

/** Every same-origin /_next/static build file a shell's HTML refers to. Pure, for tests. */
export function extractStaticAssetUrls(html: string): string[] {
  const unescaped = html.replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
  const urls = new Set<string>();
  for (const match of unescaped.matchAll(STATIC_ASSET_PATTERN)) {
    urls.add(match[0]);
    if (urls.size >= MAX_STATIC_FILES) break;
  }
  return [...urls];
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.allSettled(items.slice(index, index + size).map(run));
  }
}

async function warmWidgetChunks() {
  await Promise.allSettled(Object.values(EXPLORATION_WIDGET_LOADERS).map((load) => load()));
}

async function warmShells() {
  const htmlBodies = await Promise.all(
    SHELL_PATHS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "no-store", credentials: "same-origin" });
        if (!response.ok || response.redirected) return "";
        if (!(response.headers.get("content-type") || "").includes("text/html")) return "";
        return await response.text();
      } catch {
        return "";
      }
    })
  );

  const assets = [...new Set(htmlBodies.flatMap(extractStaticAssetUrls))];
  // Normal fetches: build files are immutable, so the HTTP cache usually
  // answers, and the worker stores what passes through it.
  await inBatches(assets, FETCH_CONCURRENCY, (url) =>
    fetch(url, { credentials: "same-origin" }).catch(() => undefined)
  );
}

/**
 * Warms the offline player's chunks and shells. Safe to call often: it does
 * nothing offline, shares one run between concurrent callers and skips runs
 * within a minute of the last (pass `force` to override).
 */
export function warmOfflinePlayerChunks({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return Promise.resolve();
  if (warming) return warming;
  if (!force && Date.now() - lastWarmedAt < MIN_INTERVAL_MS) return Promise.resolve();

  warming = Promise.allSettled([warmWidgetChunks(), warmShells()])
    .then(() => {
      lastWarmedAt = Date.now();
    })
    .finally(() => {
      warming = null;
    });
  return warming;
}
