import { COUNTABLE_NAMES, countableFor } from "@/lib/countables";
import "server-only";

import {
  resolvePracticeDisplayLanguages,
  resolvePracticeQuestionPresentation,
  type LessonLanguageMode,
} from "@/lib/practice-language";
import { battlePhase, battleTurn, bossHpPercent, isBigMovePosition } from "@/lib/milestones/rules";
import type { BattleQuestion, BattleState, BattleStatus, Lang, MilestoneKind, OwlHint } from "@/lib/milestones/types";
import { cachedNarrationUrl, questionNarration, type NarratableQuestion } from "@/lib/server/question-audio";
import {
  battleInteractionFor,
  displayChoices,
  interactionPerms,
  toPublicInteraction,
  type BattleInteraction,
  type InteractionPerms,
} from "@/lib/server/milestones/interactions";

export { optionPermutation } from "@/lib/server/milestones/interactions";

/** perm[displayIndex] = canonical index. */
export function canonicalChoice(displayIndex: number, perm: readonly number[]): number {
  return perm[displayIndex];
}

/** A pool question with its answer key. Server-only: never serialize it to a learner. */
export interface MilestonePoolQuestion extends NarratableQuestion {
  assignment_id: string;
  question_type: string;
  correct_answer: string | null;
  correct_option_index: number | null;
  source_lesson_id: string | null;
  display_order: number;
  /** The item as a shared Interaction (with its key). Null on legacy MC/TF/short rows. */
  interaction: unknown;
  /** Measurement tags (null = untagged). */
  skill_key?: string | null;
  difficulty?: number | null;
}

/** A milestone_battles row (§1.2). */
export interface MilestoneBattleRow {
  id: string;
  milestone_id: string;
  assignment_id: string;
  learner_id: string;
  attempt_number: number;
  is_preview: boolean;
  question_ids: string[];
  question_count: number;
  required_correct: number;
  hearts_total: number;
  correct_count: number;
  wrong_count: number;
  answered_count: number;
  status: BattleStatus;
  started_at: string;
  last_answer_at: string | null;
  finished_at: string | null;
  /** The one Owl Hint: which position it was used on (null = unused). */
  hint_used_question_index: number | null;
  hint_used_at: string | null;
  /** Absent on rows read before the measurement migration: "milestone". */
  kind?: MilestoneKind;
  /** Placement only: set when staff re-placed the learner. */
  superseded_at?: string | null;
}

export function isPlacementBattle(row: Pick<MilestoneBattleRow, "kind">): boolean {
  return row.kind === "placement";
}

/** A placement's meter: down one step per answer, whatever the verdict. */
export function placementHpPercent(row: Pick<MilestoneBattleRow, "question_count" | "answered_count">): number {
  if (row.question_count <= 0) return 0;
  return Math.max(0, Math.round((100 * (row.question_count - row.answered_count)) / row.question_count));
}

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
}

/** A pool question resolved for one battle: its Interaction and this battle's shuffles. */
export interface ServedItem {
  interaction: BattleInteraction;
  perms: InteractionPerms;
}

export function servedItem(question: MilestonePoolQuestion, battleId: string): ServedItem | null {
  const interaction = battleInteractionFor(question);
  if (!interaction) return null;
  return { interaction, perms: interactionPerms(battleId, question.id, interaction) };
}

/** A catch move always says what to tap: "Count 5 apples!", or the question then "Tap that many stars!". */
export function countInstruction(
  prompt: string,
  shown: { emoji: string; catch_count: number | null },
  lang: Lang,
): string {
  const { emoji, catch_count: count } = shown;
  const kind = countableFor(emoji);
  const name = (n: number) => (lang === "ar" ? COUNTABLE_NAMES[kind].ar : COUNTABLE_NAMES[kind].en[n === 1 ? 0 : 1]);
  if (count !== null) {
    // Keep a prompt that already gives the direction with its number ("Count 5 apples!").
    const digits = prompt.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    if (new RegExp(`(^|\\D)${count}(\\D|$)`).test(digits)) return prompt;
    return lang === "ar" ? `عُدّ ${count} ${name(count)}!` : `Count ${count} ${name(count)}!`;
  }
  const tail = lang === "ar" ? `اضغط بعدد ${name(2)}!` : `Tap that many ${name(2)}!`;
  return /that many|بعدد/i.test(prompt) ? prompt : `${prompt.trim()} ${tail}`;
}

