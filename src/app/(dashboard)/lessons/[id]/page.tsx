"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimAccess } from "@/lib/hooks/useSimAccess";
import type {
  Lesson,
  LessonProgress,
  LessonQuestion,
  LessonSlideResponse,
  QuizSettings,
  Subject,
} from "@/lib/database.types";
import type { Slide } from "@/lib/slides.types";
import type { SimPayload } from "@/lib/sim.types";
import dynamic from "next/dynamic";

const SimPlayer = dynamic(() => import("@/components/slides/SimPlayer"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-2xl h-96" />,
});
import { Confetti } from "@/components/illustrations";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { getOfflineLesson, getCachedSimAudio, queueProgressUpdate } from "@/lib/offline/db";
import ProgressGateModal from "@/components/lessons/ProgressGateModal";
import {
  getSlideInteractionStorageKey,
  readStoredSlideInteractionResponses,
  type SlideInteractionResult,
  type StoredSlideInteractionResponses,
} from "@/lib/slide-interactions";

const translations = {
  ar: {
    loading: "جاري التحميل...",
    lessonNotFound: "الدرس غير موجود",
    backToLessons: "العودة للدروس",
    nextLesson: "الدرس التالي",
    prevLesson: "الدرس السابق",
    completed: "مكتمل",
    markComplete: "تحديد كمكتمل",
    question: "سؤال",
    submit: "إرسال",
    correct: "إجابة صحيحة!",
    incorrect: "إجابة خاطئة",
    tryAgain: "حاول مرة أخرى",
    continue: "متابعة",
    explanation: "التفسير",
    askTutor: "اسأل المعلم الذكي",
    progress: "التقدم",
    of: "من",
    minutes: "دقيقة",
    grade: "الصف",
  },
  en: {
    loading: "Loading...",
    lessonNotFound: "Lesson not found",
    backToLessons: "Back to Lessons",
    nextLesson: "Next Lesson",
    prevLesson: "Previous Lesson",
    completed: "Completed",
    markComplete: "Mark Complete",
    question: "Question",
    submit: "Submit",
    correct: "Correct!",
    incorrect: "Incorrect",
    tryAgain: "Try Again",
    continue: "Continue",
    explanation: "Explanation",
    askTutor: "Ask AI Tutor",
    progress: "Progress",
    of: "of",
    minutes: "min",
    grade: "Grade",
  },
};

// Icons
const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  chevronLeft: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  ),
};

const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  require_pass_to_continue: false,
  min_pass_questions: 1,
  allow_retries: true,
  max_attempts: null,
  show_explanation: true,
};

function resolveQuizSettings(value: unknown): QuizSettings {
  if (!value || typeof value !== "object") {
    return DEFAULT_QUIZ_SETTINGS;
  }

  const settings = value as Partial<QuizSettings>;

  return {
    require_pass_to_continue: settings.require_pass_to_continue ?? DEFAULT_QUIZ_SETTINGS.require_pass_to_continue,
    min_pass_questions: settings.min_pass_questions ?? DEFAULT_QUIZ_SETTINGS.min_pass_questions,
    allow_retries: settings.allow_retries ?? DEFAULT_QUIZ_SETTINGS.allow_retries,
    max_attempts: settings.max_attempts ?? DEFAULT_QUIZ_SETTINGS.max_attempts,
    show_explanation: settings.show_explanation ?? DEFAULT_QUIZ_SETTINGS.show_explanation,
  };
}

function mapSlideResponsesToStoredState(
  responses: LessonSlideResponse[] | null | undefined
): StoredSlideInteractionResponses {
  if (!responses || responses.length === 0) {
    return {};
  }

  return responses.reduce<StoredSlideInteractionResponses>((acc, response) => {
    const payload =
      response.response_data && typeof response.response_data === "object" && !Array.isArray(response.response_data)
        ? (response.response_data as Record<string, unknown>)
        : {};

    acc[response.slide_id] = {
      answer:
        payload.answer === null ||
        typeof payload.answer === "string" ||
        typeof payload.answer === "number" ||
        typeof payload.answer === "boolean" ||
        (Array.isArray(payload.answer) && payload.answer.every((item) => typeof item === "string"))
          ? (payload.answer as SlideInteractionResult["answer"])
          : null,
      completedAt: response.completed_at,
      isCorrect: response.is_correct,
      timeSpentSeconds: response.time_spent_seconds,
    };

    return acc;
  }, {});
}

