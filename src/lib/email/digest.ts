// Date windows and activity summaries for the recurring emails. These are
// pure functions, so they're tested without a database.

import { PRACTICE_PASSING_SCORE } from "@/lib/practice";
import type { EmailLanguage } from "./render";
import type { VolunteerImpact, WeeklySummary } from "./templates";

const DAY = 24 * 60 * 60 * 1000;

export type PeriodWindow = { start: Date; end: Date; key: string };

/** The Sunday-to-Saturday week (UTC) that ended most recently before `now`. */
export function previousWeek(now: Date): PeriodWindow {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = new Date(today - now.getUTCDay() * DAY);
  const start = new Date(end.getTime() - 7 * DAY);
  return { start, end, key: `week:${start.toISOString().slice(0, 10)}` };
}

/** The calendar month (UTC) before the one `now` is in. */
export function previousMonth(now: Date): PeriodWindow {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { start, end, key: `month:${start.toISOString().slice(0, 7)}` };
}

const locale = (language: EmailLanguage) => (language === "ar" ? "ar-EG" : "en-GB");

/** "5–11 October", or "28 September – 4 October" when the week spans two months. */
export function weekLabel(window: PeriodWindow, language: EmailLanguage) {
  const last = new Date(window.end.getTime() - DAY);
  const day = new Intl.DateTimeFormat(locale(language), { day: "numeric", timeZone: "UTC" });
  const dayMonth = new Intl.DateTimeFormat(locale(language), { day: "numeric", month: "long", timeZone: "UTC" });
  return window.start.getUTCMonth() === last.getUTCMonth()
    ? `${day.format(window.start)}–${dayMonth.format(last)}`
    : `${dayMonth.format(window.start)} – ${dayMonth.format(last)}`;
}

/** "September" or "سبتمبر". */
export function monthLabel(window: PeriodWindow, language: EmailLanguage) {
  return new Intl.DateTimeFormat(locale(language), { month: "long", timeZone: "UTC" }).format(window.start);
}

export type ProgressActivity = { created_at: string; updated_at: string; completed_at: string | null };

export type PracticeAttempt = {
  assignment_id: string;
  submitted_at: string;
  score: number | null;
  max_score: number | null;
  passing_score: number | null;
  total_points: number | null;
};

export type StreakState = { current_streak_days: number; last_activity_date: string | null } | null;

/** Matches the app's rule: a Practice set passes at its pass mark, 75% by default. */
export function isPracticePass(attempt: PracticeAttempt) {
  const max = attempt.max_score ?? attempt.total_points;
  if (attempt.score == null || !max) return false;
  return attempt.score >= ((attempt.passing_score ?? PRACTICE_PASSING_SCORE) / 100) * max;
}

function within(window: PeriodWindow, iso: string | null) {
  if (!iso) return false;
  const time = Date.parse(iso);
  return time >= window.start.getTime() && time < window.end.getTime();
}

export function summariseWeek(
  window: PeriodWindow,
  progress: ProgressActivity[],
  attempts: PracticeAttempt[],
  streak: StreakState,
): WeeklySummary {
  const activeDays = Array<boolean>(7).fill(false);
  const mark = (iso: string | null) => {
    if (within(window, iso)) activeDays[Math.floor((Date.parse(iso!) - window.start.getTime()) / DAY)] = true;
  };
  for (const row of progress) {
    mark(row.created_at);
    mark(row.updated_at);
    mark(row.completed_at);
  }
  for (const attempt of attempts) mark(attempt.submitted_at);

  const weekAttempts = attempts.filter((attempt) => within(window, attempt.submitted_at));
  const lastDay = new Date(window.end.getTime() - DAY).toISOString().slice(0, 10);
  // Only mention a streak that was still going at the end of the week.
  const streakAlive = Boolean(streak?.last_activity_date && streak.last_activity_date >= lastDay);

  return {
    lessonsStarted: progress.filter((row) => within(window, row.created_at)).length,
    lessonsCompleted: progress.filter((row) => within(window, row.completed_at)).length,
    practiceTried: new Set(weekAttempts.map((attempt) => attempt.assignment_id)).size,
    practicePassed: new Set(weekAttempts.filter(isPracticePass).map((attempt) => attempt.assignment_id)).size,
    streakDays: streakAlive ? streak!.current_streak_days : 0,
    activeDays,
  };
}

export type LessonActivity = { lesson_id: string; student_id: string; created_at: string; completed_at: string | null };

/** What a teacher's lessons did in a month. Leave out the teacher's own views before calling. */
export function summariseImpact(
  window: PeriodWindow,
  rows: LessonActivity[],
  titleFor: (lessonId: string) => string | null,
): VolunteerImpact {
  const startsByLesson = new Map<string, number>();
  const learners = new Set<string>();
  let starts = 0;
  let completions = 0;
  for (const row of rows) {
    const started = within(window, row.created_at);
    const completed = within(window, row.completed_at);
    if (started) {
      starts += 1;
      startsByLesson.set(row.lesson_id, (startsByLesson.get(row.lesson_id) ?? 0) + 1);
    }
    if (completed) completions += 1;
    if (started || completed) learners.add(row.student_id);
  }
  const top = [...startsByLesson.entries()].sort((a, b) => b[1] - a[1])[0];
  return { starts, completions, learners: learners.size, topLessonTitle: top ? titleFor(top[0]) : null };
}
