import { describe, expect, it } from "vitest";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { AnswerResult } from "@/lib/milestones/types";
import { gradeBattleAnswer, InvalidAnswerError } from "@/lib/server/milestones/grade";
import {
  interactionPerms,
  inverse,
  toPublicInteraction,
  type BattleInteraction,
  type InteractionPerms,
} from "@/lib/server/milestones/interactions";
import { battleStateFromRow, canonicalChoice, optionPermutation, servedItem, toBattleQuestion } from "@/lib/server/milestones/present";
import { serverTraceTemplate } from "@/lib/interactions/trace-templates.server";
import { BATTLE_A, BATTLE_B, INTERACTIONS, battleRow, interactionQuestion, mcQuestion, shortQuestion, tfQuestion } from "./milestone-fixtures";

/** The correct answer in DISPLAY indexes, built the way a child would place it on screen. */
function correctDisplayAnswer(interaction: BattleInteraction, perms: InteractionPerms): InteractionAnswer {
  const opt = inverse(perms.options);
  const items = inverse(perms.items);
  const targets = inverse(perms.targets);
  switch (interaction.type) {
    case "choose_correct":
      return { type: "choose_correct", selected_index: opt[interaction.correct_index] };
    case "true_false":
      return { type: "true_false", value: interaction.answer };
    case "fill_missing_word":
      return { type: "fill_missing_word", selected_index: opt[interaction.correct_index!] };
    case "tap_to_count":
      return { type: "tap_to_count", count: interaction.target };
    case "match_pairs":
      return { type: "match_pairs", placements: perms.items.map((canonical, display) => ({ item_index: display, target_index: targets[canonical] })) };
    case "sequence_order":
      return { type: "sequence_order", order: interaction.items.ar.map((_, canonical) => items[canonical]) };
    case "sort_groups":
      return { type: "sort_groups", placements: perms.items.map((canonical, display) => ({ item_index: display, target_index: targets[interaction.solution_map[canonical]] })) };
    case "drag_drop_label":
      return { type: "drag_drop_label", placements: perms.items.map((canonical, display) => ({ label_index: display, hotspot_index: targets[canonical] })) };
    case "trace_letter":
      // Tracing the shown guide is the right answer.
      return { type: "trace_letter", strokes: serverTraceTemplate(interaction.config)!.strokes.map((stroke) => stroke.points) };
  }
}

/** Every field a public interaction may carry, per type. Anything else is a leak. */
const PUBLIC_KEYS: Record<BattleInteraction["type"], string[]> = {
  choose_correct: ["options", "prompt", "type"],
  true_false: ["prompt", "type"],
  fill_missing_word: ["free_entry", "options", "prompt", "type"],
  tap_to_count: ["catch_count", "emoji", "prompt", "type"],
  match_pairs: ["items", "prompt", "targets", "type"],
  sequence_order: ["items", "prompt", "type"],
  sort_groups: ["items", "prompt", "targets", "type"],
  drag_drop_label: ["hotspots", "image_url", "labels", "prompt", "type"],
  trace_letter: ["case", "form", "guide", "letter", "prompt", "script", "type"],
};
const KEY_FIELDS = ["correct_index", "correct_option_index", "correct_answer", "answer", "expected_answer", "target", "solution_map"];

describe("option permutation", () => {
  it("is a stable permutation per (battle, question)", () => {
    const first = optionPermutation(BATTLE_A, "q1", 4);
    expect(optionPermutation(BATTLE_A, "q1", 4)).toEqual(first);
    expect([...first].sort()).toEqual([0, 1, 2, 3]);
    expect(canonicalChoice(1, first)).toBe(first[1]);
  });

  it("differs across battles for at least some questions", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `q${i}`);
    expect(ids.some((id) => optionPermutation(BATTLE_A, id, 4).join() !== optionPermutation(BATTLE_B, id, 4).join())).toBe(true);
  });

  it("keeps true/false in its fixed order", () => {
    for (const battle of [BATTLE_A, BATTLE_B]) {
      expect(toBattleQuestion(tfQuestion(), battle, 0, "en", null)!.options).toEqual(["True", "False"]);
      expect(toBattleQuestion(tfQuestion({ answer_language: "ar" }), battle, 0, "ar", "ar")!.options).toEqual(["صحيح", "خطأ"]);
      expect(servedItem(tfQuestion(), battle)!.perms.options).toEqual([0, 1]);
    }
  });

  it("never serves a sequence or a match board already solved", () => {
    for (let i = 0; i < 40; i += 1) {
      const battle = `battle-${i}`;
      const seq = interactionPerms(battle, "q", INTERACTIONS.sequence_order);
      expect(seq.items.join()).not.toBe("0,1,2,3");
      const match = interactionPerms(battle, "q", INTERACTIONS.match_pairs);
      expect(match.items.join()).not.toBe(match.targets.join());
    }
  });
});

