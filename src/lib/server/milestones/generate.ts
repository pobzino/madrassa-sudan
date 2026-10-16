import "server-only";

import { extractSlideContent } from "@/lib/ai/homework-slides";
import { bossForSubject, isMilestoneWeek, milestoneBlockWeeks } from "@/lib/milestones/rules";
import {
  MILESTONE_DEFAULT_BATTLE_QUESTIONS,
  MILESTONE_MAX_BATTLE_QUESTIONS,
  MILESTONE_MIN_BATTLE_QUESTIONS,
  MILESTONE_PASS_PERCENT,
} from "@/lib/milestones/types";
import type { Slide } from "@/lib/slides.types";
import { interactionRowFields, type BattleInteraction } from "@/lib/server/milestones/interactions";
import {
  generateLessonItems,
  itemQualityIssue,
  itemTypesForLesson,
  promptKey,
  toGeneratedInteraction,
  type LessonItemGenerator,
} from "@/lib/server/milestones/item-generator";
import { MilestoneRouteError, type MilestoneAdminClient } from "@/lib/server/milestones/load";

const MAX_PARALLEL_LESSONS = 4;
const MIN_PER_LESSON = 2;
const MAX_PER_LESSON = 6;

export interface GenerateMilestonePoolArgs {
  admin: MilestoneAdminClient;
  pathId: string;
  afterWeekNumber: number;
  poolSize: number;
  actorId: string;
  /** Injected in tests; defaults to the interaction-mix item generator. */
  generate?: LessonItemGenerator;
}

export interface GenerateMilestonePoolResult {
  milestoneId: string;
  assignmentId: string;
  questionCount: number;
  skippedLessons: string[];
}

type PoolItem = { interaction: BattleInteraction; sourceLessonId: string };

function arabicDigits(value: number) {
  return new Intl.NumberFormat("ar-EG", { useGrouping: false }).format(value);
}

export function milestoneTitles(afterWeekNumber: number) {
  const first = afterWeekNumber - 3;
  return {
    titleAr: `التحدي الكبير: الأسابيع ${arabicDigits(first)}–${arabicDigits(afterWeekNumber)}`,
    titleEn: `Big Challenge: weeks ${first}–${afterWeekNumber}`,
  };
}

/** Runs tasks with at most `limit` in flight; like Promise.allSettled. */
async function settleWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function questionRows(assignmentId: string, items: PoolItem[]) {
  return items.map((item, index) => ({
    assignment_id: assignmentId,
    ...interactionRowFields(item.interaction),
    question_content: null,
    question_content_language: null,
    answer_language: null,
    points: 1,
    display_order: index + 1,
    source_lesson_id: item.sourceLessonId,
  }));
}

/**
 * Generate (or regenerate, while draft) a milestone's question pool from the
 * lessons of weeks k-3..k. Writes through the service client.
 */
