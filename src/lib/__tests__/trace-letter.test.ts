import { describe, expect, it } from 'vitest';
import arabic from '../interactions/trace-templates/ar.json';
import english from '../interactions/trace-templates/en.json';
import { getTraceLetterTemplate, gradeTraceLetter } from '../interactions/trace-letter';
import type { TraceLetterConfig } from '../interactions/types';

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
      const strokes = getTraceLetterTemplate(config)!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
      expect(gradeTraceLetter(config, strokes).is_correct, `Arabic ${letter}`).toBe(true);
    }
    for (const letter of Object.keys(english.templates)) {
      const letterCase = letter === letter.toLowerCase() ? 'lower' : 'upper';
      const config: TraceLetterConfig = { script: 'en', letter, case: letterCase };
      const strokes = getTraceLetterTemplate(config)!.strokes.map((stroke) => stroke.points.map(([x, y]) => [x, y]));
      expect(gradeTraceLetter(config, strokes).is_correct, `English ${letter}`).toBe(true);
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
