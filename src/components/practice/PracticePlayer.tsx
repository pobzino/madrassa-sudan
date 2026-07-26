"use client";

// One-question-at-a-time Practice player: big tap targets, owl reactions,
// hearts + progress, confetti, gentle wrong-answer teaching moment. The owl
// REACTION is the product here — the SVG owl itself is placeholder art.
//
// The player is presentation-only: the parent supplies questions (already in
// the student's language) and receives the final answers to submit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  questions: PracticeQuestionInput[];
  lang: PracticeLang;
  passingPercent: number;
  /** Called once, when the last question is answered. Should persist the attempt. */
  onFinish: (result: { correctCount: number; total: number; answers: PracticeAnswer[] }) => Promise<boolean>;
  /** Start a fresh attempt (parent calls the retake API and remounts). */
  onRetry: () => void;
  /** Continue after passing (next lesson / back to the path). */
  onContinue: () => void;
  onExit?: () => void;
}

const UI = {
  ar: {
    check: "تحقق",
    gotIt: "فهمت!",
    numberPlaceholder: "اكتب إجابتك",
    correctAnswerWas: "الإجابة الصحيحة:",
    passTitle: "أكملت التدريب!",
    failTitle: "تدريب جيد!",
    scoreLabel: "نتيجتك",
    tryAgain: "حاول مرة أخرى",
    continue: "متابعة",
    backToLessons: "العودة للدروس",
    saving: "جاري الحفظ...",
    exit: "خروج",
    passNeeded: (p: number) => `تحتاج ${p}٪ لإكمال الدرس`,
  },
  en: {
    check: "Check",
    gotIt: "Got it!",
    numberPlaceholder: "Type your answer",
    correctAnswerWas: "The correct answer:",
    passTitle: "Practice complete!",
    failTitle: "Good practice!",
    scoreLabel: "Your score",
    tryAgain: "Try again",
    continue: "Continue",
    backToLessons: "Back to lessons",
    saving: "Saving...",
    exit: "Exit",
    passNeeded: (p: number) => `You need ${p}% to complete the lesson`,
  },
} as const;

function answersMatch(response: string, correct: string): boolean {
  const norm = (v: string) => normalizeArabicDigits(v).trim();
  const r = norm(response);
  const c = norm(correct);
  if (r === c) return true;
  const rn = Number(r.replace(",", "."));
  const cn = Number(c.replace(",", "."));
  if (r !== "" && c !== "" && Number.isFinite(rn) && Number.isFinite(cn)) {
    return Math.abs(rn - cn) < 1e-9;
  }
  return r.toLowerCase() === c.toLowerCase();
}

type Phase = "question" | "feedback" | "summary";

