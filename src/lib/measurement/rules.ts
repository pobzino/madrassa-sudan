// Pure measurement rules shared by server routes and app UI. Owner: server builder. No server-only imports.
import {
  LEVEL_BAND_MIN,
  PLACEMENT_QUESTION_COUNT,
  type Difficulty,
  type LevelBand,
  type PlacementOutcome,
  type SkillChip,
  type SkillSubjectKey,
} from "@/lib/measurement/types";

/**
 * The caveats printed on the impact page and in the funder export's notes
 * (spec §3.6; the export's SQL carries the same text). {date} = when the
 * offline marker started.
 */
export const MEASUREMENT_CAVEATS = {
  en: [
    "Bosses stop early (win or out of tries), so a boss's first try sees 9-12 items, and skill rates use the items actually answered.",
    "A placement covers weeks 1-12, partly before teaching. Growth is \"before teaching -> first try after teaching\" on the same skills, not a controlled study.",
    "Each child answers about 12 items per occasion. Individual skill results are rough; group results with at least 5 children are reported.",
    "The offline mode uses a server-side marker that started {date}. Earlier completions count as unknown.",
    "Ages are the ages given at signup.",
  ],
  ar: [
    "تتوقف التحديات مبكراً (فوز أو نفاد المحاولات)، لذا ترى المحاولة الأولى ٩–١٢ سؤالاً، وتُحسب نسب المهارات من الأسئلة التي أُجيبت فعلاً.",
    "يغطي التحدي الأول الأسابيع ١–١٢، وبعضها قبل التعليم. النمو هو «قبل التعليم ← أول محاولة بعده» على المهارات نفسها، وليس دراسة مضبوطة.",
    "يجيب كل طفل عن ١٢ سؤالاً تقريباً في كل مرة. نتائج المهارة للطفل الواحد تقريبية؛ نعرض نتائج المجموعات التي تضم ٥ أطفال على الأقل.",
    "يعتمد نمط «دون اتصال» على علامة في الخادم بدأت {date}. الإكمالات السابقة غير معروفة.",
    "الأعمار هي الأعمار المذكورة عند التسجيل.",
  ],
} as const;

/** level_score >= 70 -> "confident"; >= 40 -> "on_the_way"; else "getting_started" (same rule as the SQL). */
export function levelBandFor(score: number): LevelBand {
  if (score >= LEVEL_BAND_MIN.confident) return "confident";
  if (score >= LEVEL_BAND_MIN.on_the_way) return "on_the_way";
  return "getting_started";
}

/**
 * LEVEL SCORE (0..100): 100 * sum(w * correct) / sum(w), w = difficulty (null counts as 2).
 * Rounded to 2 decimals like numeric(5,2). Null when there are no items.
 */
export function levelScore(items: ReadonlyArray<{ correct: boolean; difficulty: Difficulty | null }>): number | null {
  let weight = 0;
  let earned = 0;
  for (const item of items) {
    const w = item.difficulty ?? 2;
    weight += w;
    if (item.correct) earned += w;
  }
  if (weight <= 0) return null;
  return Math.round((10000 * earned) / weight) / 100;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Band sizes for n questions in the PLACEMENT_DIFFICULTY_PLAN proportions (12 -> 4/4/4). */
function bandTargets(n: number): Record<Difficulty, number> {
  const targets: Record<Difficulty, number> = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < n; i += 1) targets[(1 + Math.floor((3 * i) / n)) as Difficulty] += 1;
  return targets;
}

/** Bands to borrow from when band `d` is short, nearest first (2 before 1 or 3). */
const BORROW_ORDER: Record<Difficulty, Difficulty[]> = { 1: [2, 3], 2: [1, 3], 3: [2, 1] };

/**
 * Draw PLACEMENT_QUESTION_COUNT items following PLACEMENT_DIFFICULTY_PLAN: per band, round-robin across skills
 * (then across source lessons), preferring earlier source weeks for ties; a band short of items borrows from the
 * nearest band (2 before 1 or 3). Ordered by difficulty ascending, then source week. Deterministic given `random`.
 * Untagged (null difficulty) items count as 2. Never repeats an id.
 */
