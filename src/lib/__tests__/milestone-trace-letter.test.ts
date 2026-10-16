import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { serverTraceTemplate } from "@/lib/interactions/trace-templates.server";
import { BATTLE_INTERACTION_TYPES, type PublicInteraction } from "@/lib/milestones/types";
import { gradeBattleAnswer, InvalidAnswerError } from "@/lib/server/milestones/grade";
import {
  interactionPerms,
  interactionRowFields,
  owlHintFor,
  storedAnswer,
  toPublicInteraction,
  validateBattleInteraction,
  type BattleInteraction,
} from "@/lib/server/milestones/interactions";
import { toBattleQuestion } from "@/lib/server/milestones/present";
import { checkGeneratedItem, itemTypesForLesson, lessonLetters } from "@/lib/server/milestones/item-generator";
import { applyVerdicts, describeForChild } from "@/lib/server/milestones/item-verifier";
import { hintFits } from "@/components/milestones/moves/contract";
import BattleMove from "@/components/milestones/moves/BattleMove";
import { SKIN_PARTS, signatureFor } from "@/components/milestones/signatures";
import { BATTLE_A, INTERACTIONS, interactionQuestion } from "./milestone-fixtures";

const ITEM = INTERACTIONS.trace_letter as BattleInteraction;
const perms = interactionPerms(BATTLE_A, "q-trace", ITEM);
const guideOf = (letter: string, script: "ar" | "en" = "ar") =>
  serverTraceTemplate(script === "ar" ? { script, letter } : { script, letter, case: letter === letter.toLowerCase() ? "lower" : "upper" })!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
const wobbly = (strokes: number[][][]) =>
  strokes.map((stroke) => stroke.map(([x, y], i) => [Math.min(1, Math.max(0, 0.51 + (x - 0.5) * 0.9 + (i % 2 ? 0.006 : -0.005))), Math.min(1, Math.max(0, 0.49 + (y - 0.5) * 0.9 + (i % 3 ? 0.004 : -0.006)))]));

