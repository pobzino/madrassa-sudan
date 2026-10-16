import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSubjectLearningPath } from "@/lib/lessons/useLearningPath";
import type { LessonLanguageMode } from "@/lib/practice-language";
import {
  comboFrom,
  heartsFor,
  milestoneBlockWeeks,
  milestoneLevel,
  requiredCorrect,
} from "@/lib/milestones/rules";
import {
  BOSS_KEYS,
  type BattleState,
  type BossKey,
  type Lang,
  type MilestoneErrorCode,
  type MilestoneLearnerState,
  type MilestoneStatus,
  type MilestoneSummary,
} from "@/lib/milestones/types";
import { battleInteractionFor, owlHintFor, type InteractionSourceRow } from "@/lib/server/milestones/interactions";
import {
  battleStateFromRow,
  servedItem,
  toBattleQuestion,
  type MilestoneBattleRow,
  type MilestonePoolQuestion,
} from "@/lib/server/milestones/present";

// The milestone tables are newer than database.types.ts, so they are read
// through an untyped client with the local row types below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MilestoneAdminClient = SupabaseClient<any>;

export interface MilestoneRow {
  id: string;
  path_id: string;
  after_week_number: number;
  assignment_id: string;
  title_ar: string;
  title_en: string | null;
  status: MilestoneStatus;
  battle_question_count: number;
  pass_percent: number;
  boss_key: BossKey;
  generated_at: string | null;
  generated_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PathRow {
  id: string;
  subject_id: string;
  is_published: boolean;
  title_ar: string;
  title_en: string | null;
}

export interface SubjectRow {
  id: string;
  name_ar: string | null;
  name_en: string | null;
}

export const MILESTONE_COLUMNS =
  "id, path_id, after_week_number, assignment_id, title_ar, title_en, status, battle_question_count, pass_percent, boss_key, generated_at, generated_by, reviewed_at, reviewed_by, published_at, published_by, created_at, updated_at";

export const BATTLE_COLUMNS =
  "id, milestone_id, assignment_id, learner_id, attempt_number, is_preview, question_ids, question_count, required_correct, hearts_total, correct_count, wrong_count, answered_count, status, started_at, last_answer_at, finished_at, hint_used_question_index, hint_used_at";

export const POOL_QUESTION_COLUMNS =
  "id, assignment_id, question_type, question_text_ar, question_text_en, instruction_ar, instruction_en, question_content, question_content_language, answer_language, options, options_ar, options_en, correct_answer, correct_option_index, source_lesson_id, display_order, interaction, audio_url_ar, audio_url_en, audio_text_hash_ar, audio_text_hash_en";

/** Columns needed to decide whether a row is a battle-ready item. */
export const GRADABLE_COLUMNS =
  "question_type, question_text_ar, question_text_en, options, options_ar, options_en, correct_answer, correct_option_index, interaction";

/** A battle-ready item: a valid auto-gradable Interaction, or a legacy MC/TF/short row with a key. */
export function isAutoGradable(question: InteractionSourceRow) {
  return battleInteractionFor(question) !== null;
}

export function isBossKey(value: unknown): value is BossKey {
  return typeof value === "string" && (BOSS_KEYS as readonly string[]).includes(value);
}

export function parseLang(value: unknown): Lang {
  return value === "en" ? "en" : "ar";
}

export class MilestoneRouteError extends Error {
  constructor(
    public readonly code: MilestoneErrorCode,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "MilestoneRouteError";
  }
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function milestoneJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export function milestoneError(code: MilestoneErrorCode, status: number, extra: { message?: string; battle?: BattleState } = {}) {
  return milestoneJson({ error: code, ...extra }, status);
}

/** Map a Postgres error raised by the milestone RPCs (§1.4) to a route error. */
export function mapMilestoneRpcError(error: { message?: string; code?: string } | null): MilestoneRouteError {
  const message = error?.message ?? "";
  if (message.includes("milestone_not_found")) return new MilestoneRouteError("milestone_not_found", 404);
  if (message.includes("milestone_unpublished")) return new MilestoneRouteError("milestone_unpublished", 404);
  if (message.includes("battle_finished")) return new MilestoneRouteError("battle_finished", 409);
  if (message.includes("position_mismatch")) return new MilestoneRouteError("position_mismatch", 409);
  if (message.includes("pool_too_small")) return new MilestoneRouteError("pool_too_small", 422);
  if (message.includes("pool_mismatch")) return new MilestoneRouteError("service_unavailable", 503, "pool_mismatch");
  return new MilestoneRouteError("service_unavailable", 500, message || undefined);
}

/**
 * A milestone a learner may open: its path is published, and the milestone is
 * published unless the caller is previewing as staff.
 */
export async function loadMilestoneForLearner(
  admin: MilestoneAdminClient,
  milestoneId: string,
  options: { preview?: boolean } = {},
): Promise<{ row: MilestoneRow; path: PathRow; subject: SubjectRow | null } | null> {
  const { data: row } = await admin
    .from("learning_path_milestones")
    .select(MILESTONE_COLUMNS)
    .eq("id", milestoneId)
    .maybeSingle<MilestoneRow>();
  if (!row) return null;
  if (row.status !== "published" && !options.preview) return null;

  const { data: path } = await admin
    .from("learning_paths")
    .select("id, subject_id, is_published, title_ar, title_en")
    .eq("id", row.path_id)
    .maybeSingle<PathRow>();
  if (!path || !path.is_published) return null;

  // The milestone only counts while its week still exists on the path.
  const { data: week } = await admin
    .from("learning_path_weeks")
    .select("id")
    .eq("path_id", path.id)
    .eq("week_number", row.after_week_number)
    .maybeSingle<{ id: string }>();
  if (!week) return null;

  const { data: subject } = await admin
    .from("subjects")
    .select("id, name_ar, name_en")
    .eq("id", path.subject_id)
    .maybeSingle<SubjectRow>();
  return { row, path, subject: subject ?? null };
}

export function toMilestoneSummary(row: MilestoneRow, path: PathRow): MilestoneSummary {
  const required = requiredCorrect(row.battle_question_count, row.pass_percent);
  return {
    id: row.id,
    pathId: row.path_id,
    subjectId: path.subject_id,
    afterWeekNumber: row.after_week_number,
    firstWeekNumber: row.after_week_number - 3,
    level: milestoneLevel(row.after_week_number),
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bossKey: isBossKey(row.boss_key) ? row.boss_key : "puzzle_owlet",
    questionCount: row.battle_question_count,
    requiredCorrect: required,
    heartsTotal: heartsFor(row.battle_question_count, row.pass_percent),
  };
}

/** Every pool question with its answer key, filtered to auto-gradable ones. Server-side only. */
export async function loadPool(admin: MilestoneAdminClient, assignmentId: string): Promise<MilestonePoolQuestion[]> {
  const { data, error } = await admin
    .from("homework_questions")
    .select(POOL_QUESTION_COLUMNS)
    .eq("assignment_id", assignmentId)
    .order("display_order", { ascending: true })
    .returns<MilestonePoolQuestion[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).filter(isAutoGradable);
}

/** One question of a battle, with its key and the source lesson's language mode. */
export async function loadBattleQuestion(
  admin: MilestoneAdminClient,
  battle: Pick<MilestoneBattleRow, "assignment_id" | "question_ids">,
  position: number,
): Promise<{ question: MilestonePoolQuestion; languageMode: LessonLanguageMode } | null> {
  const questionId = battle.question_ids[position];
  if (!questionId) return null;
  const { data: question } = await admin
    .from("homework_questions")
    .select(POOL_QUESTION_COLUMNS)
    .eq("id", questionId)
    .eq("assignment_id", battle.assignment_id)
    .maybeSingle<MilestonePoolQuestion>();
  if (!question) return null;
  return { question, languageMode: await languageModeForLesson(admin, question.source_lesson_id) };
}

export async function languageModeForLesson(admin: MilestoneAdminClient, lessonId: string | null): Promise<LessonLanguageMode> {
  if (!lessonId) return null;
  const { data } = await admin
    .from("lesson_slides")
    .select("language_mode")
    .eq("lesson_id", lessonId)
    .maybeSingle<{ language_mode: string | null }>();
  const mode = data?.language_mode;
  return mode === "ar" || mode === "en" || mode === "both" ? mode : null;
}

export async function loadBattle(admin: MilestoneAdminClient, battleId: string): Promise<MilestoneBattleRow | null> {
  const { data } = await admin
    .from("milestone_battles")
    .select(BATTLE_COLUMNS)
    .eq("id", battleId)
    .maybeSingle<MilestoneBattleRow>();
  return data ?? null;
}

export async function loadActiveBattle(
  admin: MilestoneAdminClient,
  learnerId: string,
  milestoneId: string,
): Promise<MilestoneBattleRow | null> {
  const { data } = await admin
    .from("milestone_battles")
    .select(BATTLE_COLUMNS)
    .eq("learner_id", learnerId)
    .eq("milestone_id", milestoneId)
    .eq("status", "active")
    .maybeSingle<MilestoneBattleRow>();
  return data ?? null;
}

export async function loadCertificateFor(admin: MilestoneAdminClient, learnerId: string, milestoneId: string) {
  const { data } = await admin
    .from("learner_certificates")
    .select("id, awarded_at, stars")
    .eq("learner_id", learnerId)
    .eq("milestone_id", milestoneId)
    .maybeSingle<{ id: string; awarded_at: string; stars: 1 | 2 | 3 }>();
  return data ?? null;
}

/** The consecutive-correct streak at the end of a battle's answers. */
export async function loadBattleCombo(admin: MilestoneAdminClient, battleId: string): Promise<number> {
  const { data } = await admin
    .from("milestone_battle_answers")
    .select("position, is_correct")
    .eq("battle_id", battleId)
    .order("position", { ascending: true })
    .returns<Array<{ position: number; is_correct: boolean }>>();
  return comboFrom((data ?? []).map((answer) => answer.is_correct === true));
}

/** The learner-safe state of a battle, with its current question when still active. */
export async function battleStateFor(admin: MilestoneAdminClient, battle: MilestoneBattleRow, lang: Lang): Promise<BattleState> {
  let question = null;
  let hint = null;
  if (battle.status === "active") {
    const loaded = await loadBattleQuestion(admin, battle, battle.answered_count);
    if (loaded) {
      question = toBattleQuestion(loaded.question, battle.id, battle.answered_count, lang, loaded.languageMode);
      const item = servedItem(loaded.question, battle.id);
      if (item && battle.hint_used_question_index === battle.answered_count) {
        hint = owlHintFor(battle.id, loaded.question.id, item.interaction, item.perms);
      }
    }
  }
  const [certificate, combo] = await Promise.all([
    battle.status === "won" && !battle.is_preview
      ? loadCertificateFor(admin, battle.learner_id, battle.milestone_id)
      : Promise.resolve(null),
    battle.answered_count > 0 ? loadBattleCombo(admin, battle.id) : Promise.resolve(0),
  ]);
  return battleStateFromRow(battle, question, certificate?.id ?? null, { combo, hint });
}

/**
 * The learner's state for a milestone, from the same engine that draws the
 * tree (`loadSubjectLearningPath`), so the server and the tree agree.
 */
export async function milestoneStateFor(
  admin: MilestoneAdminClient,
  milestone: MilestoneRow,
  path: PathRow,
  learnerId: string,
): Promise<MilestoneLearnerState> {
  const tree = await loadSubjectLearningPath(admin, path.subject_id, learnerId, "ar");
  if (!tree || tree.pathId !== milestone.path_id) return "locked";
  const milestones = (tree as { milestones?: Array<{ id: string; state: string }> }).milestones;
  if (milestones) {
    const state = milestones.find((item) => item.id === milestone.id)?.state;
    return state === "available" || state === "in_battle" || state === "passed" ? state : "locked";
  }
  // Until the tree reports milestones, the block counts once week k is completed.
  const week = tree.weeks.find((item) => item.weekNumber === milestone.after_week_number);
  return week?.state === "completed" ? "available" : "locked";
}

export async function milestoneUnlockedFor(
  admin: MilestoneAdminClient,
  milestone: MilestoneRow,
  path: PathRow,
  learnerId: string,
): Promise<boolean> {
  return (await milestoneStateFor(admin, milestone, path, learnerId)) !== "locked";
}

/** The block's lessons (weeks k-3..k) in path order. */
export async function loadBlockLessons(
  admin: MilestoneAdminClient,
  pathId: string,
  afterWeekNumber: number,
  lang: Lang,
): Promise<{ lessonId: string; title: string; weekNumber: number }[]> {
  const { data: weeks } = await admin
    .from("learning_path_weeks")
    .select("id, week_number")
    .eq("path_id", pathId)
    .in("week_number", milestoneBlockWeeks(afterWeekNumber))
    .order("week_number", { ascending: true })
    .returns<Array<{ id: string; week_number: number }>>();
  if (!weeks?.length) return [];
  const { data: steps } = await admin
    .from("learning_path_steps")
    .select("week_id, lesson_id, sequence")
    .in("week_id", weeks.map((week) => week.id))
    .order("sequence", { ascending: true })
    .returns<Array<{ week_id: string; lesson_id: string; sequence: number }>>();
  const lessonIds = [...new Set((steps ?? []).map((step) => step.lesson_id))];
  const { data: lessons } = lessonIds.length
    ? await admin
        .from("lessons")
        .select("id, title_ar, title_en")
        .in("id", lessonIds)
        .returns<Array<{ id: string; title_ar: string; title_en: string | null }>>()
    : { data: [] as Array<{ id: string; title_ar: string; title_en: string | null }> };
  const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const weekNumberById = new Map(weeks.map((week) => [week.id, week.week_number]));
  return [...(steps ?? [])]
    .sort((a, b) => (weekNumberById.get(a.week_id)! - weekNumberById.get(b.week_id)!) || a.sequence - b.sequence)
    .map((step) => {
      const lesson = lessonById.get(step.lesson_id);
      return {
        lessonId: step.lesson_id,
        title: (lang === "en" ? lesson?.title_en : lesson?.title_ar) || lesson?.title_ar || "",
        weekNumber: weekNumberById.get(step.week_id)!,
      };
    });
}
