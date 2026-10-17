import "server-only";

import { countableFor } from "@/lib/countables";

import { createHash } from "node:crypto";
import { gradeInteraction } from "@/lib/interactions/grader";
import { compactTraceStrokes, isTraceStrokeList, MAX_TRACE_POINTS, MAX_TRACE_STROKES, traceLetterOf } from "@/lib/interactions/trace-letter";
import { gradeTraceLetterOnServer, serverTraceTemplate } from "@/lib/interactions/trace-templates.server";
import type { BilingualList, BilingualText, EnglishLetterCase, Interaction, InteractionAnswer } from "@/lib/interactions/types";
import { practiceAnswerMatches } from "@/lib/practice-answer";
import {
  checkChoiceKey,
  checkGroups,
  checkPairs,
  checkSequence,
  checkTapTarget,
  checkTrueFalseKey,
} from "@/lib/server/milestones/item-checks";
import {
  BATTLE_INTERACTION_TYPES,
  type BattleInteractionType,
  type OwlHint,
  type PublicInteraction,
} from "@/lib/milestones/types";

// Battle items are shared Interactions. Everything that touches an answer key
// lives here, server-side: validation, the learner-safe public view, the
// per-battle shuffles, mapping display-index answers back, grading and the
// Owl Hint.

export type BattleInteraction = Extract<Interaction, { type: BattleInteractionType }>;

export class InvalidAnswerError extends Error {
  readonly code = "invalid_answer" as const;
  constructor(message = "invalid_answer") {
    super(message);
    this.name = "InvalidAnswerError";
  }
}

export const MAX_TEXT_ANSWER_LENGTH = 200;
const MAX_TAP_COUNT = 100;

/** perm[displayIndex] = canonical index, per list. Identity where a list is not shuffled. */
export interface InteractionPerms {
  options: number[];
  items: number[];
  targets: number[];
}

// ── validation ──────────────────────────────────────────────────────────

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBilingual(value: unknown): BilingualText {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ar = cleanText(raw.ar);
  const en = cleanText(raw.en);
  return { ar: ar || en, en: en || ar };
}

function cleanList(value: unknown): BilingualList | null {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ar = Array.isArray(raw.ar) ? raw.ar.map(cleanText) : [];
  const en = Array.isArray(raw.en) ? raw.en.map(cleanText) : [];
  if (ar.some((item) => !item) || en.some((item) => !item)) return null;
  if (!ar.length && !en.length) return { ar: [], en: [] };
  if (ar.length && en.length && ar.length !== en.length) return null;
  return { ar: ar.length ? ar : en, en: en.length ? en : ar };
}

function distinct(values: string[]) {
  const normalized = values.map((value) => value.normalize("NFKC").toLocaleLowerCase());
  return new Set(normalized).size === normalized.length;
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < length;
}

/**
 * True when working the number out is the question itself ("7 stars, take
 * away 3", "How many days are in a week?"), so the count stays hidden. A bare
 * "Count the apples." asks nothing: the battle tells the child how many to tap.
 */
export function countIsTheQuestion(prompt: { ar: string; en: string }): boolean {
  const text = `${prompt.en} ${prompt.ar}`;
  if (/[0-9٠-٩]/.test(text)) return true;
  return /[?؟]/.test(text) && !/\bcount\b|عُ?دّ|\bعد\b/i.test(text);
}

/** The prompt already says the count to tap ("Count 5 apples!"). */
export function statesCount(prompt: { ar: string; en: string }, target: number): boolean {
  const latin = `${prompt.en} ${prompt.ar}`.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  return new RegExp(`(^|\\D)${target}(\\D|$)`).test(latin) && !/[+\-−×÷=]|take away|plus|minus|left|بقي|الباقي|شلنا|ناقص|زائد/i.test(latin);
}

