import type { Slide } from '@/lib/slides.types';

export interface SlideInteractionResult {
  answer: boolean | number | string | string[] | null;
  completedAt: string;
  isCorrect: boolean;
  timeSpentSeconds?: number;
}

export type StoredSlideInteractionResponses = Record<string, SlideInteractionResult>;

export interface TimedInteractiveSlide {
  slide: Slide;
  triggerSecond: number;
}

export function hasStudentInteraction(slide: Slide): boolean {
  return Boolean(slide.interaction_type);
}

export function getSlideInteractionStorageKey(lessonId: string, userId: string): string {
  return `lesson-slide-interactions:${userId}:${lessonId}`;
}

export function getInteractiveSlides(slides: Slide[], videoDurationSeconds: number | null): TimedInteractiveSlide[] {
  const interactiveSlides = slides
    .filter(hasStudentInteraction)
    .sort((a, b) => a.sequence - b.sequence);

  if (interactiveSlides.length === 0) {
    return [];
  }

  const usableDuration = Math.max(60, Math.round(videoDurationSeconds || 0));
  const startWindow = Math.max(8, Math.floor(usableDuration * 0.2));
  const endWindow = Math.max(startWindow + 5, Math.floor(usableDuration * 0.85));
  const spread = Math.max(1, interactiveSlides.length + 1);

  return interactiveSlides.map((slide, index) => {
    if (typeof slide.timestamp_seconds === 'number' && Number.isFinite(slide.timestamp_seconds)) {
      return {
        slide,
        triggerSecond: Math.max(0, Math.round(slide.timestamp_seconds)),
      };
    }

    const ratio = (index + 1) / spread;
    const derivedSecond = Math.round(startWindow + (endWindow - startWindow) * ratio);

    return {
      slide,
      triggerSecond: derivedSecond,
    };
  });
}

export function getSlideInteractionPrompt(slide: Slide, language: 'ar' | 'en'): string {
  if (language === 'ar') {
    return slide.interaction_prompt_ar?.trim() || slide.body_ar?.trim() || slide.title_ar?.trim() || '';
  }

  return slide.interaction_prompt_en?.trim() || slide.body_en?.trim() || slide.title_en?.trim() || '';
}

export function getSlideInteractionOptions(slide: Slide, language: 'ar' | 'en'): string[] {
  const primary = language === 'ar' ? slide.interaction_options_ar : slide.interaction_options_en;
  const fallback = language === 'ar' ? slide.interaction_options_en : slide.interaction_options_ar;

  return (primary && primary.length > 0 ? primary : fallback) || [];
}

export function getSlideInteractionItems(slide: Slide, language: 'ar' | 'en'): string[] {
  const primary = language === 'ar' ? slide.interaction_items_ar : slide.interaction_items_en;
  const fallback = language === 'ar' ? slide.interaction_items_en : slide.interaction_items_ar;

  return (primary && primary.length > 0 ? primary : fallback) || [];
}

export function getSlideInteractionTargets(slide: Slide, language: 'ar' | 'en'): string[] {
  const primary = language === 'ar' ? slide.interaction_targets_ar : slide.interaction_targets_en;
  const fallback = language === 'ar' ? slide.interaction_targets_en : slide.interaction_targets_ar;

  return (primary && primary.length > 0 ? primary : fallback) || [];
}

