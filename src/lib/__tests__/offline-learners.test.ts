import { afterEach, describe, expect, it, vi } from "vitest";
import {
  localProgressKey,
  migrateLegacyProgressRecord,
  migrateLegacyResponsesRecord,
  normalizeQueueItem,
  planSlideAnswerQueue,
  responsesKey,
} from "@/lib/offline/db";
import {
  activeLearnerStorageKey,
  cacheValidatedLearnerSelection,
  getCachedActiveLearnerId,
  selectCachedLearner,
  validateActiveLearner,
} from "@/lib/offline/learner";

const ACCOUNT = "account-a";
const CHILD = "child-a";
const LESSON = "lesson-a";

function localStorageStub() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("learner-partitioned offline keys", () => {
  it("uses account + learner + lesson for progress and saved answers", () => {
    expect(localProgressKey(ACCOUNT, LESSON, CHILD)).toBe(`${ACCOUNT}:${CHILD}:${LESSON}`);
    expect(responsesKey(ACCOUNT, LESSON, CHILD)).toBe(`${ACCOUNT}:${CHILD}:${LESSON}`);
    expect(localProgressKey(ACCOUNT, LESSON)).toBe(`${ACCOUNT}:${ACCOUNT}:${LESSON}`);
  });

  it("migrates v2 self progress and ordered answers without changing values", () => {
    const oldProgress = {
      key: `progress:${ACCOUNT}:${LESSON}`,
      ownerId: ACCOUNT,
      lessonId: LESSON,
      last_position_seconds: 41,
      total_watch_time_seconds: 60,
      completed: true,
      updatedAt: "2026-10-15T12:00:00.000Z",
    } as const;
    expect(migrateLegacyProgressRecord(oldProgress)).toEqual({
      ...oldProgress,
      key: `${ACCOUNT}:${ACCOUNT}:${LESSON}`,
      learnerId: ACCOUNT,
    });

    const bySlide = { s2: { answer: "B", isCorrect: true }, s1: { answer: "A", isCorrect: false } };
    const oldAnswers = { key: `${ACCOUNT}:${LESSON}`, ownerId: ACCOUNT, lessonId: LESSON, bySlide } as const;
    const migrated = migrateLegacyResponsesRecord(oldAnswers);
    expect(migrated).toEqual({ ...oldAnswers, key: `${ACCOUNT}:${ACCOUNT}:${LESSON}`, learnerId: ACCOUNT });
    expect(Object.keys(migrated.bySlide)).toEqual(["s2", "s1"]);
  });

  it("maps v2 queue rows to self while keeping the account owner", () => {
    expect(
      normalizeQueueItem({
        id: 9,
        lessonId: LESSON,
        ownerId: ACCOUNT,
        kind: "progress",
        data: { last_position_seconds: 3 },
        timestamp: "2026-10-15T12:00:00.000Z",
      })
    ).toMatchObject({ ownerId: ACCOUNT, learnerId: ACCOUNT, lessonId: LESSON, kind: "progress" });
  });

  it("never lets sibling answers replace or supersede each other", () => {
    const one = {
      id: 1,
      lessonId: LESSON,
      ownerId: ACCOUNT,
      learnerId: CHILD,
      kind: "slide_response" as const,
      data: { slideId: "slide-1", answer: "child" },
      timestamp: "2026-10-15T12:00:00.000Z",
    };
    const two = {
      ...one,
      id: 2,
      learnerId: ACCOUNT,
      data: { slideId: "slide-1", answer: "self" },
    };
    expect(planSlideAnswerQueue(null, [one], two)).toEqual({ action: "add" });
  });
});

describe("cached active learner", () => {
  it("stores a validated selection under the private account-scoped key", () => {
    const storage = localStorageStub();
    vi.stubGlobal("window", { localStorage: storage });
    expect(cacheValidatedLearnerSelection(ACCOUNT, CHILD, [CHILD])).toBe(true);
    expect(storage.values.has(activeLearnerStorageKey(ACCOUNT))).toBe(true);
    expect(getCachedActiveLearnerId(ACCOUNT)).toBe(CHILD);
  });

  it("refuses an unvalidated offline switch and defaults to self", () => {
    const storage = localStorageStub();
    vi.stubGlobal("window", { localStorage: storage });
    expect(selectCachedLearner(ACCOUNT, "foreign-child")).toBe(false);
    expect(getCachedActiveLearnerId(ACCOUNT)).toBe(ACCOUNT);
  });

  it("resets a stale child selection after the fresh learner list omits it", async () => {
    const storage = localStorageStub();
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("navigator", { onLine: true });
    cacheValidatedLearnerSelection(ACCOUNT, CHILD, [CHILD]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ accountId: ACCOUNT, learners: [{ id: ACCOUNT, isSelf: true, name: "Parent", avatar: null, gradeLevel: null }] })
      )
    );
    await expect(validateActiveLearner(ACCOUNT)).resolves.toMatchObject({
      learnerId: ACCOUNT,
      validatedOnline: true,
    });
    expect(getCachedActiveLearnerId(ACCOUNT)).toBe(ACCOUNT);
  });
});