/** Whether the question at `position` is this battle's Big Move (a Big Challenge's every 4th question). */
export function bigMoveFor(battle: Pick<MilestoneBattleRow, "kind" | "question_count">, position: number): boolean {
  return battle.kind !== "placement" && isBigMovePosition(position, battle.question_count);
}

export function toBattleQuestion(
  question: MilestonePoolQuestion,
  battleId: string,
  position: number,
  lang: Lang,
  languageMode: LessonLanguageMode,
  extra: { bigMove?: boolean } = {},
): BattleQuestion | null {
  const item = servedItem(question, battleId);
  if (!item) return null;
  const { interaction, perms } = item;
  const languages = resolvePracticeDisplayLanguages(languageMode, lang);
  const presentation = resolvePracticeQuestionPresentation({
    defaultAnswerLanguage: languages.answerLanguage,
    instructionLanguage: lang,
    legacyMaterialLanguage: languageMode,
    answerLanguage: question.answer_language,
    instructionAr: question.instruction_ar ?? interaction.prompt.ar,
    instructionEn: question.instruction_en ?? interaction.prompt.en,
    questionContent: question.question_content,
    questionContentLanguage: question.question_content_language,
    questionTextAr: question.question_text_ar,
    questionTextEn: question.question_text_en,
  });
  const options = displayChoices(interaction, perms, presentation.answerLanguage);
  // The battle's clip is the key line only (see the audio route), so the cached clip is looked up by that text.
  const { hash } = questionNarration(question, lang, languageMode, undefined, true);
  const expected = interaction.type === "fill_missing_word" && interaction.free_entry ? interaction.expected_answer?.ar ?? "" : "";

  const shown = toPublicInteraction(interaction, perms);
  return {
    position,
    questionId: question.id,
    type: interaction.type,
    interaction: shown,
    instruction: shown.type === "tap_to_count" ? countInstruction(presentation.instruction, shown, lang) : presentation.instruction,
    content: presentation.questionContent,
    contentLanguage: presentation.questionContentLanguage,
    answerLanguage: presentation.answerLanguage,
    options,
    numericAnswer: /^-?\d+(?:[.,]\d+)?$/.test(normalizeDigits(expected)),
    imageUrl: interaction.type === "drag_drop_label" ? interaction.image_url : null,
    audioUrl: cachedNarrationUrl(question, lang, hash),
    turn: battleTurn(position),
    ...(extra.bigMove ? { bigMove: true } : {}),
  };
}

/** The display-order choices a battle question shows, for narration. */
export function battleDisplayOptions(
  question: MilestonePoolQuestion,
  battleId: string,
  lang: Lang,
  languageMode: LessonLanguageMode,
) {
  return toBattleQuestion(question, battleId, 0, lang, languageMode)?.options ?? [];
}

export function heartsLeftFor(row: Pick<MilestoneBattleRow, "hearts_total" | "wrong_count" | "kind">) {
  // A placement has no tries: the UI hides them, and they never run out.
  if (row.kind === "placement") return row.hearts_total;
  return Math.max(0, row.hearts_total - row.wrong_count);
}

/** The boss meter of any battle kind. */
export function battleHpPercent(row: Pick<MilestoneBattleRow, "kind" | "correct_count" | "required_correct" | "question_count" | "answered_count">) {
  return row.kind === "placement" ? placementHpPercent(row) : bossHpPercent(row.correct_count, row.required_correct);
}

export function battleStateFromRow(
  row: MilestoneBattleRow,
  question: BattleQuestion | null,
  certificateId: string | null,
  extras: { combo?: number; hint?: OwlHint | null } = {},
): BattleState {
  const placement = row.kind === "placement";
  const hp = battleHpPercent(row);
  const active = row.status === "active";
  return {
    battleId: row.id,
    milestoneId: row.milestone_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    preview: row.is_preview,
    questionCount: row.question_count,
    requiredCorrect: row.required_correct,
    heartsTotal: row.hearts_total,
    heartsLeft: heartsLeftFor(row),
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    answeredCount: row.answered_count,
    bossHpPercent: hp,
    question: active ? question : null,
    certificateId: placement ? null : certificateId,
    combo: placement ? 0 : extras.combo ?? 0,
    phase: battlePhase(hp),
    hintUsed: row.hint_used_question_index !== null && row.hint_used_question_index !== undefined,
    hint: active && !placement && row.hint_used_question_index === row.answered_count ? extras.hint ?? null : null,
    kind: placement ? "placement" : "milestone",
    hintAllowed: !placement,
  };
}
