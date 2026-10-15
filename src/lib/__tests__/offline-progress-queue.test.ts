import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalLessonProgress, OfflineLesson, ProgressQueueItem } from "@/lib/offline/db";

// In-memory stand-ins for the phone's progress record and the sync queue.
const store = vi.hoisted(() => ({
  record: null as Partial<OfflineLesson> | null,
  local: null as LocalLessonProgress | null,
  queue: [] as ProgressQueueItem[],
  writes: 0,
}));

vi.mock("@/lib/offline/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/db")>();
  return {
    ...actual,
    getOfflineLesson: vi.fn(async () => store.record),
    getLocalProgress: vi.fn(async () => store.local),
    getQueuedUpdates: vi.fn(async () => store.queue),
    // Like the real one: one progress item per lesson, replaced on every save.
    saveLocalProgressAndQueue: vi.fn(async (progress: LocalLessonProgress, data: Record<string, unknown>) => {
      store.writes += 1;
      store.local = progress;
      store.queue = [
        ...store.queue.filter((item) => item.kind !== "progress" || item.lessonId !== progress.lessonId),
        { lessonId: progress.lessonId, ownerId: progress.ownerId, kind: "progress", data, timestamp: progress.updatedAt },
      ];
    }),
  };
});

import { queueLessonProgress } from "@/lib/offline/sync";

const OWNER = "student-1";
const LESSON = "lesson-1";

function save(positionSec: number, completedCandidate: boolean, practiceGated?: boolean) {
  return queueLessonProgress({
    ownerId: OWNER,
    lessonId: LESSON,
    positionSec,
    watchSec: positionSec,
    completedCandidate,
    practiceGated,
  });
}

function queuedCompleted() {
  return store.queue.find((item) => item.kind === "progress")?.data.completed;
}

beforeEach(() => {
  store.record = null;
  store.local = null;
  store.queue = [];
  store.writes = 0;
});

describe("queueLessonProgress for a copy saved before the practice gate was stored", () => {
  beforeEach(() => {
    // Schema 1: no `practice` field at all.
    store.record = { id: LESSON, ownerId: OWNER };
  });

  it("asks the server to complete it, without showing it finished on the phone", async () => {
    const saved = await save(25, true);
    expect(saved.completed).toBe(false);
    expect(store.local?.completed).toBe(false);
    expect(queuedCompleted()).toBe(true);
  });

  it("keeps the request when a later save no longer reaches the end", async () => {
    await save(25, true);
    // Next visit: the player's checkpoint starts again from scratch.
    await save(28, false);
    expect(queuedCompleted()).toBe(true);
  });

  it("queues the request even when the position didn't move", async () => {
    await save(25, false);
    expect(queuedCompleted()).toBe(false);
    await save(25, true);
    expect(queuedCompleted()).toBe(true);
    // Already waiting: nothing more to write.
    const writes = store.writes;
    await save(25, true);
    expect(store.writes).toBe(writes);
  });

  it("follows an explicit gate from the caller", async () => {
    await save(25, true, true);
    expect(queuedCompleted()).toBe(false);
  });
});

describe("queueLessonProgress with a known gate keeps today's rules", () => {
  it("completes a lesson with no gate on the phone and on the server", async () => {
    store.record = { id: LESSON, ownerId: OWNER, schema: 2, practice: null };
    const saved = await save(25, true);
    expect(saved.completed).toBe(true);
    expect(queuedCompleted()).toBe(true);
  });

  it("never completes a practice-gated lesson", async () => {
    store.record = { id: LESSON, ownerId: OWNER, schema: 2, practice: { assignmentId: "p-1", passed: false } };
    const saved = await save(25, true);
    expect(saved.completed).toBe(false);
    expect(queuedCompleted()).toBe(false);
  });

  it("doesn't complete a lesson that isn't saved on the phone", async () => {
    store.record = null;
    await save(25, true);
    expect(queuedCompleted()).toBe(false);
  });
});