describe("trace_letter as a battle move", () => {
  it("is a battle interaction type", () => {
    expect(BATTLE_INTERACTION_TYPES).toContain("trace_letter");
  });

  it("validates and normalizes the letter (isolated Arabic, English case)", () => {
    expect(validateBattleInteraction(ITEM)).toEqual({ interaction: ITEM });
    expect(validateBattleInteraction({ type: "trace_letter", prompt: { en: "Trace b!", ar: "تتبّع b!" }, config: { script: "en", letter: "b" } })).toEqual({
      interaction: { type: "trace_letter", prompt: { en: "Trace b!", ar: "تتبّع b!" }, config: { script: "en", letter: "b", case: "lower" } },
    });
    for (const config of [{ script: "ar", letter: "ب", form: "medial" }, { script: "ar", letter: "پ" }, { script: "en", letter: "ab" }, { script: "fr", letter: "a" }, null]) {
      expect("error" in validateBattleInteraction({ type: "trace_letter", prompt: { en: "Trace!", ar: "تتبّع!" }, config })).toBe(true);
    }
  });

  it("serves the letter and its guide, and nothing else", () => {
    const shown = toPublicInteraction(ITEM, perms);
    expect(Object.keys(shown).sort()).toEqual(["case", "form", "guide", "letter", "prompt", "script", "type"]);
    expect(shown).toMatchObject({ type: "trace_letter", script: "ar", letter: "ب", form: "isolated", case: null });
    const guide = (shown as Extract<PublicInteraction, { type: "trace_letter" }>).guide;
    expect(guide.map((stroke) => stroke.points)).toEqual(guideOf("ب"));
    for (const stroke of guide) expect(Object.keys(stroke).sort()).toEqual(["kind", "points", "width"]);
    // Small enough to serve with every question.
    expect(JSON.stringify(shown).length).toBeLessThan(3000);
    const question = toBattleQuestion(interactionQuestion(ITEM), BATTLE_A, 1, "en", null)!;
    expect(question.type).toBe("trace_letter");
    expect(question.options).toEqual([]);
    expect(question.instruction).toBe("Trace the letter baa ب!");
  });

  it("grades the strokes on the server: the letter's trace passes, a lookalike fails", () => {
    expect(gradeBattleAnswer(ITEM, perms, { answer: { type: "trace_letter", strokes: guideOf("ب") } }).isCorrect).toBe(true);
    expect(gradeBattleAnswer(ITEM, perms, { answer: { type: "trace_letter", strokes: wobbly(guideOf("ب")) } }).isCorrect).toBe(true);
    expect(gradeBattleAnswer(ITEM, perms, { answer: { type: "trace_letter", strokes: guideOf("ت") } }).isCorrect).toBe(false);
    expect(gradeBattleAnswer(ITEM, perms, { answer: { type: "trace_letter", strokes: guideOf("ن") } }).isCorrect).toBe(false);
    const b = { type: "trace_letter", prompt: { en: "Trace b!", ar: "تتبّع b!" }, config: { script: "en", letter: "b", case: "lower" } } as BattleInteraction;
    const bPerms = interactionPerms(BATTLE_A, "q-b", b);
    expect(gradeBattleAnswer(b, bPerms, { answer: { type: "trace_letter", strokes: wobbly(guideOf("b", "en")) } }).isCorrect).toBe(true);
    for (const wrong of ["d", "p", "q"]) {
      expect(gradeBattleAnswer(b, bPerms, { answer: { type: "trace_letter", strokes: guideOf(wrong, "en") } }).isCorrect, `b accepted ${wrong}`).toBe(false);
    }
  });

  it("rejects malformed or oversized answers before anything is written", () => {
    const big = Array.from({ length: 49 }, (_, i) => [i / 48, 0.5]);
    for (const answer of [
      { type: "trace_letter", strokes: [] },
      { type: "trace_letter", strokes: Array.from({ length: 7 }, () => [[0.5, 0.5]]) },
      { type: "trace_letter", strokes: [big] },
      { type: "trace_letter", strokes: [[[0.5, 1.5]]] },
      { type: "trace_letter", strokes: [[["a", 0.5]]] },
      { type: "trace_letter" },
      { type: "choose_correct", selected_index: 0 },
    ]) {
      expect(() => gradeBattleAnswer(ITEM, perms, { answer }), JSON.stringify(answer).slice(0, 60)).toThrow(InvalidAnswerError);
    }
  });

  it("keeps the largest answer well under the 16 KB answer cap", () => {
    const full = Array.from({ length: 6 }, (_, s) => Array.from({ length: 48 }, (_, i) => [0.123456 + i / 100, 0.987654 - s / 10]));
    const { canonical } = gradeBattleAnswer(ITEM, perms, { answer: { type: "trace_letter", strokes: full } });
    expect(JSON.stringify(canonical).length).toBeLessThan(6 * 1024);
    expect(storedAnswer(canonical)).toEqual({ choiceIndex: null, responseText: "trace: 6 strokes" });
  });

  it("offers no Owl hint (hint_unavailable)", () => {
    expect(owlHintFor(BATTLE_A, "q-trace", ITEM, perms)).toBeNull();
    expect(hintFits(toPublicInteraction(ITEM, perms))).toBe(false);
  });

  it("is stored for the battle only (gradable through its interaction)", () => {
    expect(interactionRowFields(ITEM)).toMatchObject({ question_type: "long_answer", correct_answer: null, interaction: ITEM });
  });

  it("is Harf's signature Rune Spell on block turns", () => {
    expect(signatureFor("letter_dragon", "trace_letter", "block")).toEqual({ name: { en: "Rune Spell!", ar: "تعويذة الحرف!" }, skin: "rune" });
    expect(signatureFor("letter_dragon", "trace_letter", "attack")).toBeNull();
    expect(signatureFor("number_giant", "trace_letter", "block")).toBeNull();
  });

  it("renders the rune move: the guide, the trace area and one Cast / Block button", () => {
    const render = (turn: "attack" | "block", skin = null as (typeof SKIN_PARTS)["rune"] | null, lang: "en" | "ar" = "en") =>
      renderToStaticMarkup(
        createElement(BattleMove, {
          interaction: toPublicInteraction(ITEM, perms),
          lang,
          turn,
          hint: null,
          numeric: false,
          disabled: false,
          onSubmit: () => undefined,
          seed: "q-trace",
          prompt: "Trace the letter baa ب!",
          skin,
          bandHeight: 220,
        })
      );
    const attack = render("attack");
    expect(attack).toContain('data-layout="moves"');
    expect(attack).toContain("touch-action:none");
    expect(attack).toContain("Cast!");
    expect(attack).not.toContain("Block!");
    expect(attack).toContain('aria-label="Watch me"');
    expect(attack).toContain('aria-label="Undo"');
    // Every guide stroke is drawn (track, halo, dashes) with a numbered start.
    expect((attack.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(ITEM.type === "trace_letter" ? 6 : 0);
    expect(attack).not.toMatch(/isolated|upper|lower/);
    const block = render("block", SKIN_PARTS.rune, "ar");
    expect(block).toContain("صُدّ!");
    expect(block).toContain("#FB923C"); // Harf's dragon fire
    expect(block).toContain("١");
  });
});

describe("trace_letter generation", () => {
  it("only plans tracing for lessons that teach letters", () => {
    expect(lessonLetters({ subjectName: "Arabic", lessonTitleAr: "حرف الباء", lessonTitleEn: "The letter Baa", content: "" })).toEqual({ script: "ar", letters: ["ب"] });
    expect(lessonLetters({ subjectName: "لغتي", lessonTitleAr: "الحروف ب ت ث", lessonTitleEn: "Letters", content: "" })?.letters.sort()).toEqual(["ب", "ت", "ث"].sort());
    expect(lessonLetters({ subjectName: "English", lessonTitleAr: "الحرف", lessonTitleEn: "Letters b and d", content: "" })?.letters.sort()).toEqual(["B", "D", "b", "d"]);
    expect(lessonLetters({ subjectName: "English", lessonTitleAr: "", lessonTitleEn: "Phonics: the alphabet", content: "We learn Ss and the sound /s/." })?.letters.sort()).toEqual(["S", "s"]);
    // Not about letters, or not a language subject: no tracing.
    expect(lessonLetters({ subjectName: "English", lessonTitleAr: "", lessonTitleEn: "Animals on the farm", content: "Bb" })).toBeNull();
    expect(lessonLetters({ subjectName: "Maths", lessonTitleAr: "", lessonTitleEn: "Letters as numbers", content: "x" })).toBeNull();
    expect(lessonLetters({ subjectName: "Arabic", lessonTitleAr: "حرف", lessonTitleEn: "A letter", content: "" })).toBeNull();
    expect(itemTypesForLesson(0, 4, true)).toContain("trace_letter");
    expect(itemTypesForLesson(0, 8, true).filter((type) => type === "trace_letter")).toHaveLength(2);
    expect(itemTypesForLesson(0, 8, false)).not.toContain("trace_letter");
  });

  const flat = (letter: string, script: "ar" | "en", prompt: [string, string], extra: Record<string, unknown> = {}) => ({
    interaction_type: "trace_letter",
    interaction_prompt_en: prompt[0],
    interaction_prompt_ar: prompt[1],
    interaction_trace_script: script,
    interaction_trace_letter: letter,
    interaction_trace_case: script === "en" ? (letter === letter.toLowerCase() ? "lower" : "upper") : null,
    interaction_options_ar: null,
    interaction_options_en: null,
    ...extra,
  });
  const baa = { letters: { script: "ar" as const, letters: ["ب"] } };

  it("accepts a trace item for a taught letter that has a template", () => {
    const result = checkGeneratedItem(flat("ب", "ar", ["Trace the letter baa ب!", "تتبّع حرف الباء ب!"]), baa);
    expect(result).toEqual({ interaction: { type: "trace_letter", prompt: { en: "Trace the letter baa ب!", ar: "تتبّع حرف الباء ب!" }, config: { script: "ar", letter: "ب", form: "isolated" } } });
  });

  it("drops trace items for untaught, unknown or unnamed letters, and in lessons without letters", () => {
    const reason = (raw: unknown, context?: Parameters<typeof checkGeneratedItem>[1]) => {
      const result = checkGeneratedItem(raw, context);
      return "reason" in result ? result.reason : null;
    };
    expect(reason(flat("ت", "ar", ["Trace the letter ت!", "تتبّع حرف ت!"]), baa)).toMatch(/not one this lesson teaches/);
    expect(reason(flat("پ", "ar", ["Trace پ!", "تتبّع پ!"]), baa)).toMatch(/Trace-a-letter needs/);
    expect(reason(flat("ب", "ar", ["Trace the letter!", "تتبّع الحرف!"]), baa)).toMatch(/does not name the letter/);
    expect(reason(flat("ب", "ar", ["Trace ب!", "تتبّع ب!"]), { letters: null })).toMatch(/does not teach letters/);
    expect(reason(flat("b", "en", ["Trace the letter b!", "تتبّع الحرف b!"]), { letters: { script: "en", letters: ["b", "B"] } })).toBeNull();
  });

  it("skips the blind answer for trace items but keeps the prompt checks", () => {
    const items = [ITEM, ITEM];
    const { kept, dropped } = applyVerdicts(items, [
      { index: 0, childAnswer: "", matchesKey: false, flags: ["wrong_key"], reason: "" },
      { index: 1, childAnswer: "trace", matchesKey: true, flags: ["incomplete_prompt"], reason: "unclear" },
    ]);
    expect(kept).toEqual([ITEM]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reasons).toContain("incomplete_prompt");
    // The verifier reads the letter, not the guide's coordinates.
    expect(JSON.parse(describeForChild(ITEM, 0))).toEqual({ type: "trace_letter", prompt: ITEM.prompt, letter_shown: "ب", script: "ar" });
  });
});
