"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import PracticeOwl, { type OwlMood } from "./PracticeOwl";
import ConfettiBurst from "./ConfettiBurst";
import PracticeHud from "./PracticeHud";
import {
  isNumberSequenceOption,
  PracticeOptionVisual,
  PracticeQuestionVisual,
} from "./PracticeVisual";
import { drawPhrase, type PracticeLang } from "./encouragement";
import { normalizeArabicDigits } from "@/lib/whatsapp-login";

export interface PracticeQuestionInput {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  prompt: string;
  options: string[];
  correctAnswer: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
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
  onRequestAudio?: (questionId: string) => Promise<string | null>;
  continueLabel?: string;
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
    playQuestion: "استمع إلى السؤال",
    stopQuestion: "إيقاف الصوت",
    audioUnavailable: "الصوت غير متاح الآن",
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
    playQuestion: "Listen to the question",
    stopQuestion: "Stop narration",
    audioUnavailable: "Narration is unavailable right now",
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

const SCENES = [
  { stage: "bg-[#DDF2BC]", tray: "bg-[#C9E99D]", frame: "border-[#A7D86A]" },
  { stage: "bg-[#F5C4D6]", tray: "bg-[#EFAAC4]", frame: "border-[#DF86AA]" },
  { stage: "bg-[#BFE7F7]", tray: "bg-[#A5D9EF]", frame: "border-[#72BFDF]" },
  { stage: "bg-[#FFE7A3]", tray: "bg-[#FBD477]", frame: "border-[#EAB94E]" },
] as const;

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
  onRequestAudio,
  continueLabel,
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
  const [audioStatus, setAudioStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [audioByQuestion, setAudioByQuestion] = useState<Record<string, string>>({});
  const answersRef = useRef<PracticeAnswer[]>([]);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationEnabledRef = useRef(false);

  const question = questions[index];
  const correctCount = answersRef.current.filter((answer) => answer.isCorrect).length;
  const scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = scorePercent >= passingPercent;
  const scene = SCENES[index % SCENES.length];

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    audioRef.current = null;
    setAudioStatus("idle");
  }, []);

  const playQuestionAudio = useCallback(async () => {
    if (!question) return;
    stopAudio();
    setAudioStatus("loading");
    try {
      const cacheKey = `${lang}:${question.id}`;
      let url = audioByQuestion[cacheKey] || question.audioUrl || null;
      if (!url && onRequestAudio) {
        url = await onRequestAudio(question.id);
        if (url) setAudioByQuestion((current) => ({ ...current, [cacheKey]: url as string }));
      }
      if (!url) {
        setAudioStatus("error");
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => setAudioStatus("playing");
      audio.onended = () => {
        audioRef.current = null;
        setAudioStatus("idle");
      };
      audio.onerror = () => {
        audioRef.current = null;
        setAudioStatus("error");
      };
      await audio.play();
    } catch (error) {
      // Browsers can block the first unmuted autoplay. Keep the replay control
      // available instead of describing that policy block as missing audio.
      setAudioStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "idle" : "error");
    }
  }, [audioByQuestion, lang, onRequestAudio, question, stopAudio]);

  const toggleNarration = useCallback(() => {
    if (audioStatus === "playing" || audioStatus === "loading") {
      narrationEnabledRef.current = false;
      stopAudio();
      return;
    }
    narrationEnabledRef.current = true;
    void playQuestionAudio();
  }, [audioStatus, playQuestionAudio, stopAudio]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      stopAudio();
    },
    [stopAudio]
  );

  const playQuestionAudioRef = useRef(playQuestionAudio);
  useEffect(() => {
    playQuestionAudioRef.current = playQuestionAudio;
  }, [playQuestionAudio]);

  useEffect(() => {
    narrationEnabledRef.current = true;
    const timer = window.setTimeout(() => void playQuestionAudioRef.current(), 220);
    return () => {
      window.clearTimeout(timer);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [index, lang]);

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

      stopAudio();

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
    [phase, question, streak, lang, goNext, stopAudio]
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
    narrationEnabledRef.current = false;
    stopAudio();
    onRetry();
  }, [maxHearts, onRetry, stopAudio]);

  if (!question && phase !== "summary") return null;

  const DirectionIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const questionLabel = t.questionNumber(index + 1, total);

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#F7F7F2]">
      <div className="absolute inset-x-0 top-0 flex h-1" aria-hidden="true">
        <span className="flex-1 bg-[#007229]" />
        <span className="flex-1 bg-[#F59E0B]" />
        <span className="flex-1 bg-[#D21034]" />
      </div>

      <ConfettiBurst burst={burst} originY={0.42} />
      <ConfettiBurst burst={bigBurst} big originY={0.34} />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6">
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
            className="practice-question-enter mt-4 flex min-h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-lg border-4 border-white bg-white shadow-[0_18px_45px_rgba(36,60,42,0.16)] lg:min-h-[clamp(34rem,72dvh,48rem)]"
          >
            <section
              className={`relative grid flex-1 items-center gap-2 px-4 py-4 sm:min-h-60 sm:grid-cols-[11rem_1fr] sm:gap-7 sm:px-9 sm:py-7 lg:grid-cols-[14rem_1fr] lg:px-12 ${scene.stage}`}
            >
              <div className="mx-auto h-28 w-28 shrink-0 sm:h-44 sm:w-44 lg:h-56 lg:w-56">
                <PracticeOwl
                  mood={owlMood}
                  pulse={owlPulse}
                  speaking={audioStatus === "playing"}
                  className="h-full w-full"
                />
              </div>

              <div
                className={`relative min-w-0 rounded-lg border-2 bg-white px-4 py-4 text-center shadow-[0_5px_0_rgba(52,74,58,0.13)] sm:px-7 sm:py-6 sm:text-start ${scene.frame}`}
              >
                <button
                  type="button"
                  onClick={toggleNarration}
                  aria-label={
                    audioStatus === "playing" || audioStatus === "loading"
                      ? t.stopQuestion
                      : t.playQuestion
                  }
                  title={
                    audioStatus === "playing" || audioStatus === "loading"
                      ? t.stopQuestion
                      : t.playQuestion
                  }
                  className="absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full border-2 border-gray-100 bg-white text-[var(--primary)] shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
                >
                  {audioStatus === "loading" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : audioStatus === "playing" ? (
                    <VolumeX className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                {phase === "feedback" && (
                  <p
                    aria-live="polite"
                    className={`mb-2 pe-12 text-sm font-extrabold sm:text-base ${
                      wasCorrect ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {phrase}
                  </p>
                )}
                <h1 className="break-words pe-10 text-2xl font-extrabold leading-snug text-gray-900 sm:text-3xl lg:text-[2rem]">
                  {question.prompt}
                </h1>
                {audioStatus === "error" && (
                  <p className="mt-2 text-xs font-bold text-gray-500">{t.audioUnavailable}</p>
                )}
              </div>
            </section>

            <PracticeQuestionVisual prompt={question.prompt} lang={lang} />

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

            <section className={`border-t-2 px-4 py-5 sm:px-8 sm:py-8 ${scene.tray} ${scene.frame}`}>
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
                        : `bg-white text-gray-900 focus:border-[var(--primary)] focus:ring-4 focus:ring-white/70 ${scene.frame}`
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
                    const sequenceOption = isNumberSequenceOption(option);
                    const revealCorrect = phase === "feedback" && isCorrectOption;
                    const revealWrongChoice = phase === "feedback" && isChosen && !isCorrectOption;

                    return (
                      <button
                        key={`${option}-${optionIndex}`}
                        type="button"
                        disabled={phase === "feedback"}
                        aria-pressed={isChosen}
                        onClick={() => submitAnswer(option)}
                        className={`practice-option group flex min-h-[4.5rem] items-center gap-4 rounded-lg border-2 px-4 py-2.5 text-start shadow-[0_5px_0_rgba(48,64,52,0.16)] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 sm:min-h-[5.25rem] sm:py-3 ${
                          revealCorrect
                            ? "practice-reveal border-emerald-500 bg-emerald-50 text-emerald-950 shadow-[0_5px_0_#15803D]"
                            : revealWrongChoice
                              ? "border-amber-400 bg-amber-50 text-amber-950 shadow-[0_5px_0_#D97706]"
                              : phase === "feedback"
                                ? "border-gray-100 bg-white text-gray-400 opacity-70"
                                : `bg-white text-gray-900 hover:-translate-y-1 hover:shadow-[0_7px_0_rgba(48,64,52,0.18)] active:translate-y-1 active:shadow-none ${scene.frame}`
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
                        <span className="flex min-w-0 flex-1 items-center gap-3 break-words text-lg font-bold leading-snug sm:text-xl">
                          <PracticeOptionVisual option={option} />
                          {!sequenceOption && <span className="min-w-0 flex-1">{option}</span>}
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
                    {continueLabel ?? t.continue}
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
