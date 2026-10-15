import { describe, expect, it } from "vitest";
import { remindersOnMessage, streakReminderMessage, weeklySummaryMessage } from "@/lib/push-messages";

const week = (overrides: Partial<Parameters<typeof weeklySummaryMessage>[1]> = {}) => ({
  lessonsStarted: 2,
  lessonsCompleted: 3,
  practiceTried: 2,
  practicePassed: 1,
  streakDays: 2,
  activeDays: [true, true, false, false, true, false, false],
  ...overrides,
});

describe("push messages", () => {
  it("celebrates a streak, or encourages the second day", () => {
    expect(streakReminderMessage("en", 4)).toMatchObject({ title: "🔥 4-day learning streak", url: "/dashboard", tag: "streak" });
    expect(streakReminderMessage("en", 1).title).toBe("🌱 Great start yesterday!");
    expect(streakReminderMessage("ar", 4).title).toBe("🔥 سلسلة التعلّم: ٤");
    expect(streakReminderMessage("ar", 4).lang).toBe("ar");
  });

  it("summarises the week and links to the full report", () => {
    const en = weeklySummaryMessage("en", week());
    expect(en.body).toBe("3 lessons completed, 1 Practice set passed. Tap to see the full report.");
    expect(en.url).toBe("/progress");
    expect(weeklySummaryMessage("en", week({ lessonsCompleted: 0, practiceTried: 0 })).body).toBe(
      "You learned on 3 days this week. Tap to see the full report.",
    );
    expect(weeklySummaryMessage("ar", week()).body).toBe("دروس مكتملة: ٣، تدريبات ناجحة: ١. اضغطوا لرؤية التقرير كاملاً.");
  });

  it("sends a gentle nudge after a quiet week", () => {
    const quiet = week({ lessonsStarted: 0, lessonsCompleted: 0, practiceTried: 0, practicePassed: 0, activeDays: Array(7).fill(false) });
    expect(weeklySummaryMessage("en", quiet)).toMatchObject({ title: "📚 Your next lesson is ready", url: "/dashboard" });
  });

  it("confirms reminders in the family's language", () => {
    expect(remindersOnMessage("ar").title).toBe("تم تفعيل التذكيرات ✓");
    expect(remindersOnMessage("en").title).toBe("Reminders are on ✓");
  });
});
