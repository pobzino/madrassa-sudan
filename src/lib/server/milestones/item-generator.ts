import "server-only";

import { slideToInteraction } from "@/lib/interactions/adapters";
import { TRACE_LETTERS } from "@/lib/interactions/trace-letter";
import { AI_MODEL, getOpenAIClient } from "@/lib/ai/openai-client";
import type { BattleInteractionType } from "@/lib/milestones/types";
import type { Difficulty } from "@/lib/measurement/types";
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

/**
 * The types to ask for, spread across lessons. A lesson that teaches letters
 * also gets a trace_letter item (two when there is room), in place of the
 * mix's slot 1 (and slot 4).
 */
export function itemTypesForLesson(lessonIndex: number, count: number, teachesLetters = false): GeneratedItemType[] {
  const types: GeneratedItemType[] = Array.from({ length: count }, (_, k) => ITEM_TYPE_MIX[(lessonIndex * count + k) % ITEM_TYPE_MIX.length]);
  if (teachesLetters) {
    if (count >= 2) types[1] = "trace_letter";
    if (count >= 7) types[4] = "trace_letter";
  }
  return types;
}

/** The letters a lesson teaches (from its titles, else its content), for trace_letter items. */
export interface LessonLetters {
  script: "ar" | "en";
  letters: string[];
}

const ARABIC_LETTER_NAMES: Array<[string, string]> = [
  ["ألف", "ا"], ["باء", "ب"], ["تاء", "ت"], ["ثاء", "ث"], ["جيم", "ج"], ["حاء", "ح"], ["خاء", "خ"], ["دال", "د"],
  ["ذال", "ذ"], ["راء", "ر"], ["زاي", "ز"], ["سين", "س"], ["شين", "ش"], ["صاد", "ص"], ["ضاد", "ض"], ["طاء", "ط"],
  ["ظاء", "ظ"], ["عين", "ع"], ["غين", "غ"], ["فاء", "ف"], ["قاف", "ق"], ["كاف", "ك"], ["لام", "ل"], ["ميم", "م"],
  ["نون", "ن"], ["هاء", "ه"], ["واو", "و"], ["ياء", "ي"],
];

function arabicLettersIn(text: string): string[] {
  const found = new Set<string>();
  // A letter on its own ("حرف ب", "ب - باب"), never one inside a word.
  for (const match of text.matchAll(/(?:^|[^ء-ي])([ا-ي])(?=$|[^ء-ي])/gu)) {
    if (TRACE_LETTERS.ar.includes(match[1])) found.add(match[1]);
  }
  // Or by name: "حرف الباء", "الباء".
  for (const [name, letter] of ARABIC_LETTER_NAMES) {
    if (new RegExp(`(?:ال|حرف\\s+)${name}(?![\\u0621-\\u064A])`, "u").test(text)) found.add(letter);
  }
  return [...found];
}

