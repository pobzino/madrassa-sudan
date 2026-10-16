import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import { bossForSubject, isMilestoneWeek, milestoneBlockWeeks } from "@/lib/milestones/rules";
import {
  MILESTONE_DEFAULT_BATTLE_QUESTIONS,
  MILESTONE_MAX_BATTLE_QUESTIONS,
  MILESTONE_MIN_BATTLE_QUESTIONS,
  MILESTONE_PASS_PERCENT,
  type MilestoneKind,
} from "@/lib/milestones/types";
import {
  PLACEMENT_DEFAULT_POOL_SIZE,
  PLACEMENT_MAX_SOURCE_LESSONS,
  PLACEMENT_MIN_PER_DIFFICULTY,
  PLACEMENT_QUESTION_COUNT,
  PLACEMENT_SOURCE_WEEKS,
  type Difficulty,
  type TagSource,
} from "@/lib/measurement/types";
import type { Slide } from "@/lib/slides.types";
import { interactionRowFields, type BattleInteraction } from "@/lib/server/milestones/interactions";
import {
  checkGeneratedItem,
  generateLessonItems,
  itemTypesForLesson,
  lessonLetters,
  promptKey,
  type LessonItemGenerator,
} from "@/lib/server/milestones/item-generator";
import { applyVerdicts, mergeTags, verifyItemsWithModel, type DroppedItem, type ItemVerdict, type ItemVerifier } from "@/lib/server/milestones/item-verifier";
import { MilestoneRouteError, type MilestoneAdminClient } from "@/lib/server/milestones/load";
import { assessableSkills, defaultSkillForLesson, loadSubjectSkills } from "@/lib/server/measurement/skills";

const MAX_PARALLEL_LESSONS = 4;
const MIN_PER_LESSON = 2;
const MAX_PER_LESSON = 6;
/** Asked for on top of each lesson's share, so checks can drop items and the pool still fills. */
export const EXTRA_ITEMS_PER_LESSON = 2;
/** A placement keeps at most this many items per source lesson. */
export const PLACEMENT_PER_LESSON = 3;

export interface GenerateMilestonePoolArgs {
  admin: MilestoneAdminClient;
  pathId: string;
  /** Milestones: 4, 8, 12 ... A placement is always 0 (ignored). */
  afterWeekNumber: number;
  poolSize: number;
  actorId: string;
  /** Default "milestone" (a Big Challenge). "placement" = the path's "Meet your first boss". */
  kind?: MilestoneKind;
  /** Injected in tests; defaults to the interaction-mix item generator. */
  generate?: LessonItemGenerator;
  /** Injected in tests; defaults to the fast-model blind verifier. */
  verify?: ItemVerifier;
}

export interface GenerateMilestonePoolResult {
  milestoneId: string;
  assignmentId: string;
  questionCount: number;
  skippedLessons: string[];
  /** Items the checks or the verifier dropped, with why (also logged). */
  droppedItems: DroppedItem[];
  /** Things to fix before publishing (the draft is saved anyway), e.g. an uneven difficulty mix. */
  warnings: string[];
}

type PoolItem = {
  interaction: BattleInteraction;
  sourceLessonId: string;
  skillKey: string | null;
  difficulty: Difficulty | null;
  tagSource: TagSource;
};

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

export const PLACEMENT_TITLES = { titleAr: "تعرّف على أوّل زعيم!", titleEn: "Meet your first boss!" } as const;

/** The difficulty plan of one placement lesson: [1,2,3] rotated by lessonIndex % 3. */
export function placementDifficultyPlan(lessonIndex: number, count: number): Difficulty[] {
  return Array.from({ length: count }, (_, k) => (((lessonIndex + k) % 3) + 1) as Difficulty);
}

/**
 * Up to PLACEMENT_MAX_SOURCE_LESSONS lessons sampled evenly over the path order
 * (index round(i * L / n)), preferring lessons whose default skill is not
 * sampled yet (a sampled lesson swaps with an unsampled neighbour of a new skill).
 */
