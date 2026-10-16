import { describe, expect, it } from "vitest";
import {
  BOSS_BLOCK_LINES,
  BOSS_NAMES,
  BOSS_SIGNATURE_TYPES,
  assignSignatureTurns,
  battlePhase,
  battleTurn,
  bossForSubject,
  bossHpPercent,
  comboFrom,
  drawBattleQuestions,
  heartsFor,
  isMilestoneWeek,
  milestoneBlockWeeks,
  milestoneLevel,
  requiredCorrect,
  starsFor,
} from "@/lib/milestones/rules";
import { BATTLE_INTERACTION_TYPES, BOSS_KEYS } from "@/lib/milestones/types";

/** Small deterministic PRNG (mulberry32) for reproducible draws. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pool(lessons: number, perLesson: number) {
  const items: { id: string; sourceLessonId: string | null }[] = [];
  for (let l = 0; l < lessons; l += 1) {
    for (let q = 0; q < perLesson; q += 1) items.push({ id: `l${l}-q${q}`, sourceLessonId: `lesson-${l}` });
  }
  return items;
}

describe("milestone formulas", () => {
  // Pinned parity table: the DB function computes the same values (§1.4).
  const table: Record<number, [number, number]> = {
    8: [6, 2], 9: [7, 2], 10: [8, 2], 11: [9, 2], 12: [9, 3], 13: [10, 3], 14: [11, 3], 15: [12, 3], 16: [12, 4],
  };
  it.each(Object.entries(table))("N=%s needs ceil(75%%) correct and leaves the rest as tries", (n, [required, hearts]) => {
    expect(requiredCorrect(Number(n))).toBe(required);
    expect(heartsFor(Number(n))).toBe(hearts);
    expect(requiredCorrect(Number(n)) + heartsFor(Number(n))).toBe(Number(n));
  });

  it("shrinks the boss health from 100 to 0", () => {
    expect(bossHpPercent(0, 9)).toBe(100);
    expect(bossHpPercent(3, 9)).toBe(67);
    expect(bossHpPercent(9, 9)).toBe(0);
    expect(bossHpPercent(12, 9)).toBe(0);
  });

  it("awards stars by tries used", () => {
    expect(starsFor(0, 3)).toBe(3);
    expect(starsFor(1, 3)).toBe(2);
    expect(starsFor(2, 3)).toBe(1);
    expect(starsFor(2, 4)).toBe(2);
    expect(starsFor(3, 4)).toBe(1);
    expect(starsFor(1, 2)).toBe(2);
  });

  it("maps weeks to levels and blocks", () => {
    expect(milestoneLevel(4)).toBe(1);
    expect(milestoneLevel(12)).toBe(3);
    expect(isMilestoneWeek(8)).toBe(true);
    expect(isMilestoneWeek(6)).toBe(false);
    expect(isMilestoneWeek(0)).toBe(false);
    expect(milestoneBlockWeeks(8)).toEqual([5, 6, 7, 8]);
  });

  it("picks a boss from the subject name in either language", () => {
    expect(bossForSubject("Maths")).toBe("number_giant");
    expect(bossForSubject(null, "الرياضيات")).toBe("number_giant");
    expect(bossForSubject("English Language")).toBe("word_dragon");
    expect(bossForSubject(null, "اللغة العربية")).toBe("letter_camel");
    expect(bossForSubject("Science")).toBe("sprout_buddy");
    expect(bossForSubject("Art")).toBe("puzzle_owlet");
    for (const key of BOSS_KEYS) expect(BOSS_NAMES[key].en && BOSS_NAMES[key].ar).toBeTruthy();
  });
});

describe("battle mechanics", () => {
  it("alternates attack and block turns from index 0", () => {
    expect([0, 1, 2, 3].map(battleTurn)).toEqual(["attack", "block", "attack", "block"]);
  });

  it("enters phase 2 at half health", () => {
    expect(battlePhase(100)).toBe(1);
    expect(battlePhase(51)).toBe(1);
    expect(battlePhase(50)).toBe(2);
    expect(battlePhase(0)).toBe(2);
  });

  it("counts the trailing correct streak", () => {
    expect(comboFrom([])).toBe(0);
    expect(comboFrom([true, true, false, true, true])).toBe(2);
    expect(comboFrom([true, false])).toBe(0);
  });

  it("has playful block lines in both languages for every boss, with no violent words", () => {
    const violent = /kill|destroy|attack|blood|die|dead|weapon|يقتل|قتل|دم|سلاح|يموت/i;
    for (const key of BOSS_KEYS) {
      const lines = BOSS_BLOCK_LINES[key];
      expect(lines.en.length).toBeGreaterThan(0);
      expect(lines.ar.length).toBe(lines.en.length);
      for (const line of [...lines.en, ...lines.ar]) expect(line).not.toMatch(violent);
    }
  });
});

describe("signature moves", () => {
  it("maps every boss, including Harf, to battle-ready types", () => {
    expect(BOSS_NAMES.letter_dragon).toEqual({ en: "Harf the Letter Dragon", ar: "حَرف تنين الحروف" });
    expect(BOSS_SIGNATURE_TYPES.number_giant).toEqual(["tap_to_count", "sequence_order"]);
    expect(BOSS_SIGNATURE_TYPES.letter_dragon).toEqual(["sequence_order", "fill_missing_word", "match_pairs"]);
    for (const key of BOSS_KEYS) {
      expect(BOSS_SIGNATURE_TYPES[key].length).toBeGreaterThan(0);
      for (const type of BOSS_SIGNATURE_TYPES[key]) expect(BATTLE_INTERACTION_TYPES).toContain(type);
    }
  });

  it("moves signature items onto block turns by the nearest swap", () => {
    const items = ["a", "b", "S1", "c", "S2", "d"];
    const result = assignSignatureTurns(items, (item) => item.startsWith("S"));
    expect([result[1], result[3]].sort()).toEqual(["S1", "S2"]);
    expect([...result].sort()).toEqual([...items].sort());
    expect(assignSignatureTurns(["a", "b"], () => false)).toEqual(["a", "b"]);
  });

  it("favours signature items in the draw without breaking balance", () => {
    const items = pool(4, 4).map((item, i) => ({ ...item, type: i % 4 === 0 ? "tap_to_count" : "choose_correct" }));
    const drawn = drawBattleQuestions(items, 8, { random: seeded(5), preferred: (item) => item.type === "tap_to_count" });
    expect(new Set(drawn.map((item) => item.sourceLessonId)).size).toBe(4);
    const blockTypes = drawn.filter((_, position) => position % 2 === 1).map((item) => item.type);
    expect(blockTypes.every((type) => type === "tap_to_count")).toBe(true);
  });
});

describe("drawBattleQuestions", () => {
  it("draws n unique items balanced across lessons", () => {
    const drawn = drawBattleQuestions(pool(8, 3), 12, { random: seeded(1) });
    expect(drawn).toHaveLength(12);
    expect(new Set(drawn.map((item) => item.id)).size).toBe(12);
    const perLesson = new Map<string, number>();
    for (const item of drawn) perLesson.set(item.sourceLessonId!, (perLesson.get(item.sourceLessonId!) ?? 0) + 1);
    expect(perLesson.size).toBe(8);
    expect(Math.max(...perLesson.values()) - Math.min(...perLesson.values())).toBeLessThanOrEqual(1);
  });

  it("returns the whole pool when it is smaller than n, and drops duplicate ids", () => {
    const items = [...pool(2, 3), { id: "l0-q0", sourceLessonId: "lesson-0" }];
    const drawn = drawBattleQuestions(items, 12, { random: seeded(2) });
    expect(drawn).toHaveLength(6);
    expect(new Set(drawn.map((item) => item.id)).size).toBe(6);
  });

  it("prefers questions not seen in the previous battle", () => {
    const items = pool(4, 4);
    const recentlySeen = new Set(items.filter((item) => item.id.endsWith("q0") || item.id.endsWith("q1")).map((item) => item.id));
    const drawn = drawBattleQuestions(items, 8, { recentlySeen, random: seeded(3) });
    expect(drawn.every((item) => !recentlySeen.has(item.id))).toBe(true);
  });

  it("is deterministic with a seeded random", () => {
    const a = drawBattleQuestions(pool(8, 3), 12, { random: seeded(42) }).map((item) => item.id);
    const b = drawBattleQuestions(pool(8, 3), 12, { random: seeded(42) }).map((item) => item.id);
    expect(a).toEqual(b);
  });

  it("orders later lessons towards the end when ranked, keeping the balanced set", () => {
    const rank = (item: { sourceLessonId: string | null }) => Number(item.sourceLessonId!.split("-")[1]);
    const unranked = drawBattleQuestions(pool(8, 3), 12, { random: seeded(7) });
    const ranked = drawBattleQuestions(pool(8, 3), 12, { random: seeded(7), rankOf: rank });
    expect(new Set(ranked.map((item) => item.sourceLessonId)).size).toBe(8);
    const average = (items: typeof ranked) => items.reduce((sum, item) => sum + rank(item), 0) / items.length;
    expect(average(ranked.slice(6))).toBeGreaterThan(average(ranked.slice(0, 6)) + 2);
    expect(unranked).toHaveLength(ranked.length);
  });
});