function englishLettersIn(text: string): string[] {
  const found = new Set<string>();
  // "Letter B", "Letters a and b", "the letters s, a, t"
  for (const match of text.matchAll(/\bletters?\s+((?:[A-Za-z](?:\s*(?:,|&|\/|and)\s*|\s+|$))+)/gi)) {
    for (const letter of match[1].match(/\b[A-Za-z]\b/g) ?? []) found.add(letter);
  }
  // "Bb", "/s/"
  for (const match of text.matchAll(/\b([A-Z])([a-z])\b/g)) if (match[1].toLowerCase() === match[2]) found.add(match[1]).add(match[2]);
  for (const match of text.matchAll(/\/([a-z])\//g)) found.add(match[1]);
  // A letter in one case may be traced in either.
  for (const letter of [...found]) found.add(letter.toUpperCase()).add(letter.toLowerCase());
  return [...found].filter((letter) => TRACE_LETTERS.en.includes(letter));
}

/**
 * Null unless the lesson teaches Arabic or English letters (an Arabic /
 * English subject whose lesson title is about letters) and names at least one.
 */
export function lessonLetters(input: { subjectName: string; lessonTitleAr: string; lessonTitleEn: string; content: string }): LessonLetters | null {
  const subject = input.subjectName.toLowerCase();
  const script = /english|إنجليزي|انجليزي/.test(subject) ? "en" : /arabic|عربي|لغتي/.test(subject) ? "ar" : null;
  if (!script) return null;
  const titles = `${input.lessonTitleEn} ${input.lessonTitleAr}`;
  const aboutLetters = /\b(letters?|alphabet|phonics|abc)\b/i.test(titles) || /حرف|حروف|أبجد|الهجاء/u.test(titles);
  if (!aboutLetters) return null;
  const find = script === "ar" ? arabicLettersIn : englishLettersIn;
  const letters = find(titles).length ? find(titles) : find(input.content);
  return letters.length ? { script, letters } : null;
}

export interface LessonItemRequest {
  content: string;
  lessonTitleAr: string;
  lessonTitleEn: string;
  subjectName: string;
  gradeLevel: number;
  /** One requested type per item, in order. */
  types: GeneratedItemType[];
  /** The letters this lesson teaches, when it does (trace_letter items use one of them). */
  letters?: LessonLetters | null;
  /** The subject's assessable skills (each item is tagged with one). */
  skills?: Array<{ key: string; label: string }>;
  /** The lesson's own skill: preferred when it fits; the fallback for a missing / unknown tag. */
  defaultSkillKey?: string;
  /** One difficulty per item, in order (placement only). */
  difficultyPlan?: Difficulty[];
}

/** Returns raw items in the flat interaction_* shape (validated by the caller). */
export type LessonItemGenerator = (request: LessonItemRequest) => Promise<unknown[]>;

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const stringList = { type: "array", items: { type: "string" } };

const ITEM_FIELDS = {
  interaction_type: { type: "string", enum: [...new Set<GeneratedItemType>([...ITEM_TYPE_MIX, "trace_letter"])] },
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
  interaction_trace_script: nullable({ type: "string", enum: ["ar", "en"] }),
  interaction_trace_letter: nullable({ type: "string" }),
  interaction_trace_case: nullable({ type: "string", enum: ["upper", "lower"] }),
} as const;

/**
 * The structured-output schema for one request: the interaction fields plus two
 * required tags, `skill_key` (one of the subject's assessable skills) and
 * `difficulty` (1 recall, 2 apply, 3 stretch).
 */
export function itemsSchema(skillKeys: readonly string[]) {
  const keys = [...new Set(skillKeys.filter(Boolean))];
  const fields = {
    ...ITEM_FIELDS,
    skill_key: keys.length ? { type: "string", enum: keys } : { type: "string" },
    difficulty: { type: "integer", enum: [1, 2, 3] },
  };
  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "object", properties: fields, required: Object.keys(fields), additionalProperties: false },
      },
    },
    required: ["items"],
    additionalProperties: false,
  } as const;
}

/** The difficulty scale shared by the generator, the verifier, the tagger and the teacher UI. */
export const DIFFICULTY_SCALE = [
  "1 = recall: one step, a taught example or fact.",
  "2 = apply: one step on a fresh example, or a familiar two-step.",
  "3 = stretch: two or more steps, or transfer to a new context, still inside the taught content.",
];

/** The SKILLS / DIFFICULTY part of the generation prompt. */
export function tagPrompt(request: Pick<LessonItemRequest, "skills" | "defaultSkillKey" | "difficultyPlan">): string {
  const skills = request.skills ?? [];
  const lines: string[] = [];
  if (skills.length) {
    lines.push(`SKILLS (pick the one each item checks; prefer ${request.defaultSkillKey ?? skills[0].key} when it fits)`);
    for (const skill of skills) lines.push(`- ${skill.key}: ${skill.label}`);
    lines.push("");
  }
  lines.push("DIFFICULTY (set each item's difficulty honestly)", ...DIFFICULTY_SCALE.map((line) => `- ${line}`));
  if (request.difficultyPlan?.length) {
    lines.push("", `DIFFICULTY, IN ORDER: ${request.difficultyPlan.join(", ")}`, "Make each item that hard.");
  }
  return lines.join("\n");
}

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
  trace_letter:
    "trace_letter: the child traces ONE letter this lesson teaches (from LETTERS TAUGHT), shown to them as a guide. Set interaction_trace_script (\"ar\" for an Arabic letter, \"en\" for an English one), interaction_trace_letter to that single letter (Arabic: the plain letter, e.g. \"ب\"; English: in the case to trace, e.g. \"b\" or \"B\"), and interaction_trace_case (\"upper\" / \"lower\" for English, null for Arabic). The prompt asks the child to trace that letter and names it, e.g. \"Trace the letter b!\" / \"تتبّع حرف الباء ب!\". All option, item and answer fields are null.",
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
${request.letters?.letters.length ? `\nLETTERS TAUGHT (trace_letter uses one of these)\n${request.letters.letters.join(" ")}\n` : ""}
${tagPrompt(request)}

