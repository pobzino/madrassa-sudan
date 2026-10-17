import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { getTeacherRole, type TeacherRole } from "@/lib/server/teacher-lesson-access";
import {
  MILESTONE_MAX_BATTLE_QUESTIONS,
  MILESTONE_MIN_BATTLE_QUESTIONS,
  type BattleQuestionType,
  type Lang,
  type TeacherMilestoneQuestion,
  type TeacherMilestoneRow,
} from "@/lib/milestones/types";
import {
  GRADABLE_COLUMNS,
  MILESTONE_COLUMNS,
  isAutoGradable,
  isBossKey,
  milestoneError,
  type MilestoneAdminClient,
  type MilestoneRow,
} from "@/lib/server/milestones/load";
import {
  battleInteractionFor,
  interactionRowFields,
  validateBattleInteraction,
  type BattleInteraction,
  type InteractionSourceRow,
} from "@/lib/server/milestones/interactions";

/**
 * Teacher/admin milestone routes: an approved teacher or admin, with every
 * read and write through the service client (milestone questions have no
 * learner- or teacher-readable policy).
 */
export async function openStaffRequest(options: { fastAuth?: boolean } = {}): Promise<
  { ok: true; userId: string; role: TeacherRole; admin: MilestoneAdminClient } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  // fastAuth: verify the session token locally (ES256, getClaims) instead of a round trip to the auth
  // server; the role and approval below are still read from the database on every request.
  let userId: string | null = null;
  if (options.fastAuth) {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    userId = !error && typeof sub === "string" && sub ? sub : null;
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    userId = !error && user ? user.id : null;
  }
  if (!userId) return { ok: false, response: milestoneError("unauthorized", 401) };
  const user = { id: userId };
  const role = await getTeacherRole(supabase, user.id);
  if (!role) return { ok: false, response: milestoneError("unauthorized", 403, { message: "Forbidden" }) };
  if (!hasServiceRoleConfig()) return { ok: false, response: milestoneError("service_unavailable", 503) };
  return { ok: true, userId: user.id, role, admin: createServiceClient() as unknown as MilestoneAdminClient };
}

/**
 * Who may generate, edit, publish or unpublish a path's milestones: an
 * approved admin, or the approved teacher who created the learning path (the
 * same rule as can_publish_milestone in the database).
 */
export async function canManagePathMilestones(
  admin: MilestoneAdminClient,
  staff: { userId: string; role: TeacherRole },
  pathId: string,
): Promise<boolean> {
  if (staff.role === "admin") return true;
  const { data } = await admin.from("learning_paths").select("created_by").eq("id", pathId).maybeSingle<{ created_by: string | null }>();
  return Boolean(data && data.created_by === staff.userId);
}

export function publishForbiddenResponse() {
  return milestoneError("publish_forbidden", 403, {
    message: "Only an approved admin or the teacher who built this learning path can do this.",
  });
}

export async function loadMilestoneRow(admin: MilestoneAdminClient, id: string) {
  const { data } = await admin.from("learning_path_milestones").select(MILESTONE_COLUMNS).eq("id", id).maybeSingle<MilestoneRow>();
  return data ?? null;
}

export async function teacherMilestoneRow(admin: MilestoneAdminClient, row: MilestoneRow): Promise<TeacherMilestoneRow> {
  const [{ data: questions }, active, certificates] = await Promise.all([
    admin
      .from("homework_questions")
      .select(`${GRADABLE_COLUMNS}, difficulty`)
      .eq("assignment_id", row.assignment_id)
      .returns<Array<InteractionSourceRow & { difficulty?: number | null }>>(),
    admin
      .from("milestone_battles")
      .select("id", { count: "exact", head: true })
      .eq("milestone_id", row.id)
      .eq("status", "active"),
    admin
      .from("learner_certificates")
      .select("id", { count: "exact", head: true })
      .eq("milestone_id", row.id),
  ]);
  const gradable = (questions ?? []).filter(isAutoGradable);
  const difficultyCounts = { d1: 0, d2: 0, d3: 0, none: 0 };
  for (const question of gradable) {
    const d = (question as { difficulty?: number | null }).difficulty;
    if (d === 1) difficultyCounts.d1 += 1;
    else if (d === 2) difficultyCounts.d2 += 1;
    else if (d === 3) difficultyCounts.d3 += 1;
    else difficultyCounts.none += 1;
  }
  return {
    id: row.id,
    pathId: row.path_id,
    kind: row.kind === "placement" ? "placement" : "milestone",
    difficultyCounts,
    afterWeekNumber: row.after_week_number,
    status: row.status,
    assignmentId: row.assignment_id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bossKey: isBossKey(row.boss_key) ? row.boss_key : "puzzle_owlet",
    battleQuestionCount: row.battle_question_count,
    poolSize: (questions ?? []).length,
    autoGradableCount: gradable.length,
    generatedAt: row.generated_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    activeBattles: active.count ?? 0,
    certificates: certificates.count ?? 0,
    required: row.required !== false,
    final: row.is_final === true,
  };
}

