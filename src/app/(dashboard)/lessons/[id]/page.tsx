"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { toPlayableVideoUrl } from "@/lib/bunny-playback";
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
import EnhancedQuizOverlay from "@/components/lessons/EnhancedQuizOverlay";
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
    quality: "الجودة",
    captions: "الترجمة",
    captionsAr: "العربية",
    captionsEn: "English",
    captionsOff: "إيقاف",
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
    quality: "Quality",
    captions: "Captions",
    captionsAr: "Arabic",
    captionsEn: "English",
    captionsOff: "Off",
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
  play: (
    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (
    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  caption: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  ),
  fullscreen: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
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
  volume: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  ),
};

type VideoQuality = "360p" | "480p" | "720p" | "1080p";

const VIDEO_QUALITIES: VideoQuality[] = ["1080p", "720p", "480p", "360p"];

const VIDEO_QUALITY_FALLBACKS: Record<VideoQuality, VideoQuality[]> = {
  "1080p": ["1080p", "720p", "480p", "360p"],
  "720p": ["720p", "1080p", "480p", "360p"],
  "480p": ["480p", "720p", "1080p", "360p"],
  "360p": ["360p", "480p", "720p", "1080p"],
};

function getLessonVideoSources(lesson: Lesson | null) {
  return {
    "1080p": toPlayableVideoUrl(lesson?.video_url_1080p || ""),
    "360p": toPlayableVideoUrl(lesson?.video_url_360p || ""),
    "480p": toPlayableVideoUrl(lesson?.video_url_480p || ""),
    "720p": toPlayableVideoUrl(lesson?.video_url_720p || ""),
  } satisfies Record<VideoQuality, string>;
}

