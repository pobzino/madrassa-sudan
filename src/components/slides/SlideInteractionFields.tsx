'use client';

import { useMemo, useState } from 'react';
import type { Slide, SlideInteractionType } from '@/lib/slides.types';

interface SlideInteractionFieldsProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
}

const INTERACTION_TYPES: Array<{ value: SlideInteractionType; label: string; hint: string }> = [
  { value: 'choose_correct', label: 'Multiple Choice', hint: 'Vocabulary & comprehension checks' },
  { value: 'true_false', label: 'True / False', hint: 'Quick fact review' },
  { value: 'fill_missing_word', label: 'Fill the Blank', hint: 'Sentence completion & grammar' },
  { value: 'tap_to_count', label: 'Tap to Count', hint: 'Early math & counting practice' },
  { value: 'match_pairs', label: 'Match Pairs', hint: 'Link terms to definitions' },
  { value: 'sequence_order', label: 'Put in Order', hint: 'Steps, timelines & processes' },
  { value: 'sort_groups', label: 'Sort Into Groups', hint: 'Classification & categorization' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

function padValues(values: string[] | null | undefined, targetLength: number) {
  return Array.from({ length: targetLength }, (_, index) => values?.[index] || '');
}

function getDefaultGroupLabel(language: 'ar' | 'en', index: number) {
  return language === 'ar' ? `المجموعة ${index + 1}` : `Group ${index + 1}`;
}

export default function SlideInteractionFields({
  slide,
  onUpdate,
}: SlideInteractionFieldsProps) {
  const [interactionLang, setInteractionLang] = useState<'ar' | 'en'>('ar');

  const interactionOptions = useMemo(
    () =>
      interactionLang === 'ar'
        ? slide.interaction_options_ar || []
        : slide.interaction_options_en || [],
    [
      interactionLang,
      slide.interaction_options_ar,
      slide.interaction_options_en,
    ]
  );

  const interactionItems = useMemo(
    () =>
      interactionLang === 'ar'
        ? slide.interaction_items_ar || []
        : slide.interaction_items_en || [],
    [interactionLang, slide.interaction_items_ar, slide.interaction_items_en]
  );

  const interactionTargets = useMemo(
    () =>
      interactionLang === 'ar'
        ? slide.interaction_targets_ar || []
        : slide.interaction_targets_en || [],
    [interactionLang, slide.interaction_targets_ar, slide.interaction_targets_en]
  );

  function setInteractionType(nextType: SlideInteractionType | '') {
    if (!nextType) {
      onUpdate({
        activity_id: null,
        interaction_type: null,
        interaction_prompt_ar: null,
        interaction_prompt_en: null,
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
      });
      return;
    }

    const baseUpdates: Partial<Slide> = {
      activity_id: slide.activity_id ?? crypto.randomUUID(),
      interaction_type: nextType,
      interaction_prompt_ar: slide.interaction_prompt_ar ?? slide.body_ar ?? '',
      interaction_prompt_en: slide.interaction_prompt_en ?? slide.body_en ?? '',
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
    };

    if (nextType === 'choose_correct' || nextType === 'fill_missing_word') {
      baseUpdates.interaction_options_ar = slide.interaction_options_ar?.length
        ? slide.interaction_options_ar
        : ['', '', ''];
      baseUpdates.interaction_options_en = slide.interaction_options_en?.length
        ? slide.interaction_options_en
        : ['', '', ''];
      baseUpdates.interaction_correct_index = slide.interaction_correct_index ?? 0;
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

      baseUpdates.interaction_items_ar = padValues(
        slide.interaction_items_ar,
        itemLength
      );
      baseUpdates.interaction_items_en = padValues(
        slide.interaction_items_en,
        itemLength
      );
      baseUpdates.interaction_targets_ar = padValues(
        slide.interaction_targets_ar,
        targetLength
      ).map((value, index) => value || getDefaultGroupLabel('ar', index));
      baseUpdates.interaction_targets_en = padValues(
        slide.interaction_targets_en,
        targetLength
      ).map((value, index) => value || getDefaultGroupLabel('en', index));
      baseUpdates.interaction_solution_map =
        slide.interaction_solution_map?.length === itemLength
          ? slide.interaction_solution_map
          : Array.from({ length: itemLength }, (_, index) =>
              Math.min(index, targetLength - 1)
            );
    }

    onUpdate(baseUpdates);
  }

  function updateOption(index: number, value: string) {
    const next = padValues(interactionOptions, Math.max(interactionOptions.length, index + 1));
    next[index] = value;
    onUpdate(
      interactionLang === 'ar'
        ? { interaction_options_ar: next }
        : { interaction_options_en: next }
    );
  }

  function addOption() {
    onUpdate({
      interaction_options_ar: [...(slide.interaction_options_ar || []), ''],
      interaction_options_en: [...(slide.interaction_options_en || []), ''],
    });
  }

  function removeOption(index: number) {
    const nextAr = (slide.interaction_options_ar || []).filter(
      (_, itemIndex) => itemIndex !== index
    );
    const nextEn = (slide.interaction_options_en || []).filter(
      (_, itemIndex) => itemIndex !== index
    );
    const nextLength = Math.max(nextAr.length, nextEn.length);
    if (nextLength < 2) return;

    onUpdate({
      interaction_options_ar: nextAr,
      interaction_options_en: nextEn,
      interaction_correct_index:
        slide.interaction_correct_index == null
          ? 0
          : slide.interaction_correct_index === index
            ? 0
            : slide.interaction_correct_index > index
              ? slide.interaction_correct_index - 1
              : Math.min(slide.interaction_correct_index, nextLength - 1),
    });
  }

  function updateItem(index: number, value: string) {
    const next = padValues(
      interactionItems,
      Math.max(interactionItems.length, index + 1)
    );
    next[index] = value;

    onUpdate(
      interactionLang === 'ar'
        ? { interaction_items_ar: next }
        : { interaction_items_en: next }
    );
  }

  function updateTarget(index: number, value: string) {
    const next = padValues(
      interactionTargets,
      Math.max(interactionTargets.length, index + 1)
    );
    next[index] = value;

    onUpdate(
      interactionLang === 'ar'
        ? { interaction_targets_ar: next }
        : { interaction_targets_en: next }
    );
  }

  function addMatchPair() {
    onUpdate({
      interaction_items_ar: [...(slide.interaction_items_ar || []), ''],
      interaction_items_en: [...(slide.interaction_items_en || []), ''],
      interaction_targets_ar: [...(slide.interaction_targets_ar || []), ''],
      interaction_targets_en: [...(slide.interaction_targets_en || []), ''],
    });
  }

  function removeMatchPair(index: number) {
    const nextLength = Math.max(
      (slide.interaction_items_ar?.length ?? 0) - 1,
      (slide.interaction_items_en?.length ?? 0) - 1
    );
    if (nextLength < 2) return;

    onUpdate({
      interaction_items_ar: (slide.interaction_items_ar || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_items_en: (slide.interaction_items_en || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_targets_ar: (slide.interaction_targets_ar || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_targets_en: (slide.interaction_targets_en || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    });
  }

  function moveSequenceItem(from: number, to: number) {
    if (to < 0 || to >= interactionItems.length) return;

    const nextAr = [...(slide.interaction_items_ar || [])];
    const nextEn = [...(slide.interaction_items_en || [])];
    const [movedAr] = nextAr.splice(from, 1);
    const [movedEn] = nextEn.splice(from, 1);
    nextAr.splice(to, 0, movedAr);
    nextEn.splice(to, 0, movedEn);

    onUpdate({
      interaction_items_ar: nextAr,
      interaction_items_en: nextEn,
    });
  }

  function addSequenceItem() {
    onUpdate({
      interaction_items_ar: [...(slide.interaction_items_ar || []), ''],
      interaction_items_en: [...(slide.interaction_items_en || []), ''],
    });
  }

  function removeSequenceItem(index: number) {
    const nextLength = Math.max(
      (slide.interaction_items_ar?.length ?? 0) - 1,
      (slide.interaction_items_en?.length ?? 0) - 1
    );
    if (nextLength < 2) return;

    onUpdate({
      interaction_items_ar: (slide.interaction_items_ar || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_items_en: (slide.interaction_items_en || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    });
  }

  function addSortBucket() {
    const nextBucketIndex = Math.max(
      slide.interaction_targets_ar?.length ?? 0,
      slide.interaction_targets_en?.length ?? 0
    );
    onUpdate({
      interaction_targets_ar: [
        ...(slide.interaction_targets_ar || []),
        getDefaultGroupLabel('ar', nextBucketIndex),
      ],
      interaction_targets_en: [
        ...(slide.interaction_targets_en || []),
        getDefaultGroupLabel('en', nextBucketIndex),
      ],
    });
  }

  function removeSortBucket(index: number) {
    const nextBucketCount = Math.max(
      (slide.interaction_targets_ar?.length ?? 0) - 1,
      (slide.interaction_targets_en?.length ?? 0) - 1
    );
    if (nextBucketCount < 2) return;

    const nextSolutionMap = (slide.interaction_solution_map || []).map((targetIndex) => {
      if (targetIndex === index) return 0;
      if (targetIndex > index) return targetIndex - 1;
      return targetIndex;
    });

    onUpdate({
      interaction_targets_ar: (slide.interaction_targets_ar || []).filter(
        (_, targetIndex) => targetIndex !== index
      ),
      interaction_targets_en: (slide.interaction_targets_en || []).filter(
        (_, targetIndex) => targetIndex !== index
      ),
      interaction_solution_map: nextSolutionMap,
    });
  }

  function addSortItem() {
    onUpdate({
      interaction_items_ar: [...(slide.interaction_items_ar || []), ''],
      interaction_items_en: [...(slide.interaction_items_en || []), ''],
      interaction_solution_map: [...(slide.interaction_solution_map || []), 0],
    });
  }

  function removeSortItem(index: number) {
    const nextLength = Math.max(
      (slide.interaction_items_ar?.length ?? 0) - 1,
      (slide.interaction_items_en?.length ?? 0) - 1
    );
    if (nextLength < 2) return;

    onUpdate({
      interaction_items_ar: (slide.interaction_items_ar || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_items_en: (slide.interaction_items_en || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
      interaction_solution_map: (slide.interaction_solution_map || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    });
  }

  function updateSortGroup(itemIndex: number, targetIndex: number) {
    const next = [...(slide.interaction_solution_map || [])];
    next[itemIndex] = targetIndex;
    onUpdate({ interaction_solution_map: next });
  }

  const pairedItemRows = Math.max(interactionItems.length, interactionTargets.length, 2);
  const sortSolutionMap = slide.interaction_solution_map || [];

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

      {slide.interaction_type && (
        <>
          <div>
            <label className={labelClass}>Prompt (Arabic)</label>
            <textarea
              dir="rtl"
              value={slide.interaction_prompt_ar || ''}
              onChange={(e) =>
                onUpdate({ interaction_prompt_ar: e.target.value })
              }
              rows={2}
              className={`${inputClass} font-cairo`}
              placeholder="Defaults to slide body if left blank"
            />
          </div>

          <div>
            <label className={labelClass}>Prompt (English)</label>
            <textarea
              value={slide.interaction_prompt_en || ''}
              onChange={(e) =>
                onUpdate({ interaction_prompt_en: e.target.value })
              }
              rows={2}
              className={inputClass}
              placeholder="Defaults to slide body if left blank"
            />
          </div>

          {(slide.interaction_type === 'choose_correct' ||
            slide.interaction_type === 'fill_missing_word') && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className={labelClass}>
                  {slide.interaction_type === 'fill_missing_word'
                    ? 'Word Options'
                    : 'Answer Choices'}
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setInteractionLang('ar')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'ar'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    عربي
                  </button>
                  <button
                    onClick={() => setInteractionLang('en')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'en'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {interactionOptions.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onUpdate({ interaction_correct_index: index })
                      }
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                        slide.interaction_correct_index === index
                          ? 'border-[#007229] bg-[#007229] text-white'
                          : 'border-gray-300 text-gray-500 bg-white'
                      }`}
                      title="Mark correct choice"
                    >
                      {index + 1}
                    </button>
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      className={`${inputClass} ${
                        interactionLang === 'ar' ? 'font-cairo' : ''
                      }`}
                      placeholder={`Choice ${index + 1}`}
                    />
                    <button
                      onClick={() => removeOption(index)}
                      disabled={interactionOptions.length <= 2}
                      className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                      title="Remove choice"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addOption}
                className="mt-1.5 w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
              >
                + Add Choice
              </button>
            </div>
          )}

          {slide.interaction_type === 'true_false' && (
            <div>
              <label className={labelClass}>Correct Answer</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    onUpdate({ interaction_true_false_answer: true })
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    slide.interaction_true_false_answer === true
                      ? 'border-[#007229] bg-green-50 text-[#007229]'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  True
                </button>
                <button
                  onClick={() =>
                    onUpdate({ interaction_true_false_answer: false })
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    slide.interaction_true_false_answer === false
                      ? 'border-[#D21034] bg-red-50 text-[#D21034]'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  False
                </button>
              </div>
            </div>
          )}

          {slide.interaction_type === 'tap_to_count' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Target Count</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={slide.interaction_count_target ?? 5}
                  onChange={(e) =>
                    onUpdate({
                      interaction_count_target: Number(e.target.value) || 1,
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Visual Token</label>
                <input
                  value={slide.interaction_visual_emoji || '🍎'}
                  onChange={(e) =>
                    onUpdate({ interaction_visual_emoji: e.target.value })
                  }
                  className={inputClass}
                  placeholder="🍎"
                />
              </div>
            </div>
          )}

          {slide.interaction_type === 'match_pairs' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Pairs (matching is row to row)</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setInteractionLang('ar')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'ar'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    عربي
                  </button>
                  <button
                    onClick={() => setInteractionLang('en')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'en'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {Array.from({ length: pairedItemRows }).map((_, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-2 items-center">
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={interactionItems[index] || ''}
                      onChange={(e) => updateItem(index, e.target.value)}
                      className={`${inputClass} ${interactionLang === 'ar' ? 'font-cairo' : ''}`}
                      placeholder={`Item ${index + 1}`}
                    />
                    <span className="text-xs text-gray-400">↔</span>
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={interactionTargets[index] || ''}
                      onChange={(e) => updateTarget(index, e.target.value)}
                      className={`${inputClass} ${interactionLang === 'ar' ? 'font-cairo' : ''}`}
                      placeholder={`Match ${index + 1}`}
                    />
                    <button
                      onClick={() => removeMatchPair(index)}
                      disabled={pairedItemRows <= 2}
                      className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addMatchPair}
                className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
              >
                + Add Pair
              </button>
            </div>
          )}

          {slide.interaction_type === 'sequence_order' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Correct Order (top to bottom)</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setInteractionLang('ar')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'ar'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    عربي
                  </button>
                  <button
                    onClick={() => setInteractionLang('en')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'en'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {interactionItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveSequenceItem(index, index - 1)}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveSequenceItem(index, index + 1)}
                        disabled={index === interactionItems.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
                      >
                        ▼
                      </button>
                    </div>
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                      className={`${inputClass} ${interactionLang === 'ar' ? 'font-cairo' : ''}`}
                      placeholder={`Step ${index + 1}`}
                    />
                    <button
                      onClick={() => removeSequenceItem(index)}
                      disabled={interactionItems.length <= 2}
                      className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addSequenceItem}
                className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
              >
                + Add Step
              </button>
            </div>
          )}

          {slide.interaction_type === 'sort_groups' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className={labelClass}>Groups and Items</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setInteractionLang('ar')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'ar'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    عربي
                  </button>
                  <button
                    onClick={() => setInteractionLang('en')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded ${
                      interactionLang === 'en'
                        ? 'bg-[#007229] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    EN
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Buckets
                </p>
                {interactionTargets.map((target, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={target}
                      onChange={(e) => updateTarget(index, e.target.value)}
                      className={`${inputClass} ${interactionLang === 'ar' ? 'font-cairo' : ''}`}
                      placeholder={getDefaultGroupLabel(interactionLang, index)}
                    />
                    <button
                      onClick={() => removeSortBucket(index)}
                      disabled={interactionTargets.length <= 2}
                      className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={addSortBucket}
                  className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
                >
                  + Add Bucket
                </button>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  Items to Sort
                </p>
                {interactionItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_160px_auto] gap-2 items-center">
                    <input
                      dir={interactionLang === 'ar' ? 'rtl' : 'ltr'}
                      value={item}
                      onChange={(e) => updateItem(index, e.target.value)}
                      className={`${inputClass} ${interactionLang === 'ar' ? 'font-cairo' : ''}`}
                      placeholder={`Item ${index + 1}`}
                    />
                    <select
                      value={sortSolutionMap[index] ?? 0}
                      onChange={(e) =>
                        updateSortGroup(index, Number(e.target.value))
                      }
                      className={inputClass}
                    >
                      {interactionTargets.map((target, targetIndex) => (
                        <option key={targetIndex} value={targetIndex}>
                          {target || getDefaultGroupLabel(interactionLang, targetIndex)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeSortItem(index)}
                      disabled={interactionItems.length <= 2}
                      className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={addSortItem}
                  className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
                >
                  + Add Item
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
