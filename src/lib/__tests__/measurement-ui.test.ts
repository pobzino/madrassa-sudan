import { describe, expect, it, vi } from "vitest";
import {
  bandLabel,
  bannedWordsIn,
  chipOverflow,
  formatCell,
  groupLabel,
  median,
  moreLabel,
  presetRange,
  suppressedHint,
  weightedRate,
} from "@/components/measurement/format";
import { IMPACT_COPY, PROGRESS_COPY } from "@/components/measurement/impactCopy";
import { impactQueryString, scopeBanner } from "@/components/measurement/ImpactDashboard";
import { normaliseJoinCode, scopeParam } from "@/components/measurement/scopeApi";
import { CLASS_COPY } from "@/components/measurement/classCopy";
import { funderCellText } from "@/components/measurement/FunderReport";
import { MILESTONE_COPY } from "@/components/milestones/copy";
import { answerEvents, answerFeedback, finishEvents, hintOffered, startEvents } from "@/components/milestones/battleEvents";
import { difficultyCountLabel, difficultyShort } from "@/components/milestones/PlacementBlockCard";
import { poolTagSummary } from "@/components/milestones/QuestionTags";
import { classifyAnalyticsSection } from "@/lib/analytics.metadata";
import { ANALYTICS_EVENT_NAMES, ANALYTICS_PROPERTY_KEYS } from "@/lib/analytics.shared";
import type { AnswerResult, BattleQuestion, BattleState, MilestoneIntroResponse, TeacherMilestoneQuestion } from "@/lib/milestones/types";

vi.mock("@/lib/analytics", () => ({ trackAnalyticsEvent: vi.fn() }));

describe("small-group cells", () => {
  it("shows a dash with the privacy hint, never a number", () => {
    const cell = formatCell(12, "int", "en", true);
    expect(cell).toEqual({ text: "—", suppressed: true, hint: suppressedHint("en") });
    expect(cell.hint).toMatch(/Fewer than 5 children/);
    expect(formatCell(0.5, "rate", "ar", true).text).toBe("—");
    expect(suppressedHint("ar")).toContain("٥");
  });

  it("formats published values in EN and AR (ar-EG digits)", () => {
    expect(formatCell(0.625, "rate", "en").text).toBe("63%");
    expect(formatCell(0.625, "rate", "ar").text).toMatch(/٦٣/);
    expect(formatCell(12.4, "points", "en").text).toBe("+12 pts");
    expect(formatCell(-3, "points", "en").text).toBe("−3 pts");
    expect(formatCell(1234, "int", "en").text).toBe("1,234");
    expect(formatCell(null, "int", "en")).toMatchObject({ text: "·", suppressed: false });
  });
});

describe("level bands", () => {
  it("labels bands in EN and AR", () => {
    expect(bandLabel("getting_started", "en")).toBe("Getting started");
    expect(bandLabel("on_the_way", "en")).toBe("On the way");
    expect(bandLabel("confident", "en")).toBe("Confident");
    expect(bandLabel("getting_started", "ar")).toBe("في البداية");
    expect(bandLabel("on_the_way", "ar")).toBe("في الطريق");
    expect(bandLabel("confident", "ar")).toBe("واثق");
  });
});

