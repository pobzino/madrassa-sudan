// Pure helpers for the measurement UI (impact page, funder report, parent card).
// No React, no server imports: unit-tested in measurement-ui.test.ts.
import { MIN_CELL_SIZE, type ImpactSplit, type LevelBand, type SkillChip } from "@/lib/measurement/types";

export type UiLang = "ar" | "en";

const locale = (lang: UiLang) => (lang === "ar" ? "ar-EG" : "en-GB");

export function formatInt(value: number, lang: UiLang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, lang: UiLang, digits = 1): string {
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** 0..1 -> "62%". */
export function formatRate(value: number, lang: UiLang): string {
  return new Intl.NumberFormat(locale(lang), { style: "percent", maximumFractionDigits: 0 }).format(value);
}

/** Percentage points, signed: "+12 pts" / "−3 pts". */
export function formatPoints(value: number, lang: UiLang): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const n = formatInt(Math.abs(rounded), lang);
  return lang === "ar" ? `${sign}${n} نقطة` : `${sign}${n} pts`;
}

/** A small-group cell: "—" with an explanation, never a number. */
export const SUPPRESSED_MARK = "—";

export function suppressedHint(lang: UiLang): string {
  const k = formatInt(MIN_CELL_SIZE, lang);
  return lang === "ar"
    ? `أقل من ${k} أطفال في هذه المجموعة، فلا نعرض الرقم حفاظاً على الخصوصية.`
    : `Fewer than ${k} children in this group, so the number is hidden to protect privacy.`;
}

export type CellKind = "int" | "rate" | "points" | "score" | "decimal" | "decimal2" | "weeks";

export interface CellText {
  text: string;
  suppressed: boolean;
  /** Tooltip for a hidden (small-group) or missing value. */
  hint: string | null;
}

/**
 * How one report value reads. A suppressed row shows "—" with the privacy
 * hint; a value that simply doesn't exist (no data yet) shows "·".
 */
export function formatCell(value: number | null | undefined, kind: CellKind, lang: UiLang, suppressed = false): CellText {
  if (suppressed) return { text: SUPPRESSED_MARK, suppressed: true, hint: suppressedHint(lang) };
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { text: "·", suppressed: false, hint: lang === "ar" ? "لا توجد بيانات بعد" : "No data yet" };
  }
  const text =
    kind === "rate"
      ? formatRate(value, lang)
      : kind === "points"
        ? formatPoints(value, lang)
        : kind === "score"
          ? formatInt(Math.round(value), lang)
          : kind === "decimal"
            ? formatDecimal(value, lang)
            : kind === "decimal2"
              ? formatDecimal(value, lang, 2)
            : kind === "weeks"
              ? lang === "ar"
                ? `${formatDecimal(value, lang)} أسبوع`
                : `${formatDecimal(value, lang)} wk`
              : formatInt(value, lang);
  return { text, suppressed: false, hint: null };
}

// ------------------------------------------------------------------ bands

export const BAND_ORDER: readonly LevelBand[] = ["getting_started", "on_the_way", "confident"];

export const BAND_LABELS: Record<LevelBand, { en: string; ar: string; icon: string }> = {
  getting_started: { en: "Getting started", ar: "في البداية", icon: "🌱" },
  on_the_way: { en: "On the way", ar: "في الطريق", icon: "🌿" },
  confident: { en: "Confident", ar: "واثق", icon: "🌳" },
};

export function bandLabel(band: LevelBand, lang: UiLang): string {
  return BAND_LABELS[band][lang];
}

/** 1, 2 or 3 steps along the way (for the little growth meter). */
export function bandStep(band: LevelBand): 1 | 2 | 3 {
  return (BAND_ORDER.indexOf(band) + 1) as 1 | 2 | 3;
}

// ------------------------------------------------------------------ chips

/** At most `max` chips, then "+N more". */
export function chipOverflow<T>(items: readonly T[], max: number): { shown: T[]; more: number } {
  const limit = Math.max(0, max);
  return { shown: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

export function moreLabel(n: number, lang: UiLang): string {
  return lang === "ar" ? `+${formatInt(n, lang)} أخرى` : `+${formatInt(n, lang)} more`;
}

export function chipLabel(chip: SkillChip, lang: UiLang): string {
  return lang === "ar" ? chip.familyLabelAr : chip.familyLabelEn;
}

// ------------------------------------------------------------------ groups

const GROUP_LABELS: Record<string, { en: string; ar: string }> = {
  all: { en: "All", ar: "الكل" },
  unknown: { en: "Not known", ar: "غير معروف" },
  online: { en: "Mostly online", ar: "عبر الإنترنت غالباً" },
  offline_heavy: { en: "Mostly offline", ar: "دون إنترنت غالباً" },
  mixed: { en: "Mixed", ar: "مختلط" },
};

/** "all", a grade band ("3-4"), an age band ("7-8"), a mode, or a subject id. */
export function groupLabel(group: string, split: ImpactSplit, lang: UiLang, subjectName?: (id: string) => string | null): string {
  const fixed = GROUP_LABELS[group];
  if (fixed) return fixed[lang];
  if (split === "subject") return subjectName?.(group) ?? group;
  const digits = group.replace(/\d+/g, (d) => formatInt(Number(d), lang));
  if (split === "grade_band") return lang === "ar" ? `الصفوف ${digits}` : `Grades ${digits}`;
  if (split === "age_band") return lang === "ar" ? `العمر ${digits}` : `Ages ${digits}`;
  return digits;
}

// ------------------------------------------------------------------ dates

/** YYYY-MM-DD (UTC) for a Date. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last `weeks` weeks ending today (UTC), inclusive: { from, to }. */
export function presetRange(weeks: number, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - (weeks * 7 - 1) * 86_400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

export function formatDay(iso: string, lang: UiLang): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale(lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export function formatMonth(isoMonth: string, lang: UiLang): string {
  const d = new Date(`${isoMonth.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoMonth;
  return new Intl.DateTimeFormat(locale(lang), { month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

// ------------------------------------------------------------------ aggregates

/** Learner-weighted mean of a rate over the published rows (suppressed rows are left out). */
export function weightedRate<T extends { learners: number | null; suppressed: boolean }>(rows: readonly T[], pick: (row: T) => number | null): number | null {
  let num = 0;
  let den = 0;
  for (const row of rows) {
    const value = pick(row);
    if (row.suppressed || row.learners === null || value === null) continue;
    num += value * row.learners;
    den += row.learners;
  }
  return den > 0 ? num / den : null;
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ------------------------------------------------------------------ child copy guard

/** Words the placement must never say to a child (EN + AR). */
export const PLACEMENT_BANNED_WORDS = ["test", "exam", "score", "level", "fail", "wrong", "pass", "اختبار", "امتحان", "درجة", "رسوب", "خطأ"] as const;

/** The banned words found in a piece of child-facing copy (case-insensitive). */
export function bannedWordsIn(text: string): string[] {
  const lower = text.toLowerCase();
  return PLACEMENT_BANNED_WORDS.filter((word) => lower.includes(word));
}
