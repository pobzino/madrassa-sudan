import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { validateBattleInteraction } from "@/lib/server/milestones/interactions";
import { checkGeneratedItem, itemQualityIssue } from "@/lib/server/milestones/item-generator";
import { equationTruth, plainNumber, singleExpressionValue } from "@/lib/server/milestones/item-checks";

const p = (en: string, ar = "سؤال") => ({ en, ar });
const l = (en: string[], ar: string[] = en) => ({ en, ar });

function rejects(value: unknown, pattern?: RegExp) {
  const result = validateBattleInteraction(value);
  expect(result).toHaveProperty("error");
  if (pattern && "error" in result) expect(result.error).toMatch(pattern);
}
function accepts(value: unknown) {
  expect(validateBattleInteraction(value)).toHaveProperty("interaction");
}

describe("reading numbers and sums", () => {
  it("reads plain numbers in any digits", () => {
    expect(plainNumber("٧")).toBe(7);
    expect(plainNumber("3.5")).toBe(3.5);
    expect(plainNumber("1,000")).toBe(1000);
    expect(plainNumber("3 and 7")).toBeNull();
  });

  it("evaluates one simple sum, in symbols or words", () => {
    expect(singleExpressionValue("What is 3 + 4?")).toBe(7);
    expect(singleExpressionValue("٩ - ٢ = ؟")).toBe(7);
    expect(singleExpressionValue("7 stars, take away 3. How many are left?")).toBe(4);
    expect(singleExpressionValue("6 times 2")).toBe(12);
    expect(singleExpressionValue("10 - 3 - 2")).toBeNull();
    expect(singleExpressionValue("Pick a number from 1-10")).toBeNull();
    expect(equationTruth("3 + 4 = 8.")).toBe(false);
    expect(equationTruth("5 plus 5 makes 10.")).toBe(true);
  });
});

describe("sequence_order", () => {
  const seq = (prompt: string, en: string[], ar?: string[]) => ({ type: "sequence_order", prompt: p(prompt), items: l(en, ar ?? en) });

  it("rejects the owner's nonsense item: pairs that all sum to 10", () => {
    rejects(seq("Put the pairs in order from smallest to biggest", ["3 and 7", "1 and 9", "5 and 5"], ["٣ و ٧", "١ و ٩", "٥ و ٥"]), /more than one value/);
  });

  it("rejects other compound steps", () => {
    rejects(seq("Smallest to biggest!", ["2 + 5", "9", "12"]), /more than one value/);
    rejects(seq("Smallest to biggest!", ["4", "6, 8", "10"]), /more than one value/);
    rejects(seq("Smallest to biggest!", ["cat", "dog", "bird"], ["قط", "كلب و قط", "عصفور"]), /more than one value/);
  });

  it("needs numbers stored in the one strict order the prompt asks for", () => {
    accepts(seq("Smallest to biggest!", ["2", "5", "9"]));
    accepts(seq("Smallest to biggest!", ["٢", "٥", "٩"]));
    accepts(seq("Biggest to smallest!", ["9", "5", "2"]));
    rejects(seq("Smallest to biggest!", ["9", "5", "2"]), /smallest to biggest/);
    rejects(seq("Biggest to smallest!", ["2", "5", "9"]), /biggest to smallest/);
    rejects(seq("Smallest to biggest!", ["2", "9", "5"]), /not stored/);
    rejects(seq("Smallest to biggest!", ["3", "5", "5.0"]), /same value/);
    rejects(seq("Smallest to biggest!", ["5", "٥", "7"], ["٥", "5", "٧"]), /same value|different/);
  });

  it("checks word length and alphabet orders", () => {
    accepts(seq("Shortest word to longest word!", ["at", "cat", "camel"]));
    rejects(seq("Shortest word to longest word!", ["cat", "dog", "camel"]), /same length/);
    rejects(seq("Shortest to longest!", ["camel", "cat", "at"]), /length order/);
    accepts(seq("Put them in alphabetical order!", ["ant", "bee", "cow"]));
    rejects(seq("Put them in alphabetical order!", ["bee", "ant", "cow"]), /alphabetical/);
  });

  it("still accepts events in time (not mechanically checkable)", () => {
    accepts(seq("Put the day in order: morning first!", ["wake up", "eat lunch", "go to bed"]));
    accepts(seq("Put the day in order: morning first!", ["wake up and wash", "eat lunch", "go to bed"]));
  });

  it("generated prompts must be short and state the rule", () => {
    const item = { type: "sequence_order" as const, prompt: p("Put these in order.", "رتّبها."), items: l(["2", "5", "9"]) };
    expect(itemQualityIssue(item)).toMatch(/which way/);
    expect(itemQualityIssue({ ...item, prompt: p("Smallest to biggest!", "من الأصغر إلى الأكبر!") })).toBeNull();
    expect(itemQualityIssue({ ...item, prompt: p("Please put all of these numbers in order from the smallest to biggest", "رتّب") })).toMatch(/10 words/);
  });
});

