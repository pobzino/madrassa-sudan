import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import arabic from '../interactions/trace-templates/ar.json';
import english from '../interactions/trace-templates/en.json';
import glyphMasks from '../interactions/trace-templates/glyph-reference-masks.json';
import { gradeTraceLetterOnServer, serverTraceTemplate } from '../interactions/trace-templates.server';
import {
  compactTraceStrokes,
  gradeTraceStrokes,
  traceLetterLabel,
  traceLetterOf,
  traceTemplateUrl,
  type TraceLetterTemplate,
} from '../interactions/trace-letter';
import { gradeInteraction } from '../interactions/grader';
import type { TraceLetterConfig } from '../interactions/types';

const referenceMasks = glyphMasks as { ar: Record<string, { size: number; mask: string }>; en: Record<string, { size: number; mask: string }> };
type File = { script: 'ar' | 'en'; templates: Record<string, TraceLetterTemplate> };
const FILES = [arabic, english] as unknown as File[];

const configOf = (script: 'ar' | 'en', letter: string): TraceLetterConfig =>
  script === 'ar' ? { script, letter } : { script, letter, case: letter === letter.toLowerCase() ? 'lower' : 'upper' };
const exactTrace = (config: TraceLetterConfig) => serverTraceTemplate(config)!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));

/** A child's trace: shrunk / moved / tilted, wobbly, with uneven pointer sampling. */
function childTrace(strokes: number[][][], { scale = 0.85, dx = 0.02, dy = -0.015, degrees = 6, wobble = 0.008 } = {}) {
  const angle = (degrees * Math.PI) / 180;
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 2 * wobble;
  };
  return strokes.map((stroke) =>
    stroke
      .filter((_, i) => i % 3 !== 1 || stroke.length < 6)
      .map(([x, y]) => {
        const px = (x - 0.5) * scale;
        const py = (y - 0.5) * scale;
        return [
          Math.min(1, Math.max(0, 0.5 + dx + px * Math.cos(angle) - py * Math.sin(angle) + noise())),
          Math.min(1, Math.max(0, 0.5 + dy + px * Math.sin(angle) + py * Math.cos(angle) + noise())),
        ];
      })
  );
}

