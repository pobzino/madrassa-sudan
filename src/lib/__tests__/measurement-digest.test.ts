import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

import { placementDoneEmail, weeklyProgressEmail, type ChildWeeklySummary, type WeeklySummary } from "@/lib/email/templates";
import { placementDoneMessage, weeklySummaryMessage } from "@/lib/push-messages";
import { childSkillDigest, loadChildSkillDigests, measurementDigestEnabled } from "@/lib/server/email-automations";
import type { LearnerProgressSummary } from "@/lib/measurement/types";

const week: WeeklySummary = { lessonsStarted: 3, lessonsCompleted: 2, practiceTried: 1, practicePassed: 1, streakDays: 2, activeDays: [true, false, true, false, false, false, false] };
const base = { name: "Huda Ali", siteUrl: "https://amal.test", unsubscribeUrl: "https://amal.test/u", summary: week, weekLabel: "12–18 October" };
const chip = (key: string, en: string, ar: string) => ({ skillKey: key, familyLabelEn: en, familyLabelAr: ar });
const children = (skills?: ChildWeeklySummary["skills"]): ChildWeeklySummary[] => [
  { name: "Sara", summary: week, ...(skills ? { skills } : {}) },
  { name: "Omar", summary: week },
];

function summary(overrides: Partial<LearnerProgressSummary> = {}): LearnerProgressSummary {
  return { learnerId: "kid-1", windowStart: "a", windowEnd: "b", skillsLearned: [], skillsPractised: [], subjects: [], ...overrides };
}

afterEach(() => {
  delete process.env.MEASUREMENT_DIGEST_ENABLED;
});

describe("weekly digest with skills", () => {
  it("is byte-identical without skills data (flag off)", () => {
    for (const language of ["en", "ar"] as const) {
      const plain = weeklyProgressEmail({ ...base, language, childSummaries: children() });
      const withUndefined = weeklyProgressEmail({ ...base, language, childSummaries: children().map((child) => ({ ...child, skills: undefined })) });
      expect(withUndefined).toEqual(plain);
    }
    expect(measurementDigestEnabled()).toBe(false);
    process.env.MEASUREMENT_DIGEST_ENABLED = "true";
    expect(measurementDigestEnabled()).toBe(true);
  });

  it("adds one skills line per child (3 names, then +N more) and a growth line", () => {
    const skills = {
      learned: [chip("a", "Counting and number patterns", "العدّ"), chip("b", "Money", "النقود"), chip("c", "Telling the time", "قراءة الوقت"), chip("d", "Chance", "الاحتمال"), chip("e", "Shapes", "الأشكال")],
      growth: [{ subjectNameEn: "Maths", subjectNameAr: "الرياضيات", from: "getting_started" as const, to: "on_the_way" as const }],
    };
    const en = weeklyProgressEmail({ ...base, language: "en", childSummaries: children(skills) });
    expect(en.text).toContain("Sara: Skills learned this month: Counting and number patterns, Money, Telling the time (+2 more)");
    expect(en.text).toContain("Sara: Since starting: Maths — Getting started → On the way");
    expect(en.text).not.toContain("Omar: Skills");
    const ar = weeklyProgressEmail({ ...base, language: "ar", childSummaries: children(skills) });
    expect(ar.text).toContain("Sara: مهارات تعلّمها هذا الشهر: العدّ، النقود، قراءة الوقت (+٢ أخرى)");
    expect(ar.text).toContain("منذ البداية: الرياضيات — في البداية ← في الطريق");
  });

  it("lists growth only with a valid baseline and a band change (or confident -> confident); nothing without data", () => {
    const subject = (baseline: unknown, current: unknown) => ({
      subjectId: "s", subjectNameAr: "الرياضيات", subjectNameEn: "Maths", placementMilestoneId: null, skillsLearnedSinceStart: 0,
      baseline: baseline as LearnerProgressSummary["subjects"][number]["baseline"], current: current as LearnerProgressSummary["subjects"][number]["current"],
    });
    expect(childSkillDigest(summary())).toBeNull();
    expect(childSkillDigest(summary({ subjects: [subject({ band: "getting_started", valid: false, measuredAt: "x" }, { band: "confident", measuredAt: "y", afterWeekNumber: 4 })] }))).toBeNull();
    expect(childSkillDigest(summary({ subjects: [subject({ band: "on_the_way", valid: true, measuredAt: "x" }, { band: "on_the_way", measuredAt: "y", afterWeekNumber: 4 })] }))).toBeNull();
    expect(childSkillDigest(summary({ subjects: [subject({ band: "confident", valid: true, measuredAt: "x" }, { band: "confident", measuredAt: "y", afterWeekNumber: 4 })] }))?.growth).toHaveLength(1);
    expect(childSkillDigest(summary({ subjects: [subject({ band: "getting_started", valid: true, measuredAt: "x" }, null)] }))).toBeNull();
    expect(childSkillDigest(summary({ skillsLearned: [{ skillKey: "math.money", subjectId: "s", familyLabelEn: "Money", familyLabelAr: "النقود" }] }))).toEqual({
      learned: [{ skillKey: "math.money", familyLabelEn: "Money", familyLabelAr: "النقود" }], growth: [],
    });
  });

  it("loads summaries in chunks of 2000 with one RPC each", async () => {
    const calls: Array<{ name: string; ids: number }> = [];
    const db = {
      rpc: async (name: string, args: { p_learner_ids: string[] }) => {
        calls.push({ name, ids: args.p_learner_ids.length });
        return { data: args.p_learner_ids.slice(0, 1).map((id) => summary({ learnerId: id, skillsLearned: [{ skillKey: "k", subjectId: "s", familyLabelEn: "K", familyLabelAr: "ك" }] })), error: null };
      },
    };
    const ids = Array.from({ length: 4500 }, (_, i) => `kid-${i}`);
    const digests = await loadChildSkillDigests(db as never, ids, new Date("2026-10-18T00:00:00Z"));
    expect(calls).toEqual([{ name: "measurement_learner_summaries", ids: 2000 }, { name: "measurement_learner_summaries", ids: 2000 }, { name: "measurement_learner_summaries", ids: 500 }]);
    expect(digests.size).toBe(3);
  });

  it("the weekly push gets a skills suffix only with a count", () => {
    expect(weeklySummaryMessage("en", week)).toEqual(weeklySummaryMessage("en", week, { skillsLearned: 0 }));
    expect(weeklySummaryMessage("en", week, { skillsLearned: 3 }).body).toMatch(/ · 3 new skills this month$/);
    expect(weeklySummaryMessage("ar", week, { skillsLearned: 3 }).body).toMatch(/ · ٣ مهارات جديدة هذا الشهر$/);
  });
});

