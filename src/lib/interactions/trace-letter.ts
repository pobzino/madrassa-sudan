import arabicTemplates from './trace-templates/ar.json';
import englishTemplates from './trace-templates/en.json';
import type { TraceLetterConfig } from './types';

export interface TraceStrokeTemplate {
  kind: 'main' | 'dot' | 'hamza';
  points: [number, number][];
}

export interface TraceLetterTemplate {
  letter: string;
  strokes: TraceStrokeTemplate[];
}

type TemplateFile = { version: number; script: 'ar' | 'en'; templates: Record<string, TraceLetterTemplate> };

const templates: Record<'ar' | 'en', TemplateFile> = {
  ar: arabicTemplates as unknown as TemplateFile,
  en: englishTemplates as unknown as TemplateFile,
};

export function getTraceLetterTemplate(config: TraceLetterConfig): TraceLetterTemplate | null {
  if (!config || (config.script !== 'ar' && config.script !== 'en') || typeof config.letter !== 'string') return null;
  const file = templates[config.script];
  const letter = config.script === 'en'
    ? (config.case === 'lower' ? config.letter.toLowerCase() : config.letter.toUpperCase())
    : config.letter;
  return file.templates[letter] ?? null;
}

function resample(points: readonly number[][], count: number): Array<[number, number]> {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => [points[0][0], points[0][1]] as [number, number]);
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(total);
  }
  if (total < 1e-6) return Array.from({ length: count }, () => [points[0][0], points[0][1]] as [number, number]);
  const output: Array<[number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const distance = total * i / Math.max(1, count - 1);
    let segment = 1;
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

function prepareCloud(strokes: readonly number[][][], angle: number): Array<[number, number]> {
  const cloud = strokes.flatMap((stroke) => resample(stroke, Math.max(8, Math.min(48, stroke.length * 2))));
  if (!cloud.length) return [];
  const cx = cloud.reduce((sum, p) => sum + p[0], 0) / cloud.length;
  const cy = cloud.reduce((sum, p) => sum + p[1], 0) / cloud.length;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotated = cloud.map(([x, y]) => [
    (x - cx) * cos - (y - cy) * sin,
    (x - cx) * sin + (y - cy) * cos,
  ] as [number, number]);
  const minX = Math.min(...rotated.map((p) => p[0]));
  const maxX = Math.max(...rotated.map((p) => p[0]));
  const minY = Math.min(...rotated.map((p) => p[1]));
  const maxY = Math.max(...rotated.map((p) => p[1]));
  const scale = Math.max(maxX - minX, maxY - minY, 1e-6);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  return rotated.map(([x, y]) => [(x - mx) / scale, (y - my) / scale]);
}

function cloudDistance(a: Array<[number, number]>, b: Array<[number, number]>): number {
  const directed = (from: Array<[number, number]>, to: Array<[number, number]>) =>
    from.reduce((sum, point) => {
      let nearest = Infinity;
      for (const candidate of to) nearest = Math.min(nearest, Math.hypot(point[0] - candidate[0], point[1] - candidate[1]));
      return sum + nearest;
    }, 0) / from.length;
  return (directed(a, b) + directed(b, a)) / 2;
}

function isCompact(stroke: number[][]): boolean {
  if (stroke.length === 0) return false;
  const xs = stroke.map((point) => point[0]);
  const ys = stroke.map((point) => point[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 0.075;
}

export interface TraceLetterGrade { score: number; is_correct: boolean }

/** Point-cloud grader; stroke direction/order do not affect the geometric match. */
export function gradeTraceLetter(
  config: TraceLetterConfig,
  strokes: number[][][],
  tolerance = 0.2
): TraceLetterGrade {
  const template = getTraceLetterTemplate(config);
  if (!template || !Array.isArray(strokes) || strokes.length === 0 || strokes.length > 16) {
    return { score: 0, is_correct: false };
  }
  if (strokes.some((stroke) => !Array.isArray(stroke) || stroke.length === 0 || stroke.length > 512 || stroke.some((p) => !Array.isArray(p) || p.length !== 2 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 1)))) {
    return { score: 0, is_correct: false };
  }
  const expectedDots = template.strokes.filter((stroke) => stroke.kind === 'dot' || stroke.kind === 'hamza').length;
  const drawnDots = strokes.filter(isCompact).length;
  // Extra dots change the Arabic letter too (ب / ت / ث), so dot count is part
  // of identity, not optional decoration.
  if (drawnDots !== expectedDots) return { score: 0.2, is_correct: false };
  if (strokes.length < Math.max(1, template.strokes.length - 1) || strokes.length > template.strokes.length + 2) {
    return { score: 0.15, is_correct: false };
  }
  const expected = prepareCloud(template.strokes.map((stroke) => stroke.points), 0);
  const drawn = strokes;
  let best = Infinity;
  for (let degrees = -25; degrees <= 25; degrees += 5) {
    best = Math.min(best, cloudDistance(prepareCloud(drawn, degrees * Math.PI / 180), expected));
  }
  const allowed = Math.max(0.05, Math.min(0.085, tolerance * 0.32));
  const score = Math.max(0, Math.min(1, 1 - best / allowed));
  return { score, is_correct: best <= allowed };
}
