import { describe, expect, it } from "vitest";
import { gradeBattleAnswer, InvalidAnswerError } from "@/lib/server/milestones/grade";
import {
  battleInteractionFor,
  inverse,
  owlHintFor,
  type BattleInteraction,
  validateBattleInteraction,
} from "@/lib/server/milestones/interactions";
import { servedItem } from "@/lib/server/milestones/present";
import { BATTLE_A, INTERACTIONS, interactionQuestion, mcQuestion, shortQuestion, tfQuestion } from "./milestone-fixtures";

function served(question = mcQuestion()) {
  return servedItem(question, BATTLE_A)!;
}

describe("gradeBattleAnswer on legacy rows", () => {
  it("grades multiple choice through the display permutation", () => {
    const { interaction, perms } = served();
    const correctDisplay = inverse(perms.options)[2];
    expect(gradeBattleAnswer(interaction, perms, { choiceIndex: correctDisplay }).isCorrect).toBe(true);
    expect(gradeBattleAnswer(interaction, perms, { choiceIndex: (correctDisplay + 1) % 4 }).isCorrect).toBe(false);
    expect(gradeBattleAnswer(interaction, perms, { answer: { type: "choose_correct", selected_index: correctDisplay } }).canonical)
      .toEqual({ type: "choose_correct", selected_index: 2 });
  });

  it("falls back to the answer text when the index is missing", () => {
    const interaction = battleInteractionFor(mcQuestion({ correct_option_index: null, correct_answer: "8" }));
    expect(interaction).toMatchObject({ type: "choose_correct", correct_index: 3 });
  });

  it("normalizes true/false stored as text", () => {
    const { interaction, perms } = served(tfQuestion());
    expect(gradeBattleAnswer(interaction, perms, { choiceIndex: 0 }).isCorrect).toBe(true);
    const falseText = served(tfQuestion({ correct_option_index: null, correct_answer: "false" }));
    expect(gradeBattleAnswer(falseText.interaction, falseText.perms, { choiceIndex: 1 }).isCorrect).toBe(true);
    expect(gradeBattleAnswer(falseText.interaction, falseText.perms, { answer: { type: "true_false", value: true } }).isCorrect).toBe(false);
    expect(battleInteractionFor(tfQuestion({ correct_option_index: null, correct_answer: "خطأ" }))).toMatchObject({ answer: false });
  });

  it("accepts Arabic-Indic and Persian digits for free-entry answers", () => {
    const { interaction, perms } = served(shortQuestion());
    for (const text of ["١٢", "۱۲", " 12 "]) expect(gradeBattleAnswer(interaction, perms, { text }).isCorrect).toBe(true);
    expect(gradeBattleAnswer(interaction, perms, { text: "13" }).isCorrect).toBe(false);
  });

  it("rejects malformed answers without grading them", () => {
    const { interaction, perms } = served();
    expect(() => gradeBattleAnswer(interaction, perms, { choiceIndex: 4 })).toThrow(InvalidAnswerError);
    expect(() => gradeBattleAnswer(interaction, perms, {})).toThrow(InvalidAnswerError);
    const tf = served(tfQuestion());
    expect(() => gradeBattleAnswer(tf.interaction, tf.perms, { choiceIndex: 2 })).toThrow(InvalidAnswerError);
    const short = served(shortQuestion());
    expect(() => gradeBattleAnswer(short.interaction, short.perms, { text: "  " })).toThrow(InvalidAnswerError);
    expect(() => gradeBattleAnswer(short.interaction, short.perms, { text: "1".repeat(201) })).toThrow(InvalidAnswerError);
    const tap = served(interactionQuestion(INTERACTIONS.tap_to_count));
    expect(() => gradeBattleAnswer(tap.interaction, tap.perms, { answer: { type: "tap_to_count", count: -1 } })).toThrow(InvalidAnswerError);
    expect(gradeBattleAnswer(tap.interaction, tap.perms, { answer: { type: "tap_to_count", count: 7 } }).isCorrect).toBe(true);
  });
});

