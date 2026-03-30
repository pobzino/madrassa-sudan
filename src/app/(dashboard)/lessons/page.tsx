"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import type { Lesson, Subject, LessonProgress } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    explore: "استكشاف",
    searchPlaceholder: "ابحث عن درس...",
    allSubjects: "الكل",
    continueWatching: "متابعة المشاهدة",
    noLessonsFound: "لم يتم العثور على دروس",
    tryAdjusting: "جرب تعديل الفلاتر أو البحث",
    minutes: "د",
    completed: "مكتمل",
    inProgress: "قيد التقدم",
    loading: "جاري التحميل...",
    watchNow: "شاهد الآن",
    resume: "استمر",
    grade: "الصف",
    seeAll: "عرض الكل",
    newLessons: "دروس جديدة",
  },
  en: {
    explore: "Explore",
    searchPlaceholder: "Search lessons...",
    allSubjects: "All",
    continueWatching: "Continue Watching",
    noLessonsFound: "No lessons found",
    tryAdjusting: "Try adjusting your filters or search",
    minutes: "min",
    completed: "Completed",
    inProgress: "In Progress",
    loading: "Loading...",
    watchNow: "Watch",
    resume: "Resume",
    grade: "Grade",
    seeAll: "See all",
    newLessons: "New Lessons",
  },
};

