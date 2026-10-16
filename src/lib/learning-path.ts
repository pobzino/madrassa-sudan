/**
 * Track B unlock engine — pure, no Supabase imports, so it is trivially
 * unit-testable. It takes the path structure plus the student's lesson
 * completion and test results, and returns per-week / per-step / per-test
 * state plus where the bird perches (`currentStepId` / `currentWeekId`).
 *
 * Unlock rules:
 *  - Week 1 is always available. Week N is available iff week N-1 is completed.
 *  - A week is completed when every step lesson is completed AND its test is
 *    either absent (`none`) or `passed`. If the lessons are done but a test is
 *    not yet passed, the week is `in_progress`.
 *  - Steps within an available week are sequential: step 1 is available; step K
 *    is available once step K-1 is completed.
 *  - A week's test is `locked` until all its lessons are completed, then
 *    `available` / `failed` / `passed`.
 *  - Milestones ("Big Challenge") sit after week k (k = 4, 8, 12...). One counts
 *    only when week k exists. It is `passed` once the learner holds its
 *    certificate; otherwise it opens (`available`, or `in_battle` with an active
 *    battle) once week k is available and completed, and is `locked` before.
 *    Week k+1 is available only when week k is completed AND its milestone (if
 *    any) is passed. Review mode (`unlockAll`) opens every milestone.
 */

export type StepState = "locked" | "available" | "in_progress" | "completed";
export type WeekState = "locked" | "available" | "in_progress" | "completed";
export type WeekTestState = "none" | "locked" | "available" | "failed" | "passed";
export type StepPracticeState = "none" | "locked" | "available" | "failed" | "passed";
export type MilestoneState = "locked" | "available" | "in_battle" | "passed";

export interface PathStepInput {
  id: string;
  lessonId: string;
  sequence: number;
  /** Per-lesson Practice gate; passing it (>= passing_score) completes the step. */
  practiceAssignmentId?: string | null;
}

export interface PathWeekInput {
  id: string;
  weekNumber: number;
  testAssignmentId: string | null;
  steps: PathStepInput[];
}

export interface PathMilestoneInput {
  id: string;
  afterWeekNumber: number;
}

export interface PathInput {
  weeks: PathWeekInput[];
  /** Published milestones only. */
  milestones?: PathMilestoneInput[];
}

/** Per-lesson completion (lesson_progress.completed) and whether it was started. */
export interface LessonProgressInput {
  completed: boolean;
  started: boolean;
}

/** A homework_submissions row joined to its assignment, for a test. */
export interface TestResultInput {
  status: string; // homework_submissions.status
  score: number | null; // homework_submissions.score (points)
  totalPoints: number; // homework_assignments.total_points
  passingScore: number; // homework_assignments.passing_score (percent)
}

export interface StudentProgressInput {
  /** lessonId -> progress. Missing entries are treated as not started. */
  lessonCompletion: Record<string, LessonProgressInput | undefined>;
  /** assignmentId -> latest submission result. Missing -> not attempted. */
  testResults: Record<string, TestResultInput | undefined>;
  /** Milestones the learner holds a certificate for. */
  passedMilestoneIds?: readonly string[];
  /** Milestones with an active (resumable) battle. */
  activeBattleMilestoneIds?: readonly string[];
}

/**
 * Review mode is used for staff accounts that need to inspect any lesson or
 * assessment without altering a learner's recorded progress.
 */
export interface PathEvaluationOptions {
  unlockAll?: boolean;
}

export interface StepResult {
  id: string;
  lessonId: string;
  sequence: number;
  state: StepState;
  practiceAssignmentId: string | null;
  practiceState: StepPracticeState;
  /** Whether the lesson video/sim itself has been watched to completion. */
  lessonWatched: boolean;
}

export interface WeekResult {
  id: string;
  weekNumber: number;
  state: WeekState;
  testAssignmentId: string | null;
  testState: WeekTestState;
  steps: StepResult[];
}

export interface MilestoneResult {
  id: string;
  afterWeekNumber: number;
  state: MilestoneState;
}

export interface PathEvaluation {
  weeks: WeekResult[];
  /** Milestones whose week exists, in week order. */
  milestones: MilestoneResult[];
  /** Step (or test node) the bird should perch on; null if everything is done. */
  currentStepId: string | null;
  currentWeekId: string | null;
}

/** Tree node id of a milestone (the bird perches on it like a step). */
export const milestoneNodeId = (milestoneId: string) => `milestone-${milestoneId}`;

export function isTestPassed(result: TestResultInput | undefined): boolean {
  if (!result) return false;
  if (result.status !== "graded" && result.status !== "returned") return false;
  if (result.score == null) return false;
  if (result.totalPoints <= 0) return false;
  const threshold = (result.passingScore / 100) * result.totalPoints;
  return result.score >= threshold;
}

/** A test counts as "failed" only once it has actually been graded below the bar. */
function isTestFailed(result: TestResultInput | undefined): boolean {
  if (!result) return false;
  if (result.status !== "graded" && result.status !== "returned") return false;
  return !isTestPassed(result);
}

/**
 * A step with a Practice completes by PASSING the practice (mastery); the
 * video alone is not enough. A step without one keeps the original rule:
 * lesson_progress.completed.
 */
function stepIsCompleted(step: PathStepInput, progress: StudentProgressInput): boolean {
  if (step.practiceAssignmentId) {
    return isTestPassed(progress.testResults[step.practiceAssignmentId]);
  }
  return progress.lessonCompletion[step.lessonId]?.completed === true;
}

function lessonsAllCompleted(
  week: PathWeekInput,
  progress: StudentProgressInput
): boolean {
  if (week.steps.length === 0) return true;
  return week.steps.every((step) => stepIsCompleted(step, progress));
}

