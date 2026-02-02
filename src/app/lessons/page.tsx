"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import type { Lesson, Subject, LessonProgress } from "@/lib/database.types";

const translations = {
  ar: {
    lessons: "الدروس",
    searchPlaceholder: "ابحث عن درس...",
    allSubjects: "جميع المواد",
    allGrades: "جميع الصفوف",
    grade: "الصف",
    continueWatching: "متابعة المشاهدة",
    noLessonsFound: "لم يتم العثور على دروس",
    tryAdjusting: "جرب تعديل الفلاتر أو البحث",
    minutes: "دقيقة",
    completed: "مكتمل",
    inProgress: "قيد التقدم",
    notStarted: "لم يبدأ",
    loading: "جاري التحميل...",
    back: "العودة",
    watchNow: "شاهد الآن",
    resume: "استمر",
  },
  en: {
    lessons: "Lessons",
    searchPlaceholder: "Search for a lesson...",
    allSubjects: "All Subjects",
    allGrades: "All Grades",
    grade: "Grade",
    continueWatching: "Continue Watching",
    noLessonsFound: "No lessons found",
    tryAdjusting: "Try adjusting your filters or search",
    minutes: "min",
    completed: "Completed",
    inProgress: "In Progress",
    notStarted: "Not Started",
    loading: "Loading...",
    back: "Back",
    watchNow: "Watch Now",
    resume: "Resume",
  },
};

// Icons
const Icons = {
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  play: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  book: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  filter: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
    </svg>
  ),
  video: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
};

type LessonWithProgress = Lesson & {
  progress?: LessonProgress | null;
  subject?: Subject | null;
};

