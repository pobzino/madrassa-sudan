'use client';

/**
 * Single dispatching renderer for every interaction on the platform.
 *
 * Modes
 * -----
 * - `answer`: student-facing input UI. Delegates drag-based types to the
 *   existing per-type components under components/lessons/interactions/
 *   (MatchPairsDnD, SortGroupsDnD, SequenceOrderDnD, DragDropLabelDnD) and
 *   inlines the simpler types (MCQ, true/false, counts, free response).
 * - `author`: teacher-facing editor for an Interaction. Emits a fully-typed
 *   next Interaction via `onInteractionChange`. Callers convert it back to
 *   their storage shape (for slides, via `interactionToSlide`).
 * - `present` / `review`: not yet implemented.
 *
 * `draw_answer` in answer mode is still rendered by SlideInteractionOverlay
 * because it owns the whiteboard + vision grading flow.
 */

import { useMemo, useRef, useState } from 'react';
import MatchPairsDnD from '@/components/lessons/interactions/MatchPairsDnD';
import SortGroupsDnD from '@/components/lessons/interactions/SortGroupsDnD';
import SequenceOrderDnD from '@/components/lessons/interactions/SequenceOrderDnD';
import DragDropLabelDnD from '@/components/lessons/interactions/DragDropLabelDnD';
import DrawAnswerInput from './DrawAnswerInput';
import type {
  Interaction,
  InteractionAnswer,
  BilingualList,
  Placement,
} from '@/lib/interactions/types';
import type { SlideInteractionHotspot } from '@/lib/slides.types';

export type InteractionRenderMode = 'answer' | 'author' | 'present' | 'review';

interface InteractionRendererProps {
  interaction: Interaction;
  mode: InteractionRenderMode;
  language: 'ar' | 'en';
  /** Seed answer (for resuming / review / replay). */
  answer?: InteractionAnswer | null;
  /** Called on every draft change. */
  onAnswerChange?: (answer: InteractionAnswer) => void;
  /** Called on explicit submit, carries the final answer. */
  onSubmit?: (answer: InteractionAnswer) => void;
  /** Called when the interaction definition is edited (author mode only). */
  onInteractionChange?: (next: Interaction) => void;
  /**
   * Slide image URL for author-mode drag_drop_label positioning. Only used
   * when mode is "author" and interaction.type is "drag_drop_label".
   */
  authorImageUrl?: string | null;
  disabled?: boolean;
}

function pickLangList(list: BilingualList, language: 'ar' | 'en'): string[] {
  return list[language]?.length ? list[language] : list[language === 'ar' ? 'en' : 'ar'] || [];
}

function placementsToRecord(placements: Placement[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of placements) out[p.item_index] = p.target_index;
  return out;
}

function recordToPlacements(record: Record<number, number>): Placement[] {
  return Object.entries(record).map(([item, target]) => ({
    item_index: Number(item),
    target_index: Number(target),
  }));
}

export default function InteractionRenderer({
  interaction,
  mode,
  language,
  answer,
  onAnswerChange,
  onSubmit,
  onInteractionChange,
  authorImageUrl,
  disabled = false,
}: InteractionRendererProps) {
  if (mode === 'author') {
    if (!onInteractionChange) {
      return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
          Author mode requires `onInteractionChange`.
        </div>
      );
    }
    return (
      <AuthorMode
        interaction={interaction}
        onInteractionChange={onInteractionChange}
        imageUrl={authorImageUrl ?? null}
      />
    );
  }

  if (mode !== 'answer') {
    // present / review arrive in a later phase.
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
        Interaction mode "{mode}" is not implemented yet.
      </div>
    );
  }

  return (
    <AnswerMode
      interaction={interaction}
      language={language}
      answer={answer ?? null}
      onAnswerChange={onAnswerChange}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}

