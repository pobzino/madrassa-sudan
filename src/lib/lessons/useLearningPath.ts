/**
 * Loads a subject's published learning path for a student and resolves it into
 * a render-ready, gated tree via the pure engine in `@/lib/learning-path`.
 *
 * Returns null when the subject has no published path, so the Lessons tab can
 * fall back to the existing flat list.
 *
 * The learning_path_* tables (and the homework is_test/passing_score columns)
 * are newer than the generated database.types.ts, so those few reads go through
 * a narrowly-scoped untyped client view with explicit local row types. Lessons,
 * lesson_progress and submissions keep full typing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluatePath,
  type PathInput,
  type StudentProgressInput,
  type StepState,
  type WeekState,
  type WeekTestState,
} from "@/lib/learning-path";

interface PathRow {
  id: string;
  subject_id: string;
  title_ar: string;
  title_en: string | null;
}
interface WeekRow {
  id: string;
  week_number: number;
  title_ar: string;
  title_en: string | null;
  test_assignment_id: string | null;
}
interface StepRow {
  id: string;
  week_id: string;
  lesson_id: string;
  sequence: number;
}

export interface TreeStep {
  id: string;
  lessonId: string;
  sequence: number;
  state: StepState;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
}

export interface TreeWeek {
  id: string;
  weekNumber: number;
  title: string;
  state: WeekState;
  testAssignmentId: string | null;
  testState: WeekTestState;
  steps: TreeStep[];
}

export interface SubjectLearningPath {
  pathId: string;
  title: string;
  weeks: TreeWeek[];
  currentStepId: string | null;
}

export async function loadSubjectLearningPath(
  supabase: SupabaseClient,
  subjectId: string,
  userId: string,
  language: "ar" | "en"
): Promise<SubjectLearningPath | null> {
  // Untyped view for the newer tables/columns not yet in database.types.ts.
  const db = supabase as unknown as SupabaseClient;

  const { data: pathRow } = await db
    .from("learning_paths")
    .select("id, subject_id, title_ar, title_en")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .maybeSingle<PathRow>();

  if (!pathRow) return null;

  const { data: weekRows } = await db
    .from("learning_path_weeks")
    .select("id, week_number, title_ar, title_en, test_assignment_id")
    .eq("path_id", pathRow.id)
    .order("week_number", { ascending: true })
    .returns<WeekRow[]>();

  const weeks = weekRows ?? [];
  if (weeks.length === 0) return null;

  const { data: stepRows } = await db
    .from("learning_path_steps")
    .select("id, week_id, lesson_id, sequence")
    .in(
      "week_id",
      weeks.map((w) => w.id)
    )
    .order("sequence", { ascending: true })
    .returns<StepRow[]>();

  const steps = stepRows ?? [];
  const lessonIds = Array.from(new Set(steps.map((s) => s.lesson_id)));
  const testIds = weeks
    .map((w) => w.test_assignment_id)
    .filter((id): id is string => Boolean(id));

  // Lesson metadata + the student's completion (typed tables).
  const [{ data: lessons }, { data: progressRows }] = await Promise.all([
    lessonIds.length
      ? supabase
          .from("lessons")
          .select("id, title_ar, title_en, thumbnail_url, video_duration_seconds")
          .in("id", lessonIds)
      : Promise.resolve({ data: [] as never[] }),
    lessonIds.length
      ? supabase
          .from("lesson_progress")
          .select("lesson_id, completed, last_position_seconds")
          .eq("student_id", userId)
          .in("lesson_id", lessonIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Test results: assignment thresholds + the student's submission.
  const [{ data: assignmentRows }, { data: submissionRows }] = await Promise.all([
    testIds.length
      ? db
          .from("homework_assignments")
          .select("id, total_points, passing_score")
          .in("id", testIds)
          .returns<Array<{ id: string; total_points: number | null; passing_score: number | null }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; total_points: number | null; passing_score: number | null }> }),
    testIds.length
      ? supabase
          .from("homework_submissions")
          .select("assignment_id, status, score")
          .eq("student_id", userId)
          .in("assignment_id", testIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const lessonById = new Map(
    (lessons ?? []).map((l) => [
      l.id,
      l as {
        id: string;
        title_ar: string;
        title_en: string;
        thumbnail_url: string | null;
        video_duration_seconds: number | null;
      },
    ])
  );

  const progressByLesson = new Map(
    (progressRows ?? []).map((p) => [
      (p as { lesson_id: string }).lesson_id,
      p as { lesson_id: string; completed: boolean; last_position_seconds: number | null },
    ])
  );

  const assignmentById = new Map((assignmentRows ?? []).map((a) => [a.id, a]));
  const submissionByAssignment = new Map(
    (submissionRows ?? []).map((s) => [
      (s as { assignment_id: string }).assignment_id,
      s as { assignment_id: string; status: string; score: number | null },
    ])
  );

  // Build engine inputs.
  const stepsByWeek = new Map<string, StepRow[]>();
  for (const step of steps) {
    const list = stepsByWeek.get(step.week_id) ?? [];
    list.push(step);
    stepsByWeek.set(step.week_id, list);
  }

  const pathInput: PathInput = {
    weeks: weeks.map((w) => ({
      id: w.id,
      weekNumber: w.week_number,
      testAssignmentId: w.test_assignment_id,
      steps: (stepsByWeek.get(w.id) ?? []).map((s) => ({
        id: s.id,
        lessonId: s.lesson_id,
        sequence: s.sequence,
      })),
    })),
  };

  const lessonCompletion: StudentProgressInput["lessonCompletion"] = {};
  for (const lessonId of lessonIds) {
    const p = progressByLesson.get(lessonId);
    lessonCompletion[lessonId] = {
      completed: p?.completed === true,
      started: p ? p.completed === true || (p.last_position_seconds ?? 0) > 0 : false,
    };
  }

  const testResults: StudentProgressInput["testResults"] = {};
  for (const testId of testIds) {
    const sub = submissionByAssignment.get(testId);
    const assignment = assignmentById.get(testId);
    if (sub && assignment) {
      testResults[testId] = {
        status: sub.status,
        score: sub.score,
        totalPoints: assignment.total_points ?? 0,
        passingScore: assignment.passing_score ?? 80,
      };
    }
  }

  const evaluation = evaluatePath(pathInput, { lessonCompletion, testResults });

  // Merge engine state with lesson metadata for rendering.
  const treeWeeks: TreeWeek[] = evaluation.weeks.map((weekResult) => {
    const weekMeta = weeks.find((w) => w.id === weekResult.id)!;
    return {
      id: weekResult.id,
      weekNumber: weekResult.weekNumber,
      title:
        (language === "ar" ? weekMeta.title_ar : weekMeta.title_en) ||
        weekMeta.title_ar,
      state: weekResult.state,
      testAssignmentId: weekResult.testAssignmentId,
      testState: weekResult.testState,
      steps: weekResult.steps.map((stepResult) => {
        const lesson = lessonById.get(stepResult.lessonId);
        const title = lesson
          ? (language === "ar" ? lesson.title_ar : lesson.title_en) || lesson.title_ar
          : "";
        return {
          id: stepResult.id,
          lessonId: stepResult.lessonId,
          sequence: stepResult.sequence,
          state: stepResult.state,
          title,
          thumbnailUrl: lesson?.thumbnail_url ?? null,
          durationSeconds: lesson?.video_duration_seconds ?? null,
        };
      }),
    };
  });

  return {
    pathId: pathRow.id,
    title: (language === "ar" ? pathRow.title_ar : pathRow.title_en) || pathRow.title_ar,
    weeks: treeWeeks,
    currentStepId: evaluation.currentStepId,
  };
}