describe("toPublicInteraction strips every answer key", () => {
  it.each(Object.values(INTERACTIONS).map((interaction) => [interaction.type, interaction] as const))("%s", (type, interaction) => {
    const perms = interactionPerms(BATTLE_A, `q-${type}`, interaction);
    const shown = toPublicInteraction(interaction, perms);
    expect(Object.keys(shown).sort()).toEqual(PUBLIC_KEYS[type]);
    const json = JSON.stringify(shown);
    for (const key of KEY_FIELDS) expect(json).not.toContain(`"${key}"`);

    // Shuffled lists are the same content, so nothing is lost or added.
    if (interaction.type === "choose_correct" && shown.type === "choose_correct") {
      expect([...shown.options.en].sort()).toEqual([...interaction.options.en].sort());
    }
    if (interaction.type === "tap_to_count") expect(json).not.toContain("7");
  });

  it.each(Object.values(INTERACTIONS).map((interaction) => [interaction.type, interaction] as const))(
    "%s: BattleQuestion JSON carries no key and the correct display answer grades right",
    (type, interaction) => {
      const question = interactionQuestion(interaction);
      const shown = toBattleQuestion(question, BATTLE_A, 2, "en", null)!;
      expect(shown.type).toBe(type);
      const json = JSON.stringify(shown);
      for (const key of KEY_FIELDS) expect(json).not.toContain(`"${key}"`);
      expect(json).not.toContain("source_lesson_id");

      const item = servedItem(question, BATTLE_A)!;
      const correct = correctDisplayAnswer(item.interaction, item.perms);
      expect(gradeBattleAnswer(item.interaction, item.perms, { answer: correct }).isCorrect).toBe(true);
    },
  );

  it("grades a wrong arrangement as wrong", () => {
    const item = servedItem(interactionQuestion(INTERACTIONS.sequence_order), BATTLE_A)!;
    expect(gradeBattleAnswer(item.interaction, item.perms, { answer: { type: "sequence_order", order: [0, 1, 2, 3] } }).isCorrect).toBe(false);
    const match = servedItem(interactionQuestion(INTERACTIONS.match_pairs), BATTLE_A)!;
    const diagonal = { type: "match_pairs", placements: [0, 1, 2, 3].map((i) => ({ item_index: i, target_index: i })) };
    expect(gradeBattleAnswer(match.interaction, match.perms, { answer: diagonal }).isCorrect).toBe(false);
  });

  it("rejects malformed answers before grading", () => {
    const match = servedItem(interactionQuestion(INTERACTIONS.match_pairs), BATTLE_A)!;
    const dup = { type: "match_pairs", placements: [0, 0, 1, 2].map((i) => ({ item_index: i, target_index: i })) };
    expect(() => gradeBattleAnswer(match.interaction, match.perms, { answer: dup })).toThrow(InvalidAnswerError);
    expect(() => gradeBattleAnswer(match.interaction, match.perms, { answer: { type: "choose_correct", selected_index: 0 } })).toThrow(InvalidAnswerError);
    const seq = servedItem(interactionQuestion(INTERACTIONS.sequence_order), BATTLE_A)!;
    expect(() => gradeBattleAnswer(seq.interaction, seq.perms, { answer: { type: "sequence_order", order: [0, 0, 1, 2] } })).toThrow(InvalidAnswerError);
    expect(() => gradeBattleAnswer(seq.interaction, seq.perms, { answer: { type: "sequence_order", order: [0, 1, 2, 9] } })).toThrow(InvalidAnswerError);
  });
});

