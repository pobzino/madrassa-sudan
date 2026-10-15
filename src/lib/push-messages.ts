// What each push notification says, in English and Arabic. Short enough to
// read in full on a lock screen.

import type { EmailLanguage } from "@/lib/email/render";
import { hadActivity, type WeeklySummary } from "@/lib/email/templates";

export type PushMessage = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag?: string;
  lang?: EmailLanguage;
  /** A large picture shown under the text on Android, e.g. "/icons/icon-512.png". */
  image?: string;
};

const number = (language: EmailLanguage, value: number) =>
  new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-GB").format(value);

/** Sent in the late afternoon to families who learned yesterday but not yet today. */
export function streakReminderMessage(language: EmailLanguage, streakDays: number): PushMessage {
  const base = { url: "/dashboard", tag: "streak", lang: language };
  if (language === "ar") {
    return streakDays > 1
      ? { ...base, title: `🔥 سلسلة التعلّم: ${number(language, streakDays)}`, body: "أكملوا درس اليوم لتستمر السلسلة." }
      : { ...base, title: "🌱 بداية رائعة أمس!", body: "تعلّموا اليوم أيضاً لتبدأ سلسلتكم." };
  }
  return streakDays > 1
    ? { ...base, title: `🔥 ${streakDays}-day learning streak`, body: "Do today's lesson to keep it going." }
    : { ...base, title: "🌱 Great start yesterday!", body: "Learn again today to start a streak." };
}

/** Sunday's summary, or a gentle nudge after a quiet week. */
export function weeklySummaryMessage(language: EmailLanguage, summary: WeeklySummary): PushMessage {
  const n = (value: number) => number(language, value);
  const daysLearned = summary.activeDays.filter(Boolean).length;
  if (!hadActivity(summary)) {
    return language === "ar"
      ? { title: "📚 درسكم التالي جاهز", body: "حتى عشر دقائق اليوم تحافظ على استمرار التعلّم.", url: "/dashboard", tag: "weekly", lang: language }
      : { title: "📚 Your next lesson is ready", body: "Even ten minutes today keeps the learning going.", url: "/dashboard", tag: "weekly", lang: language };
  }
  if (language === "ar") {
    const parts = [`دروس مكتملة: ${n(summary.lessonsCompleted)}`];
    if (summary.practiceTried) parts.push(`تدريبات ناجحة: ${n(summary.practicePassed)}`);
    if (!summary.lessonsCompleted) parts.splice(0, 1, `أيام التعلّم: ${n(daysLearned)}`);
    return { title: "🎉 أسبوعكم في آمال", body: `${parts.join("، ")}. اضغطوا لرؤية التقرير كاملاً.`, url: "/progress", tag: "weekly", lang: language };
  }
  const lessons = `${summary.lessonsCompleted} ${summary.lessonsCompleted === 1 ? "lesson" : "lessons"} completed`;
  const practice = summary.practiceTried ? `, ${summary.practicePassed} Practice ${summary.practicePassed === 1 ? "set" : "sets"} passed` : "";
  const days = `You learned on ${daysLearned} ${daysLearned === 1 ? "day" : "days"} this week`;
  const lead = summary.lessonsCompleted ? `${lessons}${practice}` : `${days}${practice}`;
  return { title: "🎉 Your week on Amal", body: `${lead}. Tap to see the full report.`, url: "/progress", tag: "weekly", lang: language };
}

/** Sent straight away when a family turns reminders on, so they know it works. */
export function remindersOnMessage(language: EmailLanguage): PushMessage {
  return language === "ar"
    ? { title: "تم تفعيل التذكيرات ✓", body: "سنخبركم عندما يحين وقت التعلّم.", url: "/dashboard", tag: "welcome", lang: language }
    : { title: "Reminders are on ✓", body: "We'll let you know when it's time to learn.", url: "/dashboard", tag: "welcome", lang: language };
}
