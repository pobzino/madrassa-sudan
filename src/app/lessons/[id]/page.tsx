"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lesson, LessonQuestion, LessonProgress, Subject } from "@/lib/database.types";
import { OwlTutorIcon, OwlCelebrating, Confetti } from "@/components/illustrations";

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

type VideoQuality = "360p" | "480p" | "720p";

interface QuestionState {
  question: LessonQuestion;
  selectedAnswer: string | null;
  isSubmitted: boolean;
  isCorrect: boolean | null;
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
  const [quality, setQuality] = useState<VideoQuality>("480p");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [captionLang, setCaptionLang] = useState<"ar" | "en" | "off">("off");
  const [showCaptionMenu, setShowCaptionMenu] = useState(false);
  const [volume, setVolume] = useState(1);

  // Question overlay state
  const [activeQuestion, setActiveQuestion] = useState<QuestionState | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());

  // Celebration state
  const [showConfetti, setShowConfetti] = useState(false);

  // Load lesson data
  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      setUserId(user.id);

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
      if (questionsData) setQuestions(questionsData);

      // Fetch progress
      const { data: progressData } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("lesson_id", lessonId)
        .eq("student_id", user.id)
        .single();
      if (progressData) {
        setProgress(progressData);
        setAnsweredQuestions(new Set()); // We'd need to track this separately
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

  // Get video URL based on quality
  const getVideoUrl = useCallback(() => {
    if (!lesson) return "";
    switch (quality) {
      case "720p":
        return lesson.video_url_720p || lesson.video_url_480p || lesson.video_url_360p || "";
      case "480p":
        return lesson.video_url_480p || lesson.video_url_360p || "";
      case "360p":
      default:
        return lesson.video_url_360p || "";
    }
  }, [lesson, quality]);

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    if (!userId || !lessonId || !videoRef.current) return;

    const currentPosition = Math.floor(videoRef.current.currentTime);
    const totalWatchTime = progress?.total_watch_time_seconds || 0;
    const isCompleted = duration > 0 && currentPosition / duration >= 0.9;

    await supabase.from("lesson_progress").upsert({
      student_id: userId,
      lesson_id: lessonId,
      last_position_seconds: currentPosition,
      total_watch_time_seconds: totalWatchTime + 5, // Approximate 5 seconds since last save
      completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
      questions_answered: answeredQuestions.size,
      questions_correct: 0, // Would need to track this
    }, {
      onConflict: "student_id,lesson_id",
    });
  }, [userId, lessonId, duration, progress, answeredQuestions.size, supabase]);

  // Auto-save progress every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying) saveProgress();
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, saveProgress]);

  // Check for questions at current timestamp
  useEffect(() => {
    if (!isPlaying || activeQuestion) return;

    const currentSecond = Math.floor(currentTime);
    const questionAtTime = questions.find(
      (q) => q.timestamp_seconds === currentSecond && !answeredQuestions.has(q.id)
    );

    if (questionAtTime) {
      videoRef.current?.pause();
      setIsPlaying(false);
      setActiveQuestion({
        question: questionAtTime,
        selectedAnswer: null,
        isSubmitted: false,
        isCorrect: null,
      });
    }
  }, [currentTime, questions, answeredQuestions, isPlaying, activeQuestion]);

  // Handle video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      // Resume from last position
      if (progress?.last_position_seconds) {
        videoRef.current.currentTime = progress.last_position_seconds;
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
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Submit question answer
  const handleSubmitAnswer = async () => {
    if (!activeQuestion || !activeQuestion.selectedAnswer) return;

    const isCorrect = activeQuestion.selectedAnswer === activeQuestion.question.correct_answer;

    setActiveQuestion({
      ...activeQuestion,
      isSubmitted: true,
      isCorrect,
    });

    setAnsweredQuestions((prev) => new Set(prev).add(activeQuestion.question.id));

    // Celebrate correct answers!
    if (isCorrect) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }

    // Save response to database
    if (userId) {
      await supabase.from("lesson_question_responses").upsert({
        student_id: userId,
        question_id: activeQuestion.question.id,
        answer: activeQuestion.selectedAnswer,
        is_correct: isCorrect,
        attempts: 1,
      }, {
        onConflict: "student_id,question_id",
      });
    }
  };

  // Continue after question
  const handleContinue = () => {
    setActiveQuestion(null);
    videoRef.current?.play();
    setIsPlaying(true);
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Mark lesson as complete
  const handleMarkComplete = async () => {
    if (!userId || !lessonId) return;
    await supabase.from("lesson_progress").upsert({
      student_id: userId,
      lesson_id: lessonId,
      completed: true,
      completed_at: new Date().toISOString(),
      last_position_seconds: Math.floor(duration),
      total_watch_time_seconds: Math.floor(duration),
    }, {
      onConflict: "student_id,lesson_id",
    });
    setProgress((prev) => prev ? { ...prev, completed: true } : null);

    // Celebrate lesson completion!
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br bg-[#007229] flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 animate-bounce shadow-lg">
            م
          </div>
          <p className="text-gray-400 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">{t.lessonNotFound}</p>
          <Link
            href="/lessons"
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            {t.backToLessons}
          </Link>
        </div>
      </div>
    );
  }

  const videoUrl = getVideoUrl();

  return (
    <div className="min-h-screen bg-gray-900" dir={isRtl ? "rtl" : "ltr"}>
      {/* Celebration confetti */}
      {showConfetti && <Confetti />}

      {/* Top bar */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/lessons"
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <span className={isRtl ? "rotate-180 inline-block" : ""}>{Icons.back}</span>
            </Link>
            <div>
              <h1 className="text-white font-semibold">
                {language === "ar" ? lesson.title_ar : lesson.title_en}
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                {subject && <span>{language === "ar" ? subject.name_ar : subject.name_en}</span>}
                <span>•</span>
                <span>{t.grade} {lesson.grade_level}</span>
              </div>
            </div>
          </div>

          {/* Completion status */}
          {progress?.completed ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 rounded-full text-sm font-medium">
              {Icons.check}
              <span>{t.completed}</span>
            </div>
          ) : (
            <button
              onClick={handleMarkComplete}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
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
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
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
            {!isPlaying && !activeQuestion && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                onClick={togglePlay}
              >
                <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center text-[#007229] shadow-xl">
                  {Icons.play}
                </div>
              </div>
            )}

            {/* Question Overlay */}
            {activeQuestion && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-fade-up">
                  <div className="flex items-center gap-2 text-[#007229] font-semibold mb-4">
                    <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-lg">?</span>
                    <span>{t.question}</span>
                  </div>

                  <p className="text-lg font-medium text-gray-900 mb-4">
                    {language === "ar"
                      ? activeQuestion.question.question_text_ar
                      : activeQuestion.question.question_text_en || activeQuestion.question.question_text_ar}
                  </p>

                  {/* Multiple choice options */}
                  {activeQuestion.question.question_type === "multiple_choice" && activeQuestion.question.options && (
                    <div className="space-y-2 mb-4">
                      {(activeQuestion.question.options as string[]).map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => !activeQuestion.isSubmitted && setActiveQuestion({
                            ...activeQuestion,
                            selectedAnswer: option,
                          })}
                          disabled={activeQuestion.isSubmitted}
                          className={`w-full p-3 rounded-xl border text-left transition-all ${
                            activeQuestion.selectedAnswer === option
                              ? activeQuestion.isSubmitted
                                ? activeQuestion.isCorrect
                                  ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                                  : option === activeQuestion.question.correct_answer
                                    ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                                    : "bg-red-100 border-red-500 text-red-800"
                                : "bg-[#007229]/10 border-emerald-500"
                              : activeQuestion.isSubmitted && option === activeQuestion.question.correct_answer
                                ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* True/False */}
                  {activeQuestion.question.question_type === "true_false" && (
                    <div className="flex gap-3 mb-4">
                      {["true", "false"].map((option) => (
                        <button
                          key={option}
                          onClick={() => !activeQuestion.isSubmitted && setActiveQuestion({
                            ...activeQuestion,
                            selectedAnswer: option,
                          })}
                          disabled={activeQuestion.isSubmitted}
                          className={`flex-1 p-3 rounded-xl border font-medium transition-all ${
                            activeQuestion.selectedAnswer === option
                              ? activeQuestion.isSubmitted
                                ? activeQuestion.isCorrect
                                  ? "bg-emerald-100 border-emerald-500 text-emerald-800"
                                  : "bg-red-100 border-red-500 text-red-800"
                                : "bg-[#007229]/10 border-emerald-500"
                              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {option === "true" ? (language === "ar" ? "صحيح" : "True") : (language === "ar" ? "خطأ" : "False")}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Feedback */}
                  {activeQuestion.isSubmitted && (
                    <div className={`p-3 rounded-xl mb-4 ${
                      activeQuestion.isCorrect ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}>
                      <div className="flex items-center gap-2">
                        {activeQuestion.isCorrect && <OwlCelebrating className="w-10 h-10" />}
                        <p className="font-semibold">
                          {activeQuestion.isCorrect ? t.correct : t.incorrect}
                        </p>
                      </div>
                      {(activeQuestion.question.explanation_ar || activeQuestion.question.explanation_en) && (
                        <p className="text-sm mt-1">
                          {language === "ar"
                            ? activeQuestion.question.explanation_ar
                            : activeQuestion.question.explanation_en}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-3">
                    {!activeQuestion.isSubmitted ? (
                      <button
                        onClick={handleSubmitAnswer}
                        disabled={!activeQuestion.selectedAnswer}
                        className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t.submit}
                      </button>
                    ) : (
                      <>
                        <Link
                          href={`/tutor?lesson=${lessonId}`}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          <OwlTutorIcon className="w-5 h-5" />
                          <span>{t.askTutor}</span>
                        </Link>
                        <button
                          onClick={handleContinue}
                          className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                        >
                          {t.continue}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
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
                      {quality}
                    </button>
                    {showQualityMenu && (
                      <div className="absolute bottom-full right-0 mb-2 bg-gray-800 rounded-lg shadow-xl overflow-hidden">
                        {(["720p", "480p", "360p"] as VideoQuality[]).map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setQuality(q);
                              setShowQualityMenu(false);
                            }}
                            className={`block w-full px-4 py-2 text-sm text-left hover:bg-gray-700 ${
                              quality === q ? "text-emerald-400" : "text-white"
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
      <div className="bg-gray-800 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Lesson description */}
          {(lesson.description_ar || lesson.description_en) && (
            <p className="text-gray-300 mb-4">
              {language === "ar" ? lesson.description_ar : lesson.description_en}
            </p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            {adjacentLessons.prev ? (
              <Link
                href={`/lessons/${adjacentLessons.prev.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 transition-colors"
              >
                {isRtl ? Icons.chevronRight : Icons.chevronLeft}
                <span className="hidden sm:inline">{t.prevLesson}</span>
              </Link>
            ) : (
              <div />
            )}

            {/* Progress indicator */}
            <div className="text-gray-400 text-sm">
              {questions.length > 0 && (
                <span>
                  {t.progress}: {answeredQuestions.size} {t.of} {questions.length}
                </span>
              )}
            </div>

            {adjacentLessons.next ? (
              <Link
                href={`/lessons/${adjacentLessons.next.id}`}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
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
    </div>
  );
}
