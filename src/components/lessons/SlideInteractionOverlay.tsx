'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import SlideCard from '@/components/slides/SlideCard';
import type { Slide } from '@/lib/slides.types';
import {
  getSlideInteractionPrompt,
  type SlideInteractionResult,
} from '@/lib/slide-interactions';
import { getIncorrectFeedback, getCorrectFeedback } from '@/lib/feedback-messages';
import { useActivitySounds } from '@/hooks/useActivitySounds';
import { ConfettiBurst } from '@/components/illustrations';
import InteractionRenderer from '@/components/interactions/InteractionRenderer';
import { slideToInteraction, answerToLegacy } from '@/lib/interactions/adapters';
import { gradeInteraction } from '@/lib/interactions/grader';
import type { Interaction, InteractionAnswer } from '@/lib/interactions/types';

/**
 * Can the current draft answer be submitted? Guards the submit button so the
 * student can't confirm an empty or partially-filled response for types that
 * require a complete placement.
 */
function draftAnswerIsReady(
  interaction: Interaction,
  answer: InteractionAnswer | null
): boolean {
  if (!answer || answer.type !== interaction.type) return false;
  switch (answer.type) {
    case 'free_response':
      return answer.text.trim().length > 0;
    case 'choose_correct':
      return typeof answer.selected_index === 'number';
    case 'fill_missing_word':
      return (
        typeof answer.selected_index === 'number' ||
        (typeof answer.text === 'string' && answer.text.trim().length > 0)
      );
    case 'true_false':
      return typeof answer.value === 'boolean';
    case 'tap_to_count':
      return typeof answer.count === 'number';
    case 'match_pairs': {
      if (interaction.type !== 'match_pairs') return false;
      const len = Math.max(interaction.items.ar.length, interaction.items.en.length);
      return len > 0 && answer.placements.length === len;
    }
    case 'sequence_order': {
      if (interaction.type !== 'sequence_order') return false;
      const len = Math.max(interaction.items.ar.length, interaction.items.en.length);
      return len > 0 && answer.order.length === len;
    }
    case 'sort_groups': {
      if (interaction.type !== 'sort_groups') return false;
      return (
        interaction.solution_map.length > 0 &&
        answer.placements.length === interaction.solution_map.length
      );
    }
    case 'drag_drop_label': {
      if (interaction.type !== 'drag_drop_label') return false;
      const len = interaction.hotspots.length;
      return len > 0 && answer.placements.length === len;
    }
    case 'draw_answer':
      return answer.image_data_url.trim().length > 0;
  }
}

interface SlideInteractionOverlayProps {
  slide: Slide;
  language: 'ar' | 'en';
  onComplete: (result: SlideInteractionResult) => void;
  badgeLabel?: string;
  headerMeta?: ReactNode;
  secondaryAction?: ReactNode;
  initialFreeResponseAnswer?: string;
  reviewStatus?: 'pending_review' | 'accepted' | 'needs_retry' | null;
  reviewFeedback?: string | null;
}