function resolveVideoSource(
  lesson: Lesson | null,
  preferredQuality: VideoQuality,
  blockedQualities: VideoQuality[] = []
) {
  const sources = getLessonVideoSources(lesson);

  for (const quality of VIDEO_QUALITY_FALLBACKS[preferredQuality]) {
    if (blockedQualities.includes(quality)) {
      continue;
    }

    const url = sources[quality];
    if (url) {
      return { quality, url };
    }
  }

  return null;
}

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

  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState<VideoQuality>("1080p");
  const [failedQualities, setFailedQualities] = useState<VideoQuality[]>([]);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [captionLang, setCaptionLang] = useState<"ar" | "en" | "off">("off");
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const [volume, setVolume] = useState(1);
  const [videoErrorMessage, setVideoErrorMessage] = useState<string | null>(null);

  // Question overlay state
  const [activeQuestion, setActiveQuestion] = useState<LessonQuestion | null>(null);
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
  const lastPlaybackSecondRef = useRef(0);

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
      setQuality("1080p");
      setFailedQualities([]);
      setVideoErrorMessage(null);
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

  const findDueQuestion = useCallback(
    (fromSecond: number, toSecond: number) => {
      const lowerBound = Math.floor(Math.min(fromSecond, toSecond));
      const upperBound = Math.floor(Math.max(fromSecond, toSecond));

      return (
        questions.find(
          (question) =>
            question.timestamp_seconds > lowerBound &&
            question.timestamp_seconds <= upperBound &&
            !answeredQuestions.has(question.id)
        ) || null
      );
    },
    [answeredQuestions, questions]
  );

  const availableVideoSources = useMemo(() => getLessonVideoSources(lesson), [lesson]);

  const availableQualities = useMemo(
    () => VIDEO_QUALITIES.filter((candidate) => Boolean(availableVideoSources[candidate])),
    [availableVideoSources]
  );

  const resolvedVideoSource = useMemo(
    () => resolveVideoSource(lesson, quality, failedQualities),
    [lesson, quality, failedQualities]
  );

  const handleVideoError = useCallback(() => {
    if (!lesson || !resolvedVideoSource) {
      setVideoErrorMessage("This lesson does not have a playable video source.");
      setIsPlaying(false);
      return;
    }

    const nextFailedQualities = Array.from(
      new Set<VideoQuality>([...failedQualities, resolvedVideoSource.quality])
    );
    const fallbackSource = resolveVideoSource(lesson, quality, nextFailedQualities);

    setFailedQualities(nextFailedQualities);

    if (fallbackSource) {
      setQuality(fallbackSource.quality);
      setVideoErrorMessage(`Could not load ${resolvedVideoSource.quality}. Switched to ${fallbackSource.quality}.`);
      return;
    }

    setVideoErrorMessage("This video could not be loaded. Ask a teacher to check the lesson video source.");
    setIsPlaying(false);
  }, [failedQualities, lesson, quality, resolvedVideoSource]);

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    if (!userId || !lessonId || !videoRef.current) return;

    const currentPosition = Math.floor(videoRef.current.currentTime);
    const totalWatchTime = progress?.total_watch_time_seconds || 0;
    const isCompleted = duration > 0 && currentPosition / duration >= 0.9;
    const questionsCorrect = correctQuestions.size;

    const progressData = {
      student_id: userId,
      lesson_id: lessonId,
      last_position_seconds: currentPosition,
      total_watch_time_seconds: totalWatchTime + 5,
      completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      questions_answered: answeredQuestions.size,
      questions_correct: questionsCorrect,
      quiz_passed: questionsCorrect >= quizSettings.min_pass_questions,
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

    const { data: updatedProgress } = await supabase.from("lesson_progress").upsert(progressData, {
      onConflict: "student_id,lesson_id",
    }).select().single();

    if (updatedProgress) {
      setProgress(updatedProgress);
    }
  }, [userId, lessonId, duration, progress, answeredQuestions.size, correctQuestions, quizSettings.min_pass_questions, supabase]);

  // Auto-save progress every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying) saveProgress();
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, saveProgress]);

  // Sim progress tracking — debounced upsert on playback percentage changes.
  const lastSimPctRef = useRef(0);
  const handleSimProgress = useCallback(async (pct: number) => {
    if (!userId || !lessonId) return;
    // Only save when progress crosses a 10% threshold
    const bucket = Math.floor(pct / 10) * 10;
    if (bucket <= lastSimPctRef.current) return;
    lastSimPctRef.current = bucket;
    const isCompleted = pct >= 80;

    const progressData = {
      student_id: userId,
      lesson_id: lessonId,
      last_position_seconds: Math.floor((pct / 100) * 600),
      total_watch_time_seconds: Math.floor((pct / 100) * 600),
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

  const maybeActivateDueInteraction = useCallback(
    (fromSecond: number, toSecond: number) => {
      if (!videoRef.current) {
        return false;
      }

      const questionAtTime = findDueQuestion(fromSecond, toSecond);
      if (questionAtTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        setActiveQuestion(questionAtTime);
        return true;
      }

      return false;
    },
    [findDueQuestion]
  );

  // Handle video time update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const nextTime = videoRef.current.currentTime;
    const previousTime = lastPlaybackSecondRef.current;
    lastPlaybackSecondRef.current = nextTime;
    setCurrentTime(nextTime);

    if (!isPlaying || activeQuestion) {
      return;
    }

    maybeActivateDueInteraction(previousTime, nextTime);
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setVideoErrorMessage(null);
      // Resume from last position
      if (progress?.last_position_seconds) {
        videoRef.current.currentTime = progress.last_position_seconds;
        lastPlaybackSecondRef.current = progress.last_position_seconds;
      } else {
        lastPlaybackSecondRef.current = 0;
      }
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!videoRef.current || activeQuestion) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle seeking
  const seekToTime = useCallback(
    (time: number, options?: { activateDueInteractions?: boolean }) => {
      if (!videoRef.current) return;

      const previousTime = currentTime;
      videoRef.current.currentTime = time;
      lastPlaybackSecondRef.current = time;
      setCurrentTime(time);

      if (
        options?.activateDueInteractions !== false &&
        !activeQuestion &&
        time > previousTime
      ) {
        maybeActivateDueInteraction(previousTime, time);
      }
    },
    [activeQuestion, currentTime, maybeActivateDueInteraction]
  );

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekToTime(parseFloat(e.target.value));
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle quiz response from EnhancedQuizOverlay
  const handleQuizResponse = async (data: { questionId: string; answer: string; isCorrect: boolean }) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: data.questionId,
          answer: data.answer,
          is_correct: data.isCorrect,
        }),
      });
      const json = await res.json();
      setAnsweredQuestions((prev) => new Set(prev).add(data.questionId));
      if (data.isCorrect) {
        setCorrectQuestions((prev) => new Set(prev).add(data.questionId));
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
      return { canRetry: json.can_retry ?? false };
    } catch {
      return { canRetry: false };
    }
  };

  const handleRewatchQuiz = useCallback(() => {
    const nextQuestion = questions
      .filter((question) => !correctQuestions.has(question.id))
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)[0];

    setShowProgressGate(false);

    if (videoRef.current && nextQuestion) {
      videoRef.current.currentTime = nextQuestion.timestamp_seconds;
      setCurrentTime(nextQuestion.timestamp_seconds);
      videoRef.current.play();
      setIsPlaying(true);
      return;
    }

    videoRef.current?.play();
    setIsPlaying(true);
  }, [correctQuestions, questions]);

  const handleVideoEnded = useCallback(() => {
    if (quizSettings.require_pass_to_continue && correctQuestions.size < quizSettings.min_pass_questions) {
      setShowProgressGate(true);
    }
  }, [correctQuestions, quizSettings]);

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
      last_position_seconds: Math.floor(duration),
      total_watch_time_seconds: Math.floor(duration),
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

  const videoUrl = resolvedVideoSource?.url || "";

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
