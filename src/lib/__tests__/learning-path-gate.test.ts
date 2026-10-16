import { describe, expect, it } from "vitest";
import { closePathBehindPlacement, placementGateApplies } from "@/lib/learning-path-gate";
import type { SubjectLearningPath } from "@/lib/lessons/useLearningPath";

describe("placementGateApplies", () => {
  const base = { required: true, completed: false, completedLessonsInPath: 0, learnerRole: "student" };
  it("holds for a child who has not started the path and not met a required boss", () => {
    expect(placementGateApplies(base)).toBe(true);
    expect(placementGateApplies({ ...base, learnerRole: null })).toBe(true);
  });
  it("never holds once a lesson is done, once the boss is met, when staff switched it off, or for staff", () => {
    expect(placementGateApplies({ ...base, completedLessonsInPath: 1 })).toBe(false);
    expect(placementGateApplies({ ...base, completed: true })).toBe(false);
    expect(placementGateApplies({ ...base, required: false })).toBe(false);
    expect(placementGateApplies({ ...base, learnerRole: "teacher" })).toBe(false);
    expect(placementGateApplies({ ...base, learnerRole: "admin" })).toBe(false);
  });
});

describe("closePathBehindPlacement", () => {
  it("locks every lesson, test and Big Challenge and clears the current step, leaving the rest untouched", () => {
    const path = {
      currentStepId: "step-1",
      weeks: [
        {
          id: "w1", weekNumber: 1, title: "W1", state: "in_progress", testState: "available", testAssignmentId: "t1",
          steps: [
            { id: "step-1", lessonId: "l1", sequence: 1, state: "in_progress", practiceState: "available", title: "L1" },
            { id: "step-2", lessonId: "l2", sequence: 2, state: "locked", practiceState: "none", title: "L2" },
          ],
        },
        { id: "w2", weekNumber: 2, title: "W2", state: "locked", testState: "none", testAssignmentId: null, steps: [] },
      ],
      milestones: [{ id: "m4", afterWeekNumber: 4, state: "available" }],
      placement: { id: "p", gate: true },
    } as unknown as SubjectLearningPath;
    const closed = closePathBehindPlacement(path);
    expect(closed.currentStepId).toBeNull();
    expect(closed.weeks.map((w) => [w.state, w.testState])).toEqual([["locked", "locked"], ["locked", "none"]]);
    expect(closed.weeks[0].steps.map((s) => [s.state, s.practiceState])).toEqual([["locked", "locked"], ["locked", "none"]]);
    expect(closed.milestones[0].state).toBe("locked");
    expect(closed.weeks[0].steps[0].title).toBe("L1");
    expect(closed.placement).toBe(path.placement);
    // the open path is not mutated
    expect(path.weeks[0].steps[0].state).toBe("in_progress");
  });
});
