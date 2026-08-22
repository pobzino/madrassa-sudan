"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import PracticeOwl, { type OwlMood } from "./PracticeOwl";
import ConfettiBurst from "./ConfettiBurst";
import PracticeHud from "./PracticeHud";
import { drawPhrase, type PracticeLang } from "./encouragement";
import { normalizeArabicDigits } from "@/lib/whatsapp-login";

export interface PracticeQuestionInput {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  prompt: string;
  options: string[];
  correctAnswer: string;
  imageUrl?: string | null;
}

export interface PracticeAnswer {
  questionId: string;
  response: string;
  isCorrect: boolean;
}

interface PracticePlayerProps {
  title?: string;
  questions: PracticeQuestionInput[];
  lang: PracticeLang;
  passingPercent: number;
  onFinish: (result: { correctCount: number; total: number; answers: PracticeAnswer[] }) => Promise<boolean>;
  onRetry: () => void;
  onContinue: () => void;
  onExit?: () => void;
}

const UI = {
  ar: {
    check: "تحقق",
    gotIt: "فهمت، التالي",
    numberPlaceholder: "اكتب إجابتك",
    correctAnswerWas: "الإجابة الصحيحة",
    passTitle: "أكملت التدريب!",
    failTitle: "محاولة جيدة!",
    scoreLabel: "نتيجتك",
    tryAgain: "حاول مرة أخرى",
    continue: "الدرس التالي",
    backToLessons: "العودة للدروس",
    saving: "جاري الحفظ...",
    exit: "خروج",
    passNeeded: (p: number) => `تحتاج ${p}٪ لإكمال الدرس`,
    questionNumber: (current: number, total: number) => `السؤال ${current} من ${total}`,
    resultDetail: (correct: number, total: number) => `${correct} إجابات صحيحة من ${total}`,
  },
  en: {
    check: "Check answer",
    gotIt: "Got it, next",
    numberPlaceholder: "Type your answer",
    correctAnswerWas: "Correct answer",
    passTitle: "Practice complete!",
    failTitle: "Good effort!",
    scoreLabel: "Your score",
    tryAgain: "Try again",
    continue: "Next lesson",
    backToLessons: "Back to lessons",
    saving: "Saving...",
    exit: "Exit",
    passNeeded: (p: number) => `You need ${p}% to complete the lesson`,
    questionNumber: (current: number, total: number) => `Question ${current} of ${total}`,
    resultDetail: (correct: number, total: number) => `${correct} correct out of ${total}`,
  },
} as const;

const OPTION_MARKERS = {
  ar: ["أ", "ب", "ج", "د", "هـ", "و"],
  en: ["A", "B", "C", "D", "E", "F"],
} as const;

const MARKER_STYLES = [
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
];

function answersMatch(response: string, correct: string): boolean {
  const norm = (value: string) => normalizeArabicDigits(value).trim();
  const normalizedResponse = norm(response);
  const normalizedCorrect = norm(correct);
  if (normalizedResponse === normalizedCorrect) return true;

  const responseNumber = Number(normalizedResponse.replace(",", "."));
  const correctNumber = Number(normalizedCorrect.replace(",", "."));
  if (
    normalizedResponse !== "" &&
    normalizedCorrect !== "" &&
    Number.isFinite(responseNumber) &&
    Number.isFinite(correctNumber)
  ) {
    return Math.abs(responseNumber - correctNumber) < 1e-9;
  }

  return normalizedResponse.toLowerCase() === normalizedCorrect.toLowerCase();
}

type Phase = "question" | "feedback" | "summary";