describe("chip overflow", () => {
  it("keeps the first N and counts the rest", () => {
    expect(chipOverflow([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(chipOverflow([1, 2], 3)).toEqual({ shown: [1, 2], more: 0 });
    expect(moreLabel(2, "en")).toBe("+2 more");
    expect(moreLabel(12, "ar")).toBe("+١٢ أخرى");
  });
});

describe("placement copy never sounds like a test", () => {
  const childCopy = (lang: "en" | "ar") =>
    Object.entries(MILESTONE_COPY[lang])
      .filter(([key]) => key.startsWith("placement"))
      .map(([key, value]) => [key, typeof value === "function" ? (value as (...a: string[]) => string)("Numbo", "Amira") : String(value)] as const);

  it.each(["en", "ar"] as const)("%s has every placement line and none of the banned words", (lang) => {
    const lines = childCopy(lang);
    expect(lines.length).toBeGreaterThan(15);
    for (const [key, text] of lines) expect({ key, banned: bannedWordsIn(text) }).toEqual({ key, banned: [] });
  });

  it("EN and AR have the same placement keys", () => {
    expect(childCopy("ar").map(([k]) => k)).toEqual(childCopy("en").map(([k]) => k));
  });

  it("the scan catches banned words in either language", () => {
    expect(bannedWordsIn("This is a Test")).toEqual(["test"]);
    expect(bannedWordsIn("إجابة خطأ")).toEqual(["خطأ"]);
  });

  it("the family card has no score words either", () => {
    for (const lang of ["en", "ar"] as const) {
      for (const value of Object.values(PROGRESS_COPY[lang])) {
        const text = typeof value === "function" ? (value as (...a: string[]) => string)("Numbo", "Amira") : value;
        expect(bannedWordsIn(text).filter((w) => w !== "level")).toEqual([]);
      }
    }
  });
});

describe("impact page helpers", () => {
  it("builds the query for a preset and filters", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(presetRange(12, now)).toEqual({ from: "2026-07-25", to: "2026-10-16" });
    expect(impactQueryString({ weeks: 4, subjectId: null, split: "none" }, now)).toBe("from=2026-09-19&to=2026-10-16&split=none");
    expect(impactQueryString({ weeks: 4, subjectId: "s1", split: "mode" }, now)).toContain("subject_id=s1");
  });

  it("labels groups", () => {
    expect(groupLabel("all", "grade_band", "en")).toBe("All");
    expect(groupLabel("3-4", "grade_band", "en")).toBe("Grades 3-4");
    expect(groupLabel("7-8", "age_band", "ar")).toBe("العمر ٧-٨");
    expect(groupLabel("offline_heavy", "mode", "en")).toBe("Mostly offline");
    expect(groupLabel("sub-1", "subject", "en", () => "Maths")).toBe("Maths");
  });

  it("pools rates over published rows only", () => {
    expect(
      weightedRate(
        [
          { learners: 10, suppressed: false, v: 0.5 },
          { learners: 30, suppressed: false, v: 1 },
          { learners: null, suppressed: true, v: null },
        ],
        (r) => r.v
      )
    ).toBeCloseTo(0.875);
    expect(weightedRate([{ learners: null, suppressed: true }], () => null)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("has the same sections and caveats in EN and AR", () => {
    expect(Object.keys(IMPACT_COPY.ar).sort()).toEqual(Object.keys(IMPACT_COPY.en).sort());
    expect(IMPACT_COPY.ar.caveats).toHaveLength(IMPACT_COPY.en.caveats.length);
  });

  it("reads funder cells: rates as %, months, hidden as null", () => {
    expect(funderCellText("first_try_pass_rate", 0.42, "en")).toBe("42%");
    expect(funderCellText("week4", 0.3, "en")).toBe("30%");
    expect(funderCellText("learners_active", 120, "en")).toBe("120");
    expect(funderCellText("cohort", "2026-09", "en")).toBe("Sept 2026");
    expect(funderCellText("learners_active", null, "en")).toBeNull();
  });

  it("files the new pages under teacher and admin analytics sections", () => {
    expect(classifyAnalyticsSection("/teacher/impact")).toBe("teacher");
    expect(classifyAnalyticsSection("/admin/impact/report")).toBe("admin");
  });

  it("registers the measurement events and property keys", () => {
    for (const name of ["impact_export", "impact_view", "placement_answer", "placement_complete", "placement_dismiss", "placement_start", "progress_skills_view"]) {
      expect(ANALYTICS_EVENT_NAMES).toContain(name);
    }
    for (const key of ["format", "split", "has_baseline", "skills_learned"]) expect(ANALYTICS_PROPERTY_KEYS.has(key)).toBe(true);
  });
});

// ------------------------------------------------------------------ battle session (placement)

function battle(kind: "milestone" | "placement", extra: Partial<BattleState> = {}): BattleState {
  return {
    battleId: "b1",
    milestoneId: "m1",
    attemptNumber: 1,
    status: "active",
    preview: false,
    questionCount: 12,
    requiredCorrect: kind === "placement" ? 0 : 9,
    heartsTotal: kind === "placement" ? 12 : 3,
    heartsLeft: kind === "placement" ? 12 : 3,
    correctCount: 0,
    wrongCount: 0,
    answeredCount: 0,
    bossHpPercent: 100,
    question: null,
    certificateId: null,
    combo: 3,
    phase: 1,
    hintUsed: false,
    hint: null,
    kind,
    hintAllowed: kind !== "placement",
    ...extra,
  };
}
const question = { position: 3, questionId: "q", turn: "block" } as BattleQuestion;
function result(extra: Partial<AnswerResult> = {}): AnswerResult {
  return {
    correct: false,
    heartsLeft: 12,
    bossHpPercent: 66,
    finished: false,
    passed: false,
    replay: false,
    next: null,
    certificateId: null,
    firstPass: false,
    stars: null,
    combo: 0,
    phase: 1,
    neutral: true,
    placement: null,
    ...extra,
  };
}
const intro = { milestone: { subjectId: "sub1", level: 0, kind: "placement" }, kind: "placement" } as unknown as MilestoneIntroResponse;
const ANSWER_LIKE = ["correct", "answer", "answers", "score_percent", "hearts_left", "boss_hp_percent", "outcome", "first_pass"];

describe("battle session in placement mode", () => {
  it("only sends placement events, with no correctness or answer content", () => {
    const events = [
      ...startEvents({ battle: battle("placement"), resumed: false }, intro, "m1"),
      ...answerEvents(battle("placement"), result({ correct: true }), 3, "m1"),
      ...answerEvents(battle("placement"), result({ correct: false }), 4, "m1"),
      ...finishEvents(result({ finished: true, firstPass: true }), battle("placement", { answeredCount: 12, correctCount: 7 }), intro, "m1"),
    ];
    expect(events.map((e) => e.name)).toEqual(["placement_start", "placement_answer", "placement_answer", "placement_complete"]);
    expect(events.every((e) => e.name.startsWith("placement_"))).toBe(true);
    for (const e of events) for (const key of ANSWER_LIKE) expect(e.props).not.toHaveProperty(key);
    expect(events[0].props).toEqual({ milestone_id: "m1", subject_id: "sub1", resumed: false });
    expect(events[1].props).toEqual({ milestone_id: "m1", position: 3 });
    expect(events[3].props).toEqual({ milestone_id: "m1", subject_id: "sub1", question_count: 12 });
    for (const e of events) for (const key of Object.keys(e.props)) expect(ANALYTICS_PROPERTY_KEYS.has(key)).toBe(true);
  });

  it("reacts the same to a right and a wrong answer, never a Super Star", () => {
    const right = answerFeedback(battle("placement"), question, result({ correct: true }));
    const wrong = answerFeedback(battle("placement"), question, result({ correct: false }));
    expect(right).toEqual(wrong);
    expect(right).toMatchObject({ correct: true, neutral: true, super: false });
  });

  it("does not offer the Owl Hint", () => {
    expect(hintOffered(battle("placement"))).toBe(false);
    expect(hintOffered(battle("milestone"))).toBe(true);
    expect(hintOffered(battle("milestone", { hintUsed: true }))).toBe(false);
  });

  it("leaves Big Challenge events as they were", () => {
    const b = battle("milestone", { answeredCount: 10, correctCount: 9, heartsLeft: 2 });
    const r = result({ neutral: undefined, correct: true, finished: true, passed: true, firstPass: true, heartsLeft: 2, bossHpPercent: 0 });
    expect(answerEvents(b, r, 9, "m1").map((e) => e.name)).toEqual(["milestone_answer"]);
    expect(answerEvents(b, r, 9, "m1")[0].props).toMatchObject({ correct: true, hearts_left: 2 });
    expect(finishEvents(r, b, null, "m1").map((e) => e.name)).toEqual(["milestone_submit", "milestone_victory", "milestone_pass"]);
    expect(answerFeedback(b, question, r)).toEqual({ correct: true, turn: "block", super: true, final: true });
  });
});

describe("school and class scope", () => {
  it("normalises join codes and builds scope params", () => {
    expect(normaliseJoinCode(" math 24 ")).toBe("MATH24");
    expect(scopeParam({ kind: "all", id: null })).toBe("all");
    expect(scopeParam({ kind: "school", id: "sch1" })).toBe("school:sch1");
    expect(scopeParam({ kind: "class", id: "c1" })).toBe("class:c1");
    expect(impactQueryString({ weeks: 4, subjectId: null, split: "none", scope: "class:c1" }, new Date("2026-10-16T12:00:00Z"))).toContain("scope=class%3Ac1");
  });

  it("names the scope shown", () => {
    expect(scopeBanner({ kind: "all", pathIds: [] }, "en", null)).toBe("All learners");
    expect(scopeBanner({ kind: "own_paths", pathIds: ["p1"] }, "en", null)).toBe("Your learning paths");
    expect(scopeBanner({ kind: "school", id: "sch1", pathIds: [], label: "Nile School" }, "en", null)).toBe("School · Nile School");
    expect(scopeBanner({ kind: "class", id: "c1", pathIds: [] }, "ar", [{ kind: "class", id: "c1", label: "Grade 2" }])).toBe("فصل · Grade 2");
  });

  it("class copy has the same keys in EN and AR and tells parents the teacher will see progress", () => {
    expect(Object.keys(CLASS_COPY.ar).sort()).toEqual(Object.keys(CLASS_COPY.en).sort());
    expect(CLASS_COPY.en.confirmBody("Amira")).toContain("teacher will see their progress");
  });
});

describe("teacher tagging helpers", () => {
  it("summarises the difficulty mix", () => {
    expect(difficultyCountLabel({ d1: 5, d2: 6, d3: 4, none: 0 })).toBe("Easy 5 · Medium 6 · Hard 4");
    expect(difficultyCountLabel({ d1: 5, d2: 6, d3: 4, none: 2 })).toBe("Easy 5 · Medium 6 · Hard 4 · 2 untagged");
    expect(difficultyShort({ d1: 3, d2: 3, d3: 3, none: 0 })).toBe(false);
    expect(difficultyShort({ d1: 5, d2: 6, d3: 2, none: 0 })).toBe(true);
    expect(difficultyShort(undefined)).toBe(true);
  });

  it("counts the pool per skill and difficulty", () => {
    const q = (skill_key: string | null, difficulty: 1 | 2 | 3 | null) => ({ skill_key, difficulty }) as TeacherMilestoneQuestion;
    const { rows, totals } = poolTagSummary([q("math.money", 1), q("math.money", 3), q("math.time", 2), q(null, null)]);
    expect(totals).toEqual({ d1: 1, d2: 1, d3: 1, none: 1 });
    expect(rows).toEqual([
      ["math.money", { d1: 1, d2: 0, d3: 1, none: 0 }],
      ["math.time", { d1: 0, d2: 1, d3: 0, none: 0 }],
      ["", { d1: 0, d2: 0, d3: 0, none: 1 }],
    ]);
  });
});
