import "server-only";

import { slideToInteraction } from "@/lib/interactions/adapters";
import { AI_MODEL, getOpenAIClient } from "@/lib/ai/openai-client";
import type { BattleInteractionType } from "@/lib/milestones/types";
import type { Slide } from "@/lib/slides.types";
import { INTERACTION_FIELD_RULES } from "@/lib/slide-generator-policy";
import { MISSING_CONTEXT_PATTERN } from "@/lib/server/practice-generator";
import { validateBattleInteraction, type BattleInteraction } from "@/lib/server/milestones/interactions";

// Big Challenge items: a mix of interaction types per lesson, written with the
// same interaction_* field rules as the slide-deck generator and the Practice
// child-quality rules, then validated and quality-filtered here.

/** Types the generator asks for (drag_drop_label needs a teacher's picture, so never generated). */
export type GeneratedItemType = Exclude<BattleInteractionType, "drag_drop_label">;

/** The rotation that spreads item types across a block's lessons. */
export const ITEM_TYPE_MIX: readonly GeneratedItemType[] = [
  "choose_correct",
  "match_pairs",
  "fill_missing_word",
  "sequence_order",
  "true_false",
  "sort_groups",
  "choose_correct",
  "tap_to_count",
];

export function itemTypesForLesson(lessonIndex: number, count: number): GeneratedItemType[] {
  return Array.from({ length: count }, (_, k) => ITEM_TYPE_MIX[(lessonIndex * count + k) % ITEM_TYPE_MIX.length]);
}

export interface LessonItemRequest {
  content: string;
  lessonTitleAr: string;
  lessonTitleEn: string;
  subjectName: string;
  gradeLevel: number;
  /** One requested type per item, in order. */
  types: GeneratedItemType[];
}

/** Returns raw items in the flat interaction_* shape (validated by the caller). */
export type LessonItemGenerator = (request: LessonItemRequest) => Promise<unknown[]>;

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const stringList = { type: "array", items: { type: "string" } };

const ITEM_FIELDS = {
  interaction_type: { type: "string", enum: [...new Set(ITEM_TYPE_MIX)] },
  interaction_prompt_ar: { type: "string" },
  interaction_prompt_en: { type: "string" },
  interaction_options_ar: nullable(stringList),
  interaction_options_en: nullable(stringList),
  interaction_correct_index: nullable({ type: "integer" }),
  interaction_true_false_answer: nullable({ type: "boolean" }),
  interaction_count_target: nullable({ type: "integer" }),
  interaction_visual_emoji: nullable({ type: "string" }),
  interaction_items_ar: nullable(stringList),
  interaction_items_en: nullable(stringList),
  interaction_targets_ar: nullable(stringList),
  interaction_targets_en: nullable(stringList),
  interaction_solution_map: nullable({ type: "array", items: { type: "integer" } }),
  interaction_free_entry: nullable({ type: "boolean" }),
  interaction_expected_answer_ar: nullable({ type: "string" }),
  interaction_expected_answer_en: nullable({ type: "string" }),
} as const;

const ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: ITEM_FIELDS, required: Object.keys(ITEM_FIELDS), additionalProperties: false },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const CHILD_RULES = [
  "- Items are for a Sudanese child aged roughly 5-12 playing alone on a phone. Keep every prompt short, kind and clear.",
  "- Use only facts, words and methods the lesson teaches. A taught method may be applied to fresh, age-appropriate examples.",
  "- Every item must be self-contained: never refer to a picture, audio, slide, gesture, text above/below, or \"the lesson\".",
  "- Exactly ONE defensible answer per item; no trick wording, opinions or teacher-led activities. If you can argue for a second answer, rewrite the item.",
  "- Every prompt is a complete sentence a 7-year-old understands on its own, at most 12 words, and says exactly what to do.",
  "- Arabic and English fields are separate, natural and meaning-aligned; never mix languages in one field.",
  "- English vocabulary, phonics and spelling items keep the English target words in Latin script in BOTH option/item lists.",
  "- Distractors are plausible but clearly wrong; all choices distinct; no \"all of the above\".",
  "- If a requested type cannot be made meaningfully from this lesson, use choose_correct for that item instead.",
  "- Set every field that does not apply to the item's type to null.",
];

/** Per-type rules: what makes each item type answerable in exactly one way. */
export const TYPE_RULES: Record<GeneratedItemType, string> = {
  choose_correct:
    "choose_correct: exactly one option is correct; every other option is clearly wrong for the prompt. For a sum, the right number appears once.",
  true_false:
    "true_false: a short statement (never a question) that is plainly true or plainly false, with no \"sometimes\" cases.",
  fill_missing_word:
    "fill_missing_word: the sentence shows a blank (___) and exactly one choice fits it.",
  tap_to_count:
    "tap_to_count: the child taps that many things. Either a direction with the number (\"Count 5 apples!\", target 5, emoji 🍎) or a counting question with ONE whole-number answer from 1 to 12 (\"7 stars, take away 3. How many are left?\", target 4). The target is that number.",
  match_pairs:
    "match_pairs: 2-4 pairs; every item has exactly one correct partner and no partner fits two items (no two sums with the same answer, no near-synonyms). List partners aligned by index.",
  sequence_order:
    "sequence_order: 3-5 SINGLE, directly comparable values: plain numbers (7), words compared by length or alphabet, or events in time. NEVER pairs, sums or compound values (\"3 and 7\", \"2 + 5\"). No ties and no repeated values: exactly one order under the stated rule. The prompt is complete, at most 10 words, and states the rule, e.g. \"Smallest to biggest!\" or \"Put the day in order: morning first!\". List the items in the correct order.",
  sort_groups:
    "sort_groups: 2-3 groups and 4-6 items; every item belongs to exactly one group under the prompt's rule (e.g. even / odd), every group gets at least one item, and no item could fit two groups.",
};

