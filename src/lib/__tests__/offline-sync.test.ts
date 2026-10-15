import { describe, expect, it } from "vitest";
import {
  clampActivityTime,
  mergeLocalProgress,
  mergeProgressForSync,
  normalizeQueueItem,
  partitionQueueByOwner,
  progressIncreased,
  resolvePracticeGated,
  summarizeProgressItems,
} from "@/lib/offline/sync";
import type { OfflineQueueItem, ProgressQueueItem } from "@/lib/offline/db";

const NOW = new Date("2026-10-15T12:00:00.000Z");

describe("resolvePracticeGated", () => {
  it("lets the caller decide when it knows", () => {
    expect(resolvePracticeGated(null, false)).toBe(false);
    expect(resolvePracticeGated({ practice: null }, true)).toBe(true);
  });

  it("reads the saved lesson: null means no gate", () => {
    expect(resolvePracticeGated({ practice: null })).toBe(false);
    expect(resolvePracticeGated({ practice: { assignmentId: "p1", passed: false } })).toBe(true);
  });

  it("treats unknown (no record, or a record saved before the gate was stored) as gated", () => {
    expect(resolvePracticeGated(null)).toBe(true);
    expect(resolvePracticeGated(undefined)).toBe(true);
    expect(resolvePracticeGated({})).toBe(true);
  });
});

describe("mergeLocalProgress", () => {
  it("never goes below the server snapshot or earlier local progress", () => {
    const merged = mergeLocalProgress(
      { last_position_seconds: 40, total_watch_time_seconds: 50, completed: false },
      { last_position_seconds: 90, total_watch_time_seconds: 30, completed: false },
      { positionSec: 10, watchSec: 10, completedCandidate: false },
      false
    );
    expect(merged).toEqual({ last_position_seconds: 90, total_watch_time_seconds: 50, completed: false });
  });

  it("completes only an ungated lesson", () => {
    const update = { positionSec: 100, watchSec: 100, completedCandidate: true };
    expect(mergeLocalProgress(null, null, update, false).completed).toBe(true);
    expect(mergeLocalProgress(null, null, update, true).completed).toBe(false);
  });

  it("keeps a completion already earned, even on a re-watch", () => {
    const merged = mergeLocalProgress(
      null,
      { last_position_seconds: 120, total_watch_time_seconds: 120, completed: true },
      { positionSec: 5, watchSec: 5, completedCandidate: false },
      true
    );
    expect(merged.completed).toBe(true);
    expect(merged.last_position_seconds).toBe(120);
  });

  it("ignores negative and non-finite values", () => {
    const merged = mergeLocalProgress(null, null, { positionSec: -5, watchSec: Number.NaN, completedCandidate: false }, false);
    expect(merged).toEqual({ last_position_seconds: 0, total_watch_time_seconds: 0, completed: false });
  });
});

describe("progressIncreased", () => {
  it("is false for an update that isn't ahead", () => {
    const previous = { last_position_seconds: 50, total_watch_time_seconds: 50, completed: false };
    expect(progressIncreased(previous, { ...previous })).toBe(false);
    expect(progressIncreased(previous, { ...previous, last_position_seconds: 51 })).toBe(true);
    expect(progressIncreased(previous, { ...previous, completed: true })).toBe(true);
    expect(progressIncreased(null, { last_position_seconds: 0, total_watch_time_seconds: 0, completed: false })).toBe(false);
  });
});

describe("mergeProgressForSync", () => {
  const queued = {
    last_position_seconds: 100,
    total_watch_time_seconds: 110,
    completed: true,
    completedAt: "2026-10-14T09:00:00.000Z",
  };

  it("takes the higher position and watch time and completes an ungated lesson", () => {
    const write = mergeProgressForSync(
      { last_position_seconds: 120, total_watch_time_seconds: 60, completed: false, completed_at: null },
      queued,
      { gated: false, now: NOW }
    );
    expect(write).toEqual({
      last_position_seconds: 120,
      total_watch_time_seconds: 110,
      completed: true,
      completed_at: "2026-10-14T09:00:00.000Z",
    });
  });

  it("never completes a practice-gated lesson and never sends completed:false", () => {
    const write = mergeProgressForSync(null, queued, { gated: true, now: NOW });
    expect(write).toEqual({ last_position_seconds: 100, total_watch_time_seconds: 110 });
    expect(write && "completed" in write).toBe(false);
  });

  it("keeps an existing completion (and its completed_at) untouched", () => {
    const write = mergeProgressForSync(
      { last_position_seconds: 10, total_watch_time_seconds: 10, completed: true, completed_at: "2026-01-01T00:00:00Z" },
      queued,
      { gated: false, now: NOW }
    );
    expect(write).toEqual({ last_position_seconds: 100, total_watch_time_seconds: 110 });
  });

  it("writes nothing when the server already has everything", () => {
    expect(
      mergeProgressForSync(
        { last_position_seconds: 200, total_watch_time_seconds: 200, completed: true, completed_at: "2026-01-01T00:00:00Z" },
        queued,
        { gated: false, now: NOW }
      )
    ).toBeNull();
    expect(
      mergeProgressForSync(null, { last_position_seconds: 0, total_watch_time_seconds: 0, completed: false, completedAt: null }, {
        gated: false,
        now: NOW,
      })
    ).toBeNull();
  });

  it("treats null server columns as zero", () => {
    const write = mergeProgressForSync(
      { last_position_seconds: null, total_watch_time_seconds: null, completed: null, completed_at: null },
      { ...queued, completed: false },
      { gated: false, now: NOW }
    );
    expect(write).toEqual({ last_position_seconds: 100, total_watch_time_seconds: 110 });
  });
});