export default function LessonsPage() {
  const [lessons, setLessons] = useState<LessonWithProgress[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  // Get subject from URL params
  useEffect(() => {
    const subjectParam = searchParams.get("subject");
    if (subjectParam) {
      setSelectedSubject(subjectParam);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Fetch subjects
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .order("display_order");
      if (subjectsData) setSubjects(subjectsData);

      // Fetch lessons with progress
      const { data: lessonsData } = await supabase
        .from("lessons")
        .select(`
          *,
          subject:subjects(*),
          progress:lesson_progress(*)
        `)
        .eq("is_published", true)
        .order("display_order");

      if (lessonsData) {
        // Map progress to single record per lesson for current user
        const mappedLessons = lessonsData.map((lesson) => ({
          ...lesson,
          progress: Array.isArray(lesson.progress)
            ? lesson.progress.find((p: LessonProgress) => p.student_id === user.id) || null
            : lesson.progress,
        }));
        setLessons(mappedLessons);
      }

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter((lesson) => {
      // Subject filter
      if (selectedSubject !== "all" && lesson.subject_id !== selectedSubject) {
        return false;
      }

      // Grade filter
      if (selectedGrade !== "all" && lesson.grade_level !== parseInt(selectedGrade)) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const titleMatch = language === "ar"
          ? lesson.title_ar.toLowerCase().includes(query)
          : lesson.title_en.toLowerCase().includes(query);
        const descMatch = language === "ar"
          ? (lesson.description_ar || "").toLowerCase().includes(query)
          : (lesson.description_en || "").toLowerCase().includes(query);
        return titleMatch || descMatch;
      }

      return true;
    });
  }, [lessons, selectedSubject, selectedGrade, searchQuery, language]);

  // Get in-progress lessons for "Continue Watching"
  const inProgressLessons = useMemo(() => {
    return lessons.filter(
      (lesson) => lesson.progress && !lesson.progress.completed && lesson.progress.last_position_seconds > 0
    );
  }, [lessons]);

  // Get unique grade levels
  const gradeOptions = useMemo(() => {
    const grades = [...new Set(lessons.map((l) => l.grade_level))].sort((a, b) => a - b);
    return grades;
  }, [lessons]);

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "0 " + t.minutes;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${t.minutes}`;
  };

  const getProgressStatus = (lesson: LessonWithProgress) => {
    if (!lesson.progress) return "not_started";
    if (lesson.progress.completed) return "completed";
    if (lesson.progress.last_position_seconds > 0) return "in_progress";
    return "not_started";
  };

  const getProgressPercentage = (lesson: LessonWithProgress) => {
    if (!lesson.progress || !lesson.video_duration_seconds) return 0;
    return Math.round((lesson.progress.last_position_seconds / lesson.video_duration_seconds) * 100);
  };

  // Subject colors for badges
  const getSubjectColor = (subjectId: string) => {
    const index = subjects.findIndex((s) => s.id === subjectId);
    const colors = [
      "bg-violet-100 text-violet-700",
      "bg-cyan-100 text-cyan-700",
      "bg-emerald-100 text-[#007229]",
      "bg-amber-100 text-amber-700",
      "bg-pink-100 text-pink-700",
      "bg-indigo-100 text-indigo-700",
    ];
    return colors[index % colors.length];
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <OwlThinking className="w-20 h-20 mx-auto mb-4" />
              <p className="text-gray-500">{t.loading}</p>
            </div>
          </div>
        ) : (
        <>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30">
                {Icons.book}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{t.lessons}</h1>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <span className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${isRtl ? "right-4" : "left-4"}`}>
                {Icons.search}
              </span>
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                  isRtl ? "pr-12 pl-4" : "pl-12 pr-4"
                }`}
              />
            </div>

            {/* Subject Filter */}
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer min-w-[160px]"
            >
              <option value="all">{t.allSubjects}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {language === "ar" ? subject.name_ar : subject.name_en}
                </option>
              ))}
            </select>

            {/* Grade Filter */}
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer min-w-[140px]"
            >
              <option value="all">{t.allGrades}</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {t.grade} {grade}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Continue Watching Section */}
        {inProgressLessons.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-amber-500">{Icons.play}</span>
              {t.continueWatching}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
              {inProgressLessons.map((lesson) => (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.id}`}
                  className="flex-shrink-0 w-72 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200">
                    {lesson.thumbnail_url ? (
                      <img
                        src={lesson.thumbnail_url}
                        alt={language === "ar" ? lesson.title_ar : lesson.title_en}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        {Icons.video}
                      </div>
                    )}
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                      <div
                        className="h-full bg-[#007229]/100"
                        style={{ width: `${getProgressPercentage(lesson)}%` }}
                      />
                    </div>
                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-[#007229]">
                        {Icons.play}
                      </div>
                    </div>
                  </div>
                  {/* Info */}
                  <div className="p-4">
                    <p className="font-semibold text-gray-900 line-clamp-1 mb-1">
                      {language === "ar" ? lesson.title_ar : lesson.title_en}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSubjectColor(lesson.subject_id)}`}>
                        {lesson.subject && (language === "ar" ? lesson.subject.name_ar : lesson.subject.name_en)}
                      </span>
                      <span>{getProgressPercentage(lesson)}%</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Lessons Grid */}
        {filteredLessons.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLessons.map((lesson) => {
              const status = getProgressStatus(lesson);
              const progress = getProgressPercentage(lesson);

              return (
                <Link
                  key={lesson.id}
                  href={`/lessons/${lesson.id}`}
                  className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all"
                >
                  {/* Thumbnail */}
                  <div className="relative h-44 bg-gradient-to-br from-gray-100 to-gray-200">
                    {lesson.thumbnail_url ? (
                      <img
                        src={lesson.thumbnail_url}
                        alt={language === "ar" ? lesson.title_ar : lesson.title_en}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                        {Icons.video}
                      </div>
                    )}

                    {/* Status Badge */}
                    {status === "completed" && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-[#007229]/100 text-white text-xs font-semibold rounded-full">
                        {Icons.check}
                        <span>{t.completed}</span>
                      </div>
                    )}
                    {status === "in_progress" && (
                      <div className="absolute top-3 right-3 px-2 py-1 bg-amber-500 text-white text-xs font-semibold rounded-full">
                        {progress}%
                      </div>
                    )}

                    {/* Duration */}
                    <div className={`absolute bottom-3 ${isRtl ? "left-3" : "right-3"} flex items-center gap-1 px-2 py-1 bg-black/60 text-white text-xs font-medium rounded-full`}>
                      {Icons.clock}
                      <span>{formatDuration(lesson.video_duration_seconds)}</span>
                    </div>

                    {/* Progress bar for in-progress */}
                    {status === "in_progress" && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-300/50">
                        <div
                          className="h-full bg-[#007229]/100"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="px-4 py-2 bg-white rounded-full font-semibold text-[#007229] flex items-center gap-2 shadow-lg">
                        {Icons.play}
                        <span>{status === "in_progress" ? t.resume : t.watchNow}</span>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-[#007229] transition-colors">
                        {language === "ar" ? lesson.title_ar : lesson.title_en}
                      </h3>
                    </div>

                    {/* Description */}
                    {(lesson.description_ar || lesson.description_en) && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {language === "ar" ? lesson.description_ar : lesson.description_en}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getSubjectColor(lesson.subject_id)}`}>
                        {lesson.subject && (language === "ar" ? lesson.subject.name_ar : lesson.subject.name_en)}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">
                        {t.grade} {lesson.grade_level}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-16">
            <OwlSad className="w-24 h-24 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.noLessonsFound}</h3>
            <p className="text-gray-500">{t.tryAdjusting}</p>
          </div>
        )}
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
