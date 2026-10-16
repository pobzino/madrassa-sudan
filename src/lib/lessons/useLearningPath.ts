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
  type MilestoneState,
  type PathInput,
  type StudentProgressInput,
  type StepPracticeState,
  type StepState,
  type WeekState,
  type WeekTestState,
} from "@/lib/learning-path";
import { watchedPercent } from "@/lib/lessons/watched-percent";
import { PRACTICE_PASSING_SCORE } from "@/lib/practice";
import { BOSS_KEYS, type BossKey } from "@/lib/milestones/types";
import { milestoneLevel, requiredCorrect } from "@/lib/milestones/rules";

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
  practice_assignment_id: string | null;
}

interface MilestoneRow {
  id: string;
  after_week_number: number;
  title_ar: string;
  title_en: string | null;
  boss_key: string;
  battle_question_count: number;
  status: string;
}

/** A "Big Challenge" after week k of the path, resolved for this learner. */
export interface TreeMilestone {
  id: string;
  afterWeekNumber: number;
  firstWeekNumber: number;
  level: number;
  title: string;
  bossKey: BossKey;
  state: MilestoneState;
  certificateId: string | null;
  stars: 1 | 2 | 3 | null;
  /** Battle size N and the correct answers needed to win (display only). */
  questionCount: number;
  requiredCorrect: number;
}

export interface TreeStep {
  id: string;
  lessonId: string;
  sequence: number;
  state: StepState;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  videoUrl: string | null;
  practiceAssignmentId: string | null;
  practiceState: StepPracticeState;
  lessonWatched: boolean;
  /** How much of the recording has been watched, 0–100. */
  watchedPercent: number;
  /** The lesson has narrated audio, so it can be saved for offline. */
  hasRecording?: boolean;
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
  /** Published milestones whose week exists, in week order. */
  milestones: TreeMilestone[];
  currentStepId: string | null;
}

export interface LearningPathLoadOptions {
  /** Allows staff to inspect every item without changing student progress. */
  unlockAll?: boolean;
}

export async function loadSubjectLearningPath(
  supabase: SupabaseClient,
  subjectId: string,
  userId: string,
  language: "ar" | "en",
  options: LearningPathLoadOptions = {}
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
    .select("id, week_id, lesson_id, sequence, practice_assignment_id")
    .in(
      "week_id",
      weeks.map((w) => w.id)
    )
    .order("sequence", { ascending: true })
    .returns<StepRow[]>();

  const steps = stepRows ?? [];

  // Published milestones, then this learner's certificates and active battles.
  // Read explicitly by learner id (not through RLS alone) so the server can
  // call this with a service client and get the same answer. A missing table
  // or a failed read means "no milestones" rather than a broken tree.
  const { data: milestoneData } = await db
    .from("learning_path_milestones")
    .select("id, after_week_number, title_ar, title_en, boss_key, battle_question_count, status")
    .eq("path_id", pathRow.id)
    .eq("status", "published")
    .order("after_week_number", { ascending: true })
    .returns<MilestoneRow[]>();
  const milestoneRows = milestoneData ?? [];
  const milestoneIds = milestoneRows.map((m) => m.id);
  const [{ data: certificateRows }, { data: battleRows }] = await Promise.all([
    milestoneIds.length
      ? db
          .from("learner_certificates")
          .select("id, milestone_id, stars")
          .eq("learner_id", userId)
          .in("milestone_id", milestoneIds)
          .returns<Array<{ id: string; milestone_id: string; stars: number }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; milestone_id: string; stars: number }> }),
    milestoneIds.length
      ? db
          .from("milestone_battles")
          .select("milestone_id")
          .eq("learner_id", userId)
          .eq("status", "active")
          .in("milestone_id", milestoneIds)
          .returns<Array<{ milestone_id: string }>>()
      : Promise.resolve({ data: [] as Array<{ milestone_id: string }> }),
  ]);
  const certificateByMilestone = new Map((certificateRows ?? []).map((c) => [c.milestone_id, c]));

  const lessonIds = Array.from(new Set(steps.map((s) => s.lesson_id)));
  const practiceIds = steps
    .map((s) => s.practice_assignment_id)
    .filter((id): id is string => Boolean(id));
  const testIds = [
    ...weeks
      .map((w) => w.test_assignment_id)
      .filter((id): id is string => Boolean(id)),
    ...practiceIds,
  ];

  // Lesson metadata + the student's completion (typed tables).
  const [{ data: lessons }, { data: progressRows }] = await Promise.all([
    lessonIds.length
      ? supabase
          .from("lessons")
          .select("id, title_ar, title_en, thumbnail_url, video_duration_seconds, video_url_720p, lesson_sims(audio_path)")
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
        video_url_720p: string | null;
        // One sim per lesson: PostgREST returns the row (or null), though
        // this untyped client types it as a list.
        lesson_sims?: { audio_path: string | null } | { audio_path: string | null }[] | null;
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
        practiceAssignmentId: s.practice_assignment_id,
      })),
    })),
    milestones: milestoneRows.map((m) => ({ id: m.id, afterWeekNumber: m.after_week_number })),
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
        passingScore: assignment.passing_score ?? PRACTICE_PASSING_SCORE,
      };
    }
  }

  const evaluation = evaluatePath(
    pathInput,
    {
      lessonCompletion,
      testResults,
      passedMilestoneIds: [...certificateByMilestone.keys()],
      activeBattleMilestoneIds: (battleRows ?? []).map((b) => b.milestone_id),
    },
    options
  );

  const treeMilestones: TreeMilestone[] = evaluation.milestones.map((result) => {
    const row = milestoneRows.find((m) => m.id === result.id)!;
    const certificate = certificateByMilestone.get(result.id);
    const stars = certificate && [1, 2, 3].includes(certificate.stars) ? (certificate.stars as 1 | 2 | 3) : null;
    const questionCount = row.battle_question_count;
    return {
      id: result.id,
      afterWeekNumber: result.afterWeekNumber,
      firstWeekNumber: result.afterWeekNumber - 3,
      level: milestoneLevel(result.afterWeekNumber),
      title: (language === "ar" ? row.title_ar : row.title_en) || row.title_ar,
      bossKey: (BOSS_KEYS as readonly string[]).includes(row.boss_key) ? (row.boss_key as BossKey) : "puzzle_owlet",
      state: result.state,
      certificateId: certificate?.id ?? null,
      stars,
      questionCount,
      requiredCorrect: requiredCorrect(questionCount),
    };
  });

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
          videoUrl: lesson?.video_url_720p ?? null,
          practiceAssignmentId: stepResult.practiceAssignmentId,
          practiceState: stepResult.practiceState,
          lessonWatched: stepResult.lessonWatched,
          // Display-only, so it is computed here rather than threaded through
          // the unlock engine (no unlock rule depends on it).
          watchedPercent: watchedPercent(
            progressByLesson.get(stepResult.lessonId)?.last_position_seconds,
            lesson?.video_duration_seconds,
            stepResult.lessonWatched
          ),
          hasRecording: [lesson?.lesson_sims].flat().some((sim) => Boolean(sim?.audio_path)),
        };
      }),
    };
  });

  return {
    pathId: pathRow.id,
    title: (language === "ar" ? pathRow.title_ar : pathRow.title_en) || pathRow.title_ar,
    weeks: treeWeeks,
    milestones: treeMilestones,
    currentStepId: evaluation.currentStepId,
  };
}
