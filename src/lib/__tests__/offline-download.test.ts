import { describe, expect, it } from "vitest";
import {
  DOWNLOAD_ERROR_MESSAGES,
  downloadErrorMessage,
  isSimOutdated,
  pickAudioMime,
} from "@/lib/offline/download-manager";
import { pickAutoDownloadsToEvict } from "@/lib/offline/auto-download";
import { extractStaticAssetUrls } from "@/lib/offline/warm";
import { normalizeQueueItem } from "@/lib/offline/db";
import { AUDIO_CACHE, offlineAudioKey, offlinePlayerUrl } from "@/lib/offline/cache-names";

describe("pickAudioMime", () => {
  it("prefers the sim's recorded type, then the response, then the extension", () => {
    expect(pickAudioMime("audio/webm;codecs=opus", "application/octet-stream", "a.mp3")).toBe("audio/webm;codecs=opus");
    expect(pickAudioMime(null, "audio/mp4", "a.webm")).toBe("audio/mp4");
    expect(pickAudioMime("", "application/octet-stream", "lesson/abc/audio.m4a")).toBe("audio/mp4");
    expect(pickAudioMime(null, null, "https://x.example/a.webm?token=1#t")).toBe("audio/webm");
    expect(pickAudioMime(null, null, "a.MP3")).toBe("audio/mpeg");
  });

  it("returns null instead of guessing", () => {
    expect(pickAudioMime(null, "application/octet-stream", "https://x.example/blob")).toBeNull();
    expect(pickAudioMime(undefined, undefined, undefined)).toBeNull();
  });
});

describe("isSimOutdated", () => {
  const server = { id: "sim-1", updated_at: "2026-10-01T10:00:00+00:00" };

  it("is false for the same recording, whatever the timestamp format", () => {
    expect(isSimOutdated({ simId: "sim-1", simUpdatedAt: "2026-10-01T10:00:00.000Z" }, server)).toBe(false);
  });

  it("is true when the teacher re-recorded or edited it", () => {
    expect(isSimOutdated({ simId: "sim-0", simUpdatedAt: "2026-10-01T10:00:00.000Z" }, server)).toBe(true);
    expect(isSimOutdated({ simId: "sim-1", simUpdatedAt: "2026-09-01T10:00:00.000Z" }, server)).toBe(true);
    expect(isSimOutdated({}, server)).toBe(true);
  });
});

describe("download error messages", () => {
  it("has English and Arabic copy for every code", () => {
    for (const [code, copy] of Object.entries(DOWNLOAD_ERROR_MESSAGES)) {
      expect(copy.en, code).toBeTruthy();
      expect(copy.ar, code).toMatch(/[؀-ۿ]/);
    }
    expect(downloadErrorMessage("no_audio", "en")).toBe("This lesson can't be saved for offline yet.");
    expect(downloadErrorMessage(undefined, "ar")).toBe(DOWNLOAD_ERROR_MESSAGES.unknown.ar);
  });
});

describe("pickAutoDownloadsToEvict", () => {
  const lessons = [
    { id: "a1", origin: "auto" as const, downloadedAt: "2026-10-01T00:00:00Z" },
    { id: "m1", origin: "manual" as const, downloadedAt: "2026-09-01T00:00:00Z" },
    { id: "a2", origin: "auto" as const, downloadedAt: "2026-10-02T00:00:00Z" },
    { id: "a3", origin: "auto" as const, downloadedAt: "2026-10-03T00:00:00Z" },
    { id: "a4", origin: "auto" as const, downloadedAt: "2026-10-04T00:00:00Z" },
    { id: "a5", origin: "auto" as const, downloadedAt: "2026-10-05T00:00:00Z" },
    { id: "old", downloadedAt: "2026-01-01T00:00:00Z" },
  ];

  it("removes the oldest automatic downloads beyond the newest three, never manual ones", () => {
    expect(pickAutoDownloadsToEvict(lessons)).toEqual(["a2", "a1"]);
  });

  it("never removes a protected lesson (the one being watched)", () => {
    expect(pickAutoDownloadsToEvict(lessons, { protectedIds: ["a1"] })).toEqual(["a2"]);
  });
});

describe("extractStaticAssetUrls", () => {
  it("finds build files in tags and in escaped flight data, once each", () => {
    const html = `
      <link rel="stylesheet" href="/_next/static/css/app-123.css">
      <script src="/_next/static/chunks/main-abc.js" async></script>
      <script>self.__next_f.push([1,"0:[\\"\\/_next\\/static\\/chunks\\/lazy-9f.js\\"]"])</script>
      <script>self.__next_f.push([1,"\\u002F_next\\u002Fstatic\\u002Fmedia\\u002Ffont-1.woff2"])</script>
      <script src="/_next/static/chunks/main-abc.js"></script>
      <img src="/_next/static/media/logo.png">`;
    expect(extractStaticAssetUrls(html)).toEqual([
      "/_next/static/css/app-123.css",
      "/_next/static/chunks/main-abc.js",
      "/_next/static/chunks/lazy-9f.js",
      "/_next/static/media/font-1.woff2",
    ]);
  });
});

describe("storage names", () => {
  it("keeps the v1 audio cache name and key so existing downloads still play", () => {
    expect(AUDIO_CACHE).toBe("sim-audio-downloads");
    expect(offlineAudioKey("abc")).toBe("/offline-audio/abc");
    expect(offlinePlayerUrl("a b")).toBe("/offline/play?id=a%20b");
  });

  it("stores v1 compat queue writes in the current shape", () => {
    expect(
      normalizeQueueItem({
        lessonId: "l",
        table: "lesson_progress",
        data: { student_id: "u", last_position_seconds: 5, total_watch_time_seconds: 6, completed: true, completed_at: "x" },
        timestamp: "t",
      })
    ).toMatchObject({ ownerId: "u", kind: "progress", data: { completed: true, completed_at: "x" } });
  });
});