export default function PracticePlayer({
  title,
  questions,
  lang,
  passingPercent,
  onFinish,
  onRetry,
  onContinue,
  onExit,
}: PracticePlayerProps) {
  const t = UI[lang];
  const total = questions.length;
  const maxHearts = useMemo(() => {
    const allowedMisses = Math.max(Math.floor((total * (100 - passingPercent)) / 100), 0);
    return Math.min(Math.max(allowedMisses + 1, 1), 5);
  }, [total, passingPercent]);

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("question");
  const [selected, setSelected] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [wasCorrect, setWasCorrect] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [hearts, setHearts] = useState(maxHearts);
  const [streak, setStreak] = useState(0);
  const [burst, setBurst] = useState(0);
  const [bigBurst, setBigBurst] = useState(0);
  const [owlMood, setOwlMood] = useState<OwlMood>("idle");
  const [owlPulse, setOwlPulse] = useState(0);
  const [saving, setSaving] = useState(false);
  const answersRef = useRef<PracticeAnswer[]>([]);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const question = questions[index];
  const correctCount = answersRef.current.filter((answer) => answer.isCorrect).length;
  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = scorePercent >= passingPercent;

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    []
  );

  const goNext = useCallback(async () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }

    if (index + 1 < total) {
      setIndex(index + 1);
      setPhase("question");
      setSelected(null);
      setTyped("");
      setOwlMood("idle");
      return;
    }

    const finalCorrect = answersRef.current.filter((answer) => answer.isCorrect).length;
    const didPass = total > 0 && (finalCorrect / total) * 100 >= passingPercent;
    setPhase("summary");
    setSaving(true);
    try {
      await onFinish({ correctCount: finalCorrect, total, answers: [...answersRef.current] });
    } finally {
      setSaving(false);
    }

    if (didPass) {
      setOwlMood("cheer");
      setOwlPulse((pulse) => pulse + 1);
      setBigBurst((value) => value + 1);
    } else {
      setOwlMood("idle");
    }
  }, [index, total, passingPercent, onFinish]);

  const submitAnswer = useCallback(
    (response: string) => {
      if (phase !== "question" || !question) return;

      const isCorrect = answersMatch(response, question.correctAnswer);
      answersRef.current = [
        ...answersRef.current,
        { questionId: question.id, response, isCorrect },
      ];
      setSelected(response);
      setWasCorrect(isCorrect);
      setPhase("feedback");
      setOwlPulse((pulse) => pulse + 1);

      if (isCorrect) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setPhrase(drawPhrase(nextStreak % 3 === 0 ? "streak" : "correct", lang));
        setOwlMood("happy");
        setBurst((value) => value + 1);
        navigator.vibrate?.(25);
        advanceTimer.current = setTimeout(() => void goNext(), 1600);
      } else {
        setStreak(0);
        setHearts((value) => Math.max(value - 1, 0));
        setPhrase(drawPhrase("wrong", lang));
        setOwlMood("sad");
        navigator.vibrate?.(60);
      }
    },
    [phase, question, streak, lang, goNext]
  );

  const restart = useCallback(() => {
    answersRef.current = [];
    setIndex(0);
    setPhase("question");
    setSelected(null);
    setTyped("");
    setHearts(maxHearts);
    setStreak(0);
    setOwlMood("idle");
    onRetry();
  }, [maxHearts, onRetry]);

  if (!question && phase !== "summary") return null;

  const DirectionIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const questionLabel = t.questionNumber(index + 1, total);

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#F4F8F5]">
      <div className="absolute inset-x-0 top-0 flex h-1" aria-hidden="true">
        <span className="flex-1 bg-[#007229]" />
        <span className="flex-1 bg-[#F59E0B]" />
        <span className="flex-1 bg-[#D21034]" />
      </div>

      <ConfettiBurst burst={burst} originY={0.42} />
      <ConfettiBurst burst={bigBurst} big originY={0.34} />

      <div className="relative mx-auto w-full max-w-4xl px-4 pb-8 pt-5 sm:px-6 sm:pb-12 sm:pt-7">
        {phase !== "summary" && (
          <PracticeHud
            title={title}
            current={index + (phase === "feedback" ? 1 : 0)}
            total={total}
            hearts={hearts}
            maxHearts={maxHearts}
            questionLabel={questionLabel}
            onExit={onExit}
            exitLabel={t.exit}
          />
        )}

        {phase !== "summary" && question && (
          <main
            key={question.id}
            className="practice-question-enter mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-[0_14px_40px_rgba(22,60,35,0.08)]"
          >
            <section className="grid min-h-48 items-center gap-2 px-5 py-6 sm:grid-cols-[9rem_1fr] sm:gap-6 sm:px-8 sm:py-8">
              <div className="mx-auto h-28 w-28 shrink-0 sm:h-36 sm:w-36">
                <PracticeOwl mood={owlMood} pulse={owlPulse} className="h-full w-full" />
              </div>

              <div className="min-w-0 text-center sm:text-start">
                {phase === "feedback" && (
                  <p
                    aria-live="polite"
                    className={`mb-2 text-sm font-extrabold sm:text-base ${
                      wasCorrect ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {phrase}
                  </p>
                )}
                <h1 className="break-words text-2xl font-extrabold leading-snug text-gray-900 sm:text-3xl">
                  {question.prompt}
                </h1>
              </div>
            </section>

            {question.imageUrl && (
              <div className="border-t border-gray-100 px-5 py-5 sm:px-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={question.imageUrl}
                  alt=""
                  className="mx-auto max-h-56 max-w-full rounded-lg object-contain"
                />
              </div>
            )}

            <section className="border-t border-gray-100 bg-[#FBFCFB] px-4 py-5 sm:px-8 sm:py-7">
              {question.type === "short_answer" ? (
                <form
                  className="mx-auto flex w-full max-w-xl flex-col items-stretch gap-4 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (typed.trim()) submitAnswer(typed);
                  }}
                >
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    disabled={phase === "feedback"}
                    placeholder={t.numberPlaceholder}
                    className={`min-h-16 min-w-0 flex-1 rounded-lg border-2 px-5 text-center text-2xl font-extrabold outline-none transition-colors ${
                      phase === "feedback"
                        ? wasCorrect
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-gray-200 bg-white text-gray-900 focus:border-[var(--primary)] focus:ring-4 focus:ring-emerald-100"
                    }`}
                    dir="auto"
                  />
                  {phase === "question" && (
                    <button
                      type="submit"
                      disabled={!typed.trim()}
                      className="min-h-16 rounded-lg bg-[var(--primary)] px-7 text-lg font-extrabold text-white shadow-md transition-colors hover:bg-[var(--primary-light)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t.check}
                    </button>
                  )}
                </form>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                  {question.options.map((option, optionIndex) => {
                    const isChosen = selected === option;
                    const isCorrectOption = answersMatch(option, question.correctAnswer);
                    const revealCorrect = phase === "feedback" && isCorrectOption;
                    const revealWrongChoice = phase === "feedback" && isChosen && !isCorrectOption;

                    return (
                      <button
                        key={`${option}-${optionIndex}`}
                        type="button"
                        disabled={phase === "feedback"}
                        aria-pressed={isChosen}
                        onClick={() => submitAnswer(option)}
                        className={`practice-option group flex min-h-[4.75rem] items-center gap-4 rounded-lg border-2 px-4 py-3 text-start transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 ${
                          revealCorrect
                            ? "practice-reveal border-emerald-400 bg-emerald-50 text-emerald-950"
                            : revealWrongChoice
                              ? "border-amber-300 bg-amber-50 text-amber-950"
                              : phase === "feedback"
                                ? "border-gray-100 bg-white text-gray-400 opacity-70"
                                : "border-gray-200 bg-white text-gray-900 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md active:translate-y-0"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-black ${
                            revealCorrect
                              ? "bg-emerald-600 text-white"
                              : revealWrongChoice
                                ? "bg-amber-200 text-amber-900"
                                : MARKER_STYLES[optionIndex % MARKER_STYLES.length]
                          }`}
                        >
                          {OPTION_MARKERS[lang][optionIndex] ?? optionIndex + 1}
                        </span>
                        <span className="min-w-0 flex-1 break-words text-lg font-bold leading-snug sm:text-xl">
                          {option}
                        </span>
                        {revealCorrect && (
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                            <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {phase === "feedback" && !wasCorrect && (
              <footer className="flex flex-col items-center justify-between gap-4 border-t border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:px-8">
                <p className="text-center text-sm font-bold text-amber-950 sm:text-start sm:text-base">
                  <span className="text-amber-700">{t.correctAnswerWas}:</span>{" "}
                  <span className="text-emerald-800">{question.correctAnswer}</span>
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={() => void goNext()}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 font-extrabold text-white shadow-md transition-colors hover:bg-[var(--primary-light)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 sm:w-auto"
                >
                  {t.gotIt}
                  <DirectionIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </footer>
            )}
          </main>
        )}

        {phase === "summary" && (
          <main className="practice-question-enter mx-auto mt-8 max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white text-center shadow-[0_14px_40px_rgba(22,60,35,0.08)]">
            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <div className="mx-auto h-36 w-36 sm:h-44 sm:w-44">
                <PracticeOwl mood={passed ? "cheer" : "idle"} pulse={owlPulse} className="h-full w-full" />
              </div>
              <h2 className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl">
                {passed ? t.passTitle : t.failTitle}
              </h2>
              <p aria-live="polite" className="mx-auto mt-2 max-w-md text-base font-semibold text-gray-600">
                {drawPhrase(passed ? "pass" : "tryAgain", lang)}
              </p>

              <div className="mx-auto mt-7 max-w-sm border-y border-gray-100 py-5">
                <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">{t.scoreLabel}</p>
                <p className={`mt-1 text-5xl font-black ${passed ? "text-[var(--primary)]" : "text-amber-600"}`}>
                  {scorePercent}%
                </p>
                <p className="mt-1 text-sm font-bold text-gray-600">{t.resultDetail(correctCount, total)}</p>
                {!passed && <p className="mt-2 text-xs font-semibold text-gray-500">{t.passNeeded(passingPercent)}</p>}
              </div>

              <div className="mx-auto mt-7 flex w-full max-w-sm flex-col gap-3">
                {saving ? (
                  <div className="py-3 text-sm font-semibold text-gray-400">{t.saving}</div>
                ) : passed ? (
                  <button
                    type="button"
                    onClick={onContinue}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 text-lg font-extrabold text-white shadow-md transition-colors hover:bg-[var(--primary-light)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
                  >
                    {t.continue}
                    <DirectionIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={restart}
                      className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-6 text-lg font-extrabold text-white shadow-md transition-colors hover:bg-[var(--primary-light)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
                    >
                      <RotateCcw className="h-5 w-5" aria-hidden="true" />
                      {t.tryAgain}
                    </button>
                    {onExit && (
                      <button
                        type="button"
                        onClick={onExit}
                        className="min-h-12 rounded-lg border-2 border-gray-200 bg-white px-6 font-bold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
                      >
                        {t.backToLessons}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
