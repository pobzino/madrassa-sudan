'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SlideCard from '@/components/slides/SlideCard';
import type { Slide } from '@/lib/slides.types';
import {
  getSlideInteractionOptions,
  getSlideInteractionPrompt,
  type SlideInteractionResult,
} from '@/lib/slide-interactions';

interface SlideInteractionOverlayProps {
  slide: Slide;
  language: 'ar' | 'en';
  onComplete: (result: SlideInteractionResult) => void;
}

export default function SlideInteractionOverlay({
  slide,
  language,
  onComplete,
}: SlideInteractionOverlayProps) {
  const isAr = language === 'ar';
  const startedAtRef = useRef(0);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [selectedTrueFalse, setSelectedTrueFalse] = useState<boolean | null>(null);
  const [tappedIndexes, setTappedIndexes] = useState<number[]>([]);
  const [result, setResult] = useState<SlideInteractionResult | null>(null);

  const text = {
    ar: {
      activity: 'نشاط تفاعلي',
      submit: 'إرسال',
      continue: 'متابعة',
      correct: 'إجابة صحيحة! 🎉',
      incorrect: 'ليست صحيحة بعد',
      tapHint: 'اضغط على كل عنصر حتى تنتهي من العد',
      counting: 'العد التفاعلي',
      trueLabel: 'صح',
      falseLabel: 'خطأ',
      choiceLabel: 'اختر الإجابة الصحيحة',
      countProgress: 'تم الضغط',
    },
    en: {
      activity: 'Interactive Activity',
      submit: 'Submit',
      continue: 'Continue',
      correct: 'Correct! 🎉',
      incorrect: 'Not quite yet',
      tapHint: 'Tap every item to complete the count',
      counting: 'Tap to Count',
      trueLabel: 'True',
      falseLabel: 'False',
      choiceLabel: 'Choose the correct answer',
      countProgress: 'Tapped',
    },
  }[language];

  const prompt = getSlideInteractionPrompt(slide, language);
  const choiceOptions = useMemo(() => getSlideInteractionOptions(slide, language), [slide, language]);
  const countTarget = Math.max(1, slide.interaction_count_target ?? 5);
  const countToken = slide.interaction_visual_emoji?.trim() || '🍎';

  useEffect(() => {
    startedAtRef.current = window.performance.now();
  }, []);

  function completeInteraction(nextResult: SlideInteractionResult, eventTimeStamp?: number) {
    const elapsedSeconds =
      startedAtRef.current > 0 && typeof eventTimeStamp === 'number'
        ? Math.max(1, Math.round((eventTimeStamp - startedAtRef.current) / 1000))
        : undefined;

    setResult({
      ...nextResult,
      timeSpentSeconds: elapsedSeconds,
    });
  }

  function submitChoice(eventTimeStamp?: number) {
    if (selectedChoiceIndex === null) {
      return;
    }

    completeInteraction({
      answer: selectedChoiceIndex,
      completedAt: new Date().toISOString(),
      isCorrect: selectedChoiceIndex === slide.interaction_correct_index,
    }, eventTimeStamp);
  }

  function submitTrueFalse(eventTimeStamp?: number) {
    if (selectedTrueFalse === null) {
      return;
    }

    completeInteraction({
      answer: selectedTrueFalse,
      completedAt: new Date().toISOString(),
      isCorrect: selectedTrueFalse === slide.interaction_true_false_answer,
    }, eventTimeStamp);
  }

  function handleTapCount(index: number, eventTimeStamp?: number) {
    if (result || tappedIndexes.includes(index)) {
      return;
    }

    const nextTapped = [...tappedIndexes, index];
    setTappedIndexes(nextTapped);

    if (nextTapped.length >= countTarget) {
      completeInteraction({
        answer: nextTapped.length,
        completedAt: new Date().toISOString(),
        isCorrect: true,
      }, eventTimeStamp);
    }
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
            <div className="rounded-full bg-[#007229]/10 px-3 py-1 text-xs font-semibold text-[#007229]">
              {slide.interaction_type === 'tap_to_count' ? text.counting : text.activity}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="overflow-hidden rounded-2xl bg-gray-100">
              <SlideCard slide={slide} language={language} />
            </div>

            <div className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className={`mb-4 text-sm text-gray-700 ${isAr ? 'font-cairo' : 'font-inter'}`}>
                {prompt}
              </p>

              {slide.interaction_type === 'choose_correct' && (
                <>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {text.choiceLabel}
                  </p>
                  <div className="space-y-2">
                    {choiceOptions.map((option, index) => (
                      <button
                        key={`${slide.id}-choice-${index}`}
                        onClick={() => setSelectedChoiceIndex(index)}
                        disabled={!!result}
                        className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition-colors ${
                          selectedChoiceIndex === index
                            ? 'border-[#007229] bg-[#007229]/8 text-[#007229]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-[#007229]/35'
                        } ${isAr ? 'font-cairo' : 'font-inter'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {!result && (
                    <button
                      onClick={(event) => submitChoice(event.timeStamp)}
                      disabled={selectedChoiceIndex === null}
                      className="mt-4 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {text.submit}
                    </button>
                  )}
                </>
              )}

              {slide.interaction_type === 'true_false' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedTrueFalse(true)}
                      disabled={!!result}
                      className={`rounded-2xl border-2 px-4 py-5 text-sm font-bold transition-colors ${
                        selectedTrueFalse === true
                          ? 'border-[#007229] bg-[#007229]/8 text-[#007229]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#007229]/35'
                      }`}
                    >
                      {text.trueLabel}
                    </button>
                    <button
                      onClick={() => setSelectedTrueFalse(false)}
                      disabled={!!result}
                      className={`rounded-2xl border-2 px-4 py-5 text-sm font-bold transition-colors ${
                        selectedTrueFalse === false
                          ? 'border-[#D21034] bg-[#D21034]/8 text-[#D21034]'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-[#D21034]/35'
                      }`}
                    >
                      {text.falseLabel}
                    </button>
                  </div>
                  {!result && (
                    <button
                      onClick={(event) => submitTrueFalse(event.timeStamp)}
                      disabled={selectedTrueFalse === null}
                      className="mt-4 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      {text.submit}
                    </button>
                  )}
                </>
              )}

              {slide.interaction_type === 'tap_to_count' && (
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
              )}

              {result && (
                <div className={`mt-4 rounded-2xl border p-4 ${result.isCorrect ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
                  <p className={`text-sm font-semibold ${result.isCorrect ? 'text-green-700' : 'text-amber-700'}`}>
                    {result.isCorrect ? text.correct : text.incorrect}
                  </p>
                  <button
                    onClick={() => onComplete(result)}
                    className="mt-3 w-full rounded-2xl bg-[#007229] px-4 py-3 text-sm font-semibold text-white"
                  >
                    {text.continue}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
