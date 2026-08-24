"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Globe2,
  Play,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { MadrassaLogo, OwlCelebrating } from "@/components/illustrations";
import SimPlayer from "@/components/slides/SimPlayer";
import PracticePlayer, {
  type PracticeQuestionInput,
} from "@/components/practice/PracticePlayer";
import type { SampleLessonData } from "@/lib/sample-lesson.types";
import { trackAnalyticsEvent } from "@/lib/analytics";

type SampleStage = "lesson" | "practice" | "complete";

const COPY = {
  ar: {
    sample: "درس حقيقي من مدرسة آمال",
    noSignup: "بدون تسجيل حساب",
    back: "الرئيسية",
    lesson: "الدرس",
    practice: "التدريب",
    complete: "النتيجة",
    recordedIn: "هذا الدرس مسجل بالعربية",
    slides: (count: number) => `${count} شريحة`,
    activities: (count: number) => `${count} أنشطة تفاعلية`,
    minutes: (count: number) => `${count} دقائق`,
    ready: "يمكنك مشاهدة الدرس أو الانتقال مباشرة إلى التدريب.",
    startPractice: "ابدأ التدريب",
    replay: "أعد مشاهدة الدرس",
    completeTitle: "أكملت الدرس والتدريب!",
    completeBody:
      "هذا هو نفس المسار الذي يراه طلاب مدرسة آمال: شرح مسجل، أنشطة أثناء الدرس، ثم تدريب من 10 أسئلة.",
    signup: "أنشئ حساباً مجانياً",
    home: "العودة للرئيسية",
    finish: "شاهد النتيجة",
  },
  en: {
    sample: "A real lesson from Amal School",
    noSignup: "No signup required",
    back: "Home",
    lesson: "Lesson",
    practice: "Practice",
    complete: "Result",
    recordedIn: "This lesson is recorded in Arabic",
    slides: (count: number) => `${count} slides`,
    activities: (count: number) => `${count} interactive activities`,
    minutes: (count: number) => `${count} minutes`,
    ready: "Watch the lesson or jump straight into Practice.",
    startPractice: "Start Practice",
    replay: "Replay lesson",
    completeTitle: "You completed the lesson and Practice!",
    completeBody:
      "This is the same flow Amal School students use: a recorded explanation, activities during the lesson, then a 10-question Practice.",
    signup: "Create a free account",
    home: "Back to homepage",
    finish: "See result",
  },
} as const;

const TRUE_FALSE = {
  ar: [
    { value: "true", label: "صحيح" },
    { value: "false", label: "خطأ" },
  ],
  en: [
    { value: "true", label: "True" },
    { value: "false", label: "False" },
  ],
} as const;

function minutes(ms: number) {
  return Math.max(1, Math.round(ms / 60_000));
}

