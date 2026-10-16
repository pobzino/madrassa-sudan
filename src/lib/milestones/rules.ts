// Pure milestone rules shared by server routes and app UI. Owner: server builder. No server-only imports.
import {
  MILESTONE_PASS_PERCENT,
  MILESTONE_WEEKS_PER_BLOCK,
  type BattlePhase,
  type BattleInteractionType,
  type BattleTurn,
  type BossKey,
} from "@/lib/milestones/types";

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
 *
 * With `rankOf` (higher = later week / harder), the drawn set is ordered so
 * later positions skew harder (phase 2 draws from the harder end): items are
 * sorted by rank plus up to `rankJitter` of random noise, so adjacent ranks
 * still mix. The set itself stays the balanced draw.
 */
export function drawBattleQuestions<T extends { id: string; sourceLessonId: string | null }>(
  pool: readonly T[],
  n: number,
  opts: {
    recentlySeen?: ReadonlySet<string>;
    random?: () => number;
    rankOf?: (item: T) => number;
    rankJitter?: number;
    /** Items the boss prefers (signature moves); up to `preferredQuota` are favoured within each lesson. */
    preferred?: (item: T) => boolean;
    preferredQuota?: number;
  } = {},
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
  const preferred = opts.preferred;
  let quota = preferred ? opts.preferredQuota ?? Math.floor(target / 2) : 0;
  const drawn: T[] = [];
  const take = (queue: T[]) => {
    // Within the same freshness, a signature item jumps the queue while the quota lasts.
    if (preferred && quota > 0 && queue.length) {
      const fresh = !recentlySeen.has(queue[0].id);
      const index = queue.findIndex((item) => preferred(item) && !recentlySeen.has(item.id) === fresh);
      if (index >= 0) {
        quota -= 1;
        return queue.splice(index, 1)[0];
      }
    }
    const next = queue.shift();
    if (next && preferred?.(next)) quota -= 1;
    return next;
  };
  while (drawn.length < target) {
    for (const queue of queues) {
      if (drawn.length >= target) break;
      const next = take(queue);
      if (next) drawn.push(next);
    }
  }
  const shuffled = shuffleInPlace(drawn, random);
  const rankOf = opts.rankOf;
  const ordered = rankOf
    ? shuffled
        .map((item) => ({ item, key: rankOf(item) + random() * (opts.rankJitter ?? 2.5) }))
        .sort((a, b) => a.key - b.key)
        .map(({ item }) => item)
    : shuffled;
  return preferred ? assignSignatureTurns(ordered, preferred) : ordered;
}

/**
 * Put signature items on "block" turns (odd positions) where possible, each by
 * swapping with the nearest "attack" position holding a signature item, so
 * the difficulty order barely moves. Any type fills what is left.
 */
export function assignSignatureTurns<T>(items: readonly T[], isSignature: (item: T) => boolean): T[] {
  const result = [...items];
  for (let block = 1; block < result.length; block += 2) {
    if (isSignature(result[block])) continue;
    let best = -1;
    for (let attack = 0; attack < result.length; attack += 2) {
      if (!isSignature(result[attack])) continue;
      if (best < 0 || Math.abs(attack - block) < Math.abs(best - block)) best = attack;
    }
    if (best < 0) break;
    [result[block], result[best]] = [result[best], result[block]];
  }
  return result;
}

/** Even question index = "attack", odd = "block". Purely presentational. */
export function battleTurn(position: number): BattleTurn {
  return position % 2 === 0 ? "attack" : "block";
}

/** Phase 1 while the boss has more than half its health, else phase 2. */
export function battlePhase(hpPercent: number): BattlePhase {
  return hpPercent > 50 ? 1 : 2;
}

/** The current consecutive-correct streak from answers in position order. */
export function comboFrom(results: readonly boolean[]): number {
  let combo = 0;
  for (let i = results.length - 1; i >= 0 && results[i]; i -= 1) combo += 1;
  return combo;
}

