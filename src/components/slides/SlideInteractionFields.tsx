'use client';

import { useMemo } from 'react';
import type { Slide, SlideInteractionType } from '@/lib/slides.types';
import InteractionRenderer from '@/components/interactions/InteractionRenderer';
import { slideToInteraction, interactionToSlide } from '@/lib/interactions/adapters';
import type { Interaction } from '@/lib/interactions/types';

interface SlideInteractionFieldsProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
}

const INTERACTION_TYPES: Array<{ value: SlideInteractionType; label: string; hint: string }> = [
  { value: 'free_response', label: 'Free Response', hint: 'Open questions answered in the student’s own words' },
  { value: 'choose_correct', label: 'Multiple Choice', hint: 'Vocabulary & comprehension checks' },
  { value: 'true_false', label: 'True / False', hint: 'Quick fact review' },
  { value: 'fill_missing_word', label: 'Fill the Blank', hint: 'Sentence completion & grammar' },
  { value: 'tap_to_count', label: 'Tap to Count', hint: 'Early math & counting practice' },
  { value: 'match_pairs', label: 'Match Pairs', hint: 'Link terms to definitions' },
  { value: 'sequence_order', label: 'Put in Order', hint: 'Steps, timelines & processes' },
  { value: 'sort_groups', label: 'Sort Into Groups', hint: 'Classification & categorization' },
  { value: 'draw_answer', label: 'Draw the Answer', hint: 'Students draw on a whiteboard; vision grader judges the drawing' },
  { value: 'drag_drop_label', label: 'Label an Image', hint: 'Teacher places spots on the slide image; students drag labels onto them' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export default function SlideInteractionFields({
  slide,
  onUpdate,
}: SlideInteractionFieldsProps) {
  const interaction = useMemo(() => slideToInteraction(slide), [slide]);

  function setInteractionType(nextType: SlideInteractionType | '') {
    if (!nextType) {
      onUpdate({
        activity_id: null,
        interaction_type: null,
        interaction_prompt_ar: null,
        interaction_prompt_en: null,
        interaction_expected_answer_ar: null,
        interaction_expected_answer_en: null,
        interaction_options_ar: null,
        interaction_options_en: null,
        interaction_correct_index: null,
        interaction_true_false_answer: null,
        interaction_count_target: null,
        interaction_visual_emoji: null,
        interaction_items_ar: null,
        interaction_items_en: null,
        interaction_targets_ar: null,
        interaction_targets_en: null,
        interaction_solution_map: null,
        interaction_free_entry: null,
        interaction_hotspots: null,
      });
      return;
    }

    const baseUpdates: Partial<Slide> = {
      activity_id: slide.activity_id ?? crypto.randomUUID(),
      interaction_type: nextType,
      interaction_prompt_ar: slide.interaction_prompt_ar ?? slide.body_ar ?? '',
      interaction_prompt_en: slide.interaction_prompt_en ?? slide.body_en ?? '',
      interaction_expected_answer_ar: null,
      interaction_expected_answer_en: null,
      interaction_options_ar: null,
      interaction_options_en: null,
      interaction_correct_index: null,
      interaction_true_false_answer: null,
      interaction_count_target: null,
      interaction_visual_emoji: null,
      interaction_items_ar: null,
      interaction_items_en: null,
      interaction_targets_ar: null,
      interaction_targets_en: null,
      interaction_solution_map: null,
      interaction_free_entry: null,
      interaction_hotspots: null,
    };

    if (nextType === 'free_response' || nextType === 'draw_answer') {
      baseUpdates.interaction_expected_answer_ar =
        slide.interaction_expected_answer_ar ?? '';
      baseUpdates.interaction_expected_answer_en =
        slide.interaction_expected_answer_en ?? '';
    }

    if (nextType === 'drag_drop_label') {
      const existingItems = Math.max(
        slide.interaction_items_ar?.length ?? 0,
        slide.interaction_items_en?.length ?? 0
      );
      const itemCount = Math.max(existingItems, 2);
      baseUpdates.interaction_items_ar = Array.from(
        { length: itemCount },
        (_, i) => slide.interaction_items_ar?.[i] || ''
      );
      baseUpdates.interaction_items_en = Array.from(
        { length: itemCount },
        (_, i) => slide.interaction_items_en?.[i] || ''
      );

      const existingHotspots = slide.interaction_hotspots || [];
      baseUpdates.interaction_hotspots = Array.from({ length: itemCount }, (_, index) =>
        existingHotspots[index] || {
          x_percent: 20 + (index % 4) * 20,
          y_percent: 30 + Math.floor(index / 4) * 25,
        }
      );
    }

    if (nextType === 'choose_correct') {
      baseUpdates.interaction_options_ar = slide.interaction_options_ar?.length
        ? slide.interaction_options_ar
        : ['', '', ''];
      baseUpdates.interaction_options_en = slide.interaction_options_en?.length
        ? slide.interaction_options_en
        : ['', '', ''];
      baseUpdates.interaction_correct_index = slide.interaction_correct_index ?? 0;
    }

    if (nextType === 'fill_missing_word') {
      const keepFreeEntry = slide.interaction_free_entry === true;
      baseUpdates.interaction_free_entry = keepFreeEntry;
      if (keepFreeEntry) {
        baseUpdates.interaction_expected_answer_ar =
          slide.interaction_expected_answer_ar ?? '';
        baseUpdates.interaction_expected_answer_en =
          slide.interaction_expected_answer_en ?? '';
      } else {
        baseUpdates.interaction_options_ar = slide.interaction_options_ar?.length
          ? slide.interaction_options_ar
          : ['', '', ''];
        baseUpdates.interaction_options_en = slide.interaction_options_en?.length
          ? slide.interaction_options_en
          : ['', '', ''];
        baseUpdates.interaction_correct_index = slide.interaction_correct_index ?? 0;
      }
    }

    if (nextType === 'true_false') {
      baseUpdates.interaction_true_false_answer =
        slide.interaction_true_false_answer ?? true;
    }

    if (nextType === 'tap_to_count') {
      baseUpdates.interaction_count_target = slide.interaction_count_target ?? 5;
      baseUpdates.interaction_visual_emoji =
        slide.interaction_visual_emoji ?? '🍎';
    }

    if (nextType === 'match_pairs') {
      baseUpdates.interaction_items_ar = slide.interaction_items_ar?.length
        ? slide.interaction_items_ar
        : ['', ''];
      baseUpdates.interaction_items_en = slide.interaction_items_en?.length
        ? slide.interaction_items_en
        : ['', ''];
      baseUpdates.interaction_targets_ar = slide.interaction_targets_ar?.length
        ? slide.interaction_targets_ar
        : ['', ''];
      baseUpdates.interaction_targets_en = slide.interaction_targets_en?.length
        ? slide.interaction_targets_en
        : ['', ''];
    }

    if (nextType === 'sequence_order') {
      baseUpdates.interaction_items_ar = slide.interaction_items_ar?.length
        ? slide.interaction_items_ar
        : ['', '', ''];
      baseUpdates.interaction_items_en = slide.interaction_items_en?.length
        ? slide.interaction_items_en
        : ['', '', ''];
    }

    if (nextType === 'sort_groups') {
      const itemLength = Math.max(
        slide.interaction_items_ar?.length ?? 0,
        slide.interaction_items_en?.length ?? 0,
        2
      );
      const targetLength = Math.max(
        slide.interaction_targets_ar?.length ?? 0,
        slide.interaction_targets_en?.length ?? 0,
        2
      );

      const padValues = (values: string[] | null | undefined, len: number) =>
        Array.from({ length: len }, (_, i) => values?.[i] || '');

      baseUpdates.interaction_items_ar = padValues(slide.interaction_items_ar, itemLength);
      baseUpdates.interaction_items_en = padValues(slide.interaction_items_en, itemLength);
      baseUpdates.interaction_targets_ar = padValues(
        slide.interaction_targets_ar,
        targetLength
      ).map((value, index) => value || `المجموعة ${index + 1}`);
      baseUpdates.interaction_targets_en = padValues(
        slide.interaction_targets_en,
        targetLength
      ).map((value, index) => value || `Group ${index + 1}`);
      baseUpdates.interaction_solution_map =
        slide.interaction_solution_map?.length === itemLength
          ? slide.interaction_solution_map
          : Array.from({ length: itemLength }, (_, index) =>
              Math.min(index, targetLength - 1)
            );
    }

    onUpdate(baseUpdates);
  }

  function handleInteractionChange(next: Interaction) {
    onUpdate(interactionToSlide(next));
  }

  const selectedInteraction = INTERACTION_TYPES.find((t) => t.value === slide.interaction_type);

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div>
        <label className={labelClass}>Student Interaction</label>
        <select
          value={slide.interaction_type || ''}
          onChange={(e) =>
            setInteractionType(e.target.value as SlideInteractionType | '')
          }
          className={inputClass}
        >
          <option value="">None — static slide</option>
          {INTERACTION_TYPES.map((interactionType) => (
            <option key={interactionType.value} value={interactionType.value}>
              {interactionType.label}
            </option>
          ))}
        </select>
        {selectedInteraction && (
          <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 rounded-md px-2 py-1">
            {selectedInteraction.hint}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>Trigger Time (seconds)</label>
        <input
          type="number"
          min={0}
          value={slide.timestamp_seconds ?? ''}
          onChange={(e) =>
            onUpdate({
              timestamp_seconds:
                e.target.value === '' ? null : Number(e.target.value),
            })
          }
          placeholder="Auto-place if blank"
          className={inputClass}
        />
      </div>

      {interaction && (
        <InteractionRenderer
          interaction={interaction}
          mode="author"
          language="ar"
          onInteractionChange={handleInteractionChange}
          authorImageUrl={slide.image_url ?? null}
        />
      )}
    </div>
  );
}