function computeTestState(
  week: PathWeekInput,
  progress: StudentProgressInput,
  unlockAll: boolean
): WeekTestState {
  if (!week.testAssignmentId) return "none";
  if (!unlockAll && !lessonsAllCompleted(week, progress)) return "locked";
  const result = progress.testResults[week.testAssignmentId];
  if (isTestPassed(result)) return "passed";
  if (isTestFailed(result)) return "failed";
  return "available";
}

function weekIsCompleted(
  week: PathWeekInput,
  progress: StudentProgressInput
): boolean {
  if (!lessonsAllCompleted(week, progress)) return false;
  if (!week.testAssignmentId) return true;
  return isTestPassed(progress.testResults[week.testAssignmentId]);
}

export function evaluatePath(
  path: PathInput,
  progress: StudentProgressInput,
  options: PathEvaluationOptions = {}
): PathEvaluation {
  const weeks = [...path.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const unlockAll = options.unlockAll === true;

  let previousWeekCompleted = true; // week 1 has no predecessor → "completed"
  let currentStepId: string | null = null;
  let currentWeekId: string | null = null;

  // One milestone per week number (the DB keys them uniquely); the first wins.
  const milestoneByWeek = new Map<number, PathMilestoneInput>();
  for (const milestone of path.milestones ?? []) {
    if (!milestoneByWeek.has(milestone.afterWeekNumber)) {
      milestoneByWeek.set(milestone.afterWeekNumber, milestone);
    }
  }
  const passedMilestones = new Set(progress.passedMilestoneIds ?? []);
  const activeBattles = new Set(progress.activeBattleMilestoneIds ?? []);
  const milestoneResults: MilestoneResult[] = [];

  const results: WeekResult[] = weeks.map((week) => {
    const weekAvailable = unlockAll || previousWeekCompleted;
    const lessonsDone = lessonsAllCompleted(week, progress);
    // A week only counts as completed (and thus unlocks the next) if it was
    // itself reachable — otherwise out-of-order completion data could unlock
    // later weeks while earlier ones are still locked.
    const completed = weekAvailable && weekIsCompleted(week, progress);
    const testState = computeTestState(week, progress, unlockAll);

    const sortedSteps = [...week.steps].sort((a, b) => a.sequence - b.sequence);
    let priorStepCompleted = true; // first step in an available week unlocks
    const steps: StepResult[] = sortedSteps.map((step) => {
      const lesson = progress.lessonCompletion[step.lessonId];
      const completed = stepIsCompleted(step, progress);
      const practiceResult = step.practiceAssignmentId
        ? progress.testResults[step.practiceAssignmentId]
        : undefined;

      let state: StepState;
      if (!weekAvailable) {
        state = "locked";
      } else if (completed) {
        state = "completed";
      } else if (!unlockAll && !priorStepCompleted) {
        state = "locked";
      } else if (lesson?.completed && step.practiceAssignmentId) {
        // Video done, practice still to pass.
        state = "in_progress";
      } else {
        state = lesson?.started ? "in_progress" : "available";
      }
      priorStepCompleted = completed;

      let practiceState: StepPracticeState;
      if (!step.practiceAssignmentId) practiceState = "none";
      else if (state === "locked") practiceState = "locked";
      else if (isTestPassed(practiceResult)) practiceState = "passed";
      else if (isTestFailed(practiceResult)) practiceState = "failed";
      else practiceState = "available";

      // Bird perches on the first non-completed, accessible step.
      if (currentStepId === null && (state === "available" || state === "in_progress")) {
        currentStepId = step.id;
        currentWeekId = week.id;
      }
      return {
        id: step.id,
        lessonId: step.lessonId,
        sequence: step.sequence,
        state,
        practiceAssignmentId: step.practiceAssignmentId ?? null,
        practiceState,
        lessonWatched: lesson?.completed === true,
      };
    });

    // If lessons are done but the test still needs passing, the bird moves to
    // the test node of this (current) week.
    if (
      currentStepId === null &&
      weekAvailable &&
      lessonsDone &&
      week.testAssignmentId &&
      (testState === "available" || testState === "failed")
    ) {
      currentStepId = `test-${week.id}`;
      currentWeekId = week.id;
    }

    const anyStepProgress = steps.some(
      (s) => s.state === "completed" || s.state === "in_progress"
    );
    let state: WeekState;
    if (!weekAvailable) state = "locked";
    else if (completed) state = "completed";
    else if (lessonsDone || anyStepProgress) state = "in_progress";
    else state = "available";

    // The milestone after this week, if one is published for it.
    const milestone = milestoneByWeek.get(week.weekNumber);
    let milestoneState: MilestoneState | null = null;
    if (milestone) {
      if (passedMilestones.has(milestone.id)) milestoneState = "passed";
      else if (unlockAll || completed) {
        milestoneState = activeBattles.has(milestone.id) ? "in_battle" : "available";
      } else milestoneState = "locked";
      milestoneResults.push({
        id: milestone.id,
        afterWeekNumber: milestone.afterWeekNumber,
        state: milestoneState,
      });
      // Week done and the challenge open: the bird waits at the challenge
      // before anything in the next week.
      if (
        currentStepId === null &&
        completed &&
        (milestoneState === "available" || milestoneState === "in_battle")
      ) {
        currentStepId = milestoneNodeId(milestone.id);
        currentWeekId = week.id;
      }
    }

    previousWeekCompleted =
      completed && (milestoneState === null || milestoneState === "passed" || unlockAll);

    return {
      id: week.id,
      weekNumber: week.weekNumber,
      state,
      testAssignmentId: week.testAssignmentId,
      testState,
      steps,
    };
  });

  return { weeks: results, milestones: milestoneResults, currentStepId, currentWeekId };
}