function AnswerMode({
  interaction,
  language,
  answer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  interaction: Interaction;
  language: 'ar' | 'en';
  answer: InteractionAnswer | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  onSubmit?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  const isAr = language === 'ar';
  const prompt = interaction.prompt[language] || interaction.prompt[isAr ? 'en' : 'ar'];

  switch (interaction.type) {
    case 'free_response':
      return (
        <FreeResponseAnswer
          prompt={prompt}
          isAr={isAr}
          answer={answer?.type === 'free_response' ? answer : null}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    case 'choose_correct':
    case 'fill_missing_word':
      return (
        <ChoiceAnswer
          interaction={interaction}
          language={language}
          answer={answer}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    case 'true_false':
      return (
        <TrueFalseAnswer
          prompt={prompt}
          isAr={isAr}
          answer={answer?.type === 'true_false' ? answer : null}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    case 'tap_to_count':
      return (
        <TapToCountAnswer
          prompt={prompt}
          emoji={interaction.emoji}
          isAr={isAr}
          answer={answer?.type === 'tap_to_count' ? answer : null}
          onAnswerChange={onAnswerChange}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    case 'match_pairs': {
      const items = pickLangList(interaction.items, language);
      const targets = pickLangList(interaction.targets, language);
      const selections =
        answer?.type === 'match_pairs' ? placementsToRecord(answer.placements) : {};
      return (
        <MatchPairsDnD
          items={items}
          targets={targets}
          selections={selections}
          onSelectionsChange={(next) => {
            const nextAnswer: InteractionAnswer = {
              type: 'match_pairs',
              placements: recordToPlacements(next),
            };
            onAnswerChange?.(nextAnswer);
          }}
          disabled={disabled}
          isAr={isAr}
        />
      );
    }

    case 'sort_groups': {
      const items = pickLangList(interaction.items, language);
      const groups = pickLangList(interaction.targets, language);
      const selections =
        answer?.type === 'sort_groups' ? placementsToRecord(answer.placements) : {};
      return (
        <SortGroupsDnD
          items={items}
          groups={groups}
          selections={selections}
          onSelectionsChange={(next) => {
            onAnswerChange?.({
              type: 'sort_groups',
              placements: recordToPlacements(next),
            });
          }}
          disabled={disabled}
          isAr={isAr}
        />
      );
    }

    case 'sequence_order':
      return (
        <SequenceAnswer
          interaction={interaction}
          language={language}
          answer={answer?.type === 'sequence_order' ? answer : null}
          onAnswerChange={onAnswerChange}
          disabled={disabled}
        />
      );

    case 'drag_drop_label': {
      const labels = pickLangList(interaction.labels, language);
      const selections: Record<number, number> = {};
      if (answer?.type === 'drag_drop_label') {
        for (const p of answer.placements) selections[p.label_index] = p.hotspot_index;
      }
      return (
        <DragDropLabelDnD
          imageUrl={interaction.image_url}
          items={labels}
          hotspots={interaction.hotspots}
          selections={selections}
          onSelectionsChange={(next) => {
            onAnswerChange?.({
              type: 'drag_drop_label',
              placements: Object.entries(next).map(([label, hotspot]) => ({
                label_index: Number(label),
                hotspot_index: Number(hotspot),
              })),
            });
          }}
          disabled={disabled}
          isAr={isAr}
        />
      );
    }

    case 'draw_answer':
      return (
        <DrawAnswerInput
          language={language}
          answer={answer?.type === 'draw_answer' ? answer : null}
          onAnswerChange={onAnswerChange}
          disabled={disabled}
        />
      );
  }
}

// ── Inline per-type answer components ────────────────────────────────────

function FreeResponseAnswer({
  prompt,
  isAr,
  answer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  prompt: string;
  isAr: boolean;
  answer: Extract<InteractionAnswer, { type: 'free_response' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  onSubmit?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  // Fully controlled by the `answer` prop so sim replay (where the parent
  // streams new answers on every `activity_answer` event) reflects the
  // teacher's typed text in real time. The sim-lab and student-side widget
  // both pass a draft answer back down; there's no need for local state.
  const text = answer?.text ?? '';

  return (
    <div className="space-y-3">
      <p className={`text-sm text-gray-700 ${isAr ? 'font-cairo text-right' : 'font-inter'}`}>
        {prompt}
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          onAnswerChange?.({ type: 'free_response', text: e.target.value });
        }}
        disabled={disabled}
        className={`w-full rounded-2xl border-2 border-gray-200 bg-white p-3 text-sm focus:border-[#007229] focus:outline-none disabled:bg-gray-50 ${
          isAr ? 'font-cairo text-right' : 'font-inter'
        }`}
        rows={4}
        dir={isAr ? 'rtl' : 'ltr'}
      />
      {onSubmit && !disabled && (
        <button
          type="button"
          onClick={() => onSubmit({ type: 'free_response', text })}
          disabled={text.trim().length === 0}
          className="w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isAr ? 'إرسال' : 'Submit'}
        </button>
      )}
    </div>
  );
}

function ChoiceAnswer({
  interaction,
  language,
  answer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  interaction: Extract<
    Interaction,
    { type: 'choose_correct' | 'fill_missing_word' }
  >;
  language: 'ar' | 'en';
  answer: InteractionAnswer | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  onSubmit?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  const isAr = language === 'ar';
  const freeEntry =
    interaction.type === 'fill_missing_word' && interaction.free_entry === true;
  const options = freeEntry
    ? []
    : interaction.options
      ? pickLangList(interaction.options, language)
      : [];

  const [text, setText] = useState(
    answer && answer.type === 'fill_missing_word' && typeof answer.text === 'string'
      ? answer.text
      : ''
  );
  const selected =
    answer && 'selected_index' in answer && typeof answer.selected_index === 'number'
      ? answer.selected_index
      : null;

  if (freeEntry) {
    return (
      <div className="space-y-3">
        <p className={`text-sm text-gray-700 ${isAr ? 'font-cairo text-right' : 'font-inter'}`}>
          {interaction.prompt[language] || interaction.prompt[isAr ? 'en' : 'ar']}
        </p>
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onAnswerChange?.({ type: 'fill_missing_word', text: e.target.value });
          }}
          disabled={disabled}
          className={`w-full rounded-2xl border-2 border-gray-200 bg-white p-3 text-sm focus:border-[#007229] focus:outline-none disabled:bg-gray-50 ${
            isAr ? 'font-cairo text-right' : 'font-inter'
          }`}
          dir={isAr ? 'rtl' : 'ltr'}
        />
        {onSubmit && !disabled && (
          <button
            type="button"
            onClick={() => onSubmit({ type: 'fill_missing_word', text })}
            disabled={text.trim().length === 0}
            className="w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {isAr ? 'إرسال' : 'Submit'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className={`text-sm text-gray-700 ${isAr ? 'font-cairo text-right' : 'font-inter'}`}>
        {interaction.prompt[language] || interaction.prompt[isAr ? 'en' : 'ar']}
      </p>
      <div className="grid gap-2">
        {options.map((option, index) => {
          const isSelected = selected === index;
          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                const nextAnswer: InteractionAnswer =
                  interaction.type === 'choose_correct'
                    ? { type: 'choose_correct', selected_index: index }
                    : { type: 'fill_missing_word', selected_index: index };
                onAnswerChange?.(nextAnswer);
                onSubmit?.(nextAnswer);
              }}
              disabled={disabled}
              className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                isSelected
                  ? 'border-[#007229] bg-[#007229]/10 text-[#007229]'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-[#007229]'
              } ${isAr ? 'font-cairo text-right' : 'font-inter'} ${
                disabled ? 'opacity-60' : ''
              }`}
              dir={isAr ? 'rtl' : 'ltr'}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TrueFalseAnswer({
  prompt,
  isAr,
  answer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  prompt: string;
  isAr: boolean;
  answer: Extract<InteractionAnswer, { type: 'true_false' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  onSubmit?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className={`text-sm text-gray-700 ${isAr ? 'font-cairo text-right' : 'font-inter'}`}>
        {prompt}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((value) => {
          const isSelected = answer?.value === value;
          return (
            <button
              key={String(value)}
              type="button"
              onClick={() => {
                const next: InteractionAnswer = { type: 'true_false', value };
                onAnswerChange?.(next);
                onSubmit?.(next);
              }}
              disabled={disabled}
              className={`rounded-2xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                isSelected
                  ? 'border-[#007229] bg-[#007229]/10 text-[#007229]'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-[#007229]'
              } ${disabled ? 'opacity-60' : ''}`}
            >
              {value ? (isAr ? 'صح' : 'True') : isAr ? 'خطأ' : 'False'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TapToCountAnswer({
  prompt,
  emoji,
  isAr,
  answer,
  onAnswerChange,
  onSubmit,
  disabled,
}: {
  prompt: string;
  emoji: string;
  isAr: boolean;
  answer: Extract<InteractionAnswer, { type: 'tap_to_count' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  onSubmit?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  const count = answer?.count ?? 0;

  return (
    <div className="space-y-3">
      <p className={`text-sm text-gray-700 ${isAr ? 'font-cairo text-right' : 'font-inter'}`}>
        {prompt}
      </p>
      <div className="flex items-center justify-between rounded-2xl border-2 border-gray-200 bg-white p-4">
        <button
          type="button"
          disabled={disabled || count === 0}
          onClick={() => {
            const next: InteractionAnswer = { type: 'tap_to_count', count: count - 1 };
            onAnswerChange?.(next);
          }}
          className="rounded-full bg-gray-100 px-3 py-1 text-lg font-bold text-gray-700 disabled:opacity-40"
        >
          −
        </button>
        <span className="text-4xl tabular-nums">{emoji.repeat(Math.max(0, count))}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next: InteractionAnswer = { type: 'tap_to_count', count: count + 1 };
            onAnswerChange?.(next);
          }}
          className="rounded-full bg-[#007229] px-3 py-1 text-lg font-bold text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
      {onSubmit && !disabled && (
        <button
          type="button"
          onClick={() => onSubmit({ type: 'tap_to_count', count })}
          className="w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white"
        >
          {isAr ? 'إرسال' : 'Submit'}
        </button>
      )}
    </div>
  );
}

function SequenceAnswer({
  interaction,
  language,
  answer,
  onAnswerChange,
  disabled,
}: {
  interaction: Extract<Interaction, { type: 'sequence_order' }>;
  language: 'ar' | 'en';
  answer: Extract<InteractionAnswer, { type: 'sequence_order' }> | null;
  onAnswerChange?: (answer: InteractionAnswer) => void;
  disabled: boolean;
}) {
  const isAr = language === 'ar';
  const labels = pickLangList(interaction.items, language);

  const items = useMemo(() => {
    const order =
      answer?.order && answer.order.length === labels.length
        ? answer.order
        : labels.map((_, i) => i);
    return order.map((originalIndex) => ({
      index: originalIndex,
      label: labels[originalIndex] ?? '',
    }));
  }, [answer, labels]);

  return (
    <SequenceOrderDnD
      items={items}
      onOrderChange={(ordered) => {
        onAnswerChange?.({
          type: 'sequence_order',
          order: ordered.map((id) => Number(id)),
        });
      }}
      disabled={disabled}
      isAr={isAr}
    />
  );
}

// ── Author mode ──────────────────────────────────────────────────────────

const authorInputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#007229] focus:border-[#007229]';
const authorLabelClass = 'block text-xs font-medium text-gray-600 mb-1';

function padStrings(values: string[] | undefined, targetLength: number): string[] {
  return Array.from({ length: targetLength }, (_, i) => values?.[i] ?? '');
}

function defaultGroupLabel(lang: 'ar' | 'en', index: number): string {
  return lang === 'ar' ? `المجموعة ${index + 1}` : `Group ${index + 1}`;
}

function LangToggle({
  value,
  onChange,
}: {
  value: 'ar' | 'en';
  onChange: (next: 'ar' | 'en') => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => onChange('ar')}
        className={`px-2 py-0.5 text-[10px] font-medium rounded ${
          value === 'ar'
            ? 'bg-[#007229] text-white'
            : 'bg-white text-gray-600 border border-gray-200'
        }`}
      >
        عربي
      </button>
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`px-2 py-0.5 text-[10px] font-medium rounded ${
          value === 'en'
            ? 'bg-[#007229] text-white'
            : 'bg-white text-gray-600 border border-gray-200'
        }`}
      >
        EN
      </button>
    </div>
  );
}

function PromptFields({
  prompt,
  onChange,
}: {
  prompt: { ar: string; en: string };
  onChange: (next: { ar: string; en: string }) => void;
}) {
  return (
    <>
      <div>
        <label className={authorLabelClass}>Prompt (Arabic)</label>
        <textarea
          dir="rtl"
          value={prompt.ar}
          onChange={(e) => onChange({ ...prompt, ar: e.target.value })}
          rows={2}
          className={`${authorInputClass} font-cairo`}
          placeholder="Defaults to slide body if left blank"
        />
      </div>
      <div>
        <label className={authorLabelClass}>Prompt (English)</label>
        <textarea
          value={prompt.en}
          onChange={(e) => onChange({ ...prompt, en: e.target.value })}
          rows={2}
          className={authorInputClass}
          placeholder="Defaults to slide body if left blank"
        />
      </div>
    </>
  );
}

function AuthorMode({
  interaction,
  onInteractionChange,
  imageUrl,
}: {
  interaction: Interaction;
  onInteractionChange: (next: Interaction) => void;
  imageUrl: string | null;
}) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');

  const setPrompt = (prompt: { ar: string; en: string }) => {
    onInteractionChange({ ...interaction, prompt });
  };

  return (
    <div className="space-y-3">
      <PromptFields prompt={interaction.prompt} onChange={setPrompt} />

      {interaction.type === 'free_response' && (
        <FreeResponseAuthor
          interaction={interaction}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'draw_answer' && (
        <DrawAnswerAuthor
          interaction={interaction}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'fill_missing_word' && (
        <FillMissingWordAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'choose_correct' && (
        <ChoiceAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'true_false' && (
        <TrueFalseAuthor
          interaction={interaction}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'tap_to_count' && (
        <TapToCountAuthor
          interaction={interaction}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'match_pairs' && (
        <MatchPairsAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'sequence_order' && (
        <SequenceAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'sort_groups' && (
        <SortGroupsAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          onChange={onInteractionChange}
        />
      )}

      {interaction.type === 'drag_drop_label' && (
        <DragDropLabelAuthor
          interaction={interaction}
          lang={lang}
          onLangChange={setLang}
          imageUrl={imageUrl}
          onChange={onInteractionChange}
        />
      )}
    </div>
  );
}

// ── Per-type author editors ──────────────────────────────────────────────

function FreeResponseAuthor({
  interaction,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'free_response' }>;
  onChange: (next: Interaction) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <label className={authorLabelClass}>Model Answer (Arabic)</label>
        <textarea
          dir="rtl"
          value={interaction.expected_answer.ar}
          onChange={(e) =>
            onChange({
              ...interaction,
              expected_answer: { ...interaction.expected_answer, ar: e.target.value },
            })
          }
          rows={3}
          className={`${authorInputClass} font-cairo`}
          placeholder="Used for presenter answer reveal"
        />
      </div>
      <div>
        <label className={authorLabelClass}>Model Answer (English)</label>
        <textarea
          value={interaction.expected_answer.en}
          onChange={(e) =>
            onChange({
              ...interaction,
              expected_answer: { ...interaction.expected_answer, en: e.target.value },
            })
          }
          rows={3}
          className={authorInputClass}
          placeholder="Used for presenter answer reveal"
        />
      </div>
    </div>
  );
}

function DrawAnswerAuthor({
  interaction,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'draw_answer' }>;
  onChange: (next: Interaction) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
        Describe what a correct drawing must show. The vision grader uses
        this to judge the student&apos;s submission.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={authorLabelClass}>Expected Drawing (Arabic)</label>
          <textarea
            dir="rtl"
            value={interaction.expected_answer.ar}
            onChange={(e) =>
              onChange({
                ...interaction,
                expected_answer: { ...interaction.expected_answer, ar: e.target.value },
              })
            }
            rows={3}
            className={`${authorInputClass} font-cairo`}
            placeholder="مثال: رسم شمس ومنزل وشجرة"
          />
        </div>
        <div>
          <label className={authorLabelClass}>Expected Drawing (English)</label>
          <textarea
            value={interaction.expected_answer.en}
            onChange={(e) =>
              onChange({
                ...interaction,
                expected_answer: { ...interaction.expected_answer, en: e.target.value },
              })
            }
            rows={3}
            className={authorInputClass}
            placeholder="e.g. a sun, a house, and a tree"
          />
        </div>
      </div>
    </div>
  );
}

function FillMissingWordAuthor({
  interaction,
  lang,
  onLangChange,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'fill_missing_word' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (next: Interaction) => void;
}) {
  const setMode = (freeEntry: boolean) => {
    if (freeEntry) {
      onChange({
        type: 'fill_missing_word',
        prompt: interaction.prompt,
        free_entry: true,
        expected_answer:
          interaction.expected_answer ?? { ar: '', en: '' },
      });
    } else {
      onChange({
        type: 'fill_missing_word',
        prompt: interaction.prompt,
        free_entry: false,
        options: interaction.options ?? { ar: ['', '', ''], en: ['', '', ''] },
        correct_index: interaction.correct_index ?? 0,
      });
    }
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <label className={authorLabelClass}>Answer Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode(false)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              !interaction.free_entry
                ? 'border-[#007229] bg-green-50 text-[#007229]'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            Multiple Choice
          </button>
          <button
            type="button"
            onClick={() => setMode(true)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              interaction.free_entry
                ? 'border-[#007229] bg-green-50 text-[#007229]'
                : 'border-gray-200 bg-white text-gray-600'
            }`}
          >
            Type the Answer
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {interaction.free_entry
            ? 'Students type the missing word. Exact matches are auto-accepted; close answers get an AI check.'
            : 'Students pick from 2–4 given word choices.'}
        </p>
      </div>

      {interaction.free_entry ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={authorLabelClass}>Expected Answer (Arabic)</label>
            <input
              dir="rtl"
              value={interaction.expected_answer?.ar ?? ''}
              onChange={(e) =>
                onChange({
                  ...interaction,
                  expected_answer: {
                    ar: e.target.value,
                    en: interaction.expected_answer?.en ?? '',
                  },
                })
              }
              className={`${authorInputClass} font-cairo`}
              placeholder="الكلمة الصحيحة"
            />
          </div>
          <div>
            <label className={authorLabelClass}>Expected Answer (English)</label>
            <input
              value={interaction.expected_answer?.en ?? ''}
              onChange={(e) =>
                onChange({
                  ...interaction,
                  expected_answer: {
                    ar: interaction.expected_answer?.ar ?? '',
                    en: e.target.value,
                  },
                })
              }
              className={authorInputClass}
              placeholder="correct word"
            />
          </div>
        </div>
      ) : (
        <OptionsEditor
          label="Word Options"
          options={interaction.options ?? { ar: [], en: [] }}
          correctIndex={interaction.correct_index ?? 0}
          lang={lang}
          onLangChange={onLangChange}
          onChange={(options, correctIndex) =>
            onChange({
              ...interaction,
              options,
              correct_index: correctIndex,
            })
          }
        />
      )}
    </>
  );
}

function ChoiceAuthor({
  interaction,
  lang,
  onLangChange,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'choose_correct' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (next: Interaction) => void;
}) {
  return (
    <OptionsEditor
      label="Answer Choices"
      options={interaction.options}
      correctIndex={interaction.correct_index}
      lang={lang}
      onLangChange={onLangChange}
      onChange={(options, correctIndex) =>
        onChange({
          ...interaction,
          options,
          correct_index: correctIndex,
        })
      }
    />
  );
}

function OptionsEditor({
  label,
  options,
  correctIndex,
  lang,
  onLangChange,
  onChange,
}: {
  label: string;
  options: BilingualList;
  correctIndex: number;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (options: BilingualList, correctIndex: number) => void;
}) {
  const langList = lang === 'ar' ? options.ar : options.en;
  const count = Math.max(options.ar.length, options.en.length);

  const updateAt = (index: number, value: string) => {
    const nextAr = padStrings(options.ar, Math.max(count, index + 1));
    const nextEn = padStrings(options.en, Math.max(count, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ar: nextAr, en: nextEn }, correctIndex);
  };

  const add = () => {
    onChange(
      { ar: [...options.ar, ''], en: [...options.en, ''] },
      correctIndex
    );
  };

  const remove = (index: number) => {
    const nextAr = options.ar.filter((_, i) => i !== index);
    const nextEn = options.en.filter((_, i) => i !== index);
    const nextLen = Math.max(nextAr.length, nextEn.length);
    if (nextLen < 2) return;
    let nextCorrect = correctIndex;
    if (correctIndex === index) nextCorrect = 0;
    else if (correctIndex > index) nextCorrect = correctIndex - 1;
    nextCorrect = Math.min(nextCorrect, nextLen - 1);
    onChange({ ar: nextAr, en: nextEn }, nextCorrect);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className={authorLabelClass}>{label}</label>
        <LangToggle value={lang} onChange={onLangChange} />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: Math.max(count, 2) }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(options, index)}
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                correctIndex === index
                  ? 'border-[#007229] bg-[#007229] text-white'
                  : 'border-gray-300 text-gray-500 bg-white'
              }`}
              title="Mark correct choice"
            >
              {index + 1}
            </button>
            <input
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              value={langList[index] ?? ''}
              onChange={(e) => updateAt(index, e.target.value)}
              className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
              placeholder={`Choice ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={count <= 2}
              className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
              title="Remove choice"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-1.5 w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
      >
        + Add Choice
      </button>
    </div>
  );
}

function TrueFalseAuthor({
  interaction,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'true_false' }>;
  onChange: (next: Interaction) => void;
}) {
  return (
    <div>
      <label className={authorLabelClass}>Correct Answer</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...interaction, answer: true })}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            interaction.answer
              ? 'border-[#007229] bg-green-50 text-[#007229]'
              : 'border-gray-200 bg-white text-gray-600'
          }`}
        >
          True
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...interaction, answer: false })}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            !interaction.answer
              ? 'border-[#D21034] bg-red-50 text-[#D21034]'
              : 'border-gray-200 bg-white text-gray-600'
          }`}
        >
          False
        </button>
      </div>
    </div>
  );
}

