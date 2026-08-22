"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Play, RotateCcw } from "lucide-react";
import SimPlayer from "@/components/slides/SimPlayer";
import { OwlCorrect, OwlThinking, OwlWrong } from "@/components/illustrations";
import type { SampleLessonData } from "@/lib/sample-lesson.types";

interface HomepageSamplePreviewProps {
  language: "ar" | "en";
  isRtl: boolean;
}

const COPY = {
  ar: {
    realLesson: "درس حقيقي من آمال",
    subject: "الرياضيات · الصف الأول",
    questionLabel: "جرّب سؤالاً من التدريب",
    correct: "ممتاز! إجابة صحيحة.",
    wrong: "محاولة جيدة. الإجابة الصحيحة موضحة باللون الأخضر.",
    retry: "حاول مرة أخرى",
    continue: "أكمل التدريب",
    fullLesson: "افتح الدرس الكامل",
    unavailable: "الدرس النموذجي غير متاح الآن.",
  },
  en: {
    realLesson: "A real lesson from Amal",
    subject: "Mathematics · Grade 1",
    questionLabel: "Try one Practice question",
    correct: "Excellent! That is correct.",
    wrong: "Good try. The correct answer is highlighted in green.",
    retry: "Try again",
    continue: "Continue Practice",
    fullLesson: "Open full lesson",
    unavailable: "The sample lesson is unavailable right now.",
  },
} as const;

export default function HomepageSamplePreview({
  language,
  isRtl,
}: HomepageSamplePreviewProps) {
  const t = COPY[language];
  const [sample, setSample] = useState<SampleLessonData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sample-lesson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Sample lesson unavailable");
        return response.json() as Promise<SampleLessonData>;
      })
      .then(setSample)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  const question = sample?.practice.questions[0] ?? null;
  const questionView = useMemo(() => {
    if (!question) return null;
    const options = language === "ar" ? question.optionsAr : question.optionsEn;
    const fallbackOptions = options.length ? options : question.optionsAr;
    const correctIndex =
      typeof question.correctOptionIndex === "number"
        ? question.correctOptionIndex
        : question.optionsAr.findIndex((option) => option === question.correctAnswer);
    return {
      prompt: language === "ar" ? question.promptAr : question.promptEn,
      options: fallbackOptions,
      correctIndex,
    };
  }, [language, question]);

  if (failed) {
    return (
      <div className="mx-auto mb-10 max-w-5xl border-y border-gray-200 py-8 text-center sm:mb-14">
        <p className="font-bold text-gray-600">{t.unavailable}</p>
        <Link href="/sample-lesson" className="mt-3 inline-flex font-bold text-emerald-700 hover:underline">
          {t.fullLesson}
        </Link>
      </div>
    );
  }

  if (!sample || !questionView) {
    return (
      <div className="mx-auto mb-10 grid min-h-80 max-w-5xl place-items-center border-y border-gray-200 bg-white sm:mb-14">
        <LoaderCircle className="h-7 w-7 animate-spin text-emerald-700" aria-label="Loading sample lesson" />
      </div>
    );
  }

  const answered = selected !== null;
  const isCorrect = selected === questionView.correctIndex;
  const DirectionIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div className="mx-auto mb-10 max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_20px_55px_rgba(29,59,39,0.14)] sm:mb-14">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-extrabold uppercase text-emerald-800">{t.realLesson}</p>
          <p className="mt-0.5 text-sm font-bold text-gray-600">{t.subject}</p>
        </div>
        <Link
          href="/sample-lesson"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-extrabold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-800"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {t.fullLesson}
        </Link>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
        <div className="min-w-0 bg-[#F7F7F2] p-2 sm:p-4">
          <SimPlayer
            payload={sample.sim}
            language={sample.contentLanguage}
            className="overflow-hidden rounded-lg border border-gray-200 bg-white"
          />
        </div>

        <aside className="flex flex-col border-t border-gray-200 p-5 text-start lg:border-s lg:border-t-0 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 shrink-0">
              {answered ? (
                isCorrect ? (
                  <OwlCorrect className="h-full w-full" />
                ) : (
                  <OwlWrong className="h-full w-full" />
                )
              ) : (
                <OwlThinking className="h-full w-full" />
              )}
            </div>
            <p className="text-xs font-extrabold uppercase text-amber-700">{t.questionLabel}</p>
          </div>

          <h3 className="mt-4 text-xl font-extrabold leading-snug text-gray-950 sm:text-2xl">
            {questionView.prompt}
          </h3>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {questionView.options.map((option, index) => {
              const revealCorrect = answered && index === questionView.correctIndex;
              const revealWrong = answered && selected === index && !revealCorrect;
              return (
                <button
                  key={`${option}-${index}`}
                  type="button"
                  disabled={answered}
                  onClick={() => setSelected(index)}
                  className={`min-h-12 rounded-lg border-2 px-3 text-lg font-extrabold shadow-[0_3px_0_rgba(31,52,38,0.12)] transition-all ${
                    revealCorrect
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                      : revealWrong
                        ? "border-amber-400 bg-amber-50 text-amber-900"
                        : answered
                          ? "border-gray-100 bg-gray-50 text-gray-400"
                          : "border-gray-200 bg-white text-gray-900 hover:-translate-y-0.5 hover:border-emerald-300"
                  }`}
                >
                  {revealCorrect && <Check className="me-1 inline h-4 w-4" aria-hidden="true" />}
                  {option}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className={`mt-4 text-sm font-bold ${isCorrect ? "text-emerald-700" : "text-amber-700"}`} aria-live="polite">
              {isCorrect ? t.correct : t.wrong}
            </div>
          )}

          <div className="mt-auto pt-5">
            {answered && !isCorrect && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="mb-3 inline-flex items-center gap-2 text-sm font-extrabold text-gray-600 hover:text-gray-900"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {t.retry}
              </button>
            )}
            <Link
              href="/sample-lesson?practice=1"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 font-extrabold text-white shadow-md transition-colors hover:bg-emerald-800"
            >
              {t.continue}
              <DirectionIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