const LEGACY_TYPES = new Set<BattleQuestionType>(["multiple_choice", "true_false", "short_answer"]);

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  return cleanString(value) || null;
}

function cleanLang(value: unknown): Lang | null {
  return value === "ar" || value === "en" ? value : null;
}

function cleanOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

/** A staff edit, normalized: the item as an Interaction plus its presentation extras. */
export interface TeacherItemWrite {
  id?: string;
  interaction: BattleInteraction;
  question_content: string | null;
  question_content_language: Lang | null;
  answer_language: Lang | null;
  source_lesson_id: string | null;
  display_order: number;
  /** Measurement tags: undefined = keep the stored value. */
  skill_key?: string | null;
  difficulty?: 1 | 2 | 3 | null;
}

/** A tag edit: undefined (absent: keep), null (clear) or a value; difficulty must be 1-3. */
export function parseTeacherTags(raw: Record<string, unknown>): { skill_key?: string | null; difficulty?: 1 | 2 | 3 | null } | { error: string } {
  const tags: { skill_key?: string | null; difficulty?: 1 | 2 | 3 | null } = {};
  if (raw.skill_key !== undefined) {
    if (raw.skill_key !== null && (typeof raw.skill_key !== "string" || !/^[a-z]+\.[a-z0-9-]+$/.test(raw.skill_key))) return { error: "Unknown skill." };
    tags.skill_key = raw.skill_key as string | null;
  }
  if (raw.difficulty !== undefined) {
    if (raw.difficulty !== null && raw.difficulty !== 1 && raw.difficulty !== 2 && raw.difficulty !== 3) return { error: "Difficulty must be easy, medium or hard." };
    tags.difficulty = raw.difficulty as 1 | 2 | 3 | null;
  }
  return tags;
}

/**
 * Validate one staff question. An `interaction` is authoritative; otherwise
 * the legacy MC / TF / short-answer fields are checked and turned into the
 * matching Interaction (choose_correct / true_false / free-entry fill).
 */
export function validateTeacherQuestion(input: unknown, index: number): { item: TeacherItemWrite } | { error: string } {
  const label = `Question ${index + 1}`;
  if (!input || typeof input !== "object") return { error: `${label} is invalid.` };
  const raw = input as Record<string, unknown>;
  const tags = parseTeacherTags(raw);
  if ("error" in tags) return { error: `${label}: ${tags.error}` };
  const extras = {
    ...tags,
    ...(typeof raw.id === "string" && raw.id ? { id: raw.id } : {}),
    question_content: cleanNullable(raw.question_content),
    question_content_language: cleanLang(raw.question_content_language),
    answer_language: cleanLang(raw.answer_language),
    source_lesson_id: cleanNullable(raw.source_lesson_id),
    display_order: index + 1,
  };

  if (raw.interaction) {
    const checked = validateBattleInteraction(raw.interaction);
    return "error" in checked ? { error: `${label}: ${checked.error}` } : { item: { ...extras, interaction: checked.interaction } };
  }

  const type = raw.question_type as BattleQuestionType;
  if (!LEGACY_TYPES.has(type)) return { error: `${label} has an unsupported type.` };
  const textAr = cleanString(raw.question_text_ar);
  if (!textAr) return { error: `${label} needs Arabic question text.` };
  const prompt = { ar: textAr, en: cleanString(raw.question_text_en) || textAr };
  const optionsAr = cleanOptions(raw.options_ar);
  const optionsEn = cleanOptions(raw.options_en);
  const correctIndex = typeof raw.correct_option_index === "number" ? raw.correct_option_index : null;
  const correctAnswer = cleanString(raw.correct_answer);

  let candidate: unknown;
  if (type === "multiple_choice") {
    if (optionsAr.length < 2 || optionsAr.length > 4) return { error: `${label} needs 2 to 4 options.` };
    if (correctIndex !== null && correctAnswer && correctAnswer !== optionsAr[correctIndex]) {
      return { error: `${label}: the correct answer must match the chosen Arabic option.` };
    }
    candidate = { type: "choose_correct", prompt, options: { ar: optionsAr, en: optionsEn.length ? optionsEn : optionsAr }, correct_index: correctIndex };
  } else if (type === "true_false") {
    if (optionsAr.length && optionsAr.length !== 2) return { error: `${label} needs exactly 2 options.` };
    if (correctIndex !== 0 && correctIndex !== 1) return { error: `${label} needs a correct option.` };
    candidate = { type: "true_false", prompt, answer: correctIndex === 0 };
  } else {
    if (!correctAnswer) return { error: `${label} needs a correct answer.` };
    candidate = { type: "fill_missing_word", prompt, free_entry: true, expected_answer: { ar: correctAnswer, en: correctAnswer } };
  }
  const checked = validateBattleInteraction(candidate);
  return "error" in checked ? { error: `${label}: ${checked.error}` } : { item: { ...extras, interaction: checked.interaction } };
}

