import type { Slide } from '@/lib/slides.types';

/**
 * Split a slide body into paragraphs on blank lines. Empty paragraphs are
 * dropped so trailing or extra whitespace doesn't add phantom reveal steps.
 */
export function splitBodyParagraphs(body: string): string[] {
  return body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
}

/**
 * Number of "reveal" steps a slide has in present mode — i.e. how many times
 * pressing the advance key reveals more content on the current slide before
 * flipping to the next slide.
 *
 * - `question_answer` slides reveal every item in `reveal_items_*`, so the
 *   total equals the item count (nothing is shown on entry).
 * - `key_points`/`summary`/`content` slides only participate when the teacher
 *   has toggled `progressive_reveal`. The first bullet/paragraph is always
 *   visible on entry, so total steps = items.length - 1.
 */
export function getTotalRevealSteps(
  slide: Slide | undefined | null,
  language: 'ar' | 'en'
): number {
  if (!slide) return 0;

  if (slide.type === 'question_answer') {
    const items = (language === 'ar' ? slide.reveal_items_ar : slide.reveal_items_en) || [];
    return items.length;
  }

  if (!slide.progressive_reveal) return 0;

  if (slide.type === 'key_points' || slide.type === 'summary') {
    const bullets = (language === 'ar' ? slide.bullets_ar : slide.bullets_en) || [];
    return Math.max(0, bullets.length - 1);
  }

  if (slide.type === 'content') {
    const body = (language === 'ar' ? slide.body_ar : slide.body_en) || '';
    return Math.max(0, splitBodyParagraphs(body).length - 1);
  }

  return 0;
}

export interface RevealState<T> {
  /** True when the component is rendered in a reveal-aware context. */
  isInteractive: boolean;
  /** Items that should be rendered right now. */
  visibleItems: T[];
  /** Number of visible items (== visibleItems.length). */
  visibleCount: number;
  /** Index of the most recently revealed item, or -1 if none. */
  lastVisibleIndex: number;
  /** True when there are still hidden items and a reveal callback is wired. */
  canReveal: boolean;
}

/**
 * Progressive-reveal slicing shared by `KeyPointsSlide`, `SummarySlide`, and
 * `ContentSlide`. When `revealedCount` is undefined the component is not in
 * interactive mode and all items are shown; otherwise the first
 * `revealedCount + 1` items are shown (so the slide is never empty on entry).
 */
export function computeRevealState<T>(
  items: T[],
  revealedCount: number | undefined,
  onReveal?: () => void
): RevealState<T> {
  const isInteractive = revealedCount !== undefined;
  const visibleCount = isInteractive
    ? Math.min(items.length, (revealedCount as number) + 1)
    : items.length;
  return {
    isInteractive,
    visibleItems: isInteractive ? items.slice(0, visibleCount) : items,
    visibleCount,
    lastVisibleIndex: visibleCount - 1,
    canReveal: isInteractive && !!onReveal && visibleCount < items.length,
  };
}

/**
 * True when the given 0-based index is the "last revealed" slot and not the
 * always-visible first item — used by templates to decorate the newly
 * revealed item with the pop-in animation.
 */
export function isNewlyRevealedIndex(state: RevealState<unknown>, index: number): boolean {
  return state.isInteractive && index > 0 && index === state.lastVisibleIndex;
}
