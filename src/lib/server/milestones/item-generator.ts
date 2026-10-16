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
  "- Exactly one defensible answer per item; no trick wording, opinions or teacher-led activities.",
  "- Arabic and English fields are separate, natural and meaning-aligned; never mix languages in one field.",
  "- English vocabulary, phonics and spelling items keep the English target words in Latin script in BOTH option/item lists.",
  "- true_false prompts are short statements, never questions.",
  "- tap_to_count: the child taps that many things in the game. Write the prompt as a clear direction with the number, e.g. \"Count 5 apples!\" (target 5, emoji 🍎), or as a counting question whose answer is the target, e.g. \"7 stars, take away 3. How many are left?\".",
  "- Distractors are plausible but clearly wrong; all choices distinct; no \"all of the above\".",
  "- If a requested type cannot be made meaningfully from this lesson, use choose_correct for that item instead.",
  "- Set every field that does not apply to the item's type to null.",
];

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
  if (!raw || typeof raw !== "object") return null;
  const interaction = slideToInteraction({ ...(raw as object), image_url: null } as unknown as Slide);
  if (!interaction) return null;
  const checked = validateBattleInteraction(interaction);
  return "interaction" in checked ? checked.interaction : null;
}

function textsOf(interaction: BattleInteraction): string[] {
  const lists: string[][] = [];
  if ("options" in interaction && interaction.options) lists.push(interaction.options.ar, interaction.options.en);
  if ("items" in interaction) lists.push(interaction.items.ar, interaction.items.en);
  if ("targets" in interaction) lists.push(interaction.targets.ar, interaction.targets.en);
  return lists.flat();
}

/** A concrete defect that would harm a child or the grading, or null. */
export function itemQualityIssue(interaction: BattleInteraction): string | null {
  const { ar, en } = interaction.prompt;
  if (MISSING_CONTEXT_PATTERN.test(ar) || MISSING_CONTEXT_PATTERN.test(en)) return "depends on missing context";
  if (ar.length > 220 || en.length > 220) return "prompt too long";
  if (interaction.type === "true_false" && (/[?؟]\s*$/u.test(ar) || /[?؟]\s*$/u.test(en))) return "true/false must be a statement";
  if (textsOf(interaction).some((value) => value.length > 80)) return "a choice is too long";
  return null;
}

export function promptKey(interaction: BattleInteraction) {
  return (interaction.prompt.en || interaction.prompt.ar).toLocaleLowerCase("en").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}