export default function SlideInteractionOverlay({
  slide,
  language,
  onComplete,
  badgeLabel,
  headerMeta,
  secondaryAction,
  initialFreeResponseAnswer,
  reviewStatus,
  reviewFeedback,
}: SlideInteractionOverlayProps) {
  const isAr = language === 'ar';
  const { playCorrect, playIncorrect, playComplete, playTap } = useActivitySounds();
  const startedAtRef = useRef(0);
  // The typed interaction primitive — drives the renderer and the grader.
  const interaction = useMemo(() => slideToInteraction(slide), [slide]);
  const [draftAnswer, setDraftAnswer] = useState<InteractionAnswer | null>(() =>
    initialFreeResponseAnswer
      ? { type: 'free_response', text: initialFreeResponseAnswer }
      : null
  );
  // Locally-owned UI state for types the renderer doesn't handle yet.
  const [fillBlankAnswer, setFillBlankAnswer] = useState('');
  const [fillBlankChecking, setFillBlankChecking] = useState(false);
  const [tappedIndexes, setTappedIndexes] = useState<number[]>([]);
  const [drawChecking, setDrawChecking] = useState(false);
  // Bumped on retry to force-remount the interaction renderer so widgets with
  // internal state (notably the draw-answer whiteboard) start fresh.
  const [retryKey, setRetryKey] = useState(0);
  const [result, setResult] = useState<SlideInteractionResult | null>(null);

  const text = {
    ar: {
      activity: 'نشاط تفاعلي',
      submit: 'إرسال',
      retry: 'حاول مرة أخرى',
      continue: 'متابعة',
      correct: 'إجابة صحيحة! 🎉',
      incorrect: 'ليست صحيحة بعد',
      tapHint: 'اضغط على كل عنصر حتى تنتهي من العد',
      counting: 'العد التفاعلي',
      trueLabel: 'صح',
      falseLabel: 'خطأ',
      choiceLabel: 'اختر الإجابة الصحيحة',
      freeResponseLabel: 'اكتب إجابتك',
      freeResponsePlaceholder: 'اكتب إجابتك هنا...',
      answerSaved: 'تم حفظ الإجابة',
      countProgress: 'تم الضغط',
      matchLabel: 'صل كل عنصر بما يناسبه',
      sequenceLabel: 'رتب العناصر بالترتيب الصحيح',
      sequenceChosen: 'الترتيب الذي اخترته',
      sortLabel: 'ضع كل عنصر في المجموعة الصحيحة',
      fillBlankLabel: 'اختر الكلمة المناسبة للفراغ',
      fillBlankTypeLabel: 'اكتب الكلمة المناسبة',
      fillBlankPlaceholder: 'اكتب إجابتك هنا...',
      checkingAnswer: 'جارٍ التحقق...',
      selectGroup: 'اختر المجموعة',
      tapToBuild: 'اضغط على العناصر لبناء الترتيب',
      remove: 'إزالة',
      labelImageLabel: 'اسحب كل تسمية إلى المكان الصحيح على الصورة',
    },
    en: {
      activity: 'Interactive Activity',
      submit: 'Submit',
      retry: 'Retry',
      continue: 'Continue',
      correct: 'Correct! 🎉',
      incorrect: 'Not quite yet',
      tapHint: 'Tap every item to complete the count',
      counting: 'Tap to Count',
      trueLabel: 'True',
      falseLabel: 'False',
      choiceLabel: 'Choose the correct answer',
      freeResponseLabel: 'Write your answer',
      freeResponsePlaceholder: 'Write your answer here...',
      answerSaved: 'Answer saved',
      countProgress: 'Tapped',
      matchLabel: 'Match each item to its pair',
      sequenceLabel: 'Put the items in the correct order',
      sequenceChosen: 'Chosen order',
      sortLabel: 'Place each item in the correct group',
      fillBlankLabel: 'Choose the missing word',
      fillBlankTypeLabel: 'Type the missing word',
      fillBlankPlaceholder: 'Type your answer here...',
      checkingAnswer: 'Checking...',
      selectGroup: 'Choose group',
      tapToBuild: 'Tap items to build the order',
      remove: 'Remove',
      labelImageLabel: 'Drag each label to the correct spot on the image',
    },
  }[language];

  const prompt = getSlideInteractionPrompt(slide, language);
  const countTarget = Math.max(1, slide.interaction_count_target ?? 5);
  const countToken = slide.interaction_visual_emoji?.trim() || '🍎';
  const freeResponseLocked = reviewStatus === 'accepted' || reviewStatus === 'pending_review';
  const reviewBanner =
    slide.interaction_type === 'free_response' && (reviewStatus || reviewFeedback)
      ? {
          title:
            reviewStatus === 'accepted'
              ? isAr
                ? 'تم قبول إجابتك'
                : 'Your answer was accepted'
              : reviewStatus === 'needs_retry'
                ? isAr
                  ? 'يرجى إعادة المحاولة بناءً على ملاحظات المعلم'
                  : 'Please try again using your teacher feedback'
                : isAr
                  ? 'إجابتك بانتظار مراجعة المعلم'
                  : 'Your answer is waiting for teacher review',
          className:
            reviewStatus === 'accepted'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : reviewStatus === 'needs_retry'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-sky-200 bg-sky-50 text-sky-800',
        }
      : null;

  useEffect(() => {
    startedAtRef.current = window.performance.now();
  }, []);

  function completeInteraction(
    nextResult: SlideInteractionResult,
    eventTimeStamp?: number
  ) {
    const elapsedSeconds =
      startedAtRef.current > 0 && typeof eventTimeStamp === 'number'
        ? Math.max(1, Math.round((eventTimeStamp - startedAtRef.current) / 1000))
        : undefined;

    setResult({
      ...nextResult,
      timeSpentSeconds: elapsedSeconds,
    });

    if (nextResult.isCorrect) {
      playCorrect();
    } else {
      playIncorrect();
    }
  }

  function retryInteraction() {
    setResult(null);
    setDraftAnswer(null);
    setFillBlankAnswer('');
    setFillBlankChecking(false);
    setTappedIndexes([]);
    setDrawChecking(false);
    setRetryKey((k) => k + 1);
  }

  /**
   * Grade a typed answer via the shared grader, then translate it back to the
   * legacy `SlideInteractionResult` shape that existing callers still use.
   */
  function submitDraftAnswer(
    answer: InteractionAnswer | null,
    eventTimeStamp?: number
  ) {
    if (!interaction || !answer) return;
    const graded = gradeInteraction(interaction, answer);
    const legacy = answerToLegacy(graded.answer);
    completeInteraction(
      {
        answer: legacy,
        completedAt: new Date().toISOString(),
        isCorrect: graded.is_correct,
      },
      eventTimeStamp
    );
  }

  function normalizeFillBlank(value: string) {
    return value
      .trim()
      .toLocaleLowerCase(language === 'ar' ? 'ar' : 'en')
      .replace(/[\s\p{P}]+/gu, ' ')
      .trim();
  }

  async function submitFillBlankFreeEntry(eventTimeStamp?: number) {
    const answer = fillBlankAnswer.trim();
    if (!answer || fillBlankChecking) {
      return;
    }

    const expectedAr = slide.interaction_expected_answer_ar?.trim() || '';
    const expectedEn = slide.interaction_expected_answer_en?.trim() || '';
    const expected = (language === 'ar' ? expectedAr : expectedEn) || expectedAr || expectedEn;

    // Exact (normalized) match first — no server round-trip.
    if (
      expected &&
      normalizeFillBlank(answer) === normalizeFillBlank(expected)
    ) {
      completeInteraction(
        {
          answer,
          completedAt: new Date().toISOString(),
          isCorrect: true,
        },
        eventTimeStamp
      );
      return;
    }

    // AI fallback for close-but-not-exact answers.
    setFillBlankChecking(true);
    try {
      const response = await fetch('/api/lesson-progress/fill-blank-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer,
          expected_ar: expectedAr || undefined,
          expected_en: expectedEn || undefined,
          language,
          prompt_hint: prompt || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { isCorrect?: boolean }
        | null;
      completeInteraction(
        {
          answer,
          completedAt: new Date().toISOString(),
          isCorrect: data?.isCorrect === true,
        },
        eventTimeStamp
      );
    } catch {
      completeInteraction(
        {
          answer,
          completedAt: new Date().toISOString(),
          isCorrect: false,
        },
        eventTimeStamp
      );
    } finally {
      setFillBlankChecking(false);
    }
  }

  async function submitDrawAnswer(dataUrl: string, eventTimeStamp?: number) {
    if (drawChecking || !dataUrl) {
      return;
    }

    setDrawChecking(true);
    try {
      const response = await fetch('/api/lesson-progress/draw-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_data_url: dataUrl,
          expected_ar: slide.interaction_expected_answer_ar?.trim() || undefined,
          expected_en: slide.interaction_expected_answer_en?.trim() || undefined,
          language,
          prompt_hint: prompt || undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { isCorrect?: boolean; feedback?: string }
        | null;
      completeInteraction(
        {
          answer: 'drawing_submitted',
          completedAt: new Date().toISOString(),
          isCorrect: data?.isCorrect === true,
        },
        eventTimeStamp
      );
    } catch {
      completeInteraction(
        {
          answer: 'drawing_submitted',
          completedAt: new Date().toISOString(),
          isCorrect: false,
        },
        eventTimeStamp
      );
    } finally {
      setDrawChecking(false);
    }
  }

  function handleTapCount(index: number, eventTimeStamp?: number) {
    if (result || tappedIndexes.includes(index)) {
      return;
    }

    playTap();
    const nextTapped = [...tappedIndexes, index];
    setTappedIndexes(nextTapped);

    if (nextTapped.length >= countTarget) {
      completeInteraction(
        {
          answer: nextTapped.length,
          completedAt: new Date().toISOString(),
          isCorrect: true,
        },
        eventTimeStamp
      );
    }
  }

  function renderInteractionControls() {
    // Types handled by the shared InteractionRenderer. The renderer owns the
    // input UI and emits typed answers via onAnswerChange; the overlay owns the
    // submit button so we can keep the existing "select then confirm" UX.
    if (
      interaction &&
      (interaction.type === 'free_response' ||
        interaction.type === 'choose_correct' ||
        interaction.type === 'true_false' ||
        interaction.type === 'match_pairs' ||
        interaction.type === 'sort_groups' ||
        interaction.type === 'sequence_order' ||
        interaction.type === 'drag_drop_label' ||
        interaction.type === 'draw_answer' ||
        (interaction.type === 'fill_missing_word' && interaction.free_entry === false))
    ) {
      const isAnswerReady = draftAnswerIsReady(interaction, draftAnswer);
      const isDraw = interaction.type === 'draw_answer';
      return (
        <>
          {interaction.type === 'free_response' && reviewBanner && (
            <div className={`mb-4 rounded-2xl border px-4 py-3 ${reviewBanner.className}`}>
              <p className="text-sm font-semibold">{reviewBanner.title}</p>
              {reviewFeedback && (
                <p className="mt-2 whitespace-pre-wrap text-sm opacity-90">{reviewFeedback}</p>
              )}
            </div>
          )}
          <InteractionRenderer
            key={retryKey}
            interaction={interaction}
            mode="answer"
            language={language}
            answer={draftAnswer}
            onAnswerChange={setDraftAnswer}
            disabled={!!result || freeResponseLocked || drawChecking}
          />
          {!result && !freeResponseLocked && (
            <button
              onClick={(event) => {
                if (isDraw) {
                  const dataUrl =
                    draftAnswer?.type === 'draw_answer' ? draftAnswer.image_data_url : '';
                  submitDrawAnswer(dataUrl, event.timeStamp);
                } else {
                  submitDraftAnswer(draftAnswer, event.timeStamp);
                }
              }}
              disabled={!isAnswerReady || drawChecking}
              className="mt-4 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {isDraw && drawChecking ? text.checkingAnswer : text.submit}
            </button>
          )}
        </>
      );
    }
    if (
      slide.interaction_type === 'fill_missing_word' &&
      slide.interaction_free_entry === true
    ) {
      return (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {text.fillBlankTypeLabel}
          </p>
          <input
            type="text"
            dir={isAr ? 'rtl' : 'ltr'}
            value={fillBlankAnswer}
            onChange={(event) => setFillBlankAnswer(event.target.value)}
            disabled={!!result || fillBlankChecking}
            placeholder={text.fillBlankPlaceholder}
            className={`w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-800 focus:border-[#007229] focus:outline-none ${isAr ? 'font-cairo text-right' : 'font-inter'}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitFillBlankFreeEntry(event.timeStamp);
              }
            }}
          />
          {!result && (
            <button
              onClick={(event) => submitFillBlankFreeEntry(event.timeStamp)}
              disabled={!fillBlankAnswer.trim() || fillBlankChecking}
              className="mt-4 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {fillBlankChecking ? text.checkingAnswer : text.submit}
            </button>
          )}
        </>
      );
    }

    if (slide.interaction_type === 'tap_to_count') {
      return (
        <>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {text.tapHint}
          </p>
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: countTarget }).map((_, index) => {
              const tapped = tappedIndexes.includes(index);

              return (
                <button
                  key={`${slide.id}-tap-${index}`}
                  onClick={(event) => handleTapCount(index, event.timeStamp)}
                  disabled={tapped || !!result}
                  className={`flex aspect-square items-center justify-center rounded-2xl border-2 text-3xl transition-all ${
                    tapped
                      ? 'border-[#007229] bg-[#007229]/10 scale-95'
                      : 'border-amber-200 bg-white hover:border-amber-400 hover:bg-amber-50'
                  }`}
                >
                  <span className={tapped ? 'opacity-50' : ''}>{countToken}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-gray-600">
            {text.countProgress}: {tappedIndexes.length} / {countTarget}
          </p>
        </>
      );
    }

    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 p-4">
      <div
        dir={isAr ? 'rtl' : 'ltr'}
        className="mx-auto flex h-full max-w-6xl flex-col justify-center gap-4"
      >
        <div className="rounded-3xl bg-white p-4 shadow-2xl sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] text-[#007229] ${isAr ? 'font-cairo' : ''}`}>
                {text.activity}
              </p>
              <h2 className={`mt-1 text-xl font-bold text-gray-900 ${isAr ? 'font-cairo' : 'font-fredoka'}`}>
                {isAr ? slide.title_ar : slide.title_en}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {headerMeta}
              <div className="rounded-full bg-[#007229]/10 px-3 py-1 text-xs font-semibold text-[#007229]">
                {badgeLabel || (slide.interaction_type === 'tap_to_count' ? text.counting : text.activity)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="self-start overflow-hidden rounded-2xl bg-gray-100">
              <SlideCard slide={slide} language={language} />
            </div>

            <div className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className={`mb-4 text-sm text-gray-700 ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {prompt}
              </p>

              {renderInteractionControls()}

              {!result && secondaryAction}

              {result && (
                <div
                  key={result.isCorrect ? 'correct' : `incorrect-${Date.now()}`}
                  className={`relative mt-4 overflow-hidden rounded-2xl border p-4 ${
                    result.isCorrect
                      ? 'border-green-300 bg-green-50'
                      : 'border-amber-300 bg-amber-50 animate-shake'
                  }`}
                >
                  {result.isCorrect && (
                    <ConfettiBurst className="absolute -top-2 -right-2 h-16 w-16 opacity-90 pointer-events-none" />
                  )}
                  <p className={`text-sm font-semibold ${result.isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
                    {slide.interaction_type === 'free_response'
                      ? text.answerSaved
                      : result.isCorrect
                        ? getCorrectFeedback(language)
                        : getIncorrectFeedback(language)}
                  </p>
                  {result.isCorrect ? (
                    <button
                      onClick={() => { playComplete(); onComplete(result); }}
                      className="mt-3 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white"
                    >
                      {text.continue}
                    </button>
                  ) : (
                    <button
                      onClick={retryInteraction}
                      className="mt-3 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white"
                    >
                      {text.retry}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