describe("choose_correct and fill_missing_word", () => {
  const choose = (prompt: string, options: string[], correct: number) => ({ type: "choose_correct", prompt: p(prompt), options: l(options), correct_index: correct });

  it("needs the marked option to be the one right answer to a sum", () => {
    accepts(choose("What is 3 + 4?", ["5", "7", "8"], 1));
    rejects(choose("What is 3 + 4?", ["5", "7", "8"], 2), /marked option is wrong/);
    rejects(choose("What is 3 + 4?", ["5", "6", "8"], 0), /None of the options/);
    rejects(choose("What is 3 + 4?", ["7", "٧", "8"], 0), /same number|different/);
    rejects({ type: "fill_missing_word", prompt: p("6 + 2 = ___"), free_entry: false, options: l(["7", "9"]), correct_index: 0 }, /None of the options/);
  });

  it("does not second-guess comparisons, chains or word questions", () => {
    accepts(choose("Which is bigger, 3 + 4 or 9?", ["7", "9"], 1));
    accepts(choose("What is 10 - 3 - 2?", ["5", "6", "7"], 0));
    accepts(choose("Which animal says moo?", ["cow", "cat", "dog"], 0));
  });
});

describe("true_false, tap_to_count", () => {
  it("checks an equation against its true/false key", () => {
    accepts({ type: "true_false", prompt: p("3 + 4 = 7."), answer: true });
    rejects({ type: "true_false", prompt: p("3 + 4 = 8."), answer: true }, /is false/);
    accepts({ type: "true_false", prompt: p("A cat has four legs."), answer: true });
  });

  it("checks the count against the prompt", () => {
    accepts({ type: "tap_to_count", prompt: p("7 stars, take away 3. How many are left?"), target: 4, emoji: "⭐" });
    rejects({ type: "tap_to_count", prompt: p("7 stars, take away 3. How many are left?"), target: 5, emoji: "⭐" }, /is 4, not 5/);
    accepts({ type: "tap_to_count", prompt: p("Count 5 apples!"), target: 5, emoji: "🍎" });
    rejects({ type: "tap_to_count", prompt: p("Count 5 apples!"), target: 6, emoji: "🍎" }, /says 5/);
    accepts({ type: "tap_to_count", prompt: p("How many days are in a week? Tap that many stars."), target: 7, emoji: "⭐" });
    rejects({ type: "tap_to_count", prompt: p("Count the stars!"), target: 15, emoji: "⭐" }, /1 to 12/);
  });
});

describe("match_pairs, sort_groups", () => {
  it("gives every item exactly one partner", () => {
    accepts({ type: "match_pairs", prompt: p("Match each sum to its answer."), items: l(["2 + 3", "4 + 4", "6 + 3"]), targets: l(["5", "8", "9"]) });
    rejects({ type: "match_pairs", prompt: p("Match each sum."), items: l(["2 + 3", "4 + 4", "6 + 3"]), targets: l(["5", "9", "8"]) }, /does not add up/);
    rejects({ type: "match_pairs", prompt: p("Match each sum."), items: l(["2 + 3", "1 + 4", "6 + 3"]), targets: l(["5", "5", "9"]) }, /different|same number/);
    rejects({ type: "match_pairs", prompt: p("Match."), items: l(["one", "two"]), targets: l(["1", "١"], ["1", "١"]) }, /same number|different/);
  });

  it("sorts even and odd correctly, and uses every group", () => {
    const sort = (map: number[], targets = l(["even", "odd"], ["زوجي", "فردي"])) =>
      ({ type: "sort_groups", prompt: p("Sort into even and odd."), items: l(["2", "3", "4", "7"]), targets, solution_map: map });
    accepts(sort([0, 1, 0, 1]));
    rejects(sort([0, 1, 1, 1]), /4 is in the wrong group/);
    rejects(sort([0, 0, 0, 0]), /at least one item/);
  });
});

describe("checkGeneratedItem", () => {
  it("reports why a generated item was refused", () => {
    const base = {
      interaction_options_ar: null, interaction_options_en: null, interaction_correct_index: null, interaction_true_false_answer: null,
      interaction_count_target: null, interaction_visual_emoji: null, interaction_targets_ar: null, interaction_targets_en: null,
      interaction_solution_map: null, interaction_free_entry: null, interaction_expected_answer_ar: null, interaction_expected_answer_en: null,
    };
    const result = checkGeneratedItem({
      ...base,
      interaction_type: "sequence_order",
      interaction_prompt_en: "Put the pairs in order from smallest to biggest",
      interaction_prompt_ar: "رتّب الأزواج من الأصغر إلى الأكبر",
      interaction_items_en: ["3 and 7", "1 and 9", "5 and 5"],
      interaction_items_ar: ["٣ و ٧", "١ و ٩", "٥ و ٥"],
    });
    expect(result).toMatchObject({ prompt: "Put the pairs in order from smallest to biggest" });
    expect("reason" in result && result.reason).toMatch(/more than one value/);
  });
});
