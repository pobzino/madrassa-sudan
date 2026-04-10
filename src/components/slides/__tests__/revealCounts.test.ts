import { describe, it, expect } from 'vitest';
import type { Slide } from '@/lib/slides.types';
import {
  getTotalRevealSteps,
  splitBodyParagraphs,
  computeRevealState,
  isNewlyRevealedIndex,
} from '../revealCounts';

function makeSlide(overrides: Partial<Slide>): Slide {
  return {
    id: 'slide-1',
    type: 'content',
    sequence: 0,
    is_required: false,
    layout: 'default',
    title_ar: '',
    title_en: '',
    body_ar: '',
    body_en: '',
    speaker_notes_ar: '',
    speaker_notes_en: '',
    visual_hint: '',
    bullets_ar: null,
    bullets_en: null,
    reveal_items_ar: null,
    reveal_items_en: null,
    image_url: null,
    title_size: 'md',
    body_size: 'md',
    timestamp_seconds: null,
    ...overrides,
  } as Slide;
}

describe('splitBodyParagraphs', () => {
  it('splits on blank lines', () => {
    expect(splitBodyParagraphs('a\n\nb\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('treats 3+ newlines as a single break', () => {
    expect(splitBodyParagraphs('a\n\n\n\nb')).toEqual(['a', 'b']);
  });

  it('preserves single newlines inside a paragraph', () => {
    expect(splitBodyParagraphs('line1\nline2\n\nnext')).toEqual(['line1\nline2', 'next']);
  });

  it('drops empty / whitespace-only paragraphs', () => {
    expect(splitBodyParagraphs('a\n\n   \n\nb')).toEqual(['a', 'b']);
  });

  it('returns empty array for empty body', () => {
    expect(splitBodyParagraphs('')).toEqual([]);
  });
});

describe('getTotalRevealSteps', () => {
  it('returns 0 for null/undefined slides', () => {
    expect(getTotalRevealSteps(null, 'en')).toBe(0);
    expect(getTotalRevealSteps(undefined, 'en')).toBe(0);
  });

  it('question_answer returns the reveal_items count (one step per item)', () => {
    const slide = makeSlide({
      type: 'question_answer',
      reveal_items_en: ['a', 'b', 'c'],
      reveal_items_ar: ['x', 'y'],
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(3);
    expect(getTotalRevealSteps(slide, 'ar')).toBe(2);
  });

  it('question_answer ignores progressive_reveal flag', () => {
    const slide = makeSlide({
      type: 'question_answer',
      reveal_items_en: ['a', 'b'],
      progressive_reveal: false,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(2);
  });

  it('key_points without progressive_reveal returns 0', () => {
    const slide = makeSlide({
      type: 'key_points',
      bullets_en: ['one', 'two', 'three'],
      progressive_reveal: false,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('key_points with progressive_reveal returns bullets - 1 (first always visible)', () => {
    const slide = makeSlide({
      type: 'key_points',
      bullets_en: ['one', 'two', 'three'],
      bullets_ar: ['واحد', 'اثنان'],
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(2);
    expect(getTotalRevealSteps(slide, 'ar')).toBe(1);
  });

  it('key_points with a single bullet yields 0 reveal steps', () => {
    const slide = makeSlide({
      type: 'key_points',
      bullets_en: ['only'],
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('summary follows the same rule as key_points', () => {
    const slide = makeSlide({
      type: 'summary',
      bullets_en: ['a', 'b', 'c', 'd'],
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(3);
  });

  it('content with progressive_reveal counts paragraphs - 1', () => {
    const slide = makeSlide({
      type: 'content',
      body_en: 'para1\n\npara2\n\npara3',
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(2);
  });

  it('content without progressive_reveal returns 0 even with multiple paragraphs', () => {
    const slide = makeSlide({
      type: 'content',
      body_en: 'para1\n\npara2',
      progressive_reveal: false,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('content with one paragraph and progressive_reveal has 0 reveal steps', () => {
    const slide = makeSlide({
      type: 'content',
      body_en: 'just one paragraph',
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('content with empty body has 0 reveal steps', () => {
    const slide = makeSlide({
      type: 'content',
      body_en: '',
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('unknown/other slide types return 0', () => {
    const slide = makeSlide({ type: 'title', progressive_reveal: true });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });

  it('treats null bullets as empty', () => {
    const slide = makeSlide({
      type: 'key_points',
      bullets_en: null,
      progressive_reveal: true,
    });
    expect(getTotalRevealSteps(slide, 'en')).toBe(0);
  });
});

describe('computeRevealState', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('when revealedCount is undefined, all items are visible and non-interactive', () => {
    const state = computeRevealState(items, undefined);
    expect(state.isInteractive).toBe(false);
    expect(state.visibleCount).toBe(4);
    expect(state.visibleItems).toEqual(items);
    expect(state.lastVisibleIndex).toBe(3);
    expect(state.canReveal).toBe(false);
  });

  it('revealedCount=0 shows the first item (always visible on entry)', () => {
    const state = computeRevealState(items, 0, () => {});
    expect(state.isInteractive).toBe(true);
    expect(state.visibleCount).toBe(1);
    expect(state.visibleItems).toEqual(['a']);
    expect(state.lastVisibleIndex).toBe(0);
    expect(state.canReveal).toBe(true);
  });

  it('revealedCount=2 shows three items', () => {
    const state = computeRevealState(items, 2, () => {});
    expect(state.visibleCount).toBe(3);
    expect(state.visibleItems).toEqual(['a', 'b', 'c']);
    expect(state.lastVisibleIndex).toBe(2);
    expect(state.canReveal).toBe(true);
  });

  it('revealedCount at the last item disables canReveal', () => {
    const state = computeRevealState(items, 3, () => {});
    expect(state.visibleCount).toBe(4);
    expect(state.visibleItems).toEqual(items);
    expect(state.canReveal).toBe(false);
  });

  it('revealedCount beyond the last item clamps to items.length', () => {
    const state = computeRevealState(items, 99, () => {});
    expect(state.visibleCount).toBe(4);
    expect(state.visibleItems).toEqual(items);
    expect(state.canReveal).toBe(false);
  });

  it('interactive with no onReveal callback disables canReveal', () => {
    const state = computeRevealState(items, 0);
    expect(state.isInteractive).toBe(true);
    expect(state.canReveal).toBe(false);
  });

  it('handles empty items array', () => {
    const state = computeRevealState([], 0, () => {});
    expect(state.isInteractive).toBe(true);
    expect(state.visibleCount).toBe(0);
    expect(state.visibleItems).toEqual([]);
    expect(state.lastVisibleIndex).toBe(-1);
    expect(state.canReveal).toBe(false);
  });
});

describe('isNewlyRevealedIndex', () => {
  it('is false in non-interactive mode', () => {
    const state = computeRevealState(['a', 'b', 'c'], undefined);
    expect(isNewlyRevealedIndex(state, 0)).toBe(false);
    expect(isNewlyRevealedIndex(state, 2)).toBe(false);
  });

  it('never highlights index 0 (first item is always visible on entry)', () => {
    const state = computeRevealState(['a', 'b', 'c'], 0, () => {});
    expect(isNewlyRevealedIndex(state, 0)).toBe(false);
  });

  it('highlights only the most recently revealed item', () => {
    const state = computeRevealState(['a', 'b', 'c', 'd'], 2, () => {});
    // visible: a, b, c — index 2 is the newly revealed one
    expect(isNewlyRevealedIndex(state, 0)).toBe(false);
    expect(isNewlyRevealedIndex(state, 1)).toBe(false);
    expect(isNewlyRevealedIndex(state, 2)).toBe(true);
  });

  it('highlights the last visible index when clamped', () => {
    const state = computeRevealState(['a', 'b'], 99, () => {});
    expect(isNewlyRevealedIndex(state, 1)).toBe(true);
    expect(isNewlyRevealedIndex(state, 0)).toBe(false);
  });
});

describe('integration: sim replay semantics', () => {
  // These verify the `reveal_bullet` → `revealed_bullets` → `computeRevealState`
  // contract that SimPlayer relies on. The sim pipeline stores
  // `revealed_bullets: Math.max(current, event.index + 1)`, which maps to
  // "number of items revealed beyond the first" for progressive-reveal slides.

  it('SimPlayer default (revealed_bullets=0) shows first bullet only for progressive slides', () => {
    const bullets = ['a', 'b', 'c'];
    const state = computeRevealState(bullets, 0);
    expect(state.visibleItems).toEqual(['a']);
  });

  it('after one reveal_bullet event (revealed_bullets=1) two bullets are visible', () => {
    // `applySimEvent` computes revealed_bullets = max(0, 0+1) = 1 for index=0.
    const bullets = ['a', 'b', 'c'];
    const state = computeRevealState(bullets, 1);
    expect(state.visibleItems).toEqual(['a', 'b']);
  });

  it('SlideCard should suppress revealedCount for non-progressive slides', () => {
    // SlideCard gates via `slide.progressive_reveal ? revealedCount : undefined`.
    // When undefined, all bullets must be visible.
    const state = computeRevealState(['a', 'b', 'c'], undefined);
    expect(state.visibleItems).toEqual(['a', 'b', 'c']);
  });
});
