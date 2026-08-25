import { describe, expect, it } from "vitest";
import {
  buildLearningPathLessonOrder,
  getAdjacentLessonIds,
} from "@/lib/lessons/path-navigation";

describe("learning-path navigation", () => {
  const weeks = [
    { id: "week-3", path_id: "path", week_number: 3 },
    { id: "week-1", path_id: "path", week_number: 1 },
    { id: "week-2", path_id: "path", week_number: 2 },
  ];
  const steps = [
    { week_id: "week-2", lesson_id: "lesson-4", sequence: 2 },
    { week_id: "week-1", lesson_id: "lesson-2", sequence: 2 },
    { week_id: "week-3", lesson_id: "lesson-5", sequence: 1 },
    { week_id: "week-1", lesson_id: "lesson-1", sequence: 1 },
    { week_id: "week-2", lesson_id: "lesson-3", sequence: 1 },
  ];

  it("orders lessons by week then step sequence", () => {
    expect(buildLearningPathLessonOrder(weeks, steps)).toEqual([
      "lesson-1",
      "lesson-2",
      "lesson-3",
      "lesson-4",
      "lesson-5",
    ]);
  });

  it("moves directly across a week boundary", () => {
    const order = buildLearningPathLessonOrder(weeks, steps);
    expect(getAdjacentLessonIds(order, "lesson-2")).toEqual({
      previousId: "lesson-1",
      nextId: "lesson-3",
    });
  });

  it("does not invent neighbours for a lesson outside the path", () => {
    expect(getAdjacentLessonIds(["lesson-1", "lesson-2"], "other")).toEqual({
      previousId: null,
      nextId: null,
    });
  });
});