/** The default generator: one structured OpenAI call per lesson. */
export const generateLessonItems: LessonItemGenerator = async (request) => {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for Big Challenge generation.");
  const plan = request.types.map((type, index) => `  ${index + 1}. ${type}`).join("\n");
  const prompt = `Write ${request.types.length} quick game items for a "Big Challenge" that reviews one lesson.

Lesson Arabic title: ${request.lessonTitleAr}
Lesson English title: ${request.lessonTitleEn}
Subject: ${request.subjectName}
Grade: ${request.gradeLevel}

LESSON CONTENT
${request.content}

ITEM TYPES, IN ORDER
${plan}

FIELD RULES
${INTERACTION_FIELD_RULES.filter((rule) => !/free_response|draw_answer|drag_drop_label/.test(rule)).join("\n")}

CHILD-QUALITY RULES
${CHILD_RULES.join("\n")}

RULES FOR EACH TYPE
${[...new Set(request.types)].map((type) => `- ${TYPE_RULES[type]}`).join("\n")}

Before answering, silently check every answer, translation and distractor.`;

  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: "system", content: "You are a rigorous bilingual primary-education game designer. Accuracy and child clarity come first." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_schema", json_schema: { name: "milestone_items", strict: true, schema: ITEMS_SCHEMA } },
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Big Challenge generation returned no content.");
  const parsed = JSON.parse(text) as { items?: unknown[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
};

/** Turn one flat generated item into a validated battle Interaction, or null. */
export function toGeneratedInteraction(raw: unknown): BattleInteraction | null {
  const checked = checkGeneratedItem(raw);
  return "interaction" in checked ? checked.interaction : null;
}

/** Validate one generated item (structure, deterministic sense checks, quality), with the reason when it fails. */
export function checkGeneratedItem(raw: unknown): { interaction: BattleInteraction } | { reason: string; prompt: string } {
  const flat = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prompt = String(flat.interaction_prompt_en ?? flat.interaction_prompt_ar ?? "");
  const interaction = slideToInteraction({ ...flat, image_url: null } as unknown as Slide);
  if (!interaction) return { reason: "not an interaction", prompt };
  const checked = validateBattleInteraction(interaction);
  if ("error" in checked) return { reason: checked.error, prompt };
  const issue = itemQualityIssue(checked.interaction);
  return issue ? { reason: issue, prompt } : checked;
}

function textsOf(interaction: BattleInteraction): string[] {
  const lists: string[][] = [];
  if ("options" in interaction && interaction.options) lists.push(interaction.options.ar, interaction.options.en);
  if ("items" in interaction) lists.push(interaction.items.ar, interaction.items.en);
  if ("targets" in interaction) lists.push(interaction.targets.ar, interaction.targets.en);
  return lists.flat();
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** A sequence prompt must say which way to order ("Smallest to biggest!", "morning first"). */
const ORDER_CRITERION =
  /\b(smallest|biggest|largest|greatest|least|most|fewest|shortest|longest|tallest|lightest|heaviest|youngest|oldest|earliest|latest|first|alphabet(?:ical)?|abc|ascending|descending|count(?:ing)? (?:up|down))\b|الأصغر|الأكبر|الأقصر|الأطول|الأقل|الأكثر|الأخف|الأثقل|أولاً|أولا|الأبجدي|أبجدي/iu;

/**
 * A concrete defect that would harm a child or the grading, or null. Applies
 * to generated items on top of validateBattleInteraction's checks.
 */
export function itemQualityIssue(interaction: BattleInteraction): string | null {
  const { ar, en } = interaction.prompt;
  if (MISSING_CONTEXT_PATTERN.test(ar) || MISSING_CONTEXT_PATTERN.test(en)) return "depends on missing context";
  if (ar.length > 220 || en.length > 220) return "prompt too long";
  if (wordCount(en) > 16) return "prompt has too many words for a young child";
  if (interaction.type === "true_false" && (/[?؟]\s*$/u.test(ar) || /[?؟]\s*$/u.test(en))) return "true/false must be a statement";
  if (interaction.type === "sequence_order") {
    if (wordCount(en) > 10) return "put-in-order prompt is longer than 10 words";
    if (!ORDER_CRITERION.test(en) && !ORDER_CRITERION.test(ar)) return "put-in-order prompt does not say which way to order";
  }
  if (textsOf(interaction).some((value) => value.length > 80)) return "a choice is too long";
  return null;
}

export function promptKey(interaction: BattleInteraction) {
  return (interaction.prompt.en || interaction.prompt.ar).toLocaleLowerCase("en").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}