const SUBJECT_COLORS = [
  { bg: "bg-violet-500", light: "bg-violet-50 text-violet-700", chip: "bg-violet-100 text-violet-700 ring-violet-200" },
  { bg: "bg-cyan-500", light: "bg-cyan-50 text-cyan-700", chip: "bg-cyan-100 text-cyan-700 ring-cyan-200" },
  { bg: "bg-emerald-500", light: "bg-emerald-50 text-emerald-700", chip: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  { bg: "bg-amber-500", light: "bg-amber-50 text-amber-700", chip: "bg-amber-100 text-amber-700 ring-amber-200" },
  { bg: "bg-pink-500", light: "bg-pink-50 text-pink-700", chip: "bg-pink-100 text-pink-700 ring-pink-200" },
  { bg: "bg-indigo-500", light: "bg-indigo-50 text-indigo-700", chip: "bg-indigo-100 text-indigo-700 ring-indigo-200" },
  { bg: "bg-rose-500", light: "bg-rose-50 text-rose-700", chip: "bg-rose-100 text-rose-700 ring-rose-200" },
  { bg: "bg-teal-500", light: "bg-teal-50 text-teal-700", chip: "bg-teal-100 text-teal-700 ring-teal-200" },
];

type LessonWithProgress = Lesson & {
  progress?: LessonProgress | null;
  subject?: Subject | null;
};

export default function LessonsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";
  const [lessons, setLessons] = useState<LessonWithProgress[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>(
    () => searchParams.get("subject") ?? "all"
  );

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .order("display_order");
      if (subjectsData) setSubjects(subjectsData);

      const { data: lessonsData } = await supabase
        .from("lessons")
        .select(`*, subject:subjects(*), progress:lesson_progress(*)`)
        .eq("is_published", true)
        .order("updated_at", { ascending: false });

      if (lessonsData) {
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

  const inProgressLessons = useMemo(
    () =>
      lessons.filter(
        (l) => l.progress && !l.progress.completed && l.progress.last_position_seconds > 0
      ),
    [lessons]
  );

  const searchFiltered = useMemo(() => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    return lessons.filter(
      (l) =>
        l.title_ar.toLowerCase().includes(q) ||
        l.title_en.toLowerCase().includes(q) ||
        (l.description_ar || "").toLowerCase().includes(q) ||
        (l.description_en || "").toLowerCase().includes(q)
    );
  }, [lessons, searchQuery]);

  const subjectFiltered = useMemo(() => {
    if (selectedSubject === "all") return null;
    return lessons.filter((l) => l.subject_id === selectedSubject);
  }, [lessons, selectedSubject]);

  // Group lessons by subject for the browse sections
  const lessonsBySubject = useMemo(() => {
    const map = new Map<string, { subject: Subject; lessons: LessonWithProgress[] }>();
    for (const lesson of lessons) {
      if (!lesson.subject) continue;
      const existing = map.get(lesson.subject_id);
      if (existing) {
        existing.lessons.push(lesson);
      } else {
        map.set(lesson.subject_id, { subject: lesson.subject, lessons: [lesson] });
      }
    }
    return Array.from(map.values());
  }, [lessons]);

  const getSubjectColor = (subjectId: string) => {
    const index = subjects.findIndex((s) => s.id === subjectId);
    return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.ceil(seconds / 60);
    return `${mins} ${t.minutes}`;
  };

  const getProgress = (lesson: LessonWithProgress) => {
    if (!lesson.progress || !lesson.video_duration_seconds) return 0;
    return Math.round(
      (lesson.progress.last_position_seconds / lesson.video_duration_seconds) * 100
    );
  };

  const isCompleted = (lesson: LessonWithProgress) =>
    lesson.progress?.completed === true;

  // Which list to render
  const showSearchResults = searchQuery.length > 0;
  const showSubjectFilter = !showSearchResults && selectedSubject !== "all";
  const showBrowse = !showSearchResults && !showSubjectFilter;
  const displayList = showSearchResults
    ? searchFiltered
    : showSubjectFilter
      ? subjectFiltered
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <OwlThinking className="w-20 h-20 mx-auto mb-4" />
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 py-6 ${isRtl ? "text-right" : ""}`}>
      {/* Search bar */}
      <div className="mb-5">
        <div className="relative max-w-xl">
          <svg
            className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 ${isRtl ? "right-3.5" : "left-3.5"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
              isRtl ? "pr-11 pl-4" : "pl-11 pr-4"
            }`}
          />
        </div>
      </div>

      {/* Subject chips */}
      <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
        <button
          onClick={() => { setSelectedSubject("all"); setSearchQuery(""); }}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            selectedSubject === "all" && !searchQuery
              ? "bg-gray-900 text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {t.allSubjects}
        </button>
        {subjects.map((subject) => {
          const colors = getSubjectColor(subject.id);
          const active = selectedSubject === subject.id && !searchQuery;
          return (
            <button
              key={subject.id}
              onClick={() => { setSelectedSubject(subject.id); setSearchQuery(""); }}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                active
                  ? `${colors.chip} ring-1`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {language === "ar" ? subject.name_ar : subject.name_en}
            </button>
          );
        })}
      </div>

      {/* Search or filter results */}
      {displayList !== null && (
        <>
          {displayList.length === 0 ? (
            <div className="text-center py-16">
              <OwlSad className="w-20 h-20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{t.noLessonsFound}</h3>
              <p className="text-sm text-gray-500">{t.tryAdjusting}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {displayList.map((lesson) => (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  language={language}
                  t={t}
                  isRtl={isRtl}
                  color={getSubjectColor(lesson.subject_id)}
                  progress={getProgress(lesson)}
                  completed={isCompleted(lesson)}
                  duration={formatDuration(lesson.video_duration_seconds)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Browse mode — sectioned by subject */}
      {showBrowse && (
        <div className="space-y-8">
          {/* Continue Watching */}
          {inProgressLessons.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-1 h-5 bg-amber-400 rounded-full" />
                {t.continueWatching}
              </h2>
              <HorizontalScroll isRtl={isRtl}>
                {inProgressLessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    language={language}
                    t={t}
                    isRtl={isRtl}
                    color={getSubjectColor(lesson.subject_id)}
                    progress={getProgress(lesson)}
                    completed={false}
                    duration={formatDuration(lesson.video_duration_seconds)}
                    compact
                  />
                ))}
              </HorizontalScroll>
            </section>
          )}

          {/* Per-subject sections */}
          {lessonsBySubject.map(({ subject, lessons: subjectLessons }) => {
            const color = getSubjectColor(subject.id);
            return (
              <section key={subject.id}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span className={`w-1 h-5 ${color.bg} rounded-full`} />
                    {language === "ar" ? subject.name_ar : subject.name_en}
                    <span className="text-sm font-normal text-gray-400 ml-1">
                      {subjectLessons.length}
                    </span>
                  </h2>
                  {subjectLessons.length > 5 && (
                    <button
                      onClick={() => setSelectedSubject(subject.id)}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      {t.seeAll}
                    </button>
                  )}
                </div>
                <HorizontalScroll isRtl={isRtl}>
                  {subjectLessons.map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      language={language}
                      t={t}
                      isRtl={isRtl}
                      color={color}
                      progress={getProgress(lesson)}
                      completed={isCompleted(lesson)}
                      duration={formatDuration(lesson.video_duration_seconds)}
                      compact
                    />
                  ))}
                </HorizontalScroll>
              </section>
            );
          })}

          {lessonsBySubject.length === 0 && (
            <div className="text-center py-16">
              <OwlSad className="w-20 h-20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{t.noLessonsFound}</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Horizontal Scroll Container ─── */

function HorizontalScroll({ children, isRtl }: { children: React.ReactNode; isRtl: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    if (isRtl) {
      setCanScrollLeft(scrollLeft < -1);
      setCanScrollRight(Math.abs(scrollLeft) + clientWidth < scrollWidth - 1);
    } else {
      setCanScrollLeft(scrollLeft > 1);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el?.removeEventListener("scroll", checkScroll);
  });

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-9 h-9 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 w-9 h-9 bg-white border border-gray-200 rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:bg-gray-50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ─── Lesson Card ─── */

function LessonCard({
  lesson,
  language,
  t,
  isRtl,
  color,
  progress,
  completed,
  duration,
  compact,
}: {
  lesson: LessonWithProgress;
  language: "ar" | "en";
  t: (typeof translations)["en"];
  isRtl: boolean;
  color: (typeof SUBJECT_COLORS)[0];
  progress: number;
  completed: boolean;
  duration: string | null;
  compact?: boolean;
}) {
  const title = language === "ar" ? lesson.title_ar : lesson.title_en;
  const subjectName =
    lesson.subject &&
    (language === "ar" ? lesson.subject.name_ar : lesson.subject.name_en);
  const hasProgress = progress > 0 && !completed;

  return (
    <Link
      href={`/lessons/${lesson.id}`}
      className={`group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all flex-shrink-0 ${
        compact ? "w-56 sm:w-64" : ""
      }`}
    >
      {/* Thumbnail */}
      <div className={`relative ${compact ? "h-32" : "h-36 sm:h-40"} bg-gradient-to-br from-gray-100 to-gray-200`}>
        {lesson.thumbnail_url ? (
          <Image
            src={lesson.thumbnail_url}
            alt={title}
            fill
            sizes={compact ? "256px" : "(max-width:640px) 50vw, 25vw"}
            className="object-cover"
          />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center ${color.bg} bg-opacity-10`}>
            <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        )}

        {/* Duration pill */}
        {duration && (
          <span className={`absolute bottom-2 ${isRtl ? "left-2" : "right-2"} px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-medium rounded`}>
            {duration}
          </span>
        )}

        {/* Completed badge */}
        {completed && (
          <span className={`absolute top-2 ${isRtl ? "left-2" : "right-2"} flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </span>
        )}

        {/* Progress bar */}
        {hasProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Hover play */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <svg className="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5.14v14l11-7-11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors mb-1.5">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {subjectName && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${color.light}`}>
              {subjectName}
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-medium">
            {t.grade} {lesson.grade_level}
          </span>
        </div>
      </div>
    </Link>
  );
}