export function isBattleInteractionType(value: unknown): value is BattleInteractionType {
  return typeof value === "string" && (BATTLE_INTERACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Validate and normalize an Interaction for battle use. Returns the clean
 * Interaction, or an error message for staff.
 */
/** The same word on both sides of a pair (ignoring case, spacing and Arabic diacritics). */
function sameText(a: string, b: string): boolean {
  const norm = (text: string) => text.normalize("NFKC").replace(/[\u064B-\u0652\u0640]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

/** Something a child can count, as one of our icon keys: a known emoji maps across; letters like "abc" become a star. */
export function countableGlyph(value: string): string {
  return countableFor(value);
}

export function validateBattleInteraction(value: unknown): { interaction: BattleInteraction } | { error: string } {
  if (!value || typeof value !== "object") return { error: "The item is missing." };
  const raw = value as Record<string, unknown>;
  if (!isBattleInteractionType(raw.type)) return { error: "This item type cannot be used in a Big Challenge." };
  const prompt = cleanBilingual(raw.prompt);
  if (!prompt.ar) return { error: "The item needs a question." };

  switch (raw.type) {
    case "choose_correct": {
      const options = cleanList(raw.options);
      if (!options || options.ar.length < 2 || options.ar.length > 4) return { error: "Choose-correct needs 2 to 4 options." };
      if (!distinct(options.ar) || !distinct(options.en)) return { error: "The options must all be different." };
      if (!isIndex(raw.correct_index, options.ar.length)) return { error: "Pick the correct option." };
      const keyError = checkChoiceKey(prompt, options, raw.correct_index);
      if (keyError) return { error: keyError };
      return { interaction: { type: "choose_correct", prompt, options, correct_index: raw.correct_index } };
    }
    case "true_false":
      if (typeof raw.answer !== "boolean") return { error: "Say whether the sentence is true or false." };
      {
        const keyError = checkTrueFalseKey(prompt, raw.answer);
        if (keyError) return { error: keyError };
      }
      return { interaction: { type: "true_false", prompt, answer: raw.answer } };
    case "fill_missing_word": {
      if (raw.free_entry === true) {
        const expected = cleanBilingual(raw.expected_answer);
        if (!expected.ar) return { error: "Fill-the-word needs the missing word." };
        if (expected.ar.length > MAX_TEXT_ANSWER_LENGTH) return { error: "The missing word is too long." };
        return { interaction: { type: "fill_missing_word", prompt, free_entry: true, expected_answer: expected } };
      }
      const options = cleanList(raw.options);
      if (!options || options.ar.length < 2 || options.ar.length > 4) return { error: "Fill-the-word needs 2 to 4 word choices." };
      if (!distinct(options.ar) || !distinct(options.en)) return { error: "The word choices must all be different." };
      if (!isIndex(raw.correct_index, options.ar.length)) return { error: "Pick the correct word." };
      const keyError = checkChoiceKey(prompt, options, raw.correct_index);
      if (keyError) return { error: keyError };
      return { interaction: { type: "fill_missing_word", prompt, free_entry: false, options, correct_index: raw.correct_index } };
    }
    case "tap_to_count": {
      const target = raw.target;
      if (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > 12) return { error: "Tap-to-count needs a number from 1 to 12." };
      const keyError = checkTapTarget(prompt, target);
      if (keyError) return { error: keyError };
      return { interaction: { type: "tap_to_count", prompt, target, emoji: countableGlyph(cleanText(raw.emoji)) } };
    }
    case "match_pairs": {
      const items = cleanList(raw.items);
      const targets = cleanList(raw.targets);
      if (!items || !targets || items.ar.length < 2 || items.ar.length > 5 || targets.ar.length !== items.ar.length) {
        return { error: "Match-the-pairs needs 2 to 5 pairs." };
      }
      if (!distinct(items.ar) || !distinct(targets.ar) || !distinct(items.en) || !distinct(targets.en)) return { error: "Each pair must be different." };
      // "cat → cat" matches nothing: every partner must differ from its item in both languages.
      if (items.ar.some((item, i) => sameText(item, targets.ar[i])) || items.en.some((item, i) => sameText(item, targets.en[i]))) {
        return { error: "A pair must match a word to something else (its meaning, picture or partner), not to itself." };
      }
      const pairError = checkPairs(items, targets);
      if (pairError) return { error: pairError };
      // "Match each colour to its Arabic name" with English partners teaches nothing: the asked-for script must appear.
      const asksArabic = /\barabic\b/i.test(prompt.en) || /العربي|بالعربية/.test(prompt.ar);
      const asksEnglish = /\benglish\b/i.test(prompt.en) || /الإنجليزي|بالإنجليزية|الانجليزي/.test(prompt.ar);
      const hasArabic = (list: string[]) => list.every((text) => /[\u0600-\u06FF]/.test(text));
      const hasLatin = (list: string[]) => list.every((text) => /[A-Za-z]/.test(text));
      if (asksArabic && !hasArabic(targets.en) && !hasArabic(items.en)) return { error: "The prompt asks for Arabic names, but no side of the pairs is in Arabic." };
      if (asksEnglish && !hasLatin(targets.ar) && !hasLatin(items.ar)) return { error: "The prompt asks for English words, but no side of the pairs is in English." };
      return { interaction: { type: "match_pairs", prompt, items, targets } };
    }
    case "sequence_order": {
      const items = cleanList(raw.items);
      if (!items || items.ar.length < 3 || items.ar.length > 6) return { error: "Put-in-order needs 3 to 6 steps." };
      if (!distinct(items.ar) || !distinct(items.en)) return { error: "Each step must be different." };
      const orderError = checkSequence(prompt, items);
      if (orderError) return { error: orderError };
      return { interaction: { type: "sequence_order", prompt, items } };
    }
    case "sort_groups": {
      const items = cleanList(raw.items);
      const targets = cleanList(raw.targets);
      const map = Array.isArray(raw.solution_map) ? raw.solution_map : [];
      if (!items || !targets || items.ar.length < 2 || items.ar.length > 8 || targets.ar.length < 2 || targets.ar.length > 4) {
        return { error: "Sort-into-groups needs 2 to 8 items and 2 to 4 groups." };
      }
      if (map.length !== items.ar.length || !map.every((target) => isIndex(target, targets.ar.length))) {
        return { error: "Give every item its group." };
      }
      if (!distinct(items.ar) || !distinct(targets.ar)) return { error: "Items and groups must be different." };
      const groupError = checkGroups(items, targets, map as number[]);
      if (groupError) return { error: groupError };
      return { interaction: { type: "sort_groups", prompt, items, targets, solution_map: map as number[] } };
    }
    case "drag_drop_label": {
      const labels = cleanList(raw.labels);
      const hotspots = Array.isArray(raw.hotspots) ? raw.hotspots : [];
      const imageUrl = cleanText(raw.image_url);
      if (!labels || labels.ar.length < 2 || labels.ar.length > 6 || hotspots.length !== labels.ar.length) {
        return { error: "Label-the-picture needs 2 to 6 labels, one spot each." };
      }
      if (!imageUrl) return { error: "Label-the-picture needs a picture." };
      const spots = hotspots.map((spot) => {
        const point = (spot ?? {}) as Record<string, unknown>;
        return { x_percent: Number(point.x_percent), y_percent: Number(point.y_percent) };
      });
      if (spots.some((spot) => !Number.isFinite(spot.x_percent) || !Number.isFinite(spot.y_percent))) {
        return { error: "Each label needs a spot on the picture." };
      }
      return { interaction: { type: "drag_drop_label", prompt, image_url: imageUrl, labels, hotspots: spots } };
    }
    case "trace_letter": {
      const config = (raw.config && typeof raw.config === "object" ? raw.config : {}) as Record<string, unknown>;
      const script = config.script === "ar" || config.script === "en" ? config.script : null;
      const letter = script ? traceLetterOf({ script, letter: config.letter as string, case: config.case as EnglishLetterCase | undefined, form: config.form as "isolated" | undefined }) : null;
      if (!script || !letter || !serverTraceTemplate({ script, letter })) return { error: "Trace-a-letter needs one Arabic or English letter." };
      return {
        interaction: {
          type: "trace_letter",
          prompt,
          config: script === "ar" ? { script, letter, form: "isolated" } : { script, letter, case: letter === letter.toLowerCase() ? "lower" : "upper" },
        },
      };
    }
  }
  return { error: "This item type cannot be used in a Big Challenge." };
}

// ── legacy MC / TF / short-answer rows ──────────────────────────────────

export interface InteractionSourceRow {
  question_type: string;
  question_text_ar: string;
  question_text_en: string | null;
  options: unknown;
  options_ar: unknown;
  options_en: unknown;
  correct_answer: string | null;
  correct_option_index: number | null;
  interaction?: unknown;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const FALSE_ANSWERS = new Set(["false", "خطأ"]);

/**
 * The canonical battle Interaction of a pool row: its `interaction` jsonb when
 * present, else one derived from the legacy MC / TF / short-answer columns.
 * Null when the row is not auto-gradable.
 */
export function battleInteractionFor(row: InteractionSourceRow): BattleInteraction | null {
  if (row.interaction) {
    const checked = validateBattleInteraction(row.interaction);
    return "interaction" in checked ? checked.interaction : null;
  }
  const prompt = { ar: row.question_text_ar, en: row.question_text_en || row.question_text_ar };
  const answer = (row.correct_answer ?? "").trim();
  if (!answer) return null;
  if (row.question_type === "true_false") {
    const index = typeof row.correct_option_index === "number" ? row.correct_option_index : FALSE_ANSWERS.has(answer.toLowerCase()) ? 1 : 0;
    return { type: "true_false", prompt, answer: index === 0 };
  }
  if (row.question_type === "short_answer") {
    return { type: "fill_missing_word", prompt, free_entry: true, expected_answer: { ar: answer, en: answer } };
  }
  if (row.question_type === "multiple_choice") {
    const optionsAr = stringArray(row.options_ar).length ? stringArray(row.options_ar) : stringArray(row.options);
    const optionsEn = stringArray(row.options_en).length === optionsAr.length ? stringArray(row.options_en) : optionsAr;
    const index = typeof row.correct_option_index === "number" && row.correct_option_index >= 0
      ? row.correct_option_index
      : optionsAr.indexOf(answer) >= 0 ? optionsAr.indexOf(answer) : stringArray(row.options).indexOf(answer);
    const checked = validateBattleInteraction({ type: "choose_correct", prompt, options: { ar: optionsAr, en: optionsEn }, correct_index: index });
    return "interaction" in checked ? checked.interaction : null;
  }
  return null;
}

// ── per-battle shuffles ─────────────────────────────────────────────────

function seededStream(seedText: string) {
  let seed = createHash("sha256").update(seedText).digest();
  let offset = 0;
  return () => {
    if (offset + 4 > seed.length) {
      seed = createHash("sha256").update(seed).digest();
      offset = 0;
    }
    const value = seed.readUInt32BE(offset);
    offset += 4;
    return value;
  };
}

/** Seeded Fisher-Yates over sha256(`${battleId}:${questionId}`): perm[display] = canonical. */
export function optionPermutation(battleId: string, questionId: string, n: number): number[] {
  const perm = Array.from({ length: Math.max(0, n) }, (_, i) => i);
  const next = seededStream(`${battleId}:${questionId}`);
  for (let i = perm.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
const rotate = (perm: number[]) => (perm.length > 1 ? [...perm.slice(1), perm[0]] : perm);
const sameOrder = (a: number[], b: number[]) => a.length === b.length && a.every((value, i) => value === b[i]);

export function inverse(perm: readonly number[]): number[] {
  const result = new Array<number>(perm.length);
  perm.forEach((canonical, display) => {
    result[canonical] = display;
  });
  return result;
}

export function interactionPerms(battleId: string, questionId: string, interaction: BattleInteraction): InteractionPerms {
  const shuffle = (salt: string, n: number) => optionPermutation(battleId, `${questionId}${salt}`, n);
  switch (interaction.type) {
    case "choose_correct":
      return { options: shuffle("", interaction.options.ar.length), items: [], targets: [] };
    case "fill_missing_word":
      return { options: interaction.free_entry ? [] : shuffle("", interaction.options?.ar.length ?? 0), items: [], targets: [] };
    case "true_false":
      return { options: [0, 1], items: [], targets: [] };
    case "tap_to_count":
    case "trace_letter":
      return { options: [], items: [], targets: [] };
    case "sequence_order": {
      let items = shuffle(":items", interaction.items.ar.length);
      // Never serve a sequence already in the correct order.
      if (sameOrder(items, identity(items.length))) items = rotate(items);
      return { options: [], items, targets: [] };
    }
    case "match_pairs": {
      const items = shuffle(":items", interaction.items.ar.length);
      let targets = shuffle(":targets", interaction.targets.ar.length);
      // Equal shuffles would line every pair up across the board.
      if (sameOrder(items, targets)) targets = rotate(targets);
      return { options: [], items, targets };
    }
    case "sort_groups":
      return { options: [], items: shuffle(":items", interaction.items.ar.length), targets: shuffle(":targets", interaction.targets.ar.length) };
    case "drag_drop_label": {
      const items = shuffle(":items", interaction.labels.ar.length);
      let targets = shuffle(":targets", interaction.hotspots.length);
      if (sameOrder(items, targets)) targets = rotate(targets);
      return { options: [], items, targets };
    }
  }
}

function permuteList(list: BilingualList, perm: readonly number[]): BilingualList {
  return { ar: perm.map((i) => list.ar[i]), en: perm.map((i) => list.en[i]) };
}

/** The learner-safe view: an explicit whitelist per type, lists in display order. */
export function toPublicInteraction(interaction: BattleInteraction, perms: InteractionPerms): PublicInteraction {
  const prompt = { ar: interaction.prompt.ar, en: interaction.prompt.en };
  switch (interaction.type) {
    case "choose_correct":
      return { type: "choose_correct", prompt, options: permuteList(interaction.options, perms.options) };
    case "true_false":
      return { type: "true_false", prompt };
    case "fill_missing_word":
      return {
        type: "fill_missing_word",
        prompt,
        free_entry: interaction.free_entry,
        options: interaction.free_entry || !interaction.options ? null : permuteList(interaction.options, perms.options),
      };
    case "tap_to_count":
      return { type: "tap_to_count", prompt, emoji: interaction.emoji, catch_count: statesCount(prompt, interaction.target) || !countIsTheQuestion(prompt) ? interaction.target : null };
    case "match_pairs":
      return { type: "match_pairs", prompt, items: permuteList(interaction.items, perms.items), targets: permuteList(interaction.targets, perms.targets) };
    case "sequence_order":
      return { type: "sequence_order", prompt, items: permuteList(interaction.items, perms.items) };
    case "sort_groups":
      return { type: "sort_groups", prompt, items: permuteList(interaction.items, perms.items), targets: permuteList(interaction.targets, perms.targets) };
    case "drag_drop_label":
      return {
        type: "drag_drop_label",
        prompt,
        image_url: interaction.image_url,
        labels: permuteList(interaction.labels, perms.items),
        hotspots: perms.targets.map((i) => ({ x_percent: interaction.hotspots[i].x_percent, y_percent: interaction.hotspots[i].y_percent })),
      };
    case "trace_letter": {
      const { script, letter } = interaction.config;
      const template = serverTraceTemplate(interaction.config);
      return {
        type: "trace_letter",
        prompt,
        script,
        letter,
        form: script === "ar" ? "isolated" : null,
        case: script === "en" ? (letter === letter.toLowerCase() ? "lower" : "upper") : null,
        guide: (template?.strokes ?? []).map((stroke) => ({
          kind: stroke.kind,
          width: stroke.width ?? 0.06,
          points: stroke.points.map(([x, y]) => [x, y] as [number, number]),
        })),
      };
    }
  }
}

/** Localized choice labels in display order (for the option buttons and narration). */
export function displayChoices(interaction: BattleInteraction, perms: InteractionPerms, lang: "ar" | "en"): string[] {
  if (interaction.type === "true_false") return lang === "ar" ? ["صحيح", "خطأ"] : ["True", "False"];
  if (interaction.type === "choose_correct") return perms.options.map((i) => interaction.options[lang][i]);
  if (interaction.type === "fill_missing_word" && !interaction.free_entry && interaction.options) {
    const options = interaction.options;
    return perms.options.map((i) => options[lang][i]);
  }
  return [];
}

// ── answers ─────────────────────────────────────────────────────────────

function mapIndex(display: unknown, perm: readonly number[]): number {
  if (!isIndex(display, perm.length)) throw new InvalidAnswerError();
  return perm[display];
}

function mapPlacements(
  placements: unknown,
  count: number,
  itemPerm: readonly number[],
  targetPerm: readonly number[],
  keys: [string, string],
): Array<[number, number]> {
  if (!Array.isArray(placements) || placements.length !== count) throw new InvalidAnswerError();
  const seenItems = new Set<number>();
  return placements.map((placement) => {
    const raw = (placement ?? {}) as Record<string, unknown>;
    const item = mapIndex(raw[keys[0]], itemPerm);
    const target = mapIndex(raw[keys[1]], targetPerm);
    if (seenItems.has(item)) throw new InvalidAnswerError();
    seenItems.add(item);
    return [item, target];
  });
}

/** Map a display-index answer back to canonical indexes. Throws InvalidAnswerError when malformed. */
export function toCanonicalAnswer(interaction: BattleInteraction, perms: InteractionPerms, answer: unknown): InteractionAnswer {
  if (!answer || typeof answer !== "object") throw new InvalidAnswerError();
  const raw = answer as Record<string, unknown>;
  if (raw.type !== interaction.type) throw new InvalidAnswerError();
  switch (interaction.type) {
    case "choose_correct":
      return { type: "choose_correct", selected_index: mapIndex(raw.selected_index, perms.options) };
    case "true_false":
      if (typeof raw.value !== "boolean") throw new InvalidAnswerError();
      return { type: "true_false", value: raw.value };
    case "fill_missing_word": {
      if (interaction.free_entry) {
        const text = raw.text;
        if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_ANSWER_LENGTH) throw new InvalidAnswerError();
        return { type: "fill_missing_word", text };
      }
      return { type: "fill_missing_word", selected_index: mapIndex(raw.selected_index, perms.options) };
    }
    case "tap_to_count": {
      const count = raw.count;
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > MAX_TAP_COUNT) throw new InvalidAnswerError();
      return { type: "tap_to_count", count };
    }
    case "match_pairs":
      return {
        type: "match_pairs",
        placements: mapPlacements(raw.placements, interaction.items.ar.length, perms.items, perms.targets, ["item_index", "target_index"])
          .map(([item_index, target_index]) => ({ item_index, target_index })),
      };
    case "sort_groups":
      return {
        type: "sort_groups",
        placements: mapPlacements(raw.placements, interaction.items.ar.length, perms.items, perms.targets, ["item_index", "target_index"])
          .map(([item_index, target_index]) => ({ item_index, target_index })),
      };
    case "drag_drop_label":
      return {
        type: "drag_drop_label",
        placements: mapPlacements(raw.placements, interaction.labels.ar.length, perms.items, perms.targets, ["label_index", "hotspot_index"])
          .map(([label_index, hotspot_index]) => ({ label_index, hotspot_index })),
      };
    case "sequence_order": {
      const order = raw.order;
      const n = interaction.items.ar.length;
      if (!Array.isArray(order) || order.length !== n) throw new InvalidAnswerError();
      const canonical = order.map((display) => mapIndex(display, perms.items));
      if (new Set(canonical).size !== n) throw new InvalidAnswerError();
      return { type: "sequence_order", order: canonical };
    }
    case "trace_letter": {
      // At most 6 strokes of 48 points (the tracer resamples), each point in the box.
      if (!isTraceStrokeList(raw.strokes, MAX_TRACE_STROKES, MAX_TRACE_POINTS)) throw new InvalidAnswerError();
      return { type: "trace_letter", strokes: compactTraceStrokes(raw.strokes) };
    }
  }
}

/**
 * The old battle answer shape ({ choiceIndex } / { text }) for choice and
 * free-entry items, so a client that sends it keeps working.
 */
export function legacyBattleAnswer(interaction: BattleInteraction, choiceIndex?: number, text?: string): InteractionAnswer | null {
  switch (interaction.type) {
    case "choose_correct":
      return choiceIndex === undefined ? null : { type: "choose_correct", selected_index: choiceIndex };
    case "true_false":
      return choiceIndex === 0 || choiceIndex === 1 ? { type: "true_false", value: choiceIndex === 0 } : null;
    case "fill_missing_word":
      if (interaction.free_entry) return text === undefined ? null : { type: "fill_missing_word", text };
      return choiceIndex === undefined ? null : { type: "fill_missing_word", selected_index: choiceIndex };
    case "tap_to_count": {
      const count = text === undefined ? NaN : Number(text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
      return Number.isInteger(count) ? { type: "tap_to_count", count } : null;
    }
    default:
      return null;
  }
}

/** Grade a canonical answer with the shared grader (digits normalized for free entry). */
export function gradeBattleInteraction(interaction: BattleInteraction, canonical: InteractionAnswer): boolean {
  if (interaction.type === "fill_missing_word" && interaction.free_entry && canonical.type === "fill_missing_word") {
    const text = canonical.text ?? "";
    if (gradeInteraction(interaction, canonical).is_correct) return true;
    const expected = [interaction.expected_answer?.ar, interaction.expected_answer?.en].filter((value): value is string => Boolean(value));
    // Arabic-Indic digits and numeric forms, as Practice short answers accept them.
    return expected.some((value) => practiceAnswerMatches(text, value, "short_answer"));
  }
  if (interaction.type === "trace_letter") {
    return canonical.type === "trace_letter" && gradeTraceLetterOnServer(interaction.config, canonical.strokes).is_correct;
  }
  return gradeInteraction(interaction, canonical).is_correct;
}

/** What the attempt log keeps: the canonical choice index, or a compact answer. */
export function storedAnswer(canonical: InteractionAnswer): { choiceIndex: number | null; responseText: string | null } {
  switch (canonical.type) {
    case "choose_correct":
      return { choiceIndex: canonical.selected_index, responseText: null };
    case "true_false":
      return { choiceIndex: canonical.value ? 0 : 1, responseText: null };
    case "fill_missing_word":
      return canonical.selected_index !== undefined
        ? { choiceIndex: canonical.selected_index, responseText: null }
        : { choiceIndex: null, responseText: (canonical.text ?? "").slice(0, MAX_TEXT_ANSWER_LENGTH) };
    case "tap_to_count":
      return { choiceIndex: null, responseText: String(canonical.count) };
    case "sequence_order":
      return { choiceIndex: null, responseText: JSON.stringify(canonical.order).slice(0, MAX_TEXT_ANSWER_LENGTH) };
    case "match_pairs":
    case "sort_groups":
      return { choiceIndex: null, responseText: JSON.stringify(canonical.placements.map((p) => [p.item_index, p.target_index])).slice(0, MAX_TEXT_ANSWER_LENGTH) };
    case "drag_drop_label":
      return { choiceIndex: null, responseText: JSON.stringify(canonical.placements.map((p) => [p.label_index, p.hotspot_index])).slice(0, MAX_TEXT_ANSWER_LENGTH) };
    case "trace_letter":
      // The strokes themselves travel in the full answer (p_answer).
      return { choiceIndex: null, responseText: `trace: ${canonical.strokes.length} strokes` };
    default:
      return { choiceIndex: null, responseText: null };
  }
}

// ── Owl Hint ────────────────────────────────────────────────────────────

/**
 * The battle's one Owl Hint for an item, server-computed and deterministic
 * per (battle, question). Choices: hide up to two wrong options while at
 * least two stay. Match / sort / label: lock one correct placement.
 * Sequence: place the first step. Null when no hint fits (true/false,
 * tap-to-count, free entry, too few options or pieces).
 */
export function owlHintFor(battleId: string, questionId: string, interaction: BattleInteraction, perms: InteractionPerms): OwlHint | null {
  const next = seededStream(`${battleId}:${questionId}:owl-hint`);
  const hide = (correct: number) => {
    const n = perms.options.length;
    const hideCount = Math.min(2, n - 2);
    if (hideCount <= 0 || !isIndex(correct, n)) return null;
    const wrongDisplay = perms.options.map((canonical, display) => ({ canonical, display })).filter((option) => option.canonical !== correct);
    const ranked = wrongDisplay.map((option) => ({ display: option.display, key: next() })).sort((a, b) => a.key - b.key);
    return { hideOptionIds: ranked.slice(0, hideCount).map((option) => option.display).sort((a, b) => a - b), lockedPlacement: null };
  };
  const lock = (count: number, targetOf: (canonicalItem: number) => number) => {
    if (count < 3) return null;
    const item = next() % count;
    return {
      hideOptionIds: [],
      lockedPlacement: { itemIndex: inverse(perms.items)[item], targetIndex: inverse(perms.targets)[targetOf(item)] },
    };
  };
  switch (interaction.type) {
    case "choose_correct":
      return hide(interaction.correct_index);
    case "fill_missing_word":
      return interaction.free_entry ? null : hide(interaction.correct_index ?? -1);
    case "match_pairs":
      return lock(interaction.items.ar.length, (item) => item);
    case "drag_drop_label":
      return lock(interaction.labels.ar.length, (item) => item);
    case "sort_groups":
      return lock(interaction.items.ar.length, (item) => interaction.solution_map[item]);
    case "sequence_order":
      return interaction.items.ar.length < 3
        ? null
        : { hideOptionIds: [], lockedPlacement: { itemIndex: inverse(perms.items)[0], targetIndex: 0 } };
    case "trace_letter":
      // Nothing to narrow down: the guide already shows the letter ("Watch me").
      return null;
    default:
      return null;
  }
}

// ── storage ─────────────────────────────────────────────────────────────

/**
 * homework_questions columns for an Interaction item. The `interaction` jsonb
 * is authoritative; the legacy columns are filled where a legacy shape exists
 * (so staff lists and the attempt log stay readable). Structured items
 * (match / order / sort / label) are stored as long_answer with no
 * correct_answer: only the battle (through `interaction`) can grade them.
 */
export function interactionRowFields(interaction: BattleInteraction) {
  const base = {
    question_text_ar: interaction.prompt.ar,
    question_text_en: interaction.prompt.en || null,
    instruction_ar: interaction.prompt.ar,
    instruction_en: interaction.prompt.en || null,
    interaction,
  };
  const none = { options: null, options_ar: null, options_en: null, correct_option_index: null };
  switch (interaction.type) {
    case "choose_correct":
      return {
        ...base,
        question_type: "multiple_choice" as const,
        options: interaction.options.ar,
        options_ar: interaction.options.ar,
        options_en: interaction.options.en,
        correct_option_index: interaction.correct_index,
        correct_answer: interaction.options.ar[interaction.correct_index],
      };
    case "true_false":
      return {
        ...base,
        question_type: "true_false" as const,
        options: ["صحيح", "خطأ"],
        options_ar: ["صحيح", "خطأ"],
        options_en: ["True", "False"],
        correct_option_index: interaction.answer ? 0 : 1,
        correct_answer: interaction.answer ? "true" : "false",
      };
    case "fill_missing_word":
      if (interaction.free_entry) {
        return { ...base, ...none, question_type: "short_answer" as const, correct_answer: interaction.expected_answer?.ar ?? "" };
      }
      return {
        ...base,
        question_type: "multiple_choice" as const,
        options: interaction.options?.ar ?? [],
        options_ar: interaction.options?.ar ?? [],
        options_en: interaction.options?.en ?? [],
        correct_option_index: interaction.correct_index ?? null,
        correct_answer: interaction.options?.ar[interaction.correct_index ?? -1] ?? "",
      };
    case "tap_to_count":
      return { ...base, ...none, question_type: "short_answer" as const, correct_answer: String(interaction.target) };
    default:
      return { ...base, ...none, question_type: "long_answer" as const, correct_answer: null };
  }
}

/** A coarse "shape" of an item: what a live battle depends on (type and list sizes). */
export function interactionShape(interaction: BattleInteraction): string {
  switch (interaction.type) {
    case "choose_correct":
      return `choose_correct:${interaction.options.ar.length}`;
    case "fill_missing_word":
      return `fill_missing_word:${interaction.free_entry ? "free" : interaction.options?.ar.length ?? 0}`;
    case "match_pairs":
      return `match_pairs:${interaction.items.ar.length}`;
    case "sequence_order":
      return `sequence_order:${interaction.items.ar.length}`;
    case "sort_groups":
      return `sort_groups:${interaction.items.ar.length}:${interaction.targets.ar.length}`;
    case "drag_drop_label":
      return `drag_drop_label:${interaction.labels.ar.length}`;
    case "trace_letter":
      return `trace_letter:${interaction.config.script}:${interaction.config.letter}`;
    default:
      return interaction.type;
  }
}
