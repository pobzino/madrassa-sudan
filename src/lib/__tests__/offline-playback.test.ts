import { afterEach, describe, expect, it, vi } from "vitest";
import { resumeVirtualMs } from "@/components/offline/helpers";
import { ensureServiceWorker, isOfflinePlaybackReady } from "@/lib/offline/readiness";
import type { OfflineLesson } from "@/lib/offline/db";
import type { SimClipSegment } from "@/lib/sim.types";

function lessonWith(durationMs: number, clips: SimClipSegment[] | null = null): Pick<OfflineLesson, "sim"> {
  return {
    sim: {
      audio_url: null,
      sim: { duration_ms: durationMs, audio_duration_ms: null, clip_segments: clips } as NonNullable<
        OfflineLesson["sim"]
      >["sim"],
    },
  };
}

describe("resuming a saved position", () => {
  // 30 s recording with 3–13 s cut: 20 s visible.
  const trimmed = lessonWith(30_000, [{ start: 3, end: 13 }]);

  it("converts by the share watched, not as audio time", () => {
    // 18 s of 30 = 60 % of the visible 20 s.
    expect(resumeVirtualMs(trimmed, 18)).toBe(12_000);
    expect(resumeVirtualMs(trimmed, 12)).toBe(8_000);
  });

  it("starts over near the end, like the player does", () => {
    expect(resumeVirtualMs(trimmed, 29)).toBeNull();
    expect(resumeVirtualMs(trimmed, 45)).toBeNull();
  });

  it("keeps untrimmed lessons as they were", () => {
    expect(resumeVirtualMs(lessonWith(30_000), 18)).toBe(18_000);
    expect(resumeVirtualMs(lessonWith(30_000, []), 12)).toBe(12_000);
  });

  it("merges overlapping cuts the way the player does", () => {
    // 4–14 s cut in all: 20 s visible.
    expect(resumeVirtualMs(lessonWith(30_000, [{ start: 4, end: 10 }, { start: 8, end: 14 }]), 15)).toBe(10_000);
  });

  it("doesn't resume without a position or a length", () => {
    expect(resumeVirtualMs(trimmed, 0)).toBeNull();
    expect(resumeVirtualMs(trimmed, Number.NaN)).toBeNull();
    expect(resumeVirtualMs(lessonWith(0), 10)).toBeNull();
    expect(resumeVirtualMs({ sim: null }, 10)).toBeNull();
  });
});

// ── Offline pages ready ──────────────────────────────────────────────────────

type FakeCaches = Record<string, string[]>;

function stubBrowser({
  registration,
  caches = {},
  serviceWorker = true,
}: {
  registration?: Partial<ServiceWorkerRegistration> | null;
  caches?: FakeCaches;
  serviceWorker?: boolean;
}) {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("window", { isSecureContext: true, location: { hostname: "amal.example" } });
  const container = {
    getRegistration: vi.fn(async () => registration ?? undefined),
    register: vi.fn(async () => registration),
  };
  vi.stubGlobal("navigator", serviceWorker ? { onLine: true, serviceWorker: container } : { onLine: true });
  vi.stubGlobal("caches", {
    keys: async () => Object.keys(caches),
    open: async (name: string) => ({
      match: async (path: string) => (caches[name]?.includes(path) ? new Response("") : undefined),
    }),
  });
  return container;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isOfflinePlaybackReady", () => {
  const active = { active: {} as ServiceWorker };

  it("is ready with an active worker and both offline pages cached", async () => {
    stubBrowser({ registration: active, caches: { "amal-shell-abc": ["/offline", "/offline/play"] } });
    expect(await isOfflinePlaybackReady()).toBe(true);
  });

  it("isn't ready while the worker has not installed (or its install failed)", async () => {
    stubBrowser({ registration: null, caches: { "amal-shell-abc": ["/offline", "/offline/play"] } });
    expect(await isOfflinePlaybackReady()).toBe(false);
    stubBrowser({ registration: { active: null }, caches: { "amal-shell-abc": ["/offline", "/offline/play"] } });
    expect(await isOfflinePlaybackReady()).toBe(false);
  });

  it("needs both pages in one of this worker's shell caches", async () => {
    stubBrowser({ registration: active, caches: { "amal-shell-abc": ["/offline"] } });
    expect(await isOfflinePlaybackReady()).toBe(false);
    // The first offline version's leftover copy doesn't count.
    stubBrowser({ registration: active, caches: { "amal-sw-v2": ["/offline", "/offline/play"] } });
    expect(await isOfflinePlaybackReady()).toBe(false);
  });

  it("isn't ready where no service worker can run", async () => {
    stubBrowser({ serviceWorker: false, caches: { "amal-shell-abc": ["/offline", "/offline/play"] } });
    expect(await isOfflinePlaybackReady()).toBe(false);
  });

  it("counts as ready in development, where the worker is turned off", async () => {
    stubBrowser({ registration: null });
    vi.stubEnv("NODE_ENV", "development");
    expect(await isOfflinePlaybackReady()).toBe(true);
  });
});

describe("ensureServiceWorker", () => {
  it("registers again, and asks a registration with no worker to try once more", async () => {
    const update = vi.fn(async () => undefined);
    const empty = { active: null, installing: null, waiting: null, update } as unknown as ServiceWorkerRegistration;
    const container = stubBrowser({ registration: empty });
    expect(await ensureServiceWorker()).toBe(empty);
    expect(container.register).toHaveBeenCalledWith("/sw.js");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("leaves a worker that is installing or active alone", async () => {
    const update = vi.fn(async () => undefined);
    const installing = { active: null, installing: {}, waiting: null, update } as unknown as ServiceWorkerRegistration;
    stubBrowser({ registration: installing });
    await ensureServiceWorker();
    expect(update).not.toHaveBeenCalled();
  });
});