export default function SampleLessonExperience({
  data,
  startInPractice = false,
}: {
  data: SampleLessonData;
  startInPractice?: boolean;
}) {
  const { language, setLanguage, isRtl } = useLanguage();
  const t = COPY[language];
  const [stage, setStage] = useState<SampleStage>(startInPractice ? "practice" : "lesson");
  const [practiceRound, setPracticeRound] = useState(0);
  const autoAdvancedRef = useRef(false);

  const title = language === "ar" ? data.lesson.titleAr : data.lesson.titleEn;
  const description =
    language === "ar" ? data.lesson.descriptionAr : data.lesson.descriptionEn;
  const subject = language === "ar" ? data.lesson.subjectAr : data.lesson.subjectEn;

  const practiceQuestions = useMemo<PracticeQuestionInput[]>(
    () =>
      data.practice.questions.map((question) => {
        const prompt = language === "ar" ? question.promptAr : question.promptEn;
        const audioUrl = language === "ar" ? question.audioUrlAr : question.audioUrlEn;

        if (question.type === "true_false") {
          const labels = TRUE_FALSE[language];
          const correctIndex =
            typeof question.correctOptionIndex === "number"
              ? question.correctOptionIndex
              : question.correctAnswer === "false" || question.correctAnswer === "خطأ"
                ? 1
                : 0;
          return {
            id: question.id,
            type: question.type,
            prompt,
            options: labels.map((item) => item.label),
            correctAnswer: labels[correctIndex]?.label ?? labels[0].label,
            audioUrl,
          };
        }

        if (question.type === "short_answer") {
          return {
            id: question.id,
            type: question.type,
            prompt,
            options: [],
            correctAnswer: question.correctAnswer,
            audioUrl,
          };
        }

        const options = language === "ar" ? question.optionsAr : question.optionsEn;
        const fallbackOptions = options.length ? options : question.optionsAr;
        const correctIndex =
          typeof question.correctOptionIndex === "number"
            ? question.correctOptionIndex
            : question.optionsAr.findIndex((option) => option === question.correctAnswer);
        return {
          id: question.id,
          type: question.type,
          prompt,
          options: fallbackOptions,
          correctAnswer: fallbackOptions[correctIndex] ?? question.correctAnswer,
          audioUrl,
        };
      }),
    [data.practice.questions, language]
  );

  const handleProgress = useCallback((progress: number) => {
    if (progress < 99.5 || autoAdvancedRef.current) return;
    autoAdvancedRef.current = true;
    trackAnalyticsEvent("sample_practice_start", { source: "video_complete" });
    window.setTimeout(() => setStage("practice"), 500);
  }, []);

  const startPractice = (source: string) => {
    trackAnalyticsEvent("sample_practice_start", { source });
    setStage("practice");
  };

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const stageIndex = stage === "lesson" ? 0 : stage === "practice" ? 1 : 2;

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-[#F7F7F2] text-gray-900">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label={t.back} className="flex shrink-0 items-center gap-3">
            <MadrassaLogo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 sm:inline">
              {t.noSignup}
            </span>
            <button
              type="button"
              onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-800"
            >
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              {language === "ar" ? "English" : "عربي"}
            </button>
            <Link
              href="/"
              className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
              aria-label={t.back}
              title={t.back}
            >
              <BackIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase text-emerald-800">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <span>{t.sample}</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
              <span>{subject}</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gray-300" />
              <span>{language === "ar" ? `الصف ${data.lesson.gradeLevel}` : `Grade ${data.lesson.gradeLevel}`}</span>
            </div>
            <h1 className="mt-3 max-w-4xl text-3xl font-extrabold leading-tight text-gray-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-3xl text-base font-medium leading-relaxed text-gray-600">
              {description}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-gray-500">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                {t.minutes(minutes(data.lesson.durationMs))}
              </span>
              <span>{t.slides(data.lesson.slideCount)}</span>
              <span>{t.activities(data.lesson.activityCount)}</span>
              <span>{t.recordedIn}</span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <ol className="grid grid-cols-3 border-b border-gray-200" aria-label="Lesson progress">
            {[t.lesson, t.practice, t.complete].map((label, index) => {
              const isActive = index === stageIndex;
              const isDone = index < stageIndex;
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={index === 2}
                    onClick={() => {
                      if (index === 0) {
                        setStage("lesson");
                      } else {
                        startPractice("progress_tabs");
                      }
                    }}
                    className={`flex min-h-14 w-full items-center justify-center gap-2 border-b-4 px-2 text-sm font-extrabold transition-colors sm:text-base ${
                      isActive
                        ? "border-emerald-700 text-emerald-800"
                        : isDone
                          ? "border-emerald-200 text-emerald-700"
                          : "border-transparent text-gray-400"
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : null}
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {stage === "lesson" && (
          <section className="mx-auto max-w-6xl px-3 pb-10 sm:px-6">
            <SimPlayer
              payload={data.sim}
              language={data.contentLanguage}
              onProgress={handleProgress}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_18px_45px_rgba(31,54,38,0.14)]"
            />
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-4 text-center sm:flex-row sm:text-start">
              <p className="text-sm font-bold text-gray-600">{t.ready}</p>
              <button
                type="button"
                onClick={() => startPractice("lesson_cta")}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 font-extrabold text-white shadow-md transition-colors hover:bg-emerald-800"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                {t.startPractice}
              </button>
            </div>
          </section>
        )}

        {stage === "practice" && (
          <PracticePlayer
            key={`${language}-${practiceRound}`}
            title={language === "ar" ? data.practice.titleAr : data.practice.titleEn}
            questions={practiceQuestions}
            lang={language}
            passingPercent={data.practice.passingPercent}
            onFinish={async () => true}
            onRetry={() => setPracticeRound((round) => round + 1)}
            onContinue={() => {
              trackAnalyticsEvent("sample_practice_complete");
              setStage("complete");
            }}
            onExit={() => setStage("lesson")}
            continueLabel={t.finish}
          />
        )}

        {stage === "complete" && (
          <section className="mx-auto flex min-h-[calc(100vh-13rem)] max-w-4xl flex-col items-center justify-center px-5 py-12 text-center">
            <div className="h-44 w-44 sm:h-52 sm:w-52">
              <OwlCelebrating className="h-full w-full" />
            </div>
            <h2 className="mt-4 text-3xl font-extrabold text-gray-950 sm:text-4xl">
              {t.completeTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-gray-600 sm:text-lg">
              {t.completeBody}
            </p>
            <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/auth/signup"
                data-analytics="signup_click"
                data-analytics-source="sample_complete"
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 font-extrabold text-white shadow-md transition-colors hover:bg-emerald-800"
              >
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                {t.signup}
              </Link>
              <button
                type="button"
                onClick={() => {
                  autoAdvancedRef.current = false;
                  setStage("lesson");
                }}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-gray-200 bg-white px-5 font-extrabold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-800"
              >
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
                {t.replay}
              </button>
            </div>
            <Link href="/" className="mt-5 text-sm font-bold text-gray-500 underline-offset-4 hover:text-gray-900 hover:underline">
              {t.home}
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