export default function LessonPlayerPage() {
  const params = useParams();
  const lessonId = params.id as string;
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const { canAccessSims } = useSimAccess();
  const t = translations[language];
  const isRtl = language === "ar";

  // State
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<LessonQuestion[]>([]);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [adjacentLessons, setAdjacentLessons] = useState<{ prev: Lesson | null; next: Lesson | null }>({ prev: null, next: null });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Lesson sim (event-sourced recording). Replaces the Bunny CDN video on
  // the student page — if a sim exists we render SimPlayer; otherwise the
  // player area shows an empty state.
  const [lessonSim, setLessonSim] = useState<SimPayload | null>(null);

  // Question/quiz state
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [correctQuestions, setCorrectQuestions] = useState<Set<string>>(new Set());

  // Slide interaction state (used by SimPlayer for savedResponses)
  const [slideDeck, setSlideDeck] = useState<Slide[]>([]);
  const [slideInteractionResponses, setSlideInteractionResponses] = useState<StoredSlideInteractionResponses>({});

  // Progress gate state
  const [showProgressGate, setShowProgressGate] = useState(false);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS);

  // Offline state
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Celebration state
  const [showConfetti, setShowConfetti] = useState(false);
  // Load lesson data
  useEffect(() => {
    async function loadData() {
      // Offline mode: load from IndexedDB
      if (!navigator.onLine) {
        try {
          const offlineLesson = await getOfflineLesson(lessonId);
          if (offlineLesson) {
            setIsOfflineMode(true);
            setLesson({
              id: offlineLesson.id,
              title_ar: offlineLesson.title_ar,
              title_en: offlineLesson.title_en,
              grade_level: offlineLesson.grade_level,
              thumbnail_url: offlineLesson.thumbnailUrl,
              subject_id: "",
              is_published: true,
            } as Lesson);

            if (offlineLesson.subject_name_ar) {
              setSubject({
                id: "",
                name_ar: offlineLesson.subject_name_ar,
                name_en: offlineLesson.subject_name_en || "",
                display_order: 0,
                created_at: "",
                icon: null,
                description: null,
              });
            }

            // Load sim with offline audio
            if (offlineLesson.sim) {
              const audioBlob = await getCachedSimAudio(lessonId);
              const sim = { ...offlineLesson.sim };
              if (audioBlob) {
                sim.audio_url = URL.createObjectURL(audioBlob);
              }
              setLessonSim(sim);
            }

            if (Array.isArray(offlineLesson.slides)) {
              setSlideDeck(offlineLesson.slides as Slide[]);
            }

            setQuestions(offlineLesson.questions as LessonQuestion[]);
            setLoading(false);
            return;
          }
        } catch {
          // Fall through to online loading
        }
        // Not downloaded — show not found
        setLoading(false);
        return;
      }

      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserId(user.id);
      const storageKey = getSlideInteractionStorageKey(lessonId, user.id);
      const localSlideResponses = readStoredSlideInteractionResponses(
        window.localStorage.getItem(storageKey)
      );
      setSlideInteractionResponses(localSlideResponses);

      // Fetch lesson
      const { data: lessonData } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .single();

      if (!lessonData) {
        setLoading(false);
        return;
      }
      setLesson(lessonData);
      setQuizSettings(resolveQuizSettings(lessonData.quiz_settings));

      const [slidesRes, slideResponsesRes, simRes] = await Promise.all([
        fetch(`/api/lessons/${lessonId}/slides`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
        fetch(`/api/lessons/${lessonId}/slide-responses`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
        fetch(`/api/lessons/${lessonId}/sim`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);

      if (Array.isArray(slidesRes?.slideDeck?.slides)) {
        setSlideDeck(slidesRes.slideDeck.slides as Slide[]);
      }

      if (Array.isArray(slideResponsesRes?.responses)) {
        const mappedResponses = mapSlideResponsesToStoredState(
          slideResponsesRes.responses as LessonSlideResponse[]
        );
        setSlideInteractionResponses(mappedResponses);
        window.localStorage.setItem(storageKey, JSON.stringify(mappedResponses));
      }

      setLessonSim((simRes?.sim as SimPayload | null) ?? null);

      // Fetch subject
      if (lessonData.subject_id) {
        const { data: subjectData } = await supabase
          .from("subjects")
          .select("*")
          .eq("id", lessonData.subject_id)
          .single();
        if (subjectData) setSubject(subjectData);
      }

      // Fetch questions
      const { data: questionsData } = await supabase
        .from("lesson_questions")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("timestamp_seconds");
      if (questionsData) {
        setQuestions(questionsData);

        if (questionsData.length > 0) {
          const { data: responseData } = await supabase
            .from("lesson_question_responses")
            .select("question_id, is_correct")
            .eq("student_id", user.id)
            .in("question_id", questionsData.map((question) => question.id));

          if (responseData) {
            setAnsweredQuestions(new Set(responseData.map((response) => response.question_id)));
            setCorrectQuestions(
              new Set(
                responseData
                  .filter((response) => response.is_correct)
                  .map((response) => response.question_id)
              )
            );
          }
        }
      }

      // Fetch progress
      const { data: progressData } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("lesson_id", lessonId)
        .eq("student_id", user.id)
        .maybeSingle();
      if (progressData) {
        setProgress(progressData);
      }

      // Fetch adjacent lessons
      const { data: allLessons } = await supabase
        .from("lessons")
        .select("id, title_ar, title_en, display_order")
        .eq("subject_id", lessonData.subject_id)
        .eq("is_published", true)
        .order("display_order");

      if (allLessons) {
        const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
        setAdjacentLessons({
          prev: currentIndex > 0 ? allLessons[currentIndex - 1] as unknown as Lesson : null,
          next: currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] as unknown as Lesson : null,
        });
      }

      setLoading(false);
    }
    loadData();
  }, [lessonId, router, supabase]);

  const persistSlideInteractionResponse = useCallback(
    async (slideId: string, result: SlideInteractionResult) => {
      if (!userId) {
        return;
      }

      const storageKey = getSlideInteractionStorageKey(lessonId, userId);
      let nextResult = result;

      try {
        const response = await fetch(`/api/lessons/${lessonId}/slide-responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slide_id: slideId,
            answer: result.answer,
            time_spent_seconds: result.timeSpentSeconds ?? 0,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          nextResult = {
            ...result,
            isCorrect: json.is_correct ?? result.isCorrect,
          };
        }
      } catch {
        // Fallback to local persistence below.
      }

      setSlideInteractionResponses((prev) => {
        const next = {
          ...prev,
          [slideId]: nextResult,
        };

        window.localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [lessonId, userId]
  );

  // Sim progress tracking — debounced upsert on playback percentage changes.
  const lastSimPctRef = useRef(0);
  const simDurationSec = lessonSim?.sim?.duration_ms ? Math.ceil(lessonSim.sim.duration_ms / 1000) : lesson?.video_duration_seconds || 0;
  const handleSimProgress = useCallback(async (pct: number) => {
    if (!userId || !lessonId) return;
    // Only save when progress crosses a 10% threshold
    const bucket = Math.floor(pct / 10) * 10;
    if (bucket <= lastSimPctRef.current) return;
    lastSimPctRef.current = bucket;
    const isCompleted = pct >= 80;
    const positionSec = Math.floor((pct / 100) * simDurationSec);

    const progressData = {
      student_id: userId,
      lesson_id: lessonId,
      last_position_seconds: positionSec,
      total_watch_time_seconds: positionSec,
      completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      questions_answered: answeredQuestions.size,
      questions_correct: correctQuestions.size,
    };

    if (!navigator.onLine) {
      await queueProgressUpdate({
        lessonId,
        table: "lesson_progress",
        data: progressData,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { data: updatedProgress } = await supabase.from("lesson_progress").upsert(progressData, { onConflict: "student_id,lesson_id" }).select().single();
    if (updatedProgress) setProgress(updatedProgress);
  }, [userId, lessonId, supabase, answeredQuestions.size, correctQuestions]);

  // Close progress gate and let sim handle replay
  const handleRewatchQuiz = useCallback(() => {
    setShowProgressGate(false);
  }, []);

  // Mark lesson as complete
  const handleMarkComplete = async () => {
    if (!userId || !lessonId) return;

    if (quizSettings.require_pass_to_continue && correctQuestions.size < quizSettings.min_pass_questions) {
      setShowProgressGate(true);
      return;
    }

    const { data: updatedProgress } = await supabase.from("lesson_progress").upsert({
      student_id: userId,
      lesson_id: lessonId,
      completed: true,
      completed_at: new Date().toISOString(),
      last_position_seconds: simDurationSec,
      total_watch_time_seconds: simDurationSec,
      questions_answered: answeredQuestions.size,
      questions_correct: correctQuestions.size,
      quiz_passed: correctQuestions.size >= quizSettings.min_pass_questions,
    }, {
      onConflict: "student_id,lesson_id",
    }).select().single();

    if (updatedProgress) {
      setProgress(updatedProgress);
    }

    // Celebrate lesson completion!
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#007229] to-[#00913D] flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 animate-bounce shadow-lg shadow-[#007229]/30">
            م
          </div>
          <p className="text-gray-500 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg mb-4">
            {isOfflineMode || !navigator.onLine
              ? (language === "ar" ? "هذا الدرس غير متاح بدون إنترنت" : "This lesson is not available offline")
              : t.lessonNotFound}
          </p>
          <Link
            href="/lessons"
            className="px-6 py-3 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] transition-colors shadow-lg shadow-[#007229]/30"
          >
            {t.backToLessons}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC]" dir={isRtl ? "rtl" : "ltr"}>
      {/* Celebration confetti */}
      {showConfetti && <Confetti />}

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/lessons"
              className="p-2 text-gray-500 hover:text-[#007229] hover:bg-[#007229]/5 rounded-xl transition-colors"
            >
              <span className={isRtl ? "rotate-180 inline-block" : ""}>{Icons.back}</span>
            </Link>
            <div className="flex-1">
              <h1 className="text-gray-900 font-semibold">
                {language === "ar" ? lesson.title_ar : lesson.title_en}
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {subject && <span>{language === "ar" ? subject.name_ar : subject.name_en}</span>}
                <span>•</span>
                <span>{t.grade} {lesson.grade_level}</span>
              </div>
            </div>
          </div>

          {/* Completion status */}
          {progress?.completed ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#007229]/10 text-[#007229] rounded-full text-sm font-medium">
              {Icons.check}
              <span>{t.completed}</span>
            </div>
          ) : (
            <button
              onClick={handleMarkComplete}
              className="px-4 py-2 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] transition-colors text-sm font-medium shadow-lg shadow-[#007229]/20"
            >
              {t.markComplete}
            </button>
          )}
        </div>
      </div>

      {/* Lesson recording — sim-based playback. Replaces the legacy Bunny
          video for the student view. If the lesson has no sim yet, show an
          empty state. */}
      {lessonSim && canAccessSims ? (
        <div className="mx-auto max-w-6xl px-3 py-2">
          <SimPlayer payload={lessonSim} language={language} lessonId={lessonId} savedResponses={slideInteractionResponses} onProgress={handleSimProgress} />
        </div>
      ) : (
        <div className="relative bg-black aspect-video max-h-[70vh] mx-auto flex items-center justify-center">
          <p className="text-gray-400 text-sm">
            {language === "ar"
              ? "لا يوجد تسجيل لهذا الدرس بعد."
              : "This lesson does not have a recording yet."}
          </p>
        </div>
      )}


      {/* Bottom section */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

          {/* Progress + Description row */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Progress pills */}
            {questions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const pct = Math.round((answeredQuestions.size / questions.length) * 100);
                  const done = answeredQuestions.size === questions.length;
                  return (
                    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium ${done ? "bg-violet-100 text-violet-700" : "bg-violet-50 text-violet-600"}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                      </svg>
                      <span>{language === "ar" ? "الأسئلة" : "Questions"}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${done ? "bg-violet-200" : "bg-violet-100"}`}>
                        {answeredQuestions.size}/{questions.length}
                      </span>
                      {pct > 0 && pct < 100 && (
                        <div className="w-12 h-1.5 bg-violet-200 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      {done && (
                        <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Description - right-aligned on desktop */}
            {(lesson.description_ar || lesson.description_en) && (
              <p className="text-sm text-gray-500 sm:ml-auto sm:text-right max-w-md leading-relaxed">
                {language === "ar" ? lesson.description_ar : lesson.description_en}
              </p>
            )}
          </div>

          {/* Navigation */}
          {(adjacentLessons.prev || adjacentLessons.next) && (
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
              {adjacentLessons.prev ? (
                <Link
                  href={`/lessons/${adjacentLessons.prev.id}`}
                  className="group flex items-center gap-2 px-4 py-2.5 bg-gray-50 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors min-w-0 max-w-[45%]"
                >
                  <span className={`flex-shrink-0 text-gray-400 group-hover:text-gray-600 ${isRtl ? "rotate-180" : ""}`}>{Icons.chevronLeft}</span>
                  <span className="truncate text-sm">
                    {language === "ar" ? adjacentLessons.prev.title_ar : (adjacentLessons.prev.title_en || adjacentLessons.prev.title_ar)}
                  </span>
                </Link>
              ) : (
                <div />
              )}

              {adjacentLessons.next ? (
                <Link
                  href={`/lessons/${adjacentLessons.next.id}`}
                  className="group flex items-center gap-2 px-4 py-2.5 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] transition-colors shadow-sm min-w-0 max-w-[45%]"
                >
                  <span className="truncate text-sm">
                    {language === "ar" ? adjacentLessons.next.title_ar : (adjacentLessons.next.title_en || adjacentLessons.next.title_ar)}
                  </span>
                  <span className={`flex-shrink-0 ${isRtl ? "rotate-180" : ""}`}>{Icons.chevronRight}</span>
                </Link>
              ) : (
                <div />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Progress Gate Modal */}
      {showProgressGate && (
        <ProgressGateModal
          questionsCorrect={correctQuestions.size}
          questionsRequired={quizSettings.min_pass_questions}
          onRewatch={handleRewatchQuiz}
          onClose={() => setShowProgressGate(false)}
        />
      )}
    </div>
  );
}
