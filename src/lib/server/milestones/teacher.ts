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
export async function openStaffRequest(): Promise<
  { ok: true; userId: string; role: TeacherRole; admin: MilestoneAdminClient } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, response: milestoneError("unauthorized", 401) };
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
      .select(GRADABLE_COLUMNS)
      .eq("assignment_id", row.assignment_id)
      .returns<InteractionSourceRow[]>(),
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
  return {
    id: row.id,
    pathId: row.path_id,
    afterWeekNumber: row.after_week_number,
    status: row.status,
    assignmentId: row.assignment_id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bossKey: isBossKey(row.boss_key) ? row.boss_key : "puzzle_owlet",
    battleQuestionCount: row.battle_question_count,
    poolSize: (questions ?? []).length,
    autoGradableCount: (questions ?? []).filter(isAutoGradable).length,
    generatedAt: row.generated_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    activeBattles: active.count ?? 0,
    certificates: certificates.count ?? 0,
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
  const extras = {
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

export function questionWriteRow(assignmentId: string, item: TeacherItemWrite) {
  return {
    assignment_id: assignmentId,
    ...interactionRowFields(item.interaction),
    question_content: item.question_content,
    question_content_language: item.question_content_language,
    answer_language: item.answer_language,
    source_lesson_id: item.source_lesson_id,
    display_order: item.display_order,
    points: 1,
  };
}

export const TEACHER_QUESTION_COLUMNS =
  "id, question_type, question_text_ar, question_text_en, instruction_ar, instruction_en, question_content, question_content_language, answer_language, options, options_ar, options_en, correct_option_index, correct_answer, source_lesson_id, display_order, interaction";

type StoredTeacherQuestion = InteractionSourceRow & {
  id: string;
  instruction_ar: string | null;
  instruction_en: string | null;
  question_content: string | null;
  question_content_language: string | null;
  answer_language: string | null;
  source_lesson_id: string | null;
  display_order: number;
};

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