function TapToCountAuthor({
  interaction,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'tap_to_count' }>;
  onChange: (next: Interaction) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={authorLabelClass}>Target Count</label>
        <input
          type="number"
          min={1}
          max={12}
          value={interaction.target}
          onChange={(e) =>
            onChange({ ...interaction, target: Number(e.target.value) || 1 })
          }
          className={authorInputClass}
        />
      </div>
      <div>
        <label className={authorLabelClass}>Visual Token</label>
        <input
          value={interaction.emoji}
          onChange={(e) =>
            onChange({ ...interaction, emoji: e.target.value })
          }
          className={authorInputClass}
          placeholder="🍎"
        />
      </div>
    </div>
  );
}

function MatchPairsAuthor({
  interaction,
  lang,
  onLangChange,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'match_pairs' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (next: Interaction) => void;
}) {
  const count = Math.max(
    interaction.items.ar.length,
    interaction.items.en.length,
    interaction.targets.ar.length,
    interaction.targets.en.length,
    2
  );

  const updateItem = (index: number, value: string) => {
    const nextAr = padStrings(interaction.items.ar, Math.max(count, index + 1));
    const nextEn = padStrings(interaction.items.en, Math.max(count, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, items: { ar: nextAr, en: nextEn } });
  };

  const updateTarget = (index: number, value: string) => {
    const nextAr = padStrings(interaction.targets.ar, Math.max(count, index + 1));
    const nextEn = padStrings(interaction.targets.en, Math.max(count, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, targets: { ar: nextAr, en: nextEn } });
  };

  const add = () => {
    onChange({
      ...interaction,
      items: {
        ar: [...interaction.items.ar, ''],
        en: [...interaction.items.en, ''],
      },
      targets: {
        ar: [...interaction.targets.ar, ''],
        en: [...interaction.targets.en, ''],
      },
    });
  };

  const remove = (index: number) => {
    if (count <= 2) return;
    onChange({
      ...interaction,
      items: {
        ar: interaction.items.ar.filter((_, i) => i !== index),
        en: interaction.items.en.filter((_, i) => i !== index),
      },
      targets: {
        ar: interaction.targets.ar.filter((_, i) => i !== index),
        en: interaction.targets.en.filter((_, i) => i !== index),
      },
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={authorLabelClass}>Pairs (matching is row to row)</label>
        <LangToggle value={lang} onChange={onLangChange} />
      </div>

      <div className="space-y-1.5">
        {Array.from({ length: count }).map((_, index) => {
          const itemVal =
            (lang === 'ar' ? interaction.items.ar : interaction.items.en)[index] ?? '';
          const targetVal =
            (lang === 'ar' ? interaction.targets.ar : interaction.targets.en)[index] ?? '';
          return (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-2 items-center"
            >
              <input
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                value={itemVal}
                onChange={(e) => updateItem(index, e.target.value)}
                className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
                placeholder={`Item ${index + 1}`}
              />
              <span className="text-xs text-gray-400">↔</span>
              <input
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                value={targetVal}
                onChange={(e) => updateTarget(index, e.target.value)}
                className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
                placeholder={`Match ${index + 1}`}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={count <= 2}
                className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
      >
        + Add Pair
      </button>
    </div>
  );
}

function SequenceAuthor({
  interaction,
  lang,
  onLangChange,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'sequence_order' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (next: Interaction) => void;
}) {
  const count = Math.max(
    interaction.items.ar.length,
    interaction.items.en.length,
    2
  );

  const updateItem = (index: number, value: string) => {
    const nextAr = padStrings(interaction.items.ar, Math.max(count, index + 1));
    const nextEn = padStrings(interaction.items.en, Math.max(count, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, items: { ar: nextAr, en: nextEn } });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= count) return;
    const nextAr = [...interaction.items.ar];
    const nextEn = [...interaction.items.en];
    const [movedAr] = nextAr.splice(from, 1);
    const [movedEn] = nextEn.splice(from, 1);
    nextAr.splice(to, 0, movedAr);
    nextEn.splice(to, 0, movedEn);
    onChange({ ...interaction, items: { ar: nextAr, en: nextEn } });
  };

  const add = () => {
    onChange({
      ...interaction,
      items: {
        ar: [...interaction.items.ar, ''],
        en: [...interaction.items.en, ''],
      },
    });
  };

  const remove = (index: number) => {
    if (count <= 2) return;
    onChange({
      ...interaction,
      items: {
        ar: interaction.items.ar.filter((_, i) => i !== index),
        en: interaction.items.en.filter((_, i) => i !== index),
      },
    });
  };

  const langItems = lang === 'ar' ? interaction.items.ar : interaction.items.en;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={authorLabelClass}>Correct Order (top to bottom)</label>
        <LangToggle value={lang} onChange={onLangChange} />
      </div>

      <div className="space-y-1.5">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === count - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-[10px] leading-none"
              >
                ▼
              </button>
            </div>
            <input
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              value={langItems[index] ?? ''}
              onChange={(e) => updateItem(index, e.target.value)}
              className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
              placeholder={`Step ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={count <= 2}
              className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
      >
        + Add Step
      </button>
    </div>
  );
}

function SortGroupsAuthor({
  interaction,
  lang,
  onLangChange,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'sort_groups' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  onChange: (next: Interaction) => void;
}) {
  const itemCount = Math.max(
    interaction.items.ar.length,
    interaction.items.en.length,
    2
  );
  const targetCount = Math.max(
    interaction.targets.ar.length,
    interaction.targets.en.length,
    2
  );

  const updateItem = (index: number, value: string) => {
    const nextAr = padStrings(interaction.items.ar, Math.max(itemCount, index + 1));
    const nextEn = padStrings(interaction.items.en, Math.max(itemCount, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, items: { ar: nextAr, en: nextEn } });
  };

  const updateTarget = (index: number, value: string) => {
    const nextAr = padStrings(interaction.targets.ar, Math.max(targetCount, index + 1));
    const nextEn = padStrings(interaction.targets.en, Math.max(targetCount, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, targets: { ar: nextAr, en: nextEn } });
  };

  const addBucket = () => {
    const nextIdx = targetCount;
    onChange({
      ...interaction,
      targets: {
        ar: [...interaction.targets.ar, defaultGroupLabel('ar', nextIdx)],
        en: [...interaction.targets.en, defaultGroupLabel('en', nextIdx)],
      },
    });
  };

  const removeBucket = (index: number) => {
    if (targetCount <= 2) return;
    const nextSolutionMap = interaction.solution_map.map((t) => {
      if (t === index) return 0;
      if (t > index) return t - 1;
      return t;
    });
    onChange({
      ...interaction,
      targets: {
        ar: interaction.targets.ar.filter((_, i) => i !== index),
        en: interaction.targets.en.filter((_, i) => i !== index),
      },
      solution_map: nextSolutionMap,
    });
  };

  const addItem = () => {
    onChange({
      ...interaction,
      items: {
        ar: [...interaction.items.ar, ''],
        en: [...interaction.items.en, ''],
      },
      solution_map: [...interaction.solution_map, 0],
    });
  };

  const removeItem = (index: number) => {
    if (itemCount <= 2) return;
    onChange({
      ...interaction,
      items: {
        ar: interaction.items.ar.filter((_, i) => i !== index),
        en: interaction.items.en.filter((_, i) => i !== index),
      },
      solution_map: interaction.solution_map.filter((_, i) => i !== index),
    });
  };

  const setSolution = (itemIdx: number, targetIdx: number) => {
    const next = [...interaction.solution_map];
    next[itemIdx] = targetIdx;
    onChange({ ...interaction, solution_map: next });
  };

  const langItems = lang === 'ar' ? interaction.items.ar : interaction.items.en;
  const langTargets =
    lang === 'ar' ? interaction.targets.ar : interaction.targets.en;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className={authorLabelClass}>Groups and Items</label>
        <LangToggle value={lang} onChange={onLangChange} />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Buckets
        </p>
        {Array.from({ length: targetCount }).map((_, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              value={langTargets[index] ?? ''}
              onChange={(e) => updateTarget(index, e.target.value)}
              className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
              placeholder={defaultGroupLabel(lang, index)}
            />
            <button
              type="button"
              onClick={() => removeBucket(index)}
              disabled={targetCount <= 2}
              className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addBucket}
          className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
        >
          + Add Bucket
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
          Items to Sort
        </p>
        {Array.from({ length: itemCount }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(0,1fr)_160px_auto] gap-2 items-center"
          >
            <input
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              value={langItems[index] ?? ''}
              onChange={(e) => updateItem(index, e.target.value)}
              className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
              placeholder={`Item ${index + 1}`}
            />
            <select
              value={interaction.solution_map[index] ?? 0}
              onChange={(e) => setSolution(index, Number(e.target.value))}
              className={authorInputClass}
            >
              {Array.from({ length: targetCount }).map((_, tIdx) => (
                <option key={tIdx} value={tIdx}>
                  {langTargets[tIdx] || defaultGroupLabel(lang, tIdx)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeItem(index)}
              disabled={itemCount <= 2}
              className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}

function DragDropLabelAuthor({
  interaction,
  lang,
  onLangChange,
  imageUrl,
  onChange,
}: {
  interaction: Extract<Interaction, { type: 'drag_drop_label' }>;
  lang: 'ar' | 'en';
  onLangChange: (next: 'ar' | 'en') => void;
  imageUrl: string | null;
  onChange: (next: Interaction) => void;
}) {
  const [activeHotspotIndex, setActiveHotspotIndex] = useState<number | null>(null);
  const imageRef = useRef<HTMLDivElement | null>(null);
  const effectiveImageUrl = imageUrl ?? interaction.image_url ?? null;

  const count = Math.max(
    interaction.labels.ar.length,
    interaction.labels.en.length,
    interaction.hotspots.length,
    2
  );

  const updateLabel = (index: number, value: string) => {
    const nextAr = padStrings(interaction.labels.ar, Math.max(count, index + 1));
    const nextEn = padStrings(interaction.labels.en, Math.max(count, index + 1));
    if (lang === 'ar') nextAr[index] = value;
    else nextEn[index] = value;
    onChange({ ...interaction, labels: { ar: nextAr, en: nextEn } });
  };

  const updateHotspot = (index: number, next: SlideInteractionHotspot) => {
    const existing = interaction.hotspots;
    const nextList = Array.from(
      { length: Math.max(existing.length, index + 1) },
      (_, i) => (i === index ? next : existing[i] || { x_percent: 50, y_percent: 50 })
    );
    onChange({ ...interaction, hotspots: nextList });
  };

  const addLabel = () => {
    const existingCount = Math.max(
      interaction.labels.ar.length,
      interaction.labels.en.length
    );
    onChange({
      ...interaction,
      labels: {
        ar: [...interaction.labels.ar, ''],
        en: [...interaction.labels.en, ''],
      },
      hotspots: [
        ...interaction.hotspots,
        {
          x_percent: 20 + (existingCount % 4) * 20,
          y_percent: 30 + Math.floor(existingCount / 4) * 25,
        },
      ],
    });
  };

  const removeLabel = (index: number) => {
    if (count <= 2) return;
    onChange({
      ...interaction,
      labels: {
        ar: interaction.labels.ar.filter((_, i) => i !== index),
        en: interaction.labels.en.filter((_, i) => i !== index),
      },
      hotspots: interaction.hotspots.filter((_, i) => i !== index),
    });
  };

  const langLabels = lang === 'ar' ? interaction.labels.ar : interaction.labels.en;

  return (
    <div className="space-y-3">
      <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
        Set the slide image above, then click on the preview to place a spot
        for each label. Students drag the matching label onto each spot.
      </p>

      <div
        ref={imageRef}
        onClick={(event) => {
          if (activeHotspotIndex === null) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x_percent = Math.max(
            0,
            Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)
          );
          const y_percent = Math.max(
            0,
            Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)
          );
          updateHotspot(activeHotspotIndex, { x_percent, y_percent });
          setActiveHotspotIndex(null);
        }}
        className={`relative aspect-video w-full overflow-hidden rounded-lg border-2 ${
          activeHotspotIndex !== null
            ? 'cursor-crosshair border-amber-400 ring-2 ring-amber-200'
            : 'border-gray-200'
        }`}
        style={{
          backgroundColor: '#f3f4f6',
          backgroundImage: effectiveImageUrl ? `url(${effectiveImageUrl})` : undefined,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      >
        {!effectiveImageUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Add a slide image to position labels
          </div>
        )}
        {interaction.hotspots.map((hotspot, index) => (
          <div
            key={index}
            className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-bold shadow ${
              activeHotspotIndex === index
                ? 'border-amber-500 bg-amber-100 text-amber-900'
                : 'border-[#007229] bg-white text-[#007229]'
            }`}
            style={{
              left: `${hotspot.x_percent}%`,
              top: `${hotspot.y_percent}%`,
            }}
          >
            {index + 1}
          </div>
        ))}
        {activeHotspotIndex !== null && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-amber-500 px-2 py-1 text-center text-[11px] font-semibold text-white">
            Click to place label {activeHotspotIndex + 1}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className={authorLabelClass}>Labels</label>
          <LangToggle value={lang} onChange={onLangChange} />
        </div>

        <div className="space-y-1.5">
          {Array.from({ length: count }).map((_, index) => {
            const hotspot = interaction.hotspots[index];
            return (
              <div
                key={index}
                className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-2"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#007229] bg-white text-[11px] font-bold text-[#007229]">
                  {index + 1}
                </span>
                <input
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  value={langLabels[index] ?? ''}
                  onChange={(e) => updateLabel(index, e.target.value)}
                  className={`${authorInputClass} ${lang === 'ar' ? 'font-cairo' : ''}`}
                  placeholder={`Label ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setActiveHotspotIndex(
                      activeHotspotIndex === index ? null : index
                    )
                  }
                  className={`flex-shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium ${
                    activeHotspotIndex === index
                      ? 'border-amber-500 bg-amber-100 text-amber-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-amber-400'
                  }`}
                  title={
                    hotspot
                      ? `x ${hotspot.x_percent.toFixed(0)}%, y ${hotspot.y_percent.toFixed(0)}%`
                      : 'Place on image'
                  }
                >
                  {activeHotspotIndex === index ? 'Click image…' : 'Place'}
                </button>
                <button
                  type="button"
                  onClick={() => removeLabel(index)}
                  disabled={count <= 2}
                  className="flex-shrink-0 w-6 h-6 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 rounded hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addLabel}
          className="mt-1.5 w-full py-1.5 text-xs font-medium text-[#007229] border border-dashed border-[#007229]/30 rounded-lg hover:bg-green-50 transition-colors"
        >
          + Add Label
        </button>
      </div>
    </div>
  );
}
