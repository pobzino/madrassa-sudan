import type { TraceLetterConfig, TraceLetterScript } from './types';

// Letter tracing, shared by the lesson player, homework and the Big Challenge.
// Client-safe: this module never imports the template JSON. The full set
// lives in trace-templates.server.ts (grading on the server); a browser loads
// one letter at a time from /trace-letter/templates/{script}/{hex}.json.

export interface TraceStrokeTemplate {
  kind: 'main' | 'dot' | 'hamza';
  /** Stroke width as a fraction of the box (the font's stroke). */
  width?: number;
  points: [number, number][];
}

export interface TraceLetterTemplate {
  letter: string;
  strokes: TraceStrokeTemplate[];
}

export interface TraceLetterGrade { score: number; is_correct: boolean }

export const TRACE_LETTERS: Record<TraceLetterScript, readonly string[]> = {
  ar: [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'],
  en: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
};

/** Strokes an answer may carry (no letter needs more than 4, plus 2 for slips). */
export const MAX_TRACE_STROKES = 6;
/** Points per answer stroke after resampling. */
export const MAX_TRACE_POINTS = 48;

const ARABIC_NAMES: Record<string, { ar: string; en: string }> = {
  'ا': { ar: 'الألف', en: 'alif' }, 'ب': { ar: 'الباء', en: 'baa' }, 'ت': { ar: 'التاء', en: 'taa' },
  'ث': { ar: 'الثاء', en: 'thaa' }, 'ج': { ar: 'الجيم', en: 'jeem' }, 'ح': { ar: 'الحاء', en: 'haa' },
  'خ': { ar: 'الخاء', en: 'khaa' }, 'د': { ar: 'الدال', en: 'daal' }, 'ذ': { ar: 'الذال', en: 'thaal' },
  'ر': { ar: 'الراء', en: 'raa' }, 'ز': { ar: 'الزاي', en: 'zaay' }, 'س': { ar: 'السين', en: 'seen' },
  'ش': { ar: 'الشين', en: 'sheen' }, 'ص': { ar: 'الصاد', en: 'saad' }, 'ض': { ar: 'الضاد', en: 'daad' },
  'ط': { ar: 'الطاء', en: 'taa' }, 'ظ': { ar: 'الظاء', en: 'thaa' }, 'ع': { ar: 'العين', en: 'ayn' },
  'غ': { ar: 'الغين', en: 'ghayn' }, 'ف': { ar: 'الفاء', en: 'faa' }, 'ق': { ar: 'القاف', en: 'qaaf' },
  'ك': { ar: 'الكاف', en: 'kaaf' }, 'ل': { ar: 'اللام', en: 'laam' }, 'م': { ar: 'الميم', en: 'meem' },
  'ن': { ar: 'النون', en: 'noon' }, 'ه': { ar: 'الهاء', en: 'haa' }, 'و': { ar: 'الواو', en: 'waaw' },
  'ي': { ar: 'الياء', en: 'yaa' },
};

/**
 * The letter a config asks for, or null when it is not one we have a
 * template for. English case comes from `case` when set, else the letter.
 * Only the isolated Arabic form has templates.
 */
export function traceLetterOf(config: Partial<TraceLetterConfig> | null | undefined): string | null {
  if (!config || (config.script !== 'ar' && config.script !== 'en') || typeof config.letter !== 'string') return null;
  const raw = config.letter.trim();
  if ([...raw].length !== 1) return null;
  if (config.script === 'ar') {
    if (config.form && config.form !== 'isolated') return null;
    return TRACE_LETTERS.ar.includes(raw) ? raw : null;
  }
  const letter = config.case === 'lower' ? raw.toLowerCase() : config.case === 'upper' ? raw.toUpperCase() : raw;
  return TRACE_LETTERS.en.includes(letter) ? letter : null;
}

/** "Capital A" / "Small a" / "the letter baa ب"; Arabic: "حرف الباء" / "الحرف الكبير A". */
export function traceLetterLabel(config: TraceLetterConfig, lang: 'ar' | 'en'): string {
  const letter = traceLetterOf(config) ?? config.letter;
  if (config.script === 'ar') {
    const name = ARABIC_NAMES[letter];
    return lang === 'ar' ? `حرف ${name?.ar ?? letter}` : `the letter ${name?.en ?? ''} ${letter}`.replace(/\s+/g, ' ');
  }
  const capital = letter === letter.toUpperCase();
  return lang === 'ar' ? `${capital ? 'الحرف الكبير' : 'الحرف الصغير'} ${letter}` : `${capital ? 'capital' : 'small'} ${letter}`;
}

/** Where the browser loads one letter's template from. */
export function traceTemplateUrl(config: TraceLetterConfig): string | null {
  const letter = traceLetterOf(config);
  if (!letter) return null;
  return `/trace-letter/templates/${config.script}/${letter.codePointAt(0)!.toString(16).padStart(4, '0')}.json`;
}

// ── template lookup ─────────────────────────────────────────────────────

type TemplateSource = (script: TraceLetterScript, letter: string) => TraceLetterTemplate | null;
let serverSource: TemplateSource | null = null;
const loaded = new Map<string, TraceLetterTemplate>();
const pending = new Map<string, Promise<TraceLetterTemplate | null>>();

/** trace-templates.server.ts registers the full set here. */
export function registerTraceTemplateSource(source: TemplateSource) {
  serverSource = source;
}

/** The template when it is at hand (server set, or loaded in this browser), else null. */
export function findTraceTemplate(config: TraceLetterConfig | null | undefined): TraceLetterTemplate | null {
  const letter = traceLetterOf(config);
  if (!letter || !config) return null;
  return serverSource?.(config.script, letter) ?? loaded.get(`${config.script}:${letter}`) ?? null;
}

export function isTraceTemplate(value: unknown): value is TraceLetterTemplate {
  if (!value || typeof value !== 'object') return false;
  const raw = value as { letter?: unknown; strokes?: unknown };
  return typeof raw.letter === 'string' && Array.isArray(raw.strokes) && raw.strokes.length > 0 && raw.strokes.every((stroke) => {
    const s = stroke as { kind?: unknown; points?: unknown };
    return (s.kind === 'main' || s.kind === 'dot' || s.kind === 'hamza') && Array.isArray(s.points) && s.points.length > 0 &&
      s.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)));
  });
}