export function samplePlacementLessons<T extends { lessonId: string; skillKey: string }>(
  lessons: readonly T[],
  max = PLACEMENT_MAX_SOURCE_LESSONS,
): T[] {
  const count = Math.min(max, lessons.length);
  if (count === lessons.length) return [...lessons];
  const indexes = Array.from({ length: count }, (_, i) => Math.min(lessons.length - 1, Math.round((i * lessons.length) / count)));
  const used = new Set(indexes);
  const skills = new Set<string>();
  const reach = Math.max(1, Math.floor(lessons.length / (2 * count)));
  const picked = indexes.map((index) => {
    let chosen = index;
    if (skills.has(lessons[index].skillKey)) {
      for (let d = 1; d <= reach; d += 1) {
        const candidate = [index + d, index - d].find((j) => j >= 0 && j < lessons.length && !used.has(j) && !skills.has(lessons[j].skillKey));
        if (candidate !== undefined) {
          used.delete(index);
          used.add(candidate);
          chosen = candidate;
          break;
        }
      }
    }
    skills.add(lessons[chosen].skillKey);
    return chosen;
  });
  return [...new Set(picked)].sort((a, b) => a - b).map((index) => lessons[index]);
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

function questionRows(assignmentId: string, items: PoolItem[], now: string) {
  return items.map((item, index) => ({
    assignment_id: assignmentId,
    ...interactionRowFields(item.interaction),
    question_content: null,
    question_content_language: null,
    answer_language: null,
    points: 1,
    display_order: index + 1,
    source_lesson_id: item.sourceLessonId,
    skill_key: item.skillKey,
    difficulty: item.difficulty,
    tag_source: item.skillKey || item.difficulty ? item.tagSource : null,
    tagged_at: item.skillKey || item.difficulty ? now : null,
  }));
}

function difficultyCounts(pool: readonly PoolItem[]) {
  const counts: Record<Difficulty, number> = { 1: 0, 2: 0, 3: 0 };
  for (const item of pool) if (item.difficulty) counts[item.difficulty] += 1;
  return counts;
}

/** Trim a placement pool to `size`, taking from the most plentiful difficulty (latest item first). */
function trimPlacementPool(pool: PoolItem[], size: number): PoolItem[] {
  const result = [...pool];
  while (result.length > size) {
    const counts = difficultyCounts(result);
    const untagged = result.map((item, index) => ({ item, index })).filter(({ item }) => !item.difficulty);
    let drop = untagged.length ? untagged[untagged.length - 1].index : -1;
    if (drop < 0) {
      const most = ([1, 2, 3] as Difficulty[]).sort((a, b) => counts[b] - counts[a])[0];
      for (let i = result.length - 1; i >= 0; i -= 1) {
        if (result[i].difficulty === most) {
          drop = i;
          break;
        }
      }
    }
    if (drop < 0) break;
    result.splice(drop, 1);
  }
  return result;
}

type PlanArgs = Pick<GenerateMilestonePoolArgs, "admin" | "pathId" | "afterWeekNumber" | "poolSize" | "kind">;

/** Which lessons' deck content a plan loads: all (one-shot generation), one (a lesson step) or none (plan / finish). */
type DeckScope = { decks: "all" } | { decks: "one"; lessonId: string } | { decks: "none" };

type LessonSource = { lessonId: string; content: string };

/** Everything the steps need, recomputed from the database on every request (nothing is trusted from the client). */
interface PoolPlan {
  admin: MilestoneAdminClient;
  pathId: string;
  kind: MilestoneKind;
  placement: boolean;
  afterWeekNumber: number;
  poolSize: number;
  path: { id: string; subject_id: string };
  subject: { name_ar: string | null; name_en: string | null } | null;
  lessonById: Map<string, { id: string; title_ar: string; title_en: string | null; grade_level: number | null; curriculum_topic: unknown }>;
  sources: LessonSource[];
  skippedLessons: string[];
  perLesson: number;
  requested: number;
  subjectName: string;
  gradeLevel: number;
  skillKeys: string[];
  promptSkills: Array<{ key: string; label: string }>;
  defaultSkillOf: (lessonId: string) => string;
  findExisting: () => Promise<{ id: string; assignment_id: string; status: string } | null>;
}

/** One lesson's generated, checked and verified items (the "lesson" step's result). */
export interface LessonPoolResult {
  lessonId: string;
  kept: Array<Omit<PoolItem, "sourceLessonId">>;
  dropped: DroppedItem[];
}

/** 1. The source weeks, their steps in path order, lessons, decks. */
async function loadPoolPlan(
  { admin, pathId, afterWeekNumber: requestedWeek, poolSize: requestedPoolSize, kind = "milestone" }: PlanArgs,
  scope: DeckScope = { decks: "all" },
): Promise<PoolPlan> {
  const placement = kind === "placement";
  const afterWeekNumber = placement ? 0 : requestedWeek;
  const poolSize = placement ? PLACEMENT_DEFAULT_POOL_SIZE : requestedPoolSize;
  if (!placement && !isMilestoneWeek(afterWeekNumber)) throw new MilestoneRouteError("block_incomplete", 400);

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

  const { data: weeks } = placement
    ? await admin
        .from("learning_path_weeks")
        .select("id, week_number")
        .eq("path_id", pathId)
        .returns<Array<{ id: string; week_number: number }>>()
    : await admin
        .from("learning_path_weeks")
        .select("id, week_number")
        .eq("path_id", pathId)
        .in("week_number", milestoneBlockWeeks(afterWeekNumber))
        .returns<Array<{ id: string; week_number: number }>>();
  const sourceWeeks = placement
    ? (weeks ?? []).filter((week) => week.week_number >= 1 && week.week_number <= PLACEMENT_SOURCE_WEEKS)
    : weeks ?? [];
  if (placement ? !sourceWeeks.length : sourceWeeks.length !== milestoneBlockWeeks(afterWeekNumber).length) {
    throw new MilestoneRouteError("block_incomplete", 400);
  }
  const weekNumberById = new Map(sourceWeeks.map((week) => [week.id, week.week_number]));

  const { data: steps } = await admin
    .from("learning_path_steps")
    .select("week_id, lesson_id, sequence")
    .in("week_id", [...weekNumberById.keys()])
    .returns<Array<{ week_id: string; lesson_id: string; sequence: number }>>();
  const orderedLessonIds = [
    ...new Set(
      [...(steps ?? [])]
        .sort((a, b) => (weekNumberById.get(a.week_id)! - weekNumberById.get(b.week_id)!) || a.sequence - b.sequence)
        .map((step) => step.lesson_id),
    ),
  ];
  if (!orderedLessonIds.length) throw new MilestoneRouteError("block_incomplete", 400);

  const [{ data: lessons }, { data: subject }] = await Promise.all([
    admin
      .from("lessons")
      .select("id, title_ar, title_en, grade_level, curriculum_topic")
      .in("id", orderedLessonIds)
      .returns<Array<{ id: string; title_ar: string; title_en: string | null; grade_level: number | null; curriculum_topic: unknown }>>(),
    admin
      .from("subjects")
      .select("name_ar, name_en")
      .eq("id", path.subject_id)
      .maybeSingle<{ name_ar: string | null; name_en: string | null }>(),
  ]);
  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const { subjectKey, skills } = await loadSubjectSkills(admin, path.subject_id, subject ?? null);
  const tagSkills = assessableSkills(skills);
  const skillKeys = tagSkills.map((skill) => skill.skillKey);
  const defaultSkillOf = (lessonId: string) => defaultSkillForLesson(lessonById.get(lessonId)?.curriculum_topic, skills, subjectKey);

  const lessonIds = placement
    ? samplePlacementLessons(orderedLessonIds.map((lessonId) => ({ lessonId, skillKey: defaultSkillOf(lessonId) }))).map((lesson) => lesson.lessonId)
    : orderedLessonIds;

  // Which lessons have a recorded deck (its first slide's type only, never the decks), and
  // the full deck for the lessons this call generates from.
  type SimRow = { lesson_id: string; deck_snapshot?: unknown; first_slide_type?: string | null; recorded_at?: string };
  const contentIds = scope.decks === "all" ? lessonIds : scope.decks === "one" ? lessonIds.filter((id) => id === scope.lessonId) : [];
  const [{ data: simFlags }, { data: simDecks }] = await Promise.all([
    admin
      .from("lesson_sims")
      .select("lesson_id, first_slide_type:deck_snapshot->0->>type, recorded_at")
      .in("lesson_id", lessonIds)
      .order("recorded_at", { ascending: false })
      .returns<SimRow[]>(),
    contentIds.length
      ? admin
          .from("lesson_sims")
          .select("lesson_id, deck_snapshot, recorded_at")
          .in("lesson_id", contentIds)
          .order("recorded_at", { ascending: false })
          .returns<SimRow[]>()
      : Promise.resolve({ data: [] as SimRow[] }),
  ]);
  const hasDeck = (sim: SimRow) => sim.first_slide_type != null || (Array.isArray(sim.deck_snapshot) && sim.deck_snapshot.length > 0);
  const withDeck = new Set<string>();
  for (const sim of simFlags ?? []) if (hasDeck(sim)) withDeck.add(sim.lesson_id);
  const latestDeck = new Map<string, Slide[]>();
  for (const sim of simDecks ?? []) {
    if (latestDeck.has(sim.lesson_id)) continue;
    if (Array.isArray(sim.deck_snapshot) && sim.deck_snapshot.length > 0) latestDeck.set(sim.lesson_id, sim.deck_snapshot as Slide[]);
  }

  const skippedLessons: string[] = [];
  const sources: LessonSource[] = [];
  for (const lessonId of lessonIds) {
    const deck = latestDeck.get(lessonId);
    const content = deck ? extractSlideContent(deck) : "";
    // Loaded decks are judged by their text; unloaded ones by the flag (the same rule the one-shot path applies once loaded).
    const usable = deck ? Boolean(content.trim()) : withDeck.has(lessonId) && !contentIds.includes(lessonId);
    if (usable) sources.push({ lessonId, content });
    else skippedLessons.push(lessonId);
  }
  if (!sources.length) {
    throw new MilestoneRouteError("generation_failed", 502, placement ? "No lesson in these weeks has a recorded deck yet." : "No lesson in this block has a recorded deck yet.");
  }

  const perLesson = placement ? PLACEMENT_PER_LESSON : Math.min(MAX_PER_LESSON, Math.max(MIN_PER_LESSON, Math.ceil(poolSize / sources.length)));
  return {
    admin,
    pathId,
    kind,
    placement,
    afterWeekNumber,
    poolSize,
    path,
    subject: subject ?? null,
    lessonById,
    sources,
    skippedLessons,
    perLesson,
    // A few extra items per lesson, so the pool still fills after checks drop some.
    requested: perLesson + EXTRA_ITEMS_PER_LESSON,
    subjectName: subject?.name_en || subject?.name_ar || "General",
    gradeLevel: lessonIds.map((id) => lessonById.get(id)?.grade_level).find((grade) => grade != null) ?? 1,
    skillKeys,
    promptSkills: tagSkills.map((skill) => ({ key: skill.skillKey, label: skill.labelEn })),
    defaultSkillOf,
    findExisting,
  };
}

/** 2-3b. One lesson: generate (a mix of interaction types), deterministic checks, then the blind verifier. */
async function runLesson(plan: PoolPlan, lessonIndex: number, generate: LessonItemGenerator, verify: ItemVerifier): Promise<LessonPoolResult> {
  const source = plan.sources[lessonIndex];
  const lesson = plan.lessonById.get(source.lessonId);
  const lessonTitleEn = lesson?.title_en || lesson?.title_ar || "Lesson";
  const lessonTitleAr = lesson?.title_ar || lesson?.title_en || "درس";
  const defaultSkillKey = plan.defaultSkillOf(source.lessonId);
  const { subjectName, gradeLevel, promptSkills, skillKeys, requested } = plan;
  // A lesson that teaches letters also gets a letter to trace.
  const letters = lessonLetters({ subjectName, lessonTitleAr, lessonTitleEn, content: source.content });
  const raw = await generate({
    content: source.content,
    lessonTitleAr,
    lessonTitleEn,
    subjectName,
    gradeLevel,
    types: itemTypesForLesson(lessonIndex, requested, Boolean(letters)),
    letters,
    skills: promptSkills,
    defaultSkillKey,
    ...(plan.placement ? { difficultyPlan: placementDifficultyPlan(lessonIndex, requested) } : {}),
  });

  // 3a. Deterministic checks: structure, keys that must add up, one order, quality rules. Tags never drop an item.
  const checked: Array<{ interaction: BattleInteraction; skillKey: string | null; difficulty: Difficulty | null }> = [];
  const dropped: DroppedItem[] = [];
  for (const item of raw) {
    const result = checkGeneratedItem(item, { letters, skillKeys: skillKeys.length ? skillKeys : undefined, defaultSkillKey });
    if ("interaction" in result) checked.push({ interaction: result.interaction, skillKey: result.skillKey ?? defaultSkillKey, difficulty: result.difficulty ?? null });
    else dropped.push({ prompt: result.prompt, reasons: [`check: ${result.reason}`] });
  }

  // 3b. The verifier answers each surviving item blind and flags the doubtful ones (and estimates difficulty).
  const interactions = checked.map((item) => item.interaction);
  const request = { items: interactions, lessonTitleEn, subjectName, gradeLevel, skills: promptSkills };
  // One try: a slow verifier must not push the lesson step past the function time limit (the page retries the lesson).
  const verdicts: ItemVerdict[] = await verify(request);
  const verified = applyVerdicts(interactions, verdicts);
  const verdictByIndex = new Map(verdicts.map((verdict) => [verdict.index, verdict]));
  const keptSet = new Set(verified.kept);
  const kept = checked
    .map((item, index) => ({ item, verdict: verdictByIndex.get(index) }))
    .filter(({ item }) => keptSet.has(item.interaction))
    .map(({ item, verdict }) => ({ interaction: item.interaction, ...mergeTags(item, verdict, { preferGenerated: plan.placement }) }));
  return { lessonId: source.lessonId, kept, dropped: [...dropped, ...verified.dropped] };
}

/** 3c-5. Assemble the pool from the lessons' results and write it (a draft). */
async function writePool(plan: PoolPlan, settled: PromiseSettledResult<LessonPoolResult>[], actorId: string): Promise<GenerateMilestonePoolResult> {
  const { admin, placement, perLesson, poolSize, path, subject, pathId, kind, afterWeekNumber } = plan;
  const skippedLessons = [...plan.skippedLessons];
  const droppedItems: DroppedItem[] = [];

  // 3c. Keep at most perLesson good items per lesson (a placement prefers one of each difficulty), no repeated prompts.
  let pool: PoolItem[] = [];
  const spare: PoolItem[] = [];
  const seenPrompts = new Set<string>();
  settled.forEach((result, index) => {
    const lessonId = plan.sources[index].lessonId;
    if (result.status === "rejected") {
      console.error("Milestone lesson generation failed:", lessonId, result.reason);
      skippedLessons.push(lessonId);
      return;
    }
    for (const item of result.value.dropped) {
      console.warn("Milestone item dropped:", lessonId, JSON.stringify(item));
      droppedItems.push(item);
    }
    const candidates = placement
      ? (() => {
          const seen = new Set<Difficulty | null>();
          const first: typeof result.value.kept = [];
          const rest: typeof result.value.kept = [];
          for (const item of result.value.kept) {
            if (!seen.has(item.difficulty)) {
              seen.add(item.difficulty);
              first.push(item);
            } else rest.push(item);
          }
          return [...first, ...rest];
        })()
      : result.value.kept;
    let kept = 0;
    for (const item of candidates) {
      if (kept >= perLesson) {
        spare.push({ ...item, sourceLessonId: lessonId });
        continue;
      }
      const key = promptKey(item.interaction);
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      pool.push({ ...item, sourceLessonId: lessonId });
      kept += 1;
    }
    if (!kept) skippedLessons.push(lessonId);
  });

  // 4. Enough for the smallest battle? A placement also wants >= 3 of each difficulty, but that is
  //    publish_milestone's rule (pool_unbalanced): the draft is saved so staff can retag, and warned.
  const warnings: string[] = [];
  if (placement) {
    // A difficulty the per-lesson cap left short is topped up from the lessons' spare good items.
    for (const d of [1, 2, 3] as Difficulty[]) {
      for (const item of spare) {
        if (difficultyCounts(pool)[d] >= PLACEMENT_MIN_PER_DIFFICULTY) break;
        if (item.difficulty !== d) continue;
        const key = promptKey(item.interaction);
        if (seenPrompts.has(key)) continue;
        seenPrompts.add(key);
        pool.push(item);
      }
    }
    pool = trimPlacementPool(pool, poolSize);
    const counts = difficultyCounts(pool);
    if (pool.length < PLACEMENT_QUESTION_COUNT) {
      console.error("Milestone pool too small:", JSON.stringify({ kind, pool: pool.length, counts, lessons: plan.sources.length, skipped: skippedLessons.length, dropped: droppedItems.length }));
      throw new MilestoneRouteError(
        "generation_failed",
        502,
        `Too few good questions were generated (${pool.length} of the 12 needed; ${skippedLessons.length} of ${plan.sources.length + plan.skippedLessons.length} lessons gave none). Try again.`,
      );
    }
    const short = ([1, 2, 3] as Difficulty[]).filter((d) => counts[d] < PLACEMENT_MIN_PER_DIFFICULTY);
    if (short.length) {
      const name = { 1: "easy", 2: "medium", 3: "hard" } as const;
      warnings.push(
        `Uneven difficulty mix: easy ${counts[1]}, medium ${counts[2]}, hard ${counts[3]}. Publishing needs at least ${PLACEMENT_MIN_PER_DIFFICULTY} ${short.map((d) => name[d]).join(" and ")}: retag some questions or generate again.`,
      );
    }
  } else if (pool.length < MILESTONE_MIN_BATTLE_QUESTIONS) {
    console.error("Milestone pool too small:", JSON.stringify({ kind, pool: pool.length, lessons: plan.sources.length, skipped: skippedLessons.length, dropped: droppedItems.length }));
    throw new MilestoneRouteError("generation_failed", 502, `Too few good questions were generated (${pool.length}; ${skippedLessons.length} lessons gave none). Try again.`);
  }

  // 5. Write. A published milestone must be unpublished before regenerating.
  const now = new Date().toISOString();
  const existing = await plan.findExisting();
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
    const { error: insertError } = await admin.from("homework_questions").insert(questionRows(existing.assignment_id, pool, now));
    if (insertError) throw new Error(insertError.message);
    await admin.from("homework_assignments").update({ total_points: pool.length, updated_at: now }).eq("id", existing.assignment_id);
    const { error: milestoneError } = await admin
      .from("learning_path_milestones")
      .update({ generated_at: now, generated_by: actorId, reviewed_at: null, reviewed_by: null })
      .eq("id", existing.id);
    if (milestoneError) throw new Error(milestoneError.message);
    return { milestoneId: existing.id, assignmentId: existing.assignment_id, questionCount: pool.length, skippedLessons, droppedItems, warnings };
  }

  const { titleAr, titleEn } = placement ? PLACEMENT_TITLES : milestoneTitles(afterWeekNumber);
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
        kind,
        assignment_id: assignment.id,
        title_ar: titleAr,
        title_en: titleEn,
        status: "draft",
        battle_question_count: placement
          ? PLACEMENT_QUESTION_COUNT
          : Math.min(
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
    const { error: questionsError } = await admin.from("homework_questions").insert(questionRows(assignment.id, pool, now));
    if (questionsError) {
      await admin.from("learning_path_milestones").delete().eq("id", milestone.id);
      throw new Error(questionsError.message);
    }
    return { milestoneId: milestone.id, assignmentId: assignment.id, questionCount: pool.length, skippedLessons, droppedItems, warnings };
  } catch (error) {
    await admin.from("homework_assignments").delete().eq("id", assignment.id);
    throw error;
  }
}