describe("legacy rows and learner payloads", () => {
  it("serves legacy MC / TF / short rows as interactions", () => {
    expect(toBattleQuestion(mcQuestion(), BATTLE_A, 0, "en", null)!.type).toBe("choose_correct");
    expect(toBattleQuestion(tfQuestion(), BATTLE_A, 0, "en", null)!.type).toBe("true_false");
    const short = toBattleQuestion(shortQuestion(), BATTLE_A, 0, "en", null)!;
    expect(short.type).toBe("fill_missing_word");
    expect(short.numericAnswer).toBe(true);
    expect(JSON.stringify(short)).not.toContain('"12"');
    expect(toBattleQuestion(mcQuestion({ correct_answer: null, correct_option_index: null }), BATTLE_A, 0, "en", null)).toBeNull();
  });

  it("labels turns by position", () => {
    expect(toBattleQuestion(mcQuestion(), BATTLE_A, 0, "en", null)!.turn).toBe("attack");
    expect(toBattleQuestion(mcQuestion(), BATTLE_A, 1, "en", null)!.turn).toBe("block");
  });

  it("AnswerResult and BattleState carry no key, permutation or question list", () => {
    const next = toBattleQuestion(mcQuestion(), BATTLE_A, 1, "en", null)!;
    const perm = servedItem(mcQuestion(), BATTLE_A)!.perms.options;
    const result: AnswerResult = {
      correct: true, heartsLeft: 3, bossHpPercent: 89, finished: false, passed: false, replay: false,
      next, certificateId: null, firstPass: false, stars: null, combo: 1, phase: 1,
    };
    const state = battleStateFromRow(battleRow({ answered_count: 1, correct_count: 1 }), next, null, { combo: 1 });
    for (const payload of [result, state]) {
      const json = JSON.stringify(payload);
      for (const key of KEY_FIELDS) expect(json).not.toContain(`"${key}"`);
      expect(json).not.toContain("question_ids");
      expect(json).not.toContain(JSON.stringify(perm));
    }
    expect(state).toMatchObject({ heartsLeft: 3, bossHpPercent: 89, combo: 1, phase: 1, hintUsed: false, hint: null });
  });

  it("drops the question once the battle is finished", () => {
    const state = battleStateFromRow(battleRow({ status: "won", correct_count: 9, answered_count: 9 }), toBattleQuestion(mcQuestion(), BATTLE_A, 9, "en", null), "cert-1");
    expect(state.question).toBeNull();
    expect(state.bossHpPercent).toBe(0);
    expect(state.phase).toBe(3);
  });
});


describe("catch moves say what to tap", () => {
  it("tells the child how many when the prompt doesn't ask", async () => {
    const { countInstruction } = await import("@/lib/server/milestones/present");
    const { toPublicInteraction, interactionPerms } = await import("@/lib/server/milestones/interactions");
    const bare = { type: "tap_to_count" as const, prompt: { en: "Count the apples.", ar: "عدّ التفاحات." }, target: 5, emoji: "🍎" };
    const shown = toPublicInteraction(bare, interactionPerms(BATTLE_A, "q", bare));
    expect(shown).toMatchObject({ catch_count: 5 });
    expect(countInstruction("Count the apples.", shown as { emoji: string; catch_count: number | null }, "en")).toBe("Count 5 apples!");
    expect(countInstruction("عدّ التفاحات.", shown as { emoji: string; catch_count: number | null }, "ar")).toBe("عُدّ 5 تفاحات!");
  });

  it("keeps the count hidden when working it out is the question", async () => {
    const { countInstruction } = await import("@/lib/server/milestones/present");
    const { toPublicInteraction, interactionPerms } = await import("@/lib/server/milestones/interactions");
    const sum = { type: "tap_to_count" as const, prompt: { en: "7 stars, take away 3.", ar: "٧ نجمات، شلنا ٣." }, target: 4, emoji: "⭐" };
    const shown = toPublicInteraction(sum, interactionPerms(BATTLE_A, "q", sum)) as { emoji: string; catch_count: number | null };
    expect(shown.catch_count).toBeNull();
    expect(countInstruction("7 stars, take away 3.", shown, "en")).toBe("7 stars, take away 3. Tap that many stars!");
    const week = INTERACTIONS.tap_to_count;
    const shownWeek = toPublicInteraction(week, interactionPerms(BATTLE_A, "q", week)) as { emoji: string; catch_count: number | null };
    expect(shownWeek.catch_count).toBeNull();
  });
});

describe("a prompt that already says the count", () => {
  it("keeps its words and shows the count to tap", async () => {
    const { countInstruction } = await import("@/lib/server/milestones/present");
    const { toPublicInteraction, interactionPerms } = await import("@/lib/server/milestones/interactions");
    const direct = { type: "tap_to_count" as const, prompt: { en: "Count 5 apples!", ar: "عُدّ ٥ تفاحات!" }, target: 5, emoji: "🍎" };
    const shown = toPublicInteraction(direct, interactionPerms(BATTLE_A, "q", direct)) as { emoji: string; catch_count: number | null };
    expect(shown.catch_count).toBe(5);
    expect(countInstruction("Count 5 apples!", shown, "en")).toBe("Count 5 apples!");
    expect(countInstruction("عُدّ ٥ تفاحات!", shown, "ar")).toBe("عُدّ ٥ تفاحات!");
  });
});