/** Keep a template the page already has (the battle's guide), so grading in this browser can use it. */
export function rememberTraceTemplate(script: TraceLetterScript, template: TraceLetterTemplate) {
  if (isTraceTemplate(template)) loaded.set(`${script}:${template.letter}`, template);
}

/** Fetch one letter's template (once per letter per page). Null when it can't be loaded. */
export function loadTraceTemplate(config: TraceLetterConfig): Promise<TraceLetterTemplate | null> {
  const known = findTraceTemplate(config);
  if (known) return Promise.resolve(known);
  const url = traceTemplateUrl(config);
  const letter = traceLetterOf(config);
  if (!url || !letter) return Promise.resolve(null);
  const key = `${config.script}:${letter}`;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = fetch(url)
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      if (!isTraceTemplate(body) || body.letter !== letter) return null;
      const template: TraceLetterTemplate = { letter: body.letter, strokes: body.strokes };
      loaded.set(key, template);
      return template;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

// ── answers ─────────────────────────────────────────────────────────────

type Point = [number, number];

function pathLength(points: readonly number[][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Evenly spaced points along a polyline (by arc length). */
export function resampleStroke(points: readonly number[][], count: number): Point[] {
  if (points.length === 0 || count <= 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => [points[0][0], points[0][1]] as Point);
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  if (total < 1e-6) return Array.from({ length: count }, () => [points[0][0], points[0][1]] as Point);
  const output: Point[] = [];
  let segment = 1;
  for (let i = 0; i < count; i += 1) {
    const distance = count === 1 ? 0 : (total * i) / (count - 1);
    while (segment < lengths.length - 1 && lengths[segment] < distance) segment += 1;
    const start = lengths[segment - 1];
    const span = lengths[segment] - start;
    const t = span === 0 ? 0 : (distance - start) / span;
    output.push([
      points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * t,
      points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * t,
    ]);
  }
  return output;
}

const round3 = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;

/**
 * What a tracer sends: at most 6 strokes of at most 48 points each, every
 * coordinate in [0, 1] rounded to 3 decimals (a few KB at most).
 */
export function compactTraceStrokes(strokes: readonly number[][][]): number[][][] {
  return strokes
    .filter((stroke) => Array.isArray(stroke) && stroke.length > 0)
    .slice(0, MAX_TRACE_STROKES)
    .map((stroke) => {
      const points = stroke.length > MAX_TRACE_POINTS ? resampleStroke(stroke, MAX_TRACE_POINTS) : stroke;
      return points.map(([x, y]) => [round3(x), round3(y)]);
    });
}

/** Valid answer strokes: 1-16 strokes of 1-512 points, coordinates finite in [0, 1]. */
export function isTraceStrokeList(value: unknown, maxStrokes = 16, maxPoints = 512): value is number[][][] {
  return Array.isArray(value) && value.length > 0 && value.length <= maxStrokes && value.every((stroke) =>
    Array.isArray(stroke) && stroke.length > 0 && stroke.length <= maxPoints && stroke.every((point) =>
      Array.isArray(point) && point.length === 2 && point.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)
    )
  );
}

// ── grading ─────────────────────────────────────────────────────────────

const CLOUD_POINTS = 96;

/** One cloud for all strokes: points spread by length (dots get a few), so sampling speed doesn't matter. */
function prepareCloud(strokes: readonly number[][][], angle: number): Point[] {
  const lengths = strokes.map(pathLength);
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const cloud = strokes.flatMap((stroke, i) => resampleStroke(stroke, Math.max(4, Math.round((CLOUD_POINTS * lengths[i]) / total))));
  if (!cloud.length) return [];
  const cx = cloud.reduce((sum, p) => sum + p[0], 0) / cloud.length;
  const cy = cloud.reduce((sum, p) => sum + p[1], 0) / cloud.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = cloud.map(([x, y]) => [(x - cx) * cos - (y - cy) * sin, (x - cx) * sin + (y - cy) * cos] as Point);
  const xs = rotated.map((p) => p[0]);
  const ys = rotated.map((p) => p[1]);
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const my = (Math.min(...ys) + Math.max(...ys)) / 2;
  return rotated.map(([x, y]) => [(x - mx) / scale, (y - my) / scale]);
}

function nearestDistances(from: Point[], to: Point[]): number[] {
  return from.map((point) => {
    let nearest = Infinity;
    for (const candidate of to) nearest = Math.min(nearest, Math.hypot(point[0] - candidate[0], point[1] - candidate[1]));
    return nearest;
  });
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

/** How far apart two clouds are on average, and the share of each that is far from the other. */
function compareClouds(drawn: Point[], expected: Point[]) {
  const toExpected = nearestDistances(drawn, expected);
  const toDrawn = nearestDistances(expected, drawn);
  return {
    distance: (mean(toExpected) + mean(toDrawn)) / 2,
    // A part of the letter left out (E traced as F, b as h)...
    missed: toDrawn.filter((d) => d > FAR).length / toDrawn.length,
    // ...or a part added that isn't there (F traced as E).
    stray: toExpected.filter((d) => d > FAR).length / toExpected.length,
  };
}

/** On the normalized letter (size 1), a point this far from the other shape is off the letter. */
const FAR = 0.11;

function centreOf(points: readonly number[][]): Point {
  return [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length];
}

function extentOf(points: readonly number[][]): number {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** A tap or a tiny scribble: how children make dots. */
const DOT_EXTENT = 0.12;

/**
 * Every dot / hamza of the letter has a small stroke on it, and no extra
 * dots: ث (three dots) is not ت (two). Positions are on the guide's box.
 */
function marksMatch(strokes: number[][][], template: TraceLetterTemplate): boolean {
  const marks = template.strokes.filter((stroke) => stroke.kind !== 'main');
  const used = new Set<number>();
  for (const mark of marks) {
    const [mx, my] = centreOf(mark.points);
    const limit = Math.max(0.16, extentOf(mark.points) * 1.5);
    let best = -1;
    let bestGap = Infinity;
    strokes.forEach((stroke, index) => {
      if (used.has(index) || extentOf(stroke) > limit) return;
      const [cx, cy] = centreOf(stroke);
      const gap = Math.hypot(cx - mx, cy - my);
      if (gap <= 0.12 && gap < bestGap) {
        best = index;
        bestGap = gap;
      }
    });
    if (best < 0) return false;
    used.add(best);
  }
  // No extra dots: ج is not ح, ث is not ت. (A slip can be undone.)
  return !strokes.some((stroke, index) => !used.has(index) && extentOf(stroke) <= DOT_EXTENT);
}

/**
 * Grade a trace against a template. A point cloud: stroke order and
 * direction don't change the match (only shape, dots and stroke count do).
 */
export function gradeTraceStrokes(template: TraceLetterTemplate, strokes: unknown, tolerance = 0.2): TraceLetterGrade {
  if (!isTraceStrokeList(strokes)) return { score: 0, is_correct: false };
  if (!marksMatch(strokes, template)) return { score: 0.2, is_correct: false };
  if (strokes.length < Math.max(1, template.strokes.length - 1) || strokes.length > template.strokes.length + 2) {
    return { score: 0.15, is_correct: false };
  }
  const expected = prepareCloud(template.strokes.map((stroke) => stroke.points), 0);
  let best = { distance: Infinity, missed: 1, stray: 1 };
  for (let degrees = -20; degrees <= 20; degrees += 5) {
    const match = compareClouds(prepareCloud(strokes, (degrees * Math.PI) / 180), expected);
    if (match.distance < best.distance) best = match;
  }
  const allowed = Math.max(0.035, Math.min(0.05, tolerance * 0.25));
  const score = Math.max(0, Math.min(1, 1 - best.distance / (allowed * 2) - best.missed - best.stray));
  const isCorrect = best.distance <= allowed && best.missed <= 0.06 && best.stray <= 0.1;
  return { score: Math.round(score * 1000) / 1000, is_correct: isCorrect };
}

/** Grade with whatever template is at hand; fails closed when there is none. */
export function gradeTraceLetter(config: TraceLetterConfig, strokes: unknown, tolerance = 0.2): TraceLetterGrade {
  const template = findTraceTemplate(config);
  return template ? gradeTraceStrokes(template, strokes, tolerance) : { score: 0, is_correct: false };
}
