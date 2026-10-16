// Pure milestone rules shared by server routes and app UI. Owner: server builder. No server-only imports.
import { MILESTONE_PASS_PERCENT, MILESTONE_WEEKS_PER_BLOCK, type BossKey } from "@/lib/milestones/types";

/** Correct answers needed to win a battle of `n` questions: ceil(passPercent * n / 100). */
export function requiredCorrect(n: number, passPercent = MILESTONE_PASS_PERCENT): number {
  return Math.ceil((passPercent * n) / 100);
}

/** Wrong answers a learner may give and still win ("tries"): n - requiredCorrect(n). */
export function heartsFor(n: number, passPercent = MILESTONE_PASS_PERCENT): number {
  return n - requiredCorrect(n, passPercent);
}

/** The "puzzle meter", 100 at the start and 0 once the boss is won over. */
export function bossHpPercent(correct: number, required: number): number {
  if (required <= 0) return 0;
  return Math.max(0, Math.round((100 * (required - correct)) / required));
}

/** 3 stars for no wrong answers, 2 for at most half the tries used, else 1. */
export function starsFor(wrong: number, hearts: number): 1 | 2 | 3 {
  if (wrong <= 0) return 3;
  if (wrong <= Math.floor(hearts / 2)) return 2;
  return 1;
}

/** 1 for the milestone after week 4, 2 after week 8, and so on. */
export function milestoneLevel(afterWeekNumber: number): number {
  return afterWeekNumber / MILESTONE_WEEKS_PER_BLOCK;
}

export function isMilestoneWeek(weekNumber: number): boolean {
  return Number.isInteger(weekNumber) && weekNumber > 0 && weekNumber % MILESTONE_WEEKS_PER_BLOCK === 0;
}

/** The weeks a milestone covers: [k-3, k-2, k-1, k]. */
export function milestoneBlockWeeks(afterWeekNumber: number): number[] {
  const weeks: number[] = [];
  for (let week = afterWeekNumber - MILESTONE_WEEKS_PER_BLOCK + 1; week <= afterWeekNumber; week += 1) {
    weeks.push(week);
  }
  return weeks;
}

export function bossForSubject(subjectNameEn: string | null, subjectNameAr?: string | null): BossKey {
  const name = `${subjectNameEn ?? ""} ${subjectNameAr ?? ""}`.toLowerCase();
  if (/math|maths|arith|رياضيات|حساب/.test(name)) return "number_giant";
  if (/english|إنجليزي/.test(name)) return "word_dragon";
  if (/arabic|عربي|لغتي/.test(name)) return "letter_camel";
  if (/science|علوم/.test(name)) return "sprout_buddy";
  return "puzzle_owlet";
}

function shuffleInPlace<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Draw a battle's questions from the pool: round-robin across source lessons
 * (balanced coverage of all 4 weeks), preferring questions the learner did
 * not see in their previous battle, then shuffled. Returns min(n, pool) items
 * with no duplicate ids.
 */
export function drawBattleQuestions<T extends { id: string; sourceLessonId: string | null }>(
  pool: readonly T[],
  n: number,
  opts: { recentlySeen?: ReadonlySet<string>; random?: () => number } = {},
): T[] {
  const random = opts.random ?? Math.random;
  const recentlySeen = opts.recentlySeen ?? new Set<string>();
  const seenIds = new Set<string>();
  const groups = new Map<string, T[]>();
  for (const item of pool) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    const key = item.sourceLessonId ?? "";
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const queues = shuffleInPlace(
    [...groups.values()].map((group) => {
      const fresh = shuffleInPlace(group.filter((item) => !recentlySeen.has(item.id)), random);
      const seen = shuffleInPlace(group.filter((item) => recentlySeen.has(item.id)), random);
      return [...fresh, ...seen];
    }),
    random,
  );

  const target = Math.max(0, Math.min(Math.floor(n), seenIds.size));
  const drawn: T[] = [];
  while (drawn.length < target) {
    for (const queue of queues) {
      if (drawn.length >= target) break;
      const next = queue.shift();
      if (next) drawn.push(next);
    }
  }
  return shuffleInPlace(drawn, random);
}

export const BOSS_NAMES: Record<BossKey, { en: string; ar: string }> = {
  number_giant: { en: "Numbo the Number Giant", ar: "نُمبو عملاق الأرقام" },
  word_dragon: { en: "Wordy the Word Dragon", ar: "وردي تنين الكلمات" },
  letter_camel: { en: "Harfi the Letter Camel", ar: "حَرفي جمل الحروف" },
  sprout_buddy: { en: "Sprouty the Seed Buddy", ar: "بُرعم صديق البذور" },
  puzzle_owlet: { en: "Puzzle Owlet", ar: "البومة الصغيرة صاحبة الألغاز" },
};
