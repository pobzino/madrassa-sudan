import { describe, expect, it } from 'vitest';
import { recordedLessonSlides } from '../recorded-lesson-slides';
import { extractSlideContent } from '../ai/homework-slides';
import type { Slide } from '../slides.types';
import type { SimRow } from '../sim.types';

const slide = (id: string): Slide => ({
  id, type: 'content', title_ar: `AR ${id}`, body_ar: '', title_en: `EN ${id}`,
  body_en: 'Old English body', bullets_ar: [], bullets_en: ['Old English bullet'],
  speaker_notes_ar: 'Unspoken teacher notes', speaker_notes_en: '',
  sequence: 0, visual_hint: '', reveal_items_ar: null, reveal_items_en: null,
  image_url: null, layout: null,
});

const recording = (overrides: Partial<SimRow> = {}): SimRow => ({
  deck_snapshot: ['a', 'b', 'unused'].map(slide),
  events: [{ type: 'slide_change', t: 1000, slide_id: 'b' }],
  duration_ms: 5000, clip_segments: null, ...overrides,
} as SimRow);

describe('recordedLessonSlides', () => {
  it('excludes unused slides while retaining the initial slide', () => {
    expect(recordedLessonSlides(recording()).map(s => s.id)).toEqual(['a', 'b']);
  });
  it('does not include a slide replaced at time zero', () => {
    expect(recordedLessonSlides(recording({ events: [{ type: 'slide_change', t: 0, slide_id: 'b' }] })).map(s => s.id)).toEqual(['b']);
  });
  it('matches the player by ignoring changes inside cuts', () => {
    expect(recordedLessonSlides(recording({ clip_segments: [{ start: 0.5, end: 2 }] })).map(s => s.id)).toEqual(['a']);
  });
  it('excludes a slide whose entire visible interval is cut', () => {
    expect(recordedLessonSlides(recording({ clip_segments: [{ start: 0, end: 1 }] })).map(s => s.id)).toEqual(['b']);
  });
  it('sorts changes, keeps first-viewed order, and deduplicates revisits', () => {
    const events: SimRow['events'] = [
      { type: 'slide_change', t: 3000, slide_id: 'b' },
      { type: 'slide_change', t: 0, slide_id: 'b' },
      { type: 'slide_change', t: 2000, slide_id: 'a' },
      { type: 'slide_change', t: 5000, slide_id: 'unused' },
    ];
    expect(recordedLessonSlides(recording({ events })).map(s => s.id)).toEqual(['b', 'a']);
  });
  it('uses only the initial slide for a recording without slide changes', () => {
    expect(recordedLessonSlides(recording({ events: [] })).map(s => s.id)).toEqual(['a']);
  });
  it('does not silently generate from a broken or empty recording', () => {
    expect(recordedLessonSlides(recording({ duration_ms: 0 }))).toEqual([]);
    expect(() => recordedLessonSlides(recording({ events: [{ type: 'slide_change', t: 0, slide_id: 'missing' }] }))).toThrow('missing slide');
  });
});

describe('Practice source text', () => {
  it('does not mix stale alternate-language fields or notes into the taught source', () => {
    const content = extractSlideContent([slide('a')], { language: 'ar', includeSpeakerNotes: false });
    expect(content).toContain('AR a');
    expect(content).not.toContain('English');
    expect(content).not.toContain('teacher notes');
  });
  it('uses the selected English track instead of preferring Arabic', () => {
    const content = extractSlideContent([slide('a')], { language: 'en', includeSpeakerNotes: false });
    expect(content).toContain('EN a');
    expect(content).not.toContain('AR a');
  });
  it('retains the existing default for other homework generators', () => {
    expect(extractSlideContent([slide('a')])).toContain('Unspoken teacher notes');
  });
  it('returns no content for empty visible slides', () => {
    expect(extractSlideContent([{ ...slide('a'), title_ar: '' }], { language: 'ar', includeSpeakerNotes: false })).toBe('');
  });
});
