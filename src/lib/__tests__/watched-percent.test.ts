import { describe, expect, it } from "vitest";
import { watchedPercent } from "@/lib/lessons/watched-percent";

describe("watchedPercent", () => {
  it("computes position over duration", () => {
    expect(watchedPercent(30, 120)).toBe(25);
    expect(watchedPercent(60, 120)).toBe(50);
    expect(watchedPercent(120, 120)).toBe(100);
  });

  it("treats a completed lesson as 100 even without a known duration", () => {
    // lessons.video_duration_seconds is nullable — only written when a sim is
    // recorded — so a finished lesson must not read 0%.
    expect(watchedPercent(null, null, true)).toBe(100);
    expect(watchedPercent(0, 0, true)).toBe(100);
  });

  it("returns 0 rather than inventing a number when duration is unknown", () => {
    expect(watchedPercent(45, null)).toBe(0);
    expect(watchedPercent(45, 0)).toBe(0);
  });

  it("handles missing and negative positions", () => {
    expect(watchedPercent(null, 120)).toBe(0);
    expect(watchedPercent(undefined, 120)).toBe(0);
    expect(watchedPercent(-10, 120)).toBe(0);
  });

  it("clamps past the end (a position beyond duration stays 100)", () => {
    // duration_ms can drift below the real recording length after an edit.
    expect(watchedPercent(500, 120)).toBe(100);
  });
});
