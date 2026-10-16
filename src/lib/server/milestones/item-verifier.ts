import "server-only";

import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { AI_MODEL_FAST, AI_MODEL_MILESTONE_VERIFY, getOpenAIClient } from "@/lib/ai/openai-client";
import { isModelUnavailableError } from "@/lib/ai/model-errors";
import type { Difficulty, TagSource } from "@/lib/measurement/types";
import {
  interactionPerms,
  toPublicInteraction,
  type BattleInteraction,
} from "@/lib/server/milestones/interactions";

// A second, cheap model pass over generated Big Challenge items. The verifier
// first answers each item blind, as a 7-year-old would, from what the child
// sees (lists shuffled, no key); only then does it compare with the key and
// raise flags. Any flag, a mismatch with the key, or a missing verdict drops
// the item.

export const VERIFY_FLAGS = ["ambiguous", "wrong_key", "needs_picture", "incomplete_prompt", "too_hard"] as const;
export type VerifyFlag = (typeof VERIFY_FLAGS)[number];

export interface ItemVerdict {
  index: number;
  childAnswer: string;
  matchesKey: boolean;
  flags: VerifyFlag[];
  reason: string;
  /** The verifier's blind difficulty estimate (1-3), when given. */
  difficulty?: Difficulty | null;
  /** The skill the verifier thinks the item checks, when given. */
  skillKey?: string | null;
}

export interface VerifyRequest {
  items: BattleInteraction[];
  lessonTitleEn: string;
  subjectName: string;
  gradeLevel: number;
  /** The subject's assessable skills (for the skill_key estimate). */
  skills?: Array<{ key: string; label: string }>;
}

export type ItemVerifier = (request: VerifyRequest) => Promise<ItemVerdict[]>;

/** The key, written out for the verifier's second step. */
export function describeKey(item: BattleInteraction): string {
  const en = (list: { en: string[] }, i: number) => list.en[i];
  switch (item.type) {
    case "choose_correct":
      return `correct option: "${en(item.options, item.correct_index)}"`;
    case "true_false":
      return item.answer ? "the statement is TRUE" : "the statement is FALSE";
    case "fill_missing_word":
      return item.free_entry ? `missing word: "${item.expected_answer?.en ?? ""}"` : `missing word: "${en(item.options!, item.correct_index!)}"`;
    case "tap_to_count":
      return `tap exactly ${item.target}`;
    case "match_pairs":
      return item.items.en.map((value, i) => `"${value}" ↔ "${item.targets.en[i]}"`).join("; ");
    case "sequence_order":
      return `correct order: ${item.items.en.map((value) => `"${value}"`).join(" → ")}`;
    case "sort_groups":
      return item.items.en.map((value, i) => `"${value}" → ${item.targets.en[item.solution_map[i]]}`).join("; ");
    case "drag_drop_label":
      return item.labels.en.map((label, i) => `"${label}" → spot ${i + 1}`).join("; ");
    case "trace_letter":
      return `trace the letter "${item.config.letter}" (shown to the child as a guide)`;
  }
}

/**
 * The child sees no choices in a trace item (the letter's guide is shown and
 * tracing it is the task), so there is nothing to answer blind: only whether
 * the prompt makes sense counts.
 */
export function answersBlind(item: BattleInteraction): boolean {
  return item.type !== "trace_letter";
}

/** What the child sees: the public view in a shuffled order, so no key leaks through list order. */
export function describeForChild(item: BattleInteraction, index: number): string {
  const shown = toPublicInteraction(item, interactionPerms("verify", String(index), item));
  // The guide's coordinates mean nothing to a reader: name the letter instead.
  if (shown.type === "trace_letter") {
    return JSON.stringify({ type: "trace_letter", prompt: shown.prompt, letter_shown: shown.letter, script: shown.script });
  }
  return JSON.stringify(shown);
}

/** The verdict schema; adds the blind `difficulty` (1-3) and `skill_key` (one of the subject's skills). */
export function verdictSchema(skillKeys: readonly string[] = []) {
  const keys = [...new Set(skillKeys.filter(Boolean))];
  const properties = {
    index: { type: "integer" },
    child_answer: { type: "string" },
    matches_key: { type: "boolean" },
    ambiguous: { type: "boolean" },
    wrong_key: { type: "boolean" },
    needs_picture: { type: "boolean" },
    incomplete_prompt: { type: "boolean" },
    too_hard: { type: "boolean" },
    reason: { type: "string" },
    difficulty: { type: "integer", enum: [1, 2, 3] },
    skill_key: keys.length ? { type: "string", enum: keys } : { type: "string" },
  };
  return {
    type: "object",
    properties: {
      verdicts: {
        type: "array",
        items: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
      },
    },
    required: ["verdicts"],
    additionalProperties: false,
  } as const;
}