export async function generateMilestonePool({
  admin,
  pathId,
  afterWeekNumber,
  poolSize,
  actorId,
  generate = generateLessonItems,
}: GenerateMilestonePoolArgs): Promise<GenerateMilestonePoolResult> {
  if (!isMilestoneWeek(afterWeekNumber)) throw new MilestoneRouteError("block_incomplete", 400);

  const { data: path } = await admin
    .from("learning_paths")
    .select("id, subject_id")
    .eq("id", pathId)
    .maybeSingle<{ id: string; subject_id: string }>();
  if (!path) throw new MilestoneRouteError("milestone_not_found", 404);

  const findExisting = async () => {
    const { data } = await admin
      .from("learning_path_milestones")
      .select("id, assignment_id, status")
      .eq("path_id", pathId)
      .eq("after_week_number", afterWeekNumber)
      .maybeSingle<{ id: string; assignment_id: string; status: string }>();
    return data ?? null;
  };
  if ((await findExisting())?.status === "published") throw new MilestoneRouteError("unpublish_first", 409);

  // 1. Weeks k-3..k (all four must exist), their steps in path order, lessons, decks.
  const blockWeeks = milestoneBlockWeeks(afterWeekNumber);
  const { data: weeks } = await admin
    .from("learning_path_weeks")
    .select("id, week_number")
    .eq("path_id", pathId)
    .in("week_number", blockWeeks)
    .returns<Array<{ id: string; week_number: number }>>();
  if ((weeks ?? []).length !== blockWeeks.length) throw new MilestoneRouteError("block_incomplete", 400);
  const weekNumberById = new Map((weeks ?? []).map((week) => [week.id, week.week_number]));

  const { data: steps } = await admin
    .from("learning_path_steps")
    .select("week_id, lesson_id, sequence")
    .in("week_id", [...weekNumberById.keys()])
    .returns<Array<{ week_id: string; lesson_id: string; sequence: number }>>();
  const lessonIds = [
    ...new Set(
      [...(steps ?? [])]
        .sort((a, b) => (weekNumberById.get(a.week_id)! - weekNumberById.get(b.week_id)!) || a.sequence - b.sequence)
        .map((step) => step.lesson_id),
    ),
  ];
  if (!lessonIds.length) throw new MilestoneRouteError("block_incomplete", 400);

  const [{ data: lessons }, { data: subject }, { data: sims }] = await Promise.all([
    admin
      .from("lessons")
      .select("id, title_ar, title_en, grade_level")
      .in("id", lessonIds)
      .returns<Array<{ id: string; title_ar: string; title_en: string | null; grade_level: number | null }>>(),
    admin
      .from("subjects")
      .select("name_ar, name_en")
      .eq("id", path.subject_id)
      .maybeSingle<{ name_ar: string | null; name_en: string | null }>(),
    admin
      .from("lesson_sims")
      .select("lesson_id, deck_snapshot, recorded_at")
      .in("lesson_id", lessonIds)
      .order("recorded_at", { ascending: false })
      .returns<Array<{ lesson_id: string; deck_snapshot: unknown }>>(),
  ]);
  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const latestDeck = new Map<string, Slide[]>();
  for (const sim of sims ?? []) {
    if (latestDeck.has(sim.lesson_id)) continue;
    if (Array.isArray(sim.deck_snapshot) && sim.deck_snapshot.length > 0) {
      latestDeck.set(sim.lesson_id, sim.deck_snapshot as Slide[]);
    }
  }

  const skippedLessons: string[] = [];
  const sources: Array<{ lessonId: string; content: string }> = [];
  for (const lessonId of lessonIds) {
    const deck = latestDeck.get(lessonId);
    const content = deck ? extractSlideContent(deck) : "";
    if (content.trim()) sources.push({ lessonId, content });
    else skippedLessons.push(lessonId);
  }
  if (!sources.length) throw new MilestoneRouteError("generation_failed", 502, "No lesson in this block has a recorded deck yet.");

  // 2. Per-lesson generation (a mix of interaction types), at most four at once.
  const perLesson = Math.min(MAX_PER_LESSON, Math.max(MIN_PER_LESSON, Math.ceil(poolSize / sources.length)));
  const subjectName = subject?.name_en || subject?.name_ar || "General";
  const gradeLevel = lessonIds.map((id) => lessonById.get(id)?.grade_level).find((grade) => grade != null) ?? 1;
  const settled = await settleWithLimit(
    sources.map((source, lessonIndex) => () => {
      const lesson = lessonById.get(source.lessonId);
      return generate({
        content: source.content,
        lessonTitleAr: lesson?.title_ar || lesson?.title_en || "درس",
        lessonTitleEn: lesson?.title_en || lesson?.title_ar || "Lesson",
        subjectName,
        gradeLevel,
        types: itemTypesForLesson(lessonIndex, perLesson),
      });
    }),
    MAX_PARALLEL_LESSONS,
  );

  // 3. Validate each item as a battle Interaction and drop flagged or repeated ones.
  const pool: PoolItem[] = [];
  const seenPrompts = new Set<string>();
  settled.forEach((result, index) => {
    const lessonId = sources[index].lessonId;
    if (result.status === "rejected") {
      console.error("Milestone lesson generation failed:", lessonId, result.reason);
      skippedLessons.push(lessonId);
      return;
    }
    let kept = 0;
    for (const raw of result.value) {
      const interaction = toGeneratedInteraction(raw);
      if (!interaction || itemQualityIssue(interaction)) continue;
      const key = promptKey(interaction);
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      pool.push({ interaction, sourceLessonId: lessonId });
      kept += 1;
    }
    if (!kept) skippedLessons.push(lessonId);
  });

  // 4. Enough for the smallest battle?
  if (pool.length < MILESTONE_MIN_BATTLE_QUESTIONS) {
    throw new MilestoneRouteError("generation_failed", 502, "Too few good questions were generated. Try again.");
  }

  // 5. Write. A published milestone must be unpublished before regenerating.
  const now = new Date().toISOString();
  const existing = await findExisting();
  if (existing?.status === "published") throw new MilestoneRouteError("unpublish_first", 409);

  if (existing) {
    // Only staff previews can be running on a draft; their questions are about to go.
    await admin
      .from("milestone_battles")
      .update({ status: "abandoned", finished_at: now })
      .eq("milestone_id", existing.id)
      .eq("status", "active");
    const { error: deleteError } = await admin.from("homework_questions").delete().eq("assignment_id", existing.assignment_id);
    if (deleteError) throw new Error(deleteError.message);
    const { error: insertError } = await admin.from("homework_questions").insert(questionRows(existing.assignment_id, pool));
    if (insertError) throw new Error(insertError.message);
    await admin.from("homework_assignments").update({ total_points: pool.length, updated_at: now }).eq("id", existing.assignment_id);
    const { error: milestoneError } = await admin
      .from("learning_path_milestones")
      .update({ generated_at: now, generated_by: actorId, reviewed_at: null, reviewed_by: null })
      .eq("id", existing.id);
    if (milestoneError) throw new Error(milestoneError.message);
    return { milestoneId: existing.id, assignmentId: existing.assignment_id, questionCount: pool.length, skippedLessons };
  }

  const { titleAr, titleEn } = milestoneTitles(afterWeekNumber);
  const { data: assignment, error: assignmentError } = await admin
    .from("homework_assignments")
    .insert({
      is_milestone: true,
      cohort_id: null,
      is_published: false,
      is_practice: false,
      is_test: false,
      subject_id: path.subject_id,
      title_ar: titleAr,
      title_en: titleEn,
      passing_score: MILESTONE_PASS_PERCENT,
      total_points: pool.length,
      created_by: actorId,
    })
    .select("id")
    .single<{ id: string }>();
  if (assignmentError || !assignment) throw new Error(assignmentError?.message ?? "Could not create the milestone assignment");

  try {
    const { data: milestone, error: milestoneError } = await admin
      .from("learning_path_milestones")
      .insert({
        path_id: pathId,
        after_week_number: afterWeekNumber,
        assignment_id: assignment.id,
        title_ar: titleAr,
        title_en: titleEn,
        status: "draft",
        battle_question_count: Math.min(
          MILESTONE_MAX_BATTLE_QUESTIONS,
          Math.max(MILESTONE_MIN_BATTLE_QUESTIONS, Math.min(MILESTONE_DEFAULT_BATTLE_QUESTIONS, pool.length)),
        ),
        boss_key: bossForSubject(subject?.name_en ?? null, subject?.name_ar ?? null),
        generated_at: now,
        generated_by: actorId,
      })
      .select("id")
      .single<{ id: string }>();
    if (milestoneError || !milestone) throw new Error(milestoneError?.message ?? "Could not create the milestone");
    const { error: questionsError } = await admin.from("homework_questions").insert(questionRows(assignment.id, pool));
    if (questionsError) {
      await admin.from("learning_path_milestones").delete().eq("id", milestone.id);
      throw new Error(questionsError.message);
    }
    return { milestoneId: milestone.id, assignmentId: assignment.id, questionCount: pool.length, skippedLessons };
  } catch (error) {
    await admin.from("homework_assignments").delete().eq("id", assignment.id);
    throw error;
  }
}