describe("clampActivityTime", () => {
  it("keeps a plausible device time", () => {
    expect(clampActivityTime("2026-10-14T09:00:00.000Z", NOW)).toBe("2026-10-14T09:00:00.000Z");
  });

  it("pulls future and far-past device times into range", () => {
    expect(clampActivityTime("2027-01-01T00:00:00.000Z", NOW)).toBe(NOW.toISOString());
    expect(clampActivityTime("2020-01-01T00:00:00.000Z", NOW)).toBe("2026-10-01T12:00:00.000Z");
    expect(clampActivityTime("not a date", NOW)).toBe(NOW.toISOString());
    expect(clampActivityTime(null, NOW)).toBe(NOW.toISOString());
  });
});

describe("queue items", () => {
  it("maps v1 lesson_progress items to the current shape, owned by their student", () => {
    const v1: ProgressQueueItem = {
      id: 7,
      lessonId: "lesson-1",
      table: "lesson_progress",
      timestamp: "2026-10-01T00:00:00.000Z",
      data: {
        student_id: "user-a",
        lesson_id: "lesson-1",
        last_position_seconds: 30,
        total_watch_time_seconds: 40,
        questions_answered: 0,
        completed: false,
        completed_at: null,
      },
    };
    expect(normalizeQueueItem(v1)).toEqual({
      id: 7,
      lessonId: "lesson-1",
      ownerId: "user-a",
      kind: "progress",
      timestamp: "2026-10-01T00:00:00.000Z",
      data: { last_position_seconds: 30, total_watch_time_seconds: 40, completed: false },
    });
  });

  it("drops items it can't attribute or doesn't understand", () => {
    expect(normalizeQueueItem({ lessonId: "l", table: "lesson_progress", data: {}, timestamp: "" })).toBeNull();
    expect(
      normalizeQueueItem({ lessonId: "l", table: "lesson_question_responses", data: { student_id: "u" }, timestamp: "" })
    ).toBeNull();
  });

  it("sends only the verified user's items; other accounts' are set aside", () => {
    const items: ProgressQueueItem[] = [
      { id: 1, lessonId: "l1", ownerId: "user-a", kind: "progress", data: {}, timestamp: "t" },
      { id: 2, lessonId: "l1", ownerId: "user-b", kind: "progress", data: {}, timestamp: "t" },
      { id: 3, lessonId: "l2", table: "lesson_progress", data: { student_id: "user-a" }, timestamp: "t" },
      { id: 4, lessonId: "l3", table: "mystery", data: {}, timestamp: "t" },
    ];
    const { mine, foreign, invalid } = partitionQueueByOwner(items, "user-a");
    expect(mine.map((item) => item.id)).toEqual([1, 3]);
    expect(foreign.map((item) => item.id)).toEqual([2]);
    expect(invalid.map((item) => item.id)).toEqual([4]);
  });

  it("summarizes progress and complete items, ignoring answers", () => {
    const items: OfflineQueueItem[] = [
      { lessonId: "l", ownerId: "u", kind: "progress", timestamp: "2026-10-10T00:00:00Z", data: { last_position_seconds: 50, total_watch_time_seconds: 60, completed: false } },
      { lessonId: "l", ownerId: "u", kind: "complete", timestamp: "2026-10-12T00:00:00Z", data: { completed_at: "2026-10-12T00:00:00Z", last_position_seconds: 80, total_watch_time_seconds: 80 } },
      { lessonId: "l", ownerId: "u", kind: "progress", timestamp: "2026-10-11T00:00:00Z", data: { last_position_seconds: 70, total_watch_time_seconds: 90, completed: true } },
      { lessonId: "l", ownerId: "u", kind: "slide_response", timestamp: "2026-10-13T00:00:00Z", data: { last_position_seconds: 999 } },
    ];
    expect(summarizeProgressItems(items)).toEqual({
      last_position_seconds: 80,
      total_watch_time_seconds: 90,
      completed: true,
      completedAt: "2026-10-11T00:00:00Z",
    });
  });
});
