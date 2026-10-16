// The starting-boss gate: while a published, required placement waits for a
// child who has done no lesson of the path, the path is closed (every lesson,
// test and Big Challenge locked) until the boss is met. Pure; the tree applies
// it only while online, and the server's placement-gate route is the same
// rule for a lesson opened by URL.

import type { SubjectLearningPath } from "@/lib/lessons/useLearningPath";

export interface PlacementGateInput {
  /** The published placement's switch (default true). */
  required: boolean;
  /** The placement has been met (a completed, non-superseded, non-preview battle). */
  completed: boolean;
  /** Completed lessons of this path by this learner. */
  completedLessonsInPath: number;
  /** Staff accounts are never gated (their battles are previews and never count as met). */
  learnerRole: string | null | undefined;
}

export function placementGateApplies(input: PlacementGateInput): boolean {
  if (!input.required || input.completed) return false;
  if (input.completedLessonsInPath > 0) return false;
  return input.learnerRole == null || input.learnerRole === "student";
}

/** The same path with everything locked and no current step (the owl waits at the boss). */
export function closePathBehindPlacement(path: SubjectLearningPath): SubjectLearningPath {
  return {
    ...path,
    currentStepId: null,
    weeks: path.weeks.map((week) => ({
      ...week,
      state: "locked",
      testState: week.testState === "none" ? "none" : "locked",
      steps: week.steps.map((step) => ({ ...step, state: "locked", practiceState: step.practiceState === "none" ? "none" : "locked" })),
    })),
    milestones: path.milestones.map((milestone) => ({ ...milestone, state: "locked" })),
  };
}