export default function PracticePlayer({
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
  const correctCount = answersRef.current.filter((a) => a.isCorrect).length;
  const passed = total > 0 && (correctCount / total) * 100 >= passingPercent;

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

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
    } else {
      const finalCorrect = answersRef.current.filter((a) => a.isCorrect).length;
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
        setOwlPulse((p) => p + 1);
        setBigBurst((b) => b + 1);
      } else {
        setOwlMood("idle");
      }
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
      setOwlPulse((p) => p + 1);

      if (isCorrect) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setPhrase(drawPhrase(nextStreak > 0 && nextStreak % 3 === 0 ? "streak" : "correct", lang));
        setOwlMood("happy");
        setBurst((b) => b + 1);
        if (typeof navigator !== "undefined") navigator.vibrate?.(25);
        advanceTimer.current = setTimeout(() => void goNext(), 1500);
      } else {
        setStreak(0);
        setHearts((h) => Math.max(h - 1, 0));
        setPhrase(drawPhrase("wrong", lang));
        setOwlMood("sad");
        if (typeof navigator !== "undefined") navigator.vibrate?.(60);
        // Wrong answers wait for an explicit "Got it" so the reveal lands.
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

  return (
    <div className="relative mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col px-4 pb-8 pt-4">
      <ConfettiBurst burst={burst} originY={0.45} />
      <ConfettiBurst burst={bigBurst} big originY={0.35} />

      {phase !== "summary" && (
        <PracticeHud
          current={index + (phase === "feedback" ? 1 : 0)}
          total={total}
          hearts={hearts}
          maxHearts={maxHearts}
          onExit={onExit}
          exitLabel={t.exit}
        />
      )}

      {phase !== "summary" && question && (
        <div className="flex flex-1 flex-col">
          {/* Owl + speech bubble */}
          <div className="mt-6 flex items-end gap-3">
            <div className="h-24 w-24 shrink-0 sm:h-28 sm:w-28">
              <PracticeOwl mood={owlMood} pulse={owlPulse} className="h-full w-full" />
            </div>
            <div
              aria-live="polite"
              className={`relative mb-3 min-h-[3rem] flex-1 rounded-2xl border px-4 py-3 text-base font-semibold leading-snug transition-colors sm:text-lg ${
                phase === "feedback"
                  ? wasCorrect
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-gray-200 bg-white text-gray-900"
              }`}
            >
              {phase === "feedback" ? phrase : question.prompt}
            </div>
          </div>

          {phase === "feedback" && (
            <p className="mt-1 text-center text-sm font-medium text-gray-500">{question.prompt}</p>
          )}

          {question.imageUrl && (
            <img
              src={question.imageUrl}
              alt=""
              className="mx-auto mt-4 max-h-44 rounded-2xl object-contain"
            />
          )}

          {/* Answers */}
          {question.type === "short_answer" ? (
            <form
              className="mt-8 flex flex-col items-center gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (typed.trim()) submitAnswer(typed);
              }}
            >
              <input
                autoFocus
                inputMode="decimal"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={phase === "feedback"}
                placeholder={t.numberPlaceholder}
                className={`w-full max-w-xs rounded-2xl border-2 px-5 py-4 text-center text-2xl font-bold outline-none transition-colors ${
                  phase === "feedback"
                    ? wasCorrect
                      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-white text-gray-900 focus:border-[var(--primary)]"
                }`}
                dir="auto"
              />
              {phase === "feedback" && !wasCorrect && (
                <div className="practice-reveal rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-5 py-3 text-center">
                  <span className="text-sm font-semibold text-emerald-700">{t.correctAnswerWas}</span>{" "}
                  <span className="text-xl font-extrabold text-emerald-800">{question.correctAnswer}</span>
                </div>
              )}
              {phase === "question" && (
                <button
                  type="submit"
                  disabled={!typed.trim()}
                  className="w-full max-w-xs rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)] disabled:opacity-40"
                >
                  {t.check}
                </button>
              )}
            </form>
          ) : (
            <div className="mt-8 grid gap-3">
              {question.options.map((option) => {
                const isChosen = selected === option;
                const isCorrectOption = answersMatch(option, question.correctAnswer);
                const revealCorrect = phase === "feedback" && isCorrectOption;
                const revealWrongChoice = phase === "feedback" && isChosen && !isCorrectOption;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={phase === "feedback"}
                    onClick={() => submitAnswer(option)}
                    className={`practice-option min-h-[3.75rem] rounded-2xl border-2 px-5 py-4 text-start text-lg font-bold transition-all sm:text-xl ${
                      revealCorrect
                        ? "practice-reveal border-emerald-400 bg-emerald-50 text-emerald-800"
                        : revealWrongChoice
                          ? "border-amber-300 bg-amber-50 text-amber-700 opacity-80"
                          : phase === "feedback"
                            ? "border-gray-100 bg-white text-gray-400"
                            : "border-gray-200 bg-white text-gray-900 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md active:translate-y-0"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {/* Continue after a wrong answer — the reveal is the teaching moment */}
          {phase === "feedback" && !wasCorrect && (
            <button
              type="button"
              autoFocus
              onClick={() => void goNext()}
              className="mx-auto mt-6 w-full max-w-xs rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)]"
            >
              {t.gotIt}
            </button>
          )}
        </div>
      )}

      {phase === "summary" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="h-32 w-32 sm:h-40 sm:w-40">
            <PracticeOwl mood={passed ? "cheer" : "idle"} pulse={owlPulse} className="h-full w-full" />
          </div>
          <h2 className="font-display mt-4 text-2xl font-extrabold text-gray-900 sm:text-3xl">
            {passed ? t.passTitle : t.failTitle}
          </h2>
          <p aria-live="polite" className="mt-2 text-base font-medium text-gray-600">
            {drawPhrase(passed ? "pass" : "tryAgain", lang)}
          </p>

          <div className="mt-6 rounded-3xl border border-gray-100 bg-white px-8 py-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-500">{t.scoreLabel}</div>
            <div className={`text-4xl font-extrabold ${passed ? "text-[var(--primary)]" : "text-amber-600"}`}>
              {correctCount}/{total}
            </div>
            {!passed && (
              <div className="mt-1 text-xs font-medium text-gray-400">{t.passNeeded(passingPercent)}</div>
            )}
          </div>

          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            {saving ? (
              <div className="py-3 text-sm font-medium text-gray-400">{t.saving}</div>
            ) : passed ? (
              <button
                type="button"
                onClick={onContinue}
                className="rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)]"
              >
                {t.continue}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={restart}
                  className="rounded-2xl bg-[var(--primary)] py-4 text-lg font-bold text-white shadow-lg shadow-green-900/20 transition-all hover:bg-[var(--primary-light)]"
                >
                  {t.tryAgain}
                </button>
                {onExit && (
                  <button
                    type="button"
                    onClick={onExit}
                    className="rounded-2xl border-2 border-gray-200 bg-white py-3.5 text-base font-bold text-gray-600 transition-colors hover:border-gray-300"
                  >
                    {t.backToLessons}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