export function getStableInteractionOrder<T>(items: T[], seed: string): T[] {
  return [...items]
    .map((item, index) => ({
      item,
      sortKey: hashSeed(`${seed}:${index}`),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((entry) => entry.item);
}

function hashSeed(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }
  return hash;
}

function parseMappedAnswer(answer: boolean | number | string | string[] | null) {
  if (!Array.isArray(answer)) {
    return new Map<number, number>();
  }

  return answer.reduce((mapping, entry) => {
    const [itemIndexRaw, targetIndexRaw] = entry.split(':');
    const itemIndex = Number(itemIndexRaw);
    const targetIndex = Number(targetIndexRaw);

    if (Number.isInteger(itemIndex) && Number.isInteger(targetIndex)) {
      mapping.set(itemIndex, targetIndex);
    }

    return mapping;
  }, new Map<number, number>());
}

export function computeSlideInteractionCorrectness(
  slide: Slide,
  answer: boolean | number | string | string[] | null
): boolean {
  if (!slide.interaction_type) {
    return false;
  }

  if (slide.interaction_type === 'free_response') {
    return typeof answer === 'string' && answer.trim().length > 0;
  }

  if (slide.interaction_type === 'draw_answer') {
    // Drawings are graded by the vision API at submission time and the
    // resulting correctness is stored on the interaction result, so here we
    // only confirm that a drawing was submitted.
    return typeof answer === 'string' && answer.trim().length > 0;
  }

  if (slide.interaction_type === 'choose_correct' || slide.interaction_type === 'fill_missing_word') {
    // Free-entry fill-the-blank: compare normalized typed answer to expected.
    if (
      slide.interaction_type === 'fill_missing_word' &&
      slide.interaction_free_entry === true &&
      typeof answer === 'string'
    ) {
      const normalize = (value: string) =>
        value
          .trim()
          .toLowerCase()
          .replace(/[\s\p{P}]+/gu, ' ')
          .trim();
      const normalizedAnswer = normalize(answer);
      const expectedAr = slide.interaction_expected_answer_ar?.trim() || '';
      const expectedEn = slide.interaction_expected_answer_en?.trim() || '';
      return (
        (expectedAr.length > 0 && normalize(expectedAr) === normalizedAnswer) ||
        (expectedEn.length > 0 && normalize(expectedEn) === normalizedAnswer)
      );
    }

    if (typeof answer === 'number') {
      return answer === slide.interaction_correct_index;
    }

    if (typeof answer === 'string') {
      const options = [
        ...(slide.interaction_options_ar || []),
        ...(slide.interaction_options_en || []),
      ];
      const correctIndex = slide.interaction_correct_index ?? -1;
      return options[correctIndex] === answer;
    }

    return false;
  }

  if (slide.interaction_type === 'true_false') {
    return answer === slide.interaction_true_false_answer;
  }

  if (slide.interaction_type === 'tap_to_count') {
    return Number(answer) === Number(slide.interaction_count_target ?? 0);
  }

  if (slide.interaction_type === 'match_pairs') {
    const itemsLength = Math.max(
      slide.interaction_items_ar?.length ?? 0,
      slide.interaction_items_en?.length ?? 0
    );
    const targetsLength = Math.max(
      slide.interaction_targets_ar?.length ?? 0,
      slide.interaction_targets_en?.length ?? 0
    );
    const mapping = parseMappedAnswer(answer);

    if (itemsLength === 0 || itemsLength !== targetsLength || mapping.size !== itemsLength) {
      return false;
    }

    return Array.from({ length: itemsLength }).every((_, itemIndex) => mapping.get(itemIndex) === itemIndex);
  }

  if (slide.interaction_type === 'sequence_order') {
    const itemsLength = Math.max(
      slide.interaction_items_ar?.length ?? 0,
      slide.interaction_items_en?.length ?? 0
    );

    if (!Array.isArray(answer) || answer.length !== itemsLength) {
      return false;
    }

    return answer.every((value, index) => value === String(index));
  }

  if (slide.interaction_type === 'drag_drop_label') {
    const itemsLength = Math.max(
      slide.interaction_items_ar?.length ?? 0,
      slide.interaction_items_en?.length ?? 0
    );
    const hotspots = slide.interaction_hotspots || [];
    const mapping = parseMappedAnswer(answer);

    if (itemsLength === 0 || hotspots.length !== itemsLength || mapping.size !== itemsLength) {
      return false;
    }

    // Each hotspot index should be matched with the label at the same index.
    return Array.from({ length: itemsLength }).every(
      (_, hotspotIndex) => mapping.get(hotspotIndex) === hotspotIndex
    );
  }

  if (slide.interaction_type === 'sort_groups') {
    const itemsLength = Math.max(
      slide.interaction_items_ar?.length ?? 0,
      slide.interaction_items_en?.length ?? 0
    );
    const solutionMap = slide.interaction_solution_map || [];
    const mapping = parseMappedAnswer(answer);

    if (itemsLength === 0 || solutionMap.length !== itemsLength || mapping.size !== itemsLength) {
      return false;
    }

    return solutionMap.every((targetIndex, itemIndex) => mapping.get(itemIndex) === targetIndex);
  }

  return false;
}

export function readStoredSlideInteractionResponses(raw: string | null): StoredSlideInteractionResponses {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as StoredSlideInteractionResponses;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}