/**
 * Generate (or regenerate, while draft) a milestone's question pool from the
 * lessons of weeks k-3..k, or a placement's from weeks 1..min(12, last week).
 * Every item is tagged with a skill and a difficulty. Writes through the service client.
 * In one call (tests, local dev); the deployed app runs the same work as steps
 * (planMilestonePool, generateMilestonePoolLesson, finishMilestonePool) to stay under the function time limit.
 */
export async function generateMilestonePool({
  generate = generateLessonItems,
  verify = verifyItemsWithModel,
  actorId,
  ...args
}: GenerateMilestonePoolArgs): Promise<GenerateMilestonePoolResult> {
  const plan = await loadPoolPlan(args);
  const settled = await settleWithLimit(
    plan.sources.map((_, lessonIndex) => () => runLesson(plan, lessonIndex, generate, verify)),
    MAX_PARALLEL_LESSONS,
  );
  return writePool(plan, settled, actorId);
}

// -----------------------------------------------------------------------------
// The same work as short steps. Each step is one request well under the
// function time limit (about 30 s on Netlify); the teacher page runs them.
// A lesson step's result is signed, so the finish step only accepts items this
// server generated, checked and verified, for this path, block and lesson.
// -----------------------------------------------------------------------------

export const MILESTONE_GENERATE_PARALLEL_LESSONS = MAX_PARALLEL_LESSONS;

