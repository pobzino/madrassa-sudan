import "server-only";

import { AI_MODEL_FAST, getOpenAIClient } from "@/lib/ai/openai-client";
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
}

export interface VerifyRequest {
  items: BattleInteraction[];
  lessonTitleEn: string;
  subjectName: string;
  gradeLevel: number;
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
  }
}

/** What the child sees: the public view in a shuffled order, so no key leaks through list order. */
export function describeForChild(item: BattleInteraction, index: number): string {
  return JSON.stringify(toPublicInteraction(item, interactionPerms("verify", String(index), item)));
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          child_answer: { type: "string" },
          matches_key: { type: "boolean" },
          ambiguous: { type: "boolean" },
          wrong_key: { type: "boolean" },
          needs_picture: { type: "boolean" },
          incomplete_prompt: { type: "boolean" },
          too_hard: { type: "boolean" },
          reason: { type: "string" },
        },
        required: ["index", "child_answer", "matches_key", "ambiguous", "wrong_key", "needs_picture", "incomplete_prompt", "too_hard", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

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
Return one verdict per item, using its index.`;

  const completion = await openai.chat.completions.create({
    model: AI_MODEL_FAST,
    messages: [
      { role: "system", content: "You are a strict, careful reviewer of children's quiz items. When in doubt, flag." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milestone_item_verdicts", strict: true, schema: VERDICT_SCHEMA } },
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
  }));
};

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
    const reasons = !verdict
      ? ["no verdict"]
      : [...verdict.flags, ...(verdict.matchesKey || verdict.flags.includes("wrong_key") ? [] : ["wrong_key"])];
    if (verdict?.reason && reasons.length) reasons.push(verdict.reason);
    if (reasons.length) dropped.push({ prompt: item.prompt.en || item.prompt.ar, type: item.type, reasons });
    else kept.push(item);
  });
  return { kept, dropped };
}