FIELD RULES
${INTERACTION_FIELD_RULES.filter((rule) => !/free_response|draw_answer|drag_drop_label|trace_letter/.test(rule)).join("\n")}

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
    response_format: {
      type: "json_schema",
      json_schema: { name: "milestone_items", strict: true, schema: itemsSchema((request.skills ?? []).map((skill) => skill.key).concat(request.defaultSkillKey ?? [])) },
    },
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Big Challenge generation returned no content.");
  const parsed = JSON.parse(text) as { items?: unknown[] };
  return Array.isArray(parsed.items) ? parsed.items : [];
};

/** Turn one flat generated item into a validated battle Interaction, or null. */
export function toGeneratedInteraction(raw: unknown, context?: { letters?: LessonLetters | null }): BattleInteraction | null {
  const checked = checkGeneratedItem(raw, context);
  return "interaction" in checked ? checked.interaction : null;
}

/**
 * Validate one generated item (structure, deterministic sense checks,
 * quality), with the reason when it fails. With a lesson `context`, a
 * trace_letter item must trace a letter that lesson teaches.
 */
export function checkGeneratedItem(
  raw: unknown,
  context?: { letters?: LessonLetters | null; skillKeys?: readonly string[]; defaultSkillKey?: string },
): { interaction: BattleInteraction; skillKey?: string | null; difficulty?: Difficulty | null } | { reason: string; prompt: string } {
  const flat = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prompt = String(flat.interaction_prompt_en ?? flat.interaction_prompt_ar ?? "");
  const traced = flat.interaction_type === "trace_letter"
    ? {
        interaction_trace_config: {
          script: flat.interaction_trace_script,
          letter: typeof flat.interaction_trace_letter === "string" ? flat.interaction_trace_letter.trim() : flat.interaction_trace_letter,
          case: flat.interaction_trace_case ?? undefined,
          form: flat.interaction_trace_script === "ar" ? "isolated" : undefined,
        },
      }
    : {};
  const interaction = slideToInteraction({ ...flat, ...traced, image_url: null } as unknown as Slide);
  if (!interaction) return { reason: "not an interaction", prompt };
  const checked = validateBattleInteraction(interaction);
  if ("error" in checked) return { reason: checked.error, prompt };
  if (checked.interaction.type === "trace_letter" && context) {
    const letters = context.letters;
    if (!letters?.letters.length) return { reason: "trace_letter in a lesson that does not teach letters", prompt };
    if (letters.script !== checked.interaction.config.script || !letters.letters.includes(checked.interaction.config.letter)) {
      return { reason: "trace_letter letter is not one this lesson teaches", prompt };
    }
  }
  const issue = itemQualityIssue(checked.interaction);
  if (issue) return { reason: issue, prompt };
  // Tags never drop an item: an unknown / missing skill becomes the lesson's default, a bad difficulty null.
  // (No tag and no skill context -> no tag keys, as before.)
  const tags = generatedTags(flat, context);
  return {
    interaction: checked.interaction,
    ...(tags.skillKey !== null ? { skillKey: tags.skillKey } : {}),
    ...(tags.difficulty !== null ? { difficulty: tags.difficulty } : {}),
  };
}

/** The item's skill / difficulty tags, with the fallbacks (pure). */
export function generatedTags(
  flat: Record<string, unknown>,
  context?: { skillKeys?: readonly string[]; defaultSkillKey?: string },
): { skillKey: string | null; difficulty: Difficulty | null } {
  const raw = typeof flat.skill_key === "string" ? flat.skill_key.trim() : "";
  const known = context?.skillKeys;
  const skillKey = raw && (!known || known.includes(raw)) ? raw : context?.defaultSkillKey ?? (raw || null);
  const difficulty = flat.difficulty === 1 || flat.difficulty === 2 || flat.difficulty === 3 ? flat.difficulty : null;
  return { skillKey, difficulty };
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
  if (interaction.type === "trace_letter") {
    const letter = interaction.config.letter;
    // On its own or by name ("ب", "حرف الباء"), not inside another word (تتبّع).
    const named = interaction.config.script === "ar"
      ? arabicLettersIn(`${ar} ${en}`).includes(letter)
      : new RegExp(`(^|[^A-Za-z])${letter}([^A-Za-z]|$)`).test(`${en} ${ar}`);
    if (!named) return "trace prompt does not name the letter to trace";
  }
  return null;
}

export function promptKey(interaction: BattleInteraction) {
  return (interaction.prompt.en || interaction.prompt.ar).toLocaleLowerCase("en").replace(/[\s\p{P}\p{S}]+/gu, " ").trim();
}
