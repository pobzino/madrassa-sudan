import { describe, expect, it } from "vitest";
import { defaultEmailUpdatesOptIn, isProtectedTimeZone, mentionsProtectedCountry } from "@/lib/email-consent-region";
import {
  isPracticePass,
  monthLabel,
  previousMonth,
  previousWeek,
  summariseImpact,
  summariseWeek,
  weekLabel,
} from "@/lib/email/digest";
import { escapeHtml } from "@/lib/email/render";
import { volunteerImpactEmail, weeklyProgressEmail, welcomeParentEmail } from "@/lib/email/templates";
import { unsubscribeUrl, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

const siteUrl = "https://amalschool.org";

describe("email consent region", () => {
  it("starts unticked in the UK, EU, EEA and Switzerland", () => {
    expect(isProtectedTimeZone("Europe/London")).toBe(true);
    expect(isProtectedTimeZone("Atlantic/Canary")).toBe(true);
    expect(isProtectedTimeZone("Africa/Khartoum")).toBe(false);
    expect(mentionsProtectedCountry("London, UK")).toBe(true);
    expect(mentionsProtectedCountry("ألمانيا")).toBe(true);
    expect(mentionsProtectedCountry("Ukraine")).toBe(false);
    expect(mentionsProtectedCountry("Khartoum, Sudan")).toBe(false);
    expect(defaultEmailUpdatesOptIn({ timeZone: "Africa/Khartoum", countryText: "Sudan" })).toBe(true);
    expect(defaultEmailUpdatesOptIn({ timeZone: "Asia/Dubai", countryText: "Manchester, England" })).toBe(false);
    expect(defaultEmailUpdatesOptIn({ timeZone: "Europe/Dublin", countryText: "" })).toBe(false);
  });
});

describe("digest windows", () => {
  it("covers the Sunday-to-Saturday week before a Sunday run", () => {
    const window = previousWeek(new Date("2026-10-18T06:00:00Z"));
    expect(window.start.toISOString()).toBe("2026-10-11T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-18T00:00:00.000Z");
    expect(window.key).toBe("week:2026-10-11");
    expect(weekLabel(window, "en")).toBe("11–17 October");
  });

  it("labels weeks that span two months", () => {
    const window = previousWeek(new Date("2026-10-04T06:00:00Z"));
    expect(weekLabel(window, "en")).toBe("27 September – 3 October");
  });

  it("covers the previous calendar month", () => {
    const window = previousMonth(new Date("2026-10-01T08:00:00Z"));
    expect(window.key).toBe("month:2026-09");
    expect(monthLabel(window, "en")).toBe("September");
    expect(monthLabel(window, "ar")).toBe("سبتمبر");
  });
});

describe("weekly summary", () => {
  const window = previousWeek(new Date("2026-10-18T06:00:00Z"));

  it("counts lessons, practice and active days inside the week only", () => {
    const summary = summariseWeek(
      window,
      [
        { created_at: "2026-10-11T09:00:00Z", updated_at: "2026-10-13T09:00:00Z", completed_at: "2026-10-13T09:00:00Z" },
        { created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-17T20:00:00Z", completed_at: null },
        { created_at: "2026-10-02T09:00:00Z", updated_at: "2026-10-03T09:00:00Z", completed_at: "2026-10-03T09:00:00Z" },
      ],
      [
        { assignment_id: "a", submitted_at: "2026-10-14T10:00:00Z", score: 6, max_score: 10, passing_score: 75, total_points: 10 },
        { assignment_id: "a", submitted_at: "2026-10-14T11:00:00Z", score: 8, max_score: 10, passing_score: 75, total_points: 10 },
        { assignment_id: "b", submitted_at: "2026-10-15T10:00:00Z", score: 2, max_score: 10, passing_score: 75, total_points: 10 },
      ],
      { current_streak_days: 4, last_activity_date: "2026-10-17" },
    );
    expect(summary).toEqual({
      lessonsStarted: 1,
      lessonsCompleted: 1,
      practiceTried: 2,
      practicePassed: 1,
      streakDays: 4,
      activeDays: [true, false, true, true, true, false, true],
    });
  });

  it("drops a streak that ended before the week did", () => {
    const summary = summariseWeek(window, [], [], { current_streak_days: 6, last_activity_date: "2026-10-14" });
    expect(summary.streakDays).toBe(0);
  });

  it("uses the app's 75% pass mark when an assignment has none", () => {
    const attempt = { assignment_id: "a", submitted_at: "", score: 15, max_score: 20, passing_score: null, total_points: 20 };
    expect(isPracticePass(attempt)).toBe(true);
    expect(isPracticePass({ ...attempt, score: 14 })).toBe(false);
  });
});

describe("volunteer impact", () => {
  it("counts starts, completions and distinct learners, and finds the top lesson", () => {
    const window = previousMonth(new Date("2026-10-01T08:00:00Z"));
    const impact = summariseImpact(
      window,
      [
        { lesson_id: "fractions", student_id: "s1", created_at: "2026-09-03T00:00:00Z", completed_at: "2026-09-04T00:00:00Z" },
        { lesson_id: "fractions", student_id: "s2", created_at: "2026-09-05T00:00:00Z", completed_at: null },
        { lesson_id: "letters", student_id: "s1", created_at: "2026-09-07T00:00:00Z", completed_at: null },
        { lesson_id: "letters", student_id: "s3", created_at: "2026-08-20T00:00:00Z", completed_at: "2026-09-02T00:00:00Z" },
        { lesson_id: "letters", student_id: "s4", created_at: "2026-08-20T00:00:00Z", completed_at: null },
      ],
      (id) => (id === "fractions" ? "Adding fractions" : "Letters"),
    );
    expect(impact).toEqual({ starts: 3, completions: 2, learners: 3, topLessonTitle: "Adding fractions" });
  });
});

describe("templates", () => {
  it("escapes names and writes Arabic right to left", () => {
    const email = welcomeParentEmail({ language: "ar", name: "<b>Amina</b> Ali", siteUrl, whatsappGroupUrl: "https://chat.whatsapp.com/x" });
    expect(email.html).toContain('dir="rtl"');
    expect(email.html).toContain("&lt;b&gt;Amina&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Amina</b>");
    expect(email.html).toContain(`${siteUrl}/email/welcome.png`);
  });

  it("includes the unsubscribe link in recurring summaries", () => {
    const summary = { lessonsStarted: 1, lessonsCompleted: 1, practiceTried: 0, practicePassed: 0, streakDays: 0, activeDays: [true, false, false, false, false, false, false] };
    const weekly = weeklyProgressEmail({ language: "en", name: "Amina", siteUrl, unsubscribeUrl: `${siteUrl}/u?x=1&y=2`, summary, weekLabel: "11–17 October" });
    expect(weekly.subject).toBe("Your week on Amal: 1 lesson completed");
    expect(weekly.html).toContain(escapeHtml(`${siteUrl}/u?x=1&y=2`));
    expect(weekly.text).toContain("Stop weekly summaries");

    const impact = volunteerImpactEmail({
      language: "en",
      name: null,
      siteUrl,
      unsubscribeUrl: `${siteUrl}/u`,
      monthLabel: "September",
      impact: { starts: 1, completions: 0, learners: 1, topLessonTitle: null },
    });
    expect(impact.html).toContain("Stop monthly summaries");
    expect(impact.text).toContain("1 lesson start");
  });

  it("attributes weekly family activity to named child profiles", () => {
    const summary = { lessonsStarted: 1, lessonsCompleted: 1, practiceTried: 0, practicePassed: 0, streakDays: 0, activeDays: [true, false, false, false, false, false, false] };
    const childSummary = { ...summary, lessonsCompleted: 2, practiceTried: 1, practicePassed: 1 };
    const weekly = weeklyProgressEmail({
      language: "en", name: "Amina", siteUrl, unsubscribeUrl: `${siteUrl}/u`, summary,
      childSummaries: [{ name: "Samira", summary: childSummary }], weekLabel: "11–17 October",
    });
    expect(weekly.text).toContain("Samira: 1 lesson started, 2 completed, 1 Practice set passed");
  });

  it("sends the nudge version when a family had a quiet week", () => {
    const quiet = { lessonsStarted: 0, lessonsCompleted: 0, practiceTried: 0, practicePassed: 0, streakDays: 0, activeDays: Array(7).fill(false) };
    const email = weeklyProgressEmail({ language: "en", name: "Amina", siteUrl, unsubscribeUrl: `${siteUrl}/u`, summary: quiet, weekLabel: "" });
    expect(email.subject).toBe("Your next lesson is waiting");
    expect(email.html).toContain(`${siteUrl}/email/missed.png`);
  });
});

describe("unsubscribe links", () => {
  it("only verify for the person and kind they were made for", () => {
    const url = new URL(unsubscribeUrl(siteUrl, "secret", "user-1", "weekly_progress"));
    const token = url.searchParams.get("t")!;
    expect(url.pathname).toBe("/api/email/unsubscribe");
    expect(verifyUnsubscribeToken("secret", "user-1", "weekly_progress", token)).toBe(true);
    expect(verifyUnsubscribeToken("secret", "user-2", "weekly_progress", token)).toBe(false);
    expect(verifyUnsubscribeToken("secret", "user-1", "volunteer_impact", token)).toBe(false);
    expect(verifyUnsubscribeToken("other", "user-1", "weekly_progress", token)).toBe(false);
    expect(verifyUnsubscribeToken("secret", "user-1", "weekly_progress", "short")).toBe(false);
  });
});