describe('trace letter templates', () => {
  it('has every isolated Arabic letter and both English cases, small and on the box', () => {
    expect(Object.keys(arabic.templates)).toHaveLength(28);
    expect(Object.keys(english.templates)).toHaveLength(52);
    for (const file of FILES) {
      for (const template of Object.values(file.templates)) {
        expect(template.strokes.length).toBeGreaterThan(0);
        expect(template.strokes.length).toBeLessThanOrEqual(4);
        for (const stroke of template.strokes) {
          expect(stroke.points.length).toBeGreaterThan(0);
          expect(stroke.points.length).toBeLessThanOrEqual(48);
          for (const [x, y] of stroke.points) {
            expect(x >= 0 && x <= 1 && y >= 0 && y <= 1).toBe(true);
            expect(Math.round(x * 1000) / 1000).toBe(x);
            expect(Math.round(y * 1000) / 1000).toBe(y);
          }
        }
        // A main body first; dots and marks after it.
        expect(template.strokes[0].kind).toBe('main');
        const firstMark = template.strokes.findIndex((stroke) => stroke.kind !== 'main');
        if (firstMark >= 0) expect(template.strokes.slice(firstMark).every((stroke) => stroke.kind !== 'main')).toBe(true);
      }
    }
  });

  it('serves one small public file per letter, identical to the server set', () => {
    const root = path.resolve(__dirname, '../../../public/trace-letter/templates');
    for (const file of FILES) {
      const names = readdirSync(path.join(root, file.script)).sort();
      expect(names).toHaveLength(Object.keys(file.templates).length);
      for (const [letter, template] of Object.entries(file.templates)) {
        const url = traceTemplateUrl(configOf(file.script, letter))!;
        const body = readFileSync(path.join(root, '..', '..', url), 'utf8');
        expect(Buffer.byteLength(body), `${letter} template size`).toBeLessThanOrEqual(3 * 1024);
        const parsed = JSON.parse(body);
        expect(parsed.letter).toBe(letter);
        expect(parsed.strokes).toEqual(template.strokes);
      }
    }
  });

  it('writes Arabic strokes right to left and English strokes from the top', () => {
    for (const letter of Object.keys(arabic.templates)) {
      const body = serverTraceTemplate({ script: 'ar', letter })!.strokes[0].points;
      const [sx, sy] = body[0];
      const [ex] = body[body.length - 1];
      // ا is a single downstroke; every other body starts right of where it ends (or at the top for ر ز د ذ و).
      if (letter !== 'ا') expect(sx > ex || sy < 0.5, `Arabic ${letter} starts at ${sx},${sy}, ends at x ${ex}`).toBe(true);
    }
    for (const letter of ['b', 'd', 'p', 'q', 'R', 'S', 'a']) {
      const first = serverTraceTemplate(configOf('en', letter))!.strokes[0].points;
      expect(first[0][1], `${letter} starts near the top`).toBeLessThan(0.5);
    }
  });

  it('renders every demo path over its source font glyph (intersection over union)', () => {
    for (const file of FILES) {
      for (const template of Object.values(file.templates)) {
        const referenceGlyph = referenceMasks[file.script][template.letter];
        const size = referenceGlyph.size;
        expect(size, `${template.letter} source mask size`).toBe(128);
        const reference = inflateSync(Buffer.from(referenceGlyph.mask, 'base64'));
        const target = new Uint8Array(size * size);
        for (let index = 0; index < target.length; index += 1) {
          target[index] = (reference[Math.floor(index / 8)] >> (7 - (index % 8))) & 1;
        }
        const rendered = new Uint8Array(target.length);
        for (const stroke of template.strokes) {
          const points = stroke.points.length === 1 ? [stroke.points[0], stroke.points[0]] : stroke.points;
          const radius = Math.max(0.75, ((stroke.width ?? 0.025) * size) / 2);
          for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
            const [ax, ay] = points[pointIndex - 1];
            const [bx, by] = points[pointIndex];
            const x1 = ax * size;
            const y1 = ay * size;
            const x2 = bx * size;
            const y2 = by * size;
            const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5));
            for (let step = 0; step <= steps; step += 1) {
              const x = x1 + ((x2 - x1) * step) / steps;
              const y = y1 + ((y2 - y1) * step) / steps;
              for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(size - 1, Math.ceil(y + radius)); py += 1) {
                for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(size - 1, Math.ceil(x + radius)); px += 1) {
                  if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) rendered[py * size + px] = 1;
                }
              }
            }
          }
        }
        let intersection = 0;
        let union = 0;
        for (let index = 0; index < target.length; index += 1) {
          if (target[index] && rendered[index]) intersection += 1;
          if (target[index] || rendered[index]) union += 1;
        }
        const iou = intersection / union;
        expect(iou, `${file.script} ${template.letter} IoU ${iou.toFixed(3)}`).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('trace letter grading', () => {
  it('accepts the exact trace of every letter', () => {
    for (const file of FILES) {
      for (const letter of Object.keys(file.templates)) {
        const config = configOf(file.script, letter);
        expect(gradeTraceLetterOnServer(config, exactTrace(config)).is_correct, `${file.script} ${letter}`).toBe(true);
      }
    }
  });

  it('accepts wobbly, scaled, moved, tilted and reversed traces', () => {
    for (const [script, letter] of [['en', 'A'], ['en', 'b'], ['en', 'R'], ['en', 'S'], ['en', 'a'], ['ar', 'ب'], ['ar', 'ج'], ['ar', 'س'], ['ar', 'ع'], ['ar', 'ي'], ['ar', 'ك']] as const) {
      const config = configOf(script, letter);
      const exact = exactTrace(config);
      for (const options of [{}, { scale: 0.7, dx: -0.04, degrees: -8 }, { scale: 1.0, dx: 0, dy: 0, degrees: 0, wobble: 0.015 }]) {
        const grade = gradeTraceLetterOnServer(config, childTrace(exact, options));
        expect(grade.is_correct, `${letter} ${JSON.stringify(options)} score ${grade.score}`).toBe(true);
      }
      // Direction and order don't count against a child (Codex's decision, kept).
      const reversed = exact.map((stroke) => [...stroke].reverse()).reverse();
      expect(gradeTraceLetterOnServer(config, reversed).is_correct, `${letter} reversed`).toBe(true);
    }
  });

  it('rejects lookalike letters: ب / ت / ث and b / d / p / q', () => {
    const pairs: Array<[string, string, 'ar' | 'en']> = [
      ['ب', 'ت', 'ar'], ['ت', 'ب', 'ar'], ['ت', 'ث', 'ar'], ['ث', 'ت', 'ar'], ['ب', 'ث', 'ar'], ['ب', 'ن', 'ar'], ['ج', 'ح', 'ar'], ['ح', 'خ', 'ar'],
      ['b', 'd', 'en'], ['d', 'b', 'en'], ['b', 'p', 'en'], ['p', 'q', 'en'], ['q', 'p', 'en'], ['d', 'q', 'en'], ['p', 'b', 'en'],
    ];
    for (const [target, wrong, script] of pairs) {
      const grade = gradeTraceLetterOnServer(configOf(script, target), childTrace(exactTrace(configOf(script, wrong)), { degrees: 0, scale: 0.95, dx: 0, dy: 0 }));
      expect(grade.is_correct, `${target} accepted ${wrong} (score ${grade.score})`).toBe(false);
    }
  });

  it('needs the dots: missing or extra dots fail', () => {
    const config: TraceLetterConfig = { script: 'ar', letter: 'ت' };
    const template = serverTraceTemplate(config)!;
    const bodyOnly = template.strokes.filter((stroke) => stroke.kind === 'main').map((stroke) => stroke.points);
    expect(gradeTraceLetterOnServer(config, bodyOnly).is_correct).toBe(false);
    const extraDot = [...exactTrace(config), [[0.45, 0.2]]];
    expect(gradeTraceLetterOnServer(config, extraDot).is_correct).toBe(false);
    // Taps for dots (one point each) are how children make them.
    const taps = template.strokes.map((stroke) => (stroke.kind === 'dot' ? [stroke.points[1]] : stroke.points));
    expect(gradeTraceLetterOnServer(config, taps).is_correct).toBe(true);
  });

  it('fails closed on unknown letters, forms and junk', () => {
    expect(gradeTraceLetterOnServer({ script: 'ar', letter: 'ب', form: 'medial' }, exactTrace({ script: 'ar', letter: 'ب' })).is_correct).toBe(false);
    expect(gradeTraceLetterOnServer({ script: 'en', letter: 'ß' }, [[[0.1, 0.1], [0.9, 0.9]]]).is_correct).toBe(false);
    const config = configOf('en', 'A');
    expect(gradeTraceLetterOnServer(config, []).is_correct).toBe(false);
    expect(gradeTraceLetterOnServer(config, [[[0.1, 2]]]).is_correct).toBe(false);
    expect(gradeTraceLetterOnServer(config, 'strokes').is_correct).toBe(false);
  });

  it('grades through the shared grader on the server', () => {
    const config = configOf('en', 'R');
    const result = gradeInteraction({ type: 'trace_letter', prompt: { ar: 'تتبّع', en: 'Trace' }, config }, { type: 'trace_letter', strokes: exactTrace(config) });
    expect(result.is_correct).toBe(true);
    expect(result.graded_by).toBe('trace');
  });

  it('compacts answers to 6 strokes of 48 points with 3 decimals', () => {
    const long = Array.from({ length: 300 }, (_, i) => [i / 299, 0.123456 + i / 1000]);
    const compact = compactTraceStrokes(Array.from({ length: 9 }, () => long));
    expect(compact).toHaveLength(6);
    expect(compact.every((stroke) => stroke.length === 48)).toBe(true);
    expect(compact[0][0]).toEqual([0, 0.123]);
    expect(JSON.stringify(compact).length).toBeLessThan(6000);
    // Compacting a child's trace keeps it correct.
    const config = configOf('ar', 'ث');
    expect(gradeTraceStrokes(serverTraceTemplate(config)!, compactTraceStrokes(childTrace(exactTrace(config)))).is_correct).toBe(true);
  });

  it('names letters for children (no raw "isolated" / "upper" labels)', () => {
    expect(traceLetterLabel({ script: 'en', letter: 'a', case: 'lower' }, 'en')).toBe('small a');
    expect(traceLetterLabel({ script: 'en', letter: 'R', case: 'upper' }, 'ar')).toBe('الحرف الكبير R');
    expect(traceLetterLabel({ script: 'ar', letter: 'ب', form: 'isolated' }, 'ar')).toBe('حرف الباء');
    expect(traceLetterLabel({ script: 'ar', letter: 'ب' }, 'en')).toBe('the letter baa ب');
    expect(traceLetterOf({ script: 'en', letter: 'a', case: 'upper' })).toBe('A');
    expect(traceTemplateUrl({ script: 'ar', letter: 'ب' })).toBe('/trace-letter/templates/ar/0628.json');
  });
});