/** The default verifier: one structured call on the fast model per lesson's items. */
export const verifyItemsWithModel: ItemVerifier = async (request) => {
  if (!request.items.length) return [];
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for Big Challenge verification.");
  const shown = request.items.map((item, index) => `ITEM ${index}: ${describeForChild(item, index)}`).join("\n");
  const keys = request.items.map((item, index) => `ITEM ${index}: ${describeKey(item)}`).join("\n");
  const prompt = `You check quick game items for children (subject: ${request.subjectName}, grade ${request.gradeLevel}, lesson "${request.lessonTitleEn}").

STEP 1. Answer every item BLIND, as a careful 7-year-old would, using only what the child sees below. Write that answer in child_answer.
${shown}

STEP 2. Only now read the answer key and compare.
${keys}

For each item set:
- matches_key: your blind answer agrees with the key.
- ambiguous: more than one answer (or order, pairing, grouping) is defensible, or items tie under the stated rule.
- wrong_key: the key is incorrect.
- needs_picture: the item can't be answered without a picture, sound or something not shown.
- incomplete_prompt: the prompt is missing words, the rule to follow, or doesn't make sense on its own.
- too_hard: well beyond a 7-year-old at this grade.
- reason: one short sentence when any flag is true or matches_key is false, else "".
- difficulty: how hard the item is for this grade (1 = recall: one step, a taught fact; 2 = apply: one step on a fresh example or a familiar two-step; 3 = stretch: two or more steps or a new context).
- skill_key: the skill the item checks${request.skills?.length ? `, one of: ${request.skills.map((skill) => `${skill.key} (${skill.label})`).join("; ")}` : ""}.
Trace-a-letter items (type "trace_letter") have nothing to choose: the child traces the letter shown. Set child_answer to "trace" and matches_key to true; only judge the prompt: it must make sense on its own and ask the child to trace (write) exactly that letter (incomplete_prompt otherwise).
Return one verdict per item, using its index.`;

  const params: Omit<ChatCompletionCreateParamsNonStreaming, "model"> = {
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "You are a strict, careful reviewer of children's quiz items. When in doubt, flag." },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "milestone_item_verdicts", strict: true, schema: verdictSchema((request.skills ?? []).map((skill) => skill.key)) },
    },
  };
  // The newest model first; an older one if this key cannot use it.
  const completion = await openai.chat.completions
    .create({ model: AI_MODEL_MILESTONE_VERIFY, ...params })
    .catch((error: unknown) => {
      if (!isModelUnavailableError(error) || AI_MODEL_MILESTONE_VERIFY === AI_MODEL_FAST) throw error;
      console.warn(`OpenAI model ${AI_MODEL_MILESTONE_VERIFY} unavailable; using ${AI_MODEL_FAST}`);
      return openai.chat.completions.create({ model: AI_MODEL_FAST, ...params });
    });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Big Challenge verification returned no content.");
  const parsed = JSON.parse(text) as { verdicts?: Array<Record<string, unknown>> };
  return (parsed.verdicts ?? []).map((verdict) => ({
    index: Number(verdict.index),
    childAnswer: String(verdict.child_answer ?? ""),
    matchesKey: verdict.matches_key === true,
    flags: VERIFY_FLAGS.filter((flag) => verdict[flag] === true),
    reason: String(verdict.reason ?? ""),
    // The tag estimates, only when the model gave them.
    ...(verdict.difficulty === 1 || verdict.difficulty === 2 || verdict.difficulty === 3 ? { difficulty: verdict.difficulty } : {}),
    ...(typeof verdict.skill_key === "string" && verdict.skill_key ? { skillKey: verdict.skill_key } : {}),
  }));
};

/**
 * The stored tags of a generated item: difficulty = the verifier's blind estimate
 * when present, else the generator's; skill = the generator's. Disputed when the
 * two disagree on the skill or by two difficulty steps. The drop rules
 * (applyVerdicts) are not affected.
 */
export function mergeTags(
  generated: { skillKey: string | null; difficulty: Difficulty | null },
  verdict: Pick<ItemVerdict, "difficulty" | "skillKey"> | null | undefined,
): { skillKey: string | null; difficulty: Difficulty | null; tagSource: TagSource } {
  const difficulty = verdict?.difficulty ?? generated.difficulty ?? null;
  const skillDispute = Boolean(verdict?.skillKey && generated.skillKey && verdict.skillKey !== generated.skillKey);
  const difficultyDispute = Boolean(verdict?.difficulty && generated.difficulty && Math.abs(verdict.difficulty - generated.difficulty) === 2);
  return { skillKey: generated.skillKey, difficulty, tagSource: skillDispute || difficultyDispute ? "model_disputed" : "model" };
}

export interface DroppedItem {
  prompt: string;
  type?: BattleInteraction["type"];
  reasons: string[];
}

/** Keep only items the verifier passed cleanly; everything else is dropped with its reasons. */
export function applyVerdicts(items: BattleInteraction[], verdicts: ItemVerdict[]): { kept: BattleInteraction[]; dropped: DroppedItem[] } {
  const byIndex = new Map(verdicts.map((verdict) => [verdict.index, verdict]));
  const kept: BattleInteraction[] = [];
  const dropped: DroppedItem[] = [];
  items.forEach((item, index) => {
    const verdict = byIndex.get(index);
    // Trace items have no blind answer (and so no key to get wrong): only the prompt checks count.
    const blind = answersBlind(item);
    const reasons = !verdict
      ? ["no verdict"]
      : blind
        ? [...verdict.flags, ...(verdict.matchesKey || verdict.flags.includes("wrong_key") ? [] : ["wrong_key"])]
        : verdict.flags.filter((flag) => flag !== "wrong_key");
    if (verdict?.reason && reasons.length) reasons.push(verdict.reason);
    if (reasons.length) dropped.push({ prompt: item.prompt.en || item.prompt.ar, type: item.type, reasons });
    else kept.push(item);
  });
  return { kept, dropped };
}
