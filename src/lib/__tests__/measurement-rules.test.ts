import { describe, expect, it } from "vitest";
import { drawPlacementQuestions, levelBandFor, levelScore, measurementSubjectKey, placementOutcome } from "@/lib/measurement/rules";
import { PLACEMENT_DIFFICULTY_PLAN, PLACEMENT_QUESTION_COUNT, type Difficulty } from "@/lib/measurement/types";

/** A deterministic random (mulberry32). */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Item = { id: string; skillKey: string | null; difficulty: Difficulty | null; sourceWeek: number; sourceLessonId?: string };

function pool(perBand: Record<Difficulty, number>, skills = ["a", "b", "c"]): Item[] {
  const items: Item[] = [];
  for (const d of [1, 2, 3] as Difficulty[]) {
    for (let i = 0; i < perBand[d]; i += 1) {
      items.push({ id: `d${d}-${i}`, skillKey: skills[i % skills.length], difficulty: d, sourceWeek: 1 + (i % 6), sourceLessonId: `l${i % 4}` });
    }
  }
  return items;
}

describe("levels", () => {
  it("bands at 40 and 70", () => {
    expect(levelBandFor(39.99)).toBe("getting_started");
    expect(levelBandFor(40)).toBe("on_the_way");
    expect(levelBandFor(69.99)).toBe("on_the_way");
    expect(levelBandFor(70)).toBe("confident");
  });

  it("weights by difficulty, null counting as 2", () => {
    expect(levelScore([])).toBeNull();
    expect(levelScore([{ correct: true, difficulty: 3 }, { correct: false, difficulty: 1 }])).toBe(75);
    // the harness's hand calculation (MS-PL-02d): 10 / 21
    const items = [1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1].map((correct, i) => ({
      correct: correct === 1,
      difficulty: (i < 5 ? 1 : i < 10 ? 2 : 3) as Difficulty,
    }));
    expect(levelScore(items)).toBe(47.62);
    expect(levelScore([{ correct: true, difficulty: null }, { correct: false, difficulty: 1 }])).toBe(66.67);
  });
});

describe("drawPlacementQuestions", () => {
  it("follows the 4/4/4 plan and orders by difficulty, then week", () => {
    const drawn = drawPlacementQuestions(pool({ 1: 8, 2: 8, 3: 8 }), PLACEMENT_QUESTION_COUNT, seeded(1));
    expect(drawn).toHaveLength(12);
    expect(drawn.map((item) => item.difficulty)).toEqual([...PLACEMENT_DIFFICULTY_PLAN]);
    for (let i = 1; i < drawn.length; i += 1) {
      if (drawn[i].difficulty === drawn[i - 1].difficulty) expect(drawn[i].sourceWeek).toBeGreaterThanOrEqual(drawn[i - 1].sourceWeek);
    }
  });

  it("round-robins across skills inside a band", () => {
    const drawn = drawPlacementQuestions(pool({ 1: 9, 2: 9, 3: 9 }), 12, seeded(2));
    for (const d of [1, 2, 3]) {
      const skills = drawn.filter((item) => item.difficulty === d).map((item) => item.skillKey);
      expect(new Set(skills).size).toBe(3);
    }
  });

  it("borrows from the nearest band (2 before 1 or 3)", () => {
    const drawn = drawPlacementQuestions(pool({ 1: 2, 2: 10, 3: 4 }), 12, seeded(3));
    const counts = [1, 2, 3].map((d) => drawn.filter((item) => item.difficulty === d).length);
    expect(counts).toEqual([2, 6, 4]);
    const short3 = drawPlacementQuestions(pool({ 1: 8, 2: 4, 3: 1 }), 12, seeded(3));
    // band 3 is short 3: band 2 has nothing spare, so band 1 lends
    expect([1, 2, 3].map((d) => short3.filter((item) => item.difficulty === d).length)).toEqual([7, 4, 1]);
  });

  it("never repeats an id, counts untagged as medium, and is deterministic", () => {
    const items = [...pool({ 1: 5, 2: 5, 3: 5 }), { id: "d1-0", skillKey: "a", difficulty: 1 as Difficulty, sourceWeek: 1 }];
    items.push({ id: "untagged", skillKey: null, difficulty: null, sourceWeek: 1 });
    const a = drawPlacementQuestions(items, 12, seeded(7));
    const b = drawPlacementQuestions(items, 12, seeded(7));
    expect(a.map((item) => item.id)).toEqual(b.map((item) => item.id));
    expect(new Set(a.map((item) => item.id)).size).toBe(12);
    const all = drawPlacementQuestions(items, 16, seeded(7));
    expect(all.find((item) => item.id === "untagged")).toBeDefined();
    const untaggedIndex = all.findIndex((item) => item.id === "untagged");
    expect(all.slice(0, untaggedIndex).every((item) => (item.difficulty ?? 2) <= 2)).toBe(true);
  });

  it("returns the whole pool when it is smaller than 12", () => {
    const small = pool({ 1: 2, 2: 2, 3: 2 });
    expect(drawPlacementQuestions(small, 12, seeded(5))).toHaveLength(6);
  });
});

describe("placementOutcome", () => {
  it("splits known / growing skills and skips untagged rows", () => {
    const outcome = placementOutcome(
      [
        { skill_key: "math.counting-sequences", family_label_en: "Counting", family_label_ar: "العدّ", answered: 4, correct: 3 },
        { skill_key: "math.money", family_label_en: "Money", family_label_ar: "النقود", answered: 4, correct: 1 },
        { skill_key: "math.time", family_label_en: "Time", family_label_ar: "الوقت", answered: 2, correct: 1 },
        { skill_key: "math.statistics", family_label_en: "Charts", family_label_ar: "الجداول", answered: 1, correct: 0 },
        { skill_key: null, family_label_en: null, family_label_ar: null, answered: 3, correct: 3 },
      ],
      "subject-1",
    );
    expect(outcome.knownSkills.map((chip) => chip.skillKey)).toEqual(["math.counting-sequences", "math.time"]);
    expect(outcome.growingSkills.map((chip) => chip.skillKey)).toEqual(["math.money", "math.statistics"]);
    expect(outcome.knownSkills[0]).toEqual({ skillKey: "math.counting-sequences", subjectId: "subject-1", familyLabelEn: "Counting", familyLabelAr: "العدّ" });
    expect(JSON.stringify(outcome)).not.toMatch(/answered|correct|score/);
  });
});

describe("measurementSubjectKey", () => {
  it("maps English and Arabic subject names", () => {
    expect(measurementSubjectKey({ name_en: "Maths" })).toBe("math");
    expect(measurementSubjectKey({ name_ar: "الرياضيات" })).toBe("math");
    expect(measurementSubjectKey({ name_en: "English" })).toBe("english");
    expect(measurementSubjectKey({ name_ar: "اللغة الإنجليزية" })).toBe("english");
    expect(measurementSubjectKey({ name_ar: "اللغة العربية" })).toBe("arabic");
    expect(measurementSubjectKey({ name_en: "Science" })).toBe("science");
    expect(measurementSubjectKey({ name_ar: "التربية الإسلامية" })).toBe("islamic");
    expect(measurementSubjectKey({ name_en: "Social studies" })).toBe("social");
    expect(measurementSubjectKey({ name_en: "Cooking" })).toBe("general");
    expect(measurementSubjectKey(null)).toBe("general");
  });
});
