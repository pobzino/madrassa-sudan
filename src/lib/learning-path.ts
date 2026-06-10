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
 */

export type StepState = "locked" | "available" | "in_progress" | "completed";
export type WeekState = "locked" | "available" | "in_progress" | "completed";
export type WeekTestState = "none" | "locked" | "available" | "failed" | "passed";

export interface PathStepInput {
  id: string;
  lessonId: string;
  sequence: number;
}

export interface PathWeekInput {
  id: string;
  weekNumber: number;
  testAssignmentId: string | null;
  steps: PathStepInput[];
}

export interface PathInput {
  weeks: PathWeekInput[];
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
}

export interface StepResult {
  id: string;
  lessonId: string;
  sequence: number;
  state: StepState;
}

export interface WeekResult {
  id: string;
  weekNumber: number;
  state: WeekState;
  testAssignmentId: string | null;
  testState: WeekTestState;
  steps: StepResult[];
}

export interface PathEvaluation {
  weeks: WeekResult[];
  /** Step (or test node) the bird should perch on; null if everything is done. */
  currentStepId: string | null;
  currentWeekId: string | null;
}

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

function lessonsAllCompleted(
  week: PathWeekInput,
  lessonCompletion: StudentProgressInput["lessonCompletion"]
): boolean {
  if (week.steps.length === 0) return true;
  return week.steps.every((step) => lessonCompletion[step.lessonId]?.completed === true);
}

function computeTestState(
  week: PathWeekInput,
  progress: StudentProgressInput
): WeekTestState {
  if (!week.testAssignmentId) return "none";
  if (!lessonsAllCompleted(week, progress.lessonCompletion)) return "locked";
  const result = progress.testResults[week.testAssignmentId];
  if (isTestPassed(result)) return "passed";
  if (isTestFailed(result)) return "failed";
  return "available";
}

function weekIsCompleted(
  week: PathWeekInput,
  progress: StudentProgressInput
): boolean {
  if (!lessonsAllCompleted(week, progress.lessonCompletion)) return false;
  if (!week.testAssignmentId) return true;
  return isTestPassed(progress.testResults[week.testAssignmentId]);
}

export function evaluatePath(
  path: PathInput,
  progress: StudentProgressInput
): PathEvaluation {
  const weeks = [...path.weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  let previousWeekCompleted = true; // week 1 has no predecessor → "completed"
  let currentStepId: string | null = null;
  let currentWeekId: string | null = null;

  const results: WeekResult[] = weeks.map((week) => {
    const weekAvailable = previousWeekCompleted;
    const lessonsDone = lessonsAllCompleted(week, progress.lessonCompletion);
    // A week only counts as completed (and thus unlocks the next) if it was
    // itself reachable — otherwise out-of-order completion data could unlock
    // later weeks while earlier ones are still locked.
    const completed = weekAvailable && weekIsCompleted(week, progress);
    const testState = computeTestState(week, progress);

    const sortedSteps = [...week.steps].sort((a, b) => a.sequence - b.sequence);
    let priorStepCompleted = true; // first step in an available week unlocks
    const steps: StepResult[] = sortedSteps.map((step) => {
      const lesson = progress.lessonCompletion[step.lessonId];
      let state: StepState;
      if (!weekAvailable) {
        state = "locked";
      } else if (lesson?.completed) {
        state = "completed";
      } else if (!priorStepCompleted) {
        state = "locked";
      } else {
        state = lesson?.started ? "in_progress" : "available";
      }
      priorStepCompleted = lesson?.completed === true;

      // Bird perches on the first non-completed, accessible step.
      if (currentStepId === null && (state === "available" || state === "in_progress")) {
        currentStepId = step.id;
        currentWeekId = week.id;
      }
      return { id: step.id, lessonId: step.lessonId, sequence: step.sequence, state };
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

    previousWeekCompleted = completed;

    return {
      id: week.id,
      weekNumber: week.weekNumber,
      state,
      testAssignmentId: week.testAssignmentId,
      testState,
      steps,
    };
  });

  return { weeks: results, currentStepId, currentWeekId };
}
