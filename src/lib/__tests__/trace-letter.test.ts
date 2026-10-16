import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import arabic from '../interactions/trace-templates/ar.json';
import english from '../interactions/trace-templates/en.json';
import glyphMasks from '../interactions/trace-templates/glyph-reference-masks.json';
import { getTraceLetterTemplate, gradeTraceLetter } from '../interactions/trace-letter';
import type { TraceLetterConfig } from '../interactions/types';

const referenceMasks = glyphMasks as { ar: Record<string, { size: number; mask: string }>; en: Record<string, { size: number; mask: string }> };

describe('trace letter templates', () => {
  it('includes every Arabic isolated letter and both English cases', () => {
    expect(Object.keys(arabic.templates)).toHaveLength(28);
    expect(Object.keys(english.templates)).toHaveLength(52);
    for (const file of [arabic, english]) {
      for (const template of Object.values(file.templates)) {
        expect(template.strokes.length).toBeGreaterThan(0);
        expect(template.strokes.every((stroke) => stroke.points.length > 0)).toBe(true);
        expect(template.strokes.flatMap((stroke) => stroke.points).every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true);
      }
    }
    for (const letter of Object.keys(arabic.templates)) {
      const config: TraceLetterConfig = { script: 'ar', letter };
      const template = getTraceLetterTemplate(config)!;
      const strokes = template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
      expect(gradeTraceLetter(config, strokes).is_correct, `Arabic ${letter}`).toBe(true);
    }
    for (const letter of Object.keys(english.templates)) {
      const letterCase = letter === letter.toLowerCase() ? 'lower' : 'upper';
      const config: TraceLetterConfig = { script: 'en', letter, case: letterCase };
      const strokes = getTraceLetterTemplate(config)!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
      expect(gradeTraceLetter(config, strokes).is_correct, `English ${letter}`).toBe(true);
    }
  });

  it('renders every demo path over its source font glyph (intersection over union)', () => {
    for (const file of [arabic, english]) {
      for (const template of Object.values(file.templates)) {
        const referenceGlyph = referenceMasks[file.script as 'ar' | 'en'][template.letter];
        const size = referenceGlyph.size;
        expect(size, `${template.letter} source mask size`).toBe(128);
        expect(referenceGlyph.mask, `${template.letter} source mask`).toBeTruthy();
        const compressed = Buffer.from(referenceGlyph.mask, 'base64');
        const reference = inflateSync(compressed);
        const target = new Uint8Array(size! * size!);
        for (let index = 0; index < target.length; index += 1) {
          target[index] = (reference[Math.floor(index / 8)] >> (7 - (index % 8))) & 1;
        }

        const rendered = new Uint8Array(target.length);
        for (const stroke of template.strokes) {
          const points = stroke.points;
          const radius = Math.max(0.75, ((stroke.width ?? 0.025) * size!) / 2);
          for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
            const [ax, ay] = points[pointIndex - 1];
            const [bx, by] = points[pointIndex];
            const x1 = ax * size!;
            const y1 = ay * size!;
            const x2 = bx * size!;
            const y2 = by * size!;
            const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5));
            for (let step = 0; step <= steps; step += 1) {
              const x = x1 + (x2 - x1) * step / steps;
              const y = y1 + (y2 - y1) * step / steps;
              for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(size! - 1, Math.ceil(y + radius)); py += 1) {
                for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(size! - 1, Math.ceil(x + radius)); px += 1) {
                  if ((px - x) ** 2 + (py - y) ** 2 <= radius ** 2) rendered[py * size! + px] = 1;
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
        expect(iou, `${file.script} ${template.letter} IoU ${iou.toFixed(3)}`).toBeGreaterThan(0.35);
      }
    }
  });

  it('accepts exact, reversed, slightly rotated, scaled, translated and noisy traces', () => {
    const config: TraceLetterConfig = { script: 'en', letter: 'A', case: 'upper' };
    const template = getTraceLetterTemplate(config)!;
    const exact = template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
    expect(gradeTraceLetter(config, exact).is_correct).toBe(true);

    const reversed = exact.map((stroke) => [...stroke].reverse());
    expect(gradeTraceLetter(config, reversed).is_correct).toBe(true);

    const transformed = exact.map((stroke, strokeIndex) => stroke.map(([x, y], pointIndex) => {
      const angle = 8 * Math.PI / 180;
      const dx = (x - 0.5) * 0.78;
      const dy = (y - 0.5) * 0.78;
      const jitter = pointIndex % 2 ? 0.004 : -0.003;
      return [0.5 + dx * Math.cos(angle) - dy * Math.sin(angle) + jitter, 0.5 + dx * Math.sin(angle) + dy * Math.cos(angle) - jitter + strokeIndex * 0.001];
    }));
    expect(gradeTraceLetter(config, transformed).is_correct).toBe(true);
  });

  it('distinguishes common lookalike Latin and Arabic letters', () => {
    const trace = (script: 'ar' | 'en', letter: string, letterCase?: 'upper' | 'lower') => {
      const config: TraceLetterConfig = script === 'ar'
        ? { script, letter }
        : { script, letter, case: letterCase };
      const strokes = getTraceLetterTemplate(config)!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
      return { config, strokes };
    };
    for (const [target, wrong] of [
      [trace('ar', 'ب'), trace('ar', 'ت')],
      [trace('ar', 'ت'), trace('ar', 'ث')],
      [trace('en', 'b', 'lower'), trace('en', 'd', 'lower')],
      [trace('en', 'b', 'lower'), trace('en', 'p', 'lower')],
    ] as const) {
      expect(gradeTraceLetter(target.config, target.strokes).is_correct).toBe(true);
      const wrongGrade = gradeTraceLetter(target.config, wrong.strokes);
      expect(wrongGrade.is_correct, `${target.config.letter} accepted ${wrong.config.letter} with score ${wrongGrade.score}`).toBe(false);
    }
  });

  it('requires Arabic dots when the letter has dots', () => {
    const config: TraceLetterConfig = { script: 'ar', letter: 'ت' };
    const template = getTraceLetterTemplate(config)!;
    const complete = template.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
    const missingDots = template.strokes.filter((stroke) => stroke.kind !== 'dot').map((stroke) => stroke.points.map(([x, y]) => [x, y]));
    expect(gradeTraceLetter(config, complete).is_correct).toBe(true);
    expect(gradeTraceLetter(config, missingDots).is_correct).toBe(false);
  });
});