export const BOSS_NAMES: Record<BossKey, { en: string; ar: string }> = {
  number_giant: { en: "Numbo the Number Giant", ar: "نُمبو عملاق الأرقام" },
  word_dragon: { en: "Wordy the Word Dragon", ar: "وردي تنين الكلمات" },
  letter_camel: { en: "Harfi the Letter Camel", ar: "حَرفي جمل الحروف" },
  sprout_buddy: { en: "Sprouty the Seed Buddy", ar: "بُرعم صديق البذور" },
  puzzle_owlet: { en: "Puzzle Owlet", ar: "البومة الصغيرة صاحبة الألغاز" },
  letter_dragon: { en: "Harf the Letter Dragon", ar: "حَرف تنين الحروف" },
};

/**
 * Each boss's signature moves: the interaction types it prefers on its
 * "block" turns (the draw places these on odd positions where the pool
 * allows; any type fills the rest). The app reads the same map for skins.
 */
export const BOSS_SIGNATURE_TYPES: Record<BossKey, readonly BattleInteractionType[]> = {
  number_giant: ["tap_to_count", "sequence_order"],
  letter_dragon: ["sequence_order", "fill_missing_word", "match_pairs", "trace_letter"],
  word_dragon: ["fill_missing_word", "match_pairs"],
  letter_camel: ["fill_missing_word", "match_pairs"],
  sprout_buddy: ["sort_groups", "sequence_order"],
  puzzle_owlet: ["match_pairs", "sort_groups"],
};

/**
 * What the boss does on a "block" turn: a playful cartoon throw the child
 * blocks by answering. Never violent. Pick by position % lines.length.
 */
export const BOSS_BLOCK_LINES: Record<BossKey, { en: readonly string[]; ar: readonly string[] }> = {
  number_giant: {
    en: ["Numbo throws a giant 7 at you!", "Numbo rolls a bouncy 3 your way!", "Numbo tosses a spinning plus sign!"],
    ar: ["نُمبو يرمي عليك رقم ٧ عملاقاً!", "نُمبو يدحرج نحوك رقم ٣ قافزاً!", "نُمبو يقذف علامة زائد تدور!"],
  },
  word_dragon: {
    en: ["Wordy puffs a cloud of jumbled letters!", "Wordy flicks a wiggly word at you!", "Wordy blows a bubble full of words!"],
    ar: ["وردي ينفخ غيمة من الحروف المبعثرة!", "وردي يرمي نحوك كلمة متلوّية!", "وردي ينفخ فقاعة مليئة بالكلمات!"],
  },
  letter_camel: {
    en: ["Harfi kicks up a sandy swirl of letters!", "Harfi tosses a dotted letter your way!", "Harfi sends a hopping letter at you!"],
    ar: ["حَرفي يثير دوّامة رمل من الحروف!", "حَرفي يرمي نحوك حرفاً منقّطاً!", "حَرفي يرسل نحوك حرفاً قافزاً!"],
  },
  sprout_buddy: {
    en: ["Sprouty shoots a sneaky seed at you!", "Sprouty swings a leafy vine your way!", "Sprouty sprinkles a puff of pollen!"],
    ar: ["بُرعم يقذف نحوك بذرة ماكرة!", "بُرعم يلوّح نحوك بغصن مورق!", "بُرعم ينثر سحابة من حبوب اللقاح!"],
  },
  puzzle_owlet: {
    en: ["Puzzle Owlet flaps a tricky puzzle piece at you!", "Puzzle Owlet drops a riddle feather!", "Puzzle Owlet spins a question mark your way!"],
    ar: ["البومة الصغيرة ترفرف نحوك بقطعة لغز صعبة!", "البومة الصغيرة تُسقط ريشة لغز!", "البومة الصغيرة تدير نحوك علامة استفهام!"],
  },
  letter_dragon: {
    en: ["Harf puffs a swirl of letters at you!", "Harf flicks a curly letter your way!", "Harf mixes up the letters with a flap!"],
    ar: ["حَرف ينفخ نحوك دوّامة من الحروف!", "حَرف يرمي نحوك حرفاً ملتفّاً!", "حَرف يخلط الحروف برفرفة جناحه!"],
  },
};