describe("placement note copy", () => {
  const banned = /score|test|exam|fail|level|درجة|اختبار|امتحان|رسوب/i;
  it("push and email: no numbers (the child's name aside), no score / test / fail", () => {
    for (const language of ["en", "ar"] as const) {
      const push = placementDoneMessage(language, { childName: "Sara", bossName: "Numbo the Number Giant", subjectName: "Maths" });
      const email = placementDoneEmail({ language, name: "Huda Ali", siteUrl: "https://amal.test", childName: "Sara", bossName: "Numbo the Number Giant", subjectName: "Maths" });
      for (const text of [push.title, push.body, email.subject, email.text]) {
        expect(text.replace(/https?:\/\/\S+/g, "")).not.toMatch(/[0-9٠-٩]/);
        expect(text.replace(/https?:\/\/\S+/g, "")).not.toMatch(banned);
      }
      expect(push.url).toBe("/progress");
    }
    expect(placementDoneMessage("en", { childName: "Sara", bossName: "Numbo", subjectName: "Maths" })).toMatchObject({ title: "Sara met Numbo!", body: "Amal now knows where to start in Maths." });
    expect(placementDoneMessage("ar", { childName: "سارة", bossName: "نُمبو", subjectName: "الرياضيات" })).toMatchObject({ title: "تعرّف سارة على نُمبو!", body: "صار آمال يعرف من أين يبدأ في الرياضيات." });
    const email = placementDoneEmail({ language: "en", name: null, siteUrl: "https://amal.test", childName: "Sara", bossName: "Numbo", subjectName: "Maths" });
    expect(email.text).toContain("See Sara's skills");
    expect(email.html).toContain("https://amal.test/progress");
  });
});