function signingKey(): string {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new MilestoneRouteError("service_unavailable", 503, "Generation is not configured on this server.");
  return createHmac("sha256", secret).update("milestone-generate-lesson-v1").digest("hex");
}

function lessonSignature(scope: { pathId: string; kind: MilestoneKind; afterWeekNumber: number }, result: LessonPoolResult): string {
  return createHmac("sha256", signingKey())
    .update(JSON.stringify([scope.pathId, scope.kind, scope.afterWeekNumber, result.lessonId, result.kept, result.dropped]))
    .digest("hex");
}

function signatureMatches(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(typeof given === "string" ? given : "", "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Step 1: the lessons that will be generated, in order. */
export async function planMilestonePool(args: PlanArgs): Promise<{ lessons: Array<{ lessonId: string; titleEn: string; titleAr: string }>; skippedLessons: string[] }> {
  const plan = await loadPoolPlan(args, { decks: "none" });
  return {
    lessons: plan.sources.map(({ lessonId }) => {
      const lesson = plan.lessonById.get(lessonId);
      return { lessonId, titleEn: lesson?.title_en || lesson?.title_ar || "Lesson", titleAr: lesson?.title_ar || lesson?.title_en || "درس" };
    }),
    skippedLessons: plan.skippedLessons,
  };
}

export type SignedLessonPoolResult = LessonPoolResult & { signature: string };

/** Step 2: one lesson's items (generated, checked, verified), signed. */
export async function generateMilestonePoolLesson(
  args: PlanArgs & { lessonId: string; generate?: LessonItemGenerator; verify?: ItemVerifier },
): Promise<SignedLessonPoolResult> {
  const plan = await loadPoolPlan(args, { decks: "one", lessonId: args.lessonId });
  const lessonIndex = plan.sources.findIndex((source) => source.lessonId === args.lessonId);
  if (lessonIndex < 0) throw new MilestoneRouteError("block_incomplete", 400, "That lesson is not part of this Big Challenge.");
  const result = await runLesson(plan, lessonIndex, args.generate ?? generateLessonItems, args.verify ?? verifyItemsWithModel);
  return { ...result, signature: lessonSignature(plan, result) };
}

/** Step 3: assemble and write the pool from the signed lesson results. A missing or unsigned lesson counts as failed. */
export async function finishMilestonePool(
  args: PlanArgs & { actorId: string; results: ReadonlyArray<Partial<SignedLessonPoolResult> | null | undefined> },
): Promise<GenerateMilestonePoolResult> {
  const plan = await loadPoolPlan(args, { decks: "none" });
  const byLesson = new Map<string, LessonPoolResult>();
  for (const given of args.results) {
    if (!given || typeof given.lessonId !== "string" || !Array.isArray(given.kept) || !Array.isArray(given.dropped)) continue;
    const result: LessonPoolResult = { lessonId: given.lessonId, kept: given.kept, dropped: given.dropped };
    if (signatureMatches(lessonSignature(plan, result), given.signature ?? "")) byLesson.set(result.lessonId, result);
    else console.warn("Milestone lesson result rejected (signature):", result.lessonId);
  }
  const settled: PromiseSettledResult<LessonPoolResult>[] = plan.sources.map(({ lessonId }) => {
    const result = byLesson.get(lessonId);
    return result ? { status: "fulfilled", value: result } : { status: "rejected", reason: new Error("no signed result for this lesson") };
  });
  return writePool(plan, settled, args.actorId);
}
