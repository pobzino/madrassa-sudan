import { describe, expect, it } from "vitest";
import {
  COMPLETION_PERCENT,
  PROGRESS_SAVE_STEP_SEC,
  contentLanguageFor,
  formatBytes,
  hasUnsavedProgress,
  lessonDurationSec,
  pickLocalized,
  positionForPercent,
  savedLessonBytes,
  shouldSaveProgress,
  watchedPercent,
} from "../helpers";
import type { OfflineLesson } from "@/lib/offline/db";

function simWithDuration(durationMs: number, audioDurationMs: number | null = null): Pick<OfflineLesson, "sim"> {
  return {
    sim: {
      audio_url: null,
      sim: { duration_ms: durationMs, audio_duration_ms: audioDurationMs } as NonNullable<OfflineLesson["sim"]>["sim"],
    },
  };
}

describe("contentLanguageFor", () => {
  it("keeps a single-language deck in its own language", () => {
    expect(contentLanguageFor({ slideLanguageMode: "ar" }, "en")).toBe("ar");
    expect(contentLanguageFor({ slideLanguageMode: "en" }, "ar")).toBe("en");
  });

  it("follows the app language for bilingual or unknown decks", () => {
    expect(contentLanguageFor({ slideLanguageMode: "both" }, "ar")).toBe("ar");
    expect(contentLanguageFor({ slideLanguageMode: null }, "en")).toBe("en");
    expect(contentLanguageFor({}, "ar")).toBe("ar");
    expect(contentLanguageFor(null, "en")).toBe("en");
  });
});

describe("pickLocalized", () => {
  it("prefers the requested language and falls back to the other", () => {
    expect(pickLocalized("ar", "عربي", "English")).toBe("عربي");
    expect(pickLocalized("en", "عربي", "English")).toBe("English");
    expect(pickLocalized("en", "عربي", "")).toBe("عربي");
    expect(pickLocalized("ar", null, "English")).toBe("English");
    expect(pickLocalized("ar", null, undefined)).toBe("");
  });
});

describe("sizes and durations", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(Number.NaN)).toBe("0 MB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(42 * 1024 * 1024)).toBe("42 MB");
  });

  it("adds audio and image bytes, ignoring missing or bad values", () => {
    expect(savedLessonBytes({ audioSize: 1000, assetBytes: 500 })).toBe(1500);
    expect(savedLessonBytes({ audioSize: 1000 })).toBe(1000);
    expect(savedLessonBytes({ audioSize: Number.NaN, assetBytes: -5 })).toBe(0);
  });

  it("reads the recording length, falling back to the audio length", () => {
    expect(lessonDurationSec(simWithDuration(61_200))).toBe(62);
    expect(lessonDurationSec(simWithDuration(0, 30_000))).toBe(30);
    expect(lessonDurationSec({ sim: null })).toBe(0);
    expect(lessonDurationSec(null)).toBe(0);
  });

  it("works out how much was watched", () => {
    expect(watchedPercent(30, 120)).toBe(25);
    expect(watchedPercent(500, 120)).toBe(100);
    expect(watchedPercent(10, 0)).toBe(0);
    expect(watchedPercent(0, 120, true)).toBe(100);
  });

  it("maps a player percentage to a position within the lesson", () => {
    expect(positionForPercent(50, 120)).toBe(60);
    expect(positionForPercent(150, 120)).toBe(120);
    expect(positionForPercent(-10, 120)).toBe(0);
    expect(positionForPercent(Number.NaN, 120)).toBe(0);
    expect(positionForPercent(50, 0)).toBe(0);
  });
});

describe("progress checkpoints", () => {
  it("saves every few seconds of new playback", () => {
    expect(shouldSaveProgress(null, { positionSec: 3, completedCandidate: false })).toBe(false);
    expect(shouldSaveProgress(null, { positionSec: PROGRESS_SAVE_STEP_SEC, completedCandidate: false })).toBe(true);
    const last = { positionSec: 40, completedCandidate: false };
    expect(shouldSaveProgress(last, { positionSec: 45, completedCandidate: false })).toBe(false);
    expect(shouldSaveProgress(last, { positionSec: 40 + PROGRESS_SAVE_STEP_SEC, completedCandidate: false })).toBe(true);
  });

  it("saves as soon as the lesson counts as finished, once", () => {
    expect(COMPLETION_PERCENT).toBe(80);
    const last = { positionSec: 95, completedCandidate: false };
    expect(shouldSaveProgress(last, { positionSec: 96, completedCandidate: true })).toBe(true);
    expect(shouldSaveProgress({ positionSec: 96, completedCandidate: true }, { positionSec: 97, completedCandidate: true })).toBe(false);
  });

  it("knows when pausing or leaving has something left to save", () => {
    expect(hasUnsavedProgress(null, null)).toBe(false);
    expect(hasUnsavedProgress(null, { positionSec: 2, completedCandidate: false })).toBe(true);
    expect(hasUnsavedProgress({ positionSec: 20, completedCandidate: false }, { positionSec: 20, completedCandidate: false })).toBe(false);
    expect(hasUnsavedProgress({ positionSec: 20, completedCandidate: false }, { positionSec: 24, completedCandidate: false })).toBe(true);
    expect(hasUnsavedProgress({ positionSec: 20, completedCandidate: false }, { positionSec: 20, completedCandidate: true })).toBe(true);
  });
});