export function drawPlacementQuestions<T extends { id: string; skillKey: string | null; difficulty: Difficulty | null; sourceWeek: number }>(
  pool: readonly T[], n: number = PLACEMENT_QUESTION_COUNT, random: () => number = Math.random): T[] {
  const unique: T[] = [];
  const ids = new Set<string>();
  for (const item of pool) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    unique.push(item);
  }
  const bandOf = (item: T): Difficulty => item.difficulty ?? 2;
  const lessonOf = (item: T): string => String((item as { sourceLessonId?: string | null }).sourceLessonId ?? "");

  // Per band: one queue in round-robin order (skills, then lessons inside a skill, earlier weeks first).
  const queues: Record<Difficulty, T[]> = { 1: [], 2: [], 3: [] };
  for (const band of [1, 2, 3] as Difficulty[]) {
    const items = unique.filter((item) => bandOf(item) === band);
    const bySkill = new Map<string, T[]>();
    for (const item of items) {
      const key = item.skillKey ?? "";
      const group = bySkill.get(key);
      if (group) group.push(item);
      else bySkill.set(key, [item]);
    }
    const skillQueues = [...bySkill.values()].map((group) => {
      // Inside a skill: round-robin across its lessons, each lesson's items by week (random among ties).
      const byLesson = new Map<string, T[]>();
      for (const item of shuffled(group, random)) {
        const key = lessonOf(item);
        const lesson = byLesson.get(key);
        if (lesson) lesson.push(item);
        else byLesson.set(key, [item]);
      }
      const lessons = [...byLesson.values()]
        .map((lesson) => lesson.sort((a, b) => a.sourceWeek - b.sourceWeek))
        .map((lesson, index) => ({ lesson, week: lesson[0].sourceWeek, index }))
        .sort((a, b) => a.week - b.week || a.index - b.index)
        .map(({ lesson }) => lesson);
      const order: T[] = [];
      for (let round = 0; order.length < group.length; round += 1) {
        for (const lesson of lessons) if (lesson[round]) order.push(lesson[round]);
      }
      return order;
    });
    const orderedSkills = shuffled(skillQueues, random)
      .map((queue, index) => ({ queue, week: queue[0].sourceWeek, index }))
      .sort((a, b) => a.week - b.week || a.index - b.index)
      .map(({ queue }) => queue);
    const queue: T[] = [];
    for (let round = 0; queue.length < items.length; round += 1) {
      for (const skill of orderedSkills) if (skill[round]) queue.push(skill[round]);
    }
    queues[band] = queue;
  }

  const target = Math.max(0, Math.min(Math.floor(n), unique.length));
  const wanted = bandTargets(target);
  const picked: T[] = [];
  const take = (band: Difficulty, count: number) => {
    const taken = queues[band].splice(0, Math.max(0, count));
    picked.push(...taken);
    return taken.length;
  };
  const short: Record<Difficulty, number> = { 1: 0, 2: 0, 3: 0 };
  for (const band of [1, 2, 3] as Difficulty[]) short[band] = wanted[band] - take(band, wanted[band]);
  for (const band of [1, 2, 3] as Difficulty[]) {
    for (const donor of BORROW_ORDER[band]) {
      if (short[band] <= 0) break;
      short[band] -= take(donor, short[band]);
    }
  }
  return picked
    .map((item, index) => ({ item, index }))
    .sort((a, b) => bandOf(a.item) - bandOf(b.item) || a.item.sourceWeek - b.item.sourceWeek || a.index - b.index)
    .map(({ item }) => item);
}

/** knownSkills = answered >= 1 && correct >= 1 && correct * 2 >= answered; the rest are growingSkills; untagged skipped. */
export function placementOutcome(rows: ReadonlyArray<{ skill_key: string | null; family_label_en: string | null; family_label_ar: string | null; answered: number; correct: number }>, subjectId: string): PlacementOutcome {
  const knownSkills: SkillChip[] = [];
  const growingSkills: SkillChip[] = [];
  for (const row of rows ?? []) {
    if (!row?.skill_key) continue;
    const chip: SkillChip = {
      skillKey: row.skill_key,
      subjectId,
      familyLabelEn: row.family_label_en ?? row.skill_key,
      familyLabelAr: row.family_label_ar ?? row.family_label_en ?? row.skill_key,
    };
    const answered = Number(row.answered) || 0;
    const correct = Number(row.correct) || 0;
    if (answered >= 1 && correct >= 1 && correct * 2 >= answered) knownSkills.push(chip);
    else growingSkills.push(chip);
  }
  return { knownSkills, growingSkills };
}

/** The curriculum_skills subject key for a subject, from its English / Arabic name. */
export function measurementSubjectKey(subject: { name_en?: string | null; name_ar?: string | null } | null): SkillSubjectKey {
  const name = `${subject?.name_en ?? ""} ${subject?.name_ar ?? ""}`.toLowerCase();
  if (/math|arith|رياضيات|حساب/.test(name)) return "math";
  if (/english|إنجليزي|انجليزي|الإنكليزية/.test(name)) return "english";
  if (/arabic|عربي|لغتي/.test(name)) return "arabic";
  if (/science|علوم/.test(name)) return "science";
  if (/islam|quran|qur'an|إسلام|اسلام|قرآن|دين/.test(name)) return "islamic";
  if (/social|اجتماع/.test(name)) return "social";
  return "general";
}