export function isValidBattleQuestionCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= MILESTONE_MIN_BATTLE_QUESTIONS && value <= MILESTONE_MAX_BATTLE_QUESTIONS;
}

export function questionWriteRow(
  assignmentId: string,
  item: TeacherItemWrite,
  tags?: { skill_key: string | null; difficulty: number | null; tag_source: string | null; tagged_at: string | null },
) {
  return {
    assignment_id: assignmentId,
    ...interactionRowFields(item.interaction),
    question_content: item.question_content,
    question_content_language: item.question_content_language,
    answer_language: item.answer_language,
    source_lesson_id: item.source_lesson_id,
    display_order: item.display_order,
    points: 1,
    ...(tags ?? {}),
  };
}

/**
 * The tag columns to write for a staff edit, or undefined to leave them alone:
 * when the skill or difficulty differs from the stored one, it becomes a
 * teacher tag (tag_source "teacher", tagged now).
 */
export function teacherTagWrite(
  item: Pick<TeacherItemWrite, "skill_key" | "difficulty">,
  stored: { skill_key?: string | null; difficulty?: number | null } | null,
  now: string,
) {
  const skill = item.skill_key === undefined ? stored?.skill_key ?? null : item.skill_key;
  const difficulty = item.difficulty === undefined ? stored?.difficulty ?? null : item.difficulty;
  const changed = skill !== (stored?.skill_key ?? null) || difficulty !== (stored?.difficulty ?? null);
  if (!changed) return undefined;
  return { skill_key: skill, difficulty, tag_source: skill || difficulty ? "teacher" : null, tagged_at: skill || difficulty ? now : null };
}

export const TEACHER_QUESTION_COLUMNS =
  "id, question_type, question_text_ar, question_text_en, instruction_ar, instruction_en, question_content, question_content_language, answer_language, options, options_ar, options_en, correct_option_index, correct_answer, source_lesson_id, display_order, interaction, skill_key, difficulty, tag_source";

type StoredTeacherQuestion = InteractionSourceRow & {
  id: string;
  instruction_ar: string | null;
  instruction_en: string | null;
  question_content: string | null;
  question_content_language: string | null;
  answer_language: string | null;
  source_lesson_id: string | null;
  display_order: number;
  skill_key?: string | null;
  difficulty?: number | null;
  tag_source?: string | null;
};

const TAG_SOURCES = new Set(["model", "model_disputed", "teacher", "backfill_lesson"]);

export function toTeacherQuestion(row: StoredTeacherQuestion): TeacherMilestoneQuestion {
  const optionsAr = cleanOptions(row.options_ar);
  const legacyType = LEGACY_TYPES.has(row.question_type as BattleQuestionType) ? (row.question_type as BattleQuestionType) : "short_answer";
  return {
    id: row.id,
    question_type: row.interaction ? "interaction" : legacyType,
    interaction: battleInteractionFor(row),
    question_text_ar: row.question_text_ar,
    question_text_en: row.question_text_en,
    instruction_ar: row.instruction_ar,
    instruction_en: row.instruction_en,
    question_content: row.question_content,
    question_content_language: cleanLang(row.question_content_language),
    answer_language: cleanLang(row.answer_language),
    options_ar: optionsAr.length ? optionsAr : cleanOptions(row.options),
    options_en: cleanOptions(row.options_en),
    correct_option_index: row.correct_option_index,
    correct_answer: row.correct_answer ?? "",
    source_lesson_id: row.source_lesson_id,
    display_order: row.display_order,
    skill_key: row.skill_key ?? null,
    difficulty: row.difficulty === 1 || row.difficulty === 2 || row.difficulty === 3 ? row.difficulty : null,
    tag_source: row.tag_source && TAG_SOURCES.has(row.tag_source) ? (row.tag_source as TeacherMilestoneQuestion["tag_source"]) : null,
  };
}

export async function loadTeacherQuestions(admin: MilestoneAdminClient, assignmentId: string) {
  const { data, error } = await admin
    .from("homework_questions")
    .select(TEACHER_QUESTION_COLUMNS)
    .eq("assignment_id", assignmentId)
    .order("display_order", { ascending: true })
    .returns<StoredTeacherQuestion[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toTeacherQuestion);
}