describe("validateBattleInteraction", () => {
  it("accepts every battle type and refuses human-graded ones", () => {
    for (const interaction of Object.values(INTERACTIONS)) expect(validateBattleInteraction(interaction)).toHaveProperty("interaction");
    expect(validateBattleInteraction({ type: "free_response", prompt: { ar: "اكتب", en: "Write" }, expected_answer: { ar: "x", en: "x" } })).toHaveProperty("error");
    expect(validateBattleInteraction({ type: "draw_answer", prompt: { ar: "ارسم", en: "Draw" }, expected_answer: { ar: "x", en: "x" } })).toHaveProperty("error");
  });

  it("refuses broken keys", () => {
    expect(validateBattleInteraction({ ...INTERACTIONS.choose_correct, correct_index: 9 })).toHaveProperty("error");
    expect(validateBattleInteraction({ ...INTERACTIONS.sort_groups, solution_map: [0, 1] })).toHaveProperty("error");
    expect(validateBattleInteraction({ ...INTERACTIONS.match_pairs, targets: { ar: ["1"], en: ["1"] } })).toHaveProperty("error");
    expect(validateBattleInteraction({ ...INTERACTIONS.drag_drop_label, image_url: null })).toHaveProperty("error");
  });
});

describe("owlHintFor", () => {
  const hintOf = (interaction: BattleInteraction = INTERACTIONS.choose_correct) => {
    const item = servedItem(interactionQuestion(interaction), BATTLE_A)!;
    return { item, hint: owlHintFor(BATTLE_A, `q-${interaction.type}`, item.interaction, item.perms) };
  };

  it("hides exactly two wrong choices, deterministically, never the right one", () => {
    const { item, hint } = hintOf();
    expect(hint!.hideOptionIds).toHaveLength(2);
    expect(hint!.hideOptionIds).not.toContain(inverse(item.perms.options)[0]);
    expect(owlHintFor(BATTLE_A, "q-choose_correct", item.interaction, item.perms)).toEqual(hint);
    const fill = hintOf(INTERACTIONS.fill_missing_word);
    expect(fill.hint!.hideOptionIds).toHaveLength(1);
  });

  it("locks one correct placement for match, sort and label items", () => {
    for (const type of ["match_pairs", "sort_groups", "drag_drop_label"] as const) {
      const { item, hint } = hintOf(INTERACTIONS[type]);
      const locked = hint!.lockedPlacement!;
      const canonicalItem = item.perms.items[locked.itemIndex];
      const canonicalTarget = item.perms.targets[locked.targetIndex];
      const expected = type === "sort_groups" ? INTERACTIONS.sort_groups.solution_map[canonicalItem] : canonicalItem;
      expect(canonicalTarget).toBe(expected);
      expect(hint!.hideOptionIds).toEqual([]);
    }
  });

  it("places the first step of a sequence", () => {
    const { item, hint } = hintOf(INTERACTIONS.sequence_order);
    expect(hint!.lockedPlacement!.targetIndex).toBe(0);
    expect(item.perms.items[hint!.lockedPlacement!.itemIndex]).toBe(0);
  });

  it("offers no hint where it would give the answer away or not fit", () => {
    expect(hintOf(INTERACTIONS.true_false).hint).toBeNull();
    expect(hintOf(INTERACTIONS.tap_to_count).hint).toBeNull();
    expect(owlHintFor(BATTLE_A, "q", served(shortQuestion()).interaction, served(shortQuestion()).perms)).toBeNull();
    const twoChoices = { ...INTERACTIONS.choose_correct, options: { ar: ["أ", "ب"], en: ["A", "B"] } };
    expect(hintOf(twoChoices).hint).toBeNull();
    const twoPairs = { ...INTERACTIONS.match_pairs, items: { ar: ["a", "b"], en: ["a", "b"] }, targets: { ar: ["1", "2"], en: ["1", "2"] } };
    expect(hintOf(twoPairs).hint).toBeNull();
  });
});
