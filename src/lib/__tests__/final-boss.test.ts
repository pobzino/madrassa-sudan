import { describe, expect, it } from "vitest";
import { evaluatePath, milestoneNodeId, type PathInput, type StudentProgressInput } from "@/lib/learning-path";
import { FINAL_BOSS_TITLES, finalBossLevel, milestoneWeeksCovered } from "@/lib/milestones/rules";

// A 10-week path (like Maths today): a block boss after week 4 and 8, the final boss after week 10.
const PATH: PathInput = {
  weeks: Array.from({ length: 10 }, (_, i) => ({
    id: `w${i + 1}`,
    weekNumber: i + 1,
    testAssignmentId: null,
    steps: [{ id: `s${i + 1}`, lessonId: `l${i + 1}`, sequence: 1, practiceAssignmentId: null }],
  })),
  milestones: [
    { id: "boss4", afterWeekNumber: 4 },
    { id: "boss8", afterWeekNumber: 8 },
    { id: "grand", afterWeekNumber: 10, final: true },
  ],
};

function progress(doneLessons: number, extra: Partial<StudentProgressInput> = {}): StudentProgressInput {
  const lessonCompletion: StudentProgressInput["lessonCompletion"] = {};
  for (let i = 1; i <= 10; i += 1) lessonCompletion[`l${i}`] = { completed: i <= doneLessons, started: i <= doneLessons };
  return { lessonCompletion, testResults: {}, passedMilestoneIds: [], activeBattleMilestoneIds: [], ...extra };
}

const stateOf = (result: ReturnType<typeof evaluatePath>, id: string) => result.milestones.find((m) => m.id === id)?.state;

describe("the final boss on the learning path", () => {
  it("stays locked until every week is done and the last block boss is beaten", () => {
    expect(stateOf(evaluatePath(PATH, progress(0)), "grand")).toBe("locked");
    // Weeks 1-4 done but boss 4 not beaten: weeks 5+ are closed, so is the final boss.
    expect(stateOf(evaluatePath(PATH, progress(10)), "grand")).toBe("locked");
    const open = evaluatePath(PATH, progress(10, { passedMilestoneIds: ["boss4", "boss8"] }));
    expect(stateOf(open, "grand")).toBe("available");
    // The bird waits at the Grand Challenge: nothing comes after it.
    expect(open.currentStepId).toBe(milestoneNodeId("grand"));
  });

  it("sits after the last week whatever its number, and never gates a week", () => {
    const result = evaluatePath(PATH, progress(10, { passedMilestoneIds: ["boss4", "boss8"] }));
    const grand = result.milestones.find((m) => m.id === "grand")!;
    expect(grand.afterWeekNumber).toBe(10);
    expect(result.milestones.map((m) => m.id)).toEqual(["boss4", "boss8", "grand"]);
    expect(result.weeks.every((week) => week.state === "completed")).toBe(true);
  });

  it("is in battle while a game is open and passed once won", () => {
    const base = { passedMilestoneIds: ["boss4", "boss8"] };
    expect(stateOf(evaluatePath(PATH, progress(10, { ...base, activeBattleMilestoneIds: ["grand"] })), "grand")).toBe("in_battle");
    const won = evaluatePath(PATH, progress(10, { passedMilestoneIds: ["boss4", "boss8", "grand"] }));
    expect(stateOf(won, "grand")).toBe("passed");
    expect(won.currentStepId).toBeNull();
  });

  it("opens in review mode like every other boss", () => {
    expect(stateOf(evaluatePath(PATH, progress(0), { unlockAll: true }), "grand")).toBe("available");
  });

  it("shares a week with the block boss on a 12-week path, block boss first", () => {
    const twelve: PathInput = {
      weeks: Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, weekNumber: i + 1, testAssignmentId: null, steps: [{ id: `s${i + 1}`, lessonId: `l${i + 1}`, sequence: 1, practiceAssignmentId: null }] })),
      milestones: [{ id: "boss12", afterWeekNumber: 12 }, { id: "grand", afterWeekNumber: 12, final: true }],
    };
    const lessonCompletion: StudentProgressInput["lessonCompletion"] = {};
    for (let i = 1; i <= 12; i += 1) lessonCompletion[`l${i}`] = { completed: true, started: true };
    const notYet = evaluatePath(twelve, { lessonCompletion, testResults: {}, passedMilestoneIds: [], activeBattleMilestoneIds: [] });
    expect(stateOf(notYet, "boss12")).toBe("available");
    expect(stateOf(notYet, "grand")).toBe("locked");
    const after = evaluatePath(twelve, { lessonCompletion, testResults: {}, passedMilestoneIds: ["boss12"], activeBattleMilestoneIds: [] });
    expect(stateOf(after, "grand")).toBe("available");
  });
});

describe("final boss rules", () => {
  it("covers the whole path and looks a level tougher than the last block boss", () => {
    expect(milestoneWeeksCovered(10, true)).toEqual({ first: 1, last: 10 });
    expect(milestoneWeeksCovered(8)).toEqual({ first: 5, last: 8 });
    expect(finalBossLevel(10)).toBe(4);
    expect(finalBossLevel(12)).toBe(4);
    expect(finalBossLevel(4)).toBe(2);
    expect(FINAL_BOSS_TITLES.titleEn).toBe("The Grand Challenge");
    expect(FINAL_BOSS_TITLES.titleAr).toBe("التحدي الأكبر");
  });
});
