"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type {
  Lesson,
  LessonProgress,
  LessonQuestion,
  LessonSlideResponse,
  QuizSettings,
  Subject,
} from "@/lib/database.types";
import type { LessonTask } from "@/lib/tasks.types";
import type { Slide } from "@/lib/slides.types";
import { Confetti } from "@/components/illustrations";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import EnhancedQuizOverlay from "@/components/lessons/EnhancedQuizOverlay";
import ProgressGateModal from "@/components/lessons/ProgressGateModal";
import TaskOverlay from "@/components/tasks/TaskOverlay";
import SlideInteractionOverlay from "@/components/lessons/SlideInteractionOverlay";
import {
  getInteractiveSlides,
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
    "1080p": lesson?.video_url_1080p || "",
    "360p": lesson?.video_url_360p || "",
    "480p": lesson?.video_url_480p || "",
    "720p": lesson?.video_url_720p || "",
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

  // Task overlay state
  const [tasks, setTasks] = useState<LessonTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<LessonTask | null>(null);

  // Slide interaction state
  const [slideDeck, setSlideDeck] = useState<Slide[]>([]);
  const [activeSlideInteraction, setActiveSlideInteraction] = useState<Slide | null>(null);
  const [slideInteractionResponses, setSlideInteractionResponses] = useState<StoredSlideInteractionResponses>({});

  // Progress gate state
  const [showProgressGate, setShowProgressGate] = useState(false);
  const [quizSettings, setQuizSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS);

  // Celebration state
  const [showConfetti, setShowConfetti] = useState(false);

  // Load lesson data
  useEffect(() => {
    async function loadData() {
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

      const [slidesRes, slideResponsesRes] = await Promise.all([
        fetch(`/api/lessons/${lessonId}/slides`)
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
        fetch(`/api/lessons/${lessonId}/slide-responses`)
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

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from("lesson_tasks")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("timestamp_seconds");
      if (tasksData) {
        setTasks(tasksData as unknown as LessonTask[]);

        if (tasksData.length > 0) {
          const { data: taskResponseData } = await supabase
            .from("lesson_task_responses")
            .select("task_id")
            .eq("student_id", user.id)
            .in("task_id", tasksData.map((task) => task.id));

          if (taskResponseData) {
            setCompletedTasks(new Set(taskResponseData.map((response) => response.task_id)));
          }
        }
      }

      // Fetch progress
      const { data: progressData } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("lesson_id", lessonId)
        .eq("student_id", user.id)
        .single();
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

  const findDueInteractiveSlide = useCallback(
    (atSecond: number) => {
      const interactiveSlides = getInteractiveSlides(
        slideDeck,
        duration || lesson?.video_duration_seconds || null
      );

      return (
        interactiveSlides.find(
          ({ slide, triggerSecond }) =>
            triggerSecond <= atSecond && !slideInteractionResponses[slide.id]
        )?.slide || null
      );
    },
    [duration, lesson?.video_duration_seconds, slideDeck, slideInteractionResponses]
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

    const { data: updatedProgress } = await supabase.from("lesson_progress").upsert({
      student_id: userId,
      lesson_id: lessonId,
      last_position_seconds: currentPosition,
      total_watch_time_seconds: totalWatchTime + 5, // Approximate 5 seconds since last save
      completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      questions_answered: answeredQuestions.size,
      questions_correct: questionsCorrect,
      quiz_passed: questionsCorrect >= quizSettings.min_pass_questions,
    }, {
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

  // Handle video time update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;

    const nextTime = videoRef.current.currentTime;
    setCurrentTime(nextTime);

    if (!isPlaying || activeQuestion || activeTask || activeSlideInteraction) {
      return;
    }

    const currentSecond = Math.floor(nextTime);
    const questionAtTime = questions.find(
      (question) => question.timestamp_seconds === currentSecond && !answeredQuestions.has(question.id)
    );

    if (questionAtTime) {
      videoRef.current.pause();
      setIsPlaying(false);
      setActiveQuestion(questionAtTime);
      return;
    }

    const taskAtTime = tasks.find(
      (task) => task.timestamp_seconds === currentSecond && !completedTasks.has(task.id)
    );

    if (taskAtTime) {
      videoRef.current.pause();
      setIsPlaying(false);
      setActiveTask(taskAtTime);
      return;
    }

    const interactiveSlideAtTime = findDueInteractiveSlide(currentSecond);

    if (interactiveSlideAtTime) {
      videoRef.current.pause();
      setIsPlaying(false);
      setActiveSlideInteraction(interactiveSlideAtTime);
    }
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setVideoErrorMessage(null);
      // Resume from last position
      if (progress?.last_position_seconds) {
        videoRef.current.currentTime = progress.last_position_seconds;
      }
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!videoRef.current || activeQuestion || activeTask || activeSlideInteraction) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Handle seeking
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
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
    const pendingInteractiveSlide = findDueInteractiveSlide(Math.floor(duration || 0));

    if (pendingInteractiveSlide) {
      setActiveSlideInteraction(pendingInteractiveSlide);
      setIsPlaying(false);
      return;
    }

    if (quizSettings.require_pass_to_continue && correctQuestions.size < quizSettings.min_pass_questions) {
      setShowProgressGate(true);
    }
  }, [correctQuestions, duration, findDueInteractiveSlide, quizSettings]);

  // Mark lesson as complete
  const handleMarkComplete = async () => {
    if (!userId || !lessonId) return;

    const pendingInteractiveSlide = findDueInteractiveSlide(Math.floor(duration || 0));

    if (pendingInteractiveSlide) {
      setActiveSlideInteraction(pendingInteractiveSlide);
      return;
    }

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
          <p className="text-gray-500 text-lg mb-4">{t.lessonNotFound}</p>
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
  const timedInteractiveSlides = getInteractiveSlides(
    slideDeck,
    duration || lesson.video_duration_seconds || null
  );
  const completedInteractiveSlideCount = timedInteractiveSlides.filter(
    ({ slide }) => slideInteractionResponses[slide.id]
  ).length;

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
            <div>
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

      {/* Video Player */}
      <div className="relative bg-black aspect-video max-h-[70vh] mx-auto">
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full"
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleVideoEnded}
              onPlay={() => {
                setIsPlaying(true);
                setVideoErrorMessage(null);
              }}
              onPause={() => setIsPlaying(false)}
              onError={handleVideoError}
              onClick={togglePlay}
            >
              {captionLang === "ar" && lesson.captions_ar_url && (
                <track kind="subtitles" src={lesson.captions_ar_url} srcLang="ar" label="Arabic" default />
              )}
              {captionLang === "en" && lesson.captions_en_url && (
                <track kind="subtitles" src={lesson.captions_en_url} srcLang="en" label="English" default />
              )}
            </video>

            {/* Play button overlay when paused */}
            {!isPlaying && !activeQuestion && !activeTask && !activeSlideInteraction && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                onClick={togglePlay}
              >
                <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center text-[#007229] shadow-xl">
                  {Icons.play}
                </div>
              </div>
            )}

            {videoErrorMessage && (
              <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-amber-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
                {videoErrorMessage}
              </div>
            )}

            {/* Question Overlay */}
            {activeQuestion && (
              <EnhancedQuizOverlay
                question={activeQuestion}
                settings={quizSettings}
                onComplete={() => {
                  setActiveQuestion(null);
                  videoRef.current?.play();
                  setIsPlaying(true);
                }}
                onResponse={handleQuizResponse}
              />
            )}

            {/* Task Overlay */}
            {activeTask && (
              <TaskOverlay
                task={activeTask}
                lessonId={lessonId}
                onComplete={() => {
                  setCompletedTasks(prev => new Set(prev).add(activeTask.id));
                  setActiveTask(null);
                  videoRef.current?.play();
                  setIsPlaying(true);
                }}
                onSkip={() => {
                  setCompletedTasks(prev => new Set(prev).add(activeTask.id));
                  setActiveTask(null);
                  videoRef.current?.play();
                  setIsPlaying(true);
                }}
              />
            )}

            {/* Slide Interaction Overlay */}
            {activeSlideInteraction && (
              <SlideInteractionOverlay
                key={activeSlideInteraction.id}
                slide={activeSlideInteraction}
                language={language}
                onComplete={(result) => {
                  persistSlideInteractionResponse(activeSlideInteraction.id, result);
                  if (result.isCorrect) {
                    setShowConfetti(true);
                    setTimeout(() => setShowConfetti(false), 3000);
                  }
                  setActiveSlideInteraction(null);
                  videoRef.current?.play();
                  setIsPlaying(true);
                }}
              />
            )}

            {/* Video Controls */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              {/* Progress bar */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-white text-sm font-mono">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#007229]/100"
                />
                <span className="text-white text-sm font-mono">{formatTime(duration)}</span>
              </div>

              {/* Control buttons */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {isPlaying ? Icons.pause : <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
                  </button>

                  {/* Volume */}
                  <div className="flex items-center gap-1">
                    <button className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors">
                      {Icons.volume}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={volume}
                      onChange={(e) => {
                        const vol = parseFloat(e.target.value);
                        setVolume(vol);
                        if (videoRef.current) videoRef.current.volume = vol;
                      }}
                      className="w-20 h-1 bg-gray-600 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quality */}
                  <div className="relative">
                    <button
                      onClick={() => setShowQualityMenu(!showQualityMenu)}
                      className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors text-sm font-medium"
                    >
                      {resolvedVideoSource?.quality || quality}
                    </button>
                    {showQualityMenu && (
                      <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                        {VIDEO_QUALITIES.map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setFailedQualities([]);
                              setVideoErrorMessage(null);
                              setQuality(q);
                              setShowQualityMenu(false);
                            }}
                            disabled={!availableQualities.includes(q)}
                            className={`block w-full px-4 py-2 text-sm text-left ${
                              availableQualities.includes(q)
                                ? "hover:bg-gray-700"
                                : "cursor-not-allowed text-gray-500"
                            } ${
                              (resolvedVideoSource?.quality || quality) === q ? "text-emerald-400" : "text-white"
                            }`}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Captions */}
                  <div className="relative">
                    <button
                      onClick={() => setShowCaptionMenu(!showCaptionMenu)}
                      className={`p-2 rounded-lg transition-colors ${
                        captionLang !== "off" ? "text-emerald-400 bg-emerald-400/20" : "text-white hover:bg-white/20"
                      }`}
                    >
                      {Icons.caption}
                    </button>
                    {showCaptionMenu && (
                      <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                        {[
                          { value: "ar", label: t.captionsAr },
                          { value: "en", label: t.captionsEn },
                          { value: "off", label: t.captionsOff },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setCaptionLang(opt.value as "ar" | "en" | "off");
                              setShowCaptionMenu(false);
                            }}
                            className={`block w-full px-4 py-2 text-sm text-left hover:bg-gray-700 ${
                              captionLang === opt.value ? "text-emerald-400" : "text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Fullscreen */}
                  <button
                    onClick={() => videoRef.current?.requestFullscreen()}
                    className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {Icons.fullscreen}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <p>No video available</p>
          </div>
        )}
      </div>

      {/* Bottom info & navigation */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Lesson description */}
          {(lesson.description_ar || lesson.description_en) && (
            <p className="text-gray-600 mb-4">
              {language === "ar" ? lesson.description_ar : lesson.description_en}
            </p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {adjacentLessons.prev ? (
              <Link
                href={`/lessons/${adjacentLessons.prev.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
              >
                {isRtl ? Icons.chevronRight : Icons.chevronLeft}
                <span className="hidden sm:inline">{t.prevLesson}</span>
              </Link>
            ) : (
              <div />
            )}

            {/* Progress indicator */}
            <div className="text-gray-500 text-sm flex items-center gap-3">
              {questions.length > 0 && (
                <span>
                  {t.question}: {answeredQuestions.size}/{questions.length}
                </span>
              )}
              {tasks.length > 0 && (
                <span>
                  {language === "ar" ? "مهام" : "Tasks"}: {completedTasks.size}/{tasks.length}
                </span>
              )}
              {timedInteractiveSlides.length > 0 && (
                <span>
                  {language === "ar" ? "شرائح تفاعلية" : "Interactive Slides"}: {completedInteractiveSlideCount}/{timedInteractiveSlides.length}
                </span>
              )}
            </div>

            {adjacentLessons.next ? (
              <Link
                href={`/lessons/${adjacentLessons.next.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-[#007229] text-white rounded-xl hover:bg-[#005C22] transition-colors shadow-lg shadow-[#007229]/20"
              >
                <span className="hidden sm:inline">{t.nextLesson}</span>
                {isRtl ? Icons.chevronLeft : Icons.chevronRight}
              </Link>
            ) : (
              <div />
            )}
          </div>
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
