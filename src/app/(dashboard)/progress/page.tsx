"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlThinking, OwlCelebrating } from "@/components/illustrations";
import type { Subject, LessonProgress } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    progress: "التقدم والإنجازات",
    overview: "نظرة عامة",
    lessonsCompleted: "دروس مكتملة",
    homeworkCompleted: "واجبات مكتملة",
    currentStreak: "أيام متتالية",
    longestStreak: "أطول سلسلة",
    totalPoints: "إجمالي النقاط",
    bySubject: "حسب المادة",
    lessons: "درس",
    achievements: "الإنجازات",
    locked: "مقفل",
    unlocked: "مفتوح",
    weeklyActivity: "نشاط الأسبوع",
    parentSummary: "ملخص لولي الأمر",
    sessionsThisWeek: "جلسات تعلم هذا الأسبوع",
    focusNext: "ركزوا بعد ذلك على",
    currentStreakLabel: "السلسلة الحالية",
    noFocus: "لا يوجد تركيز واضح بعد",
    noActivity: "لا يوجد نشاط",
    loading: "جاري التحميل...",
    back: "العودة",
    keepLearning: "استمر في التعلم لفتح المزيد من الإنجازات!",
    sun: "أح",
    mon: "إث",
    tue: "ثل",
    wed: "أر",
    thu: "خم",
    fri: "جم",
    sat: "سب",
  },
  en: {
    progress: "Progress & Achievements",
    overview: "Overview",
    lessonsCompleted: "Lessons Completed",
    homeworkCompleted: "Homework Done",
    currentStreak: "Day Streak",
    longestStreak: "Longest Streak",
    totalPoints: "Total Points",
    bySubject: "By Subject",
    lessons: "lessons",
    achievements: "Achievements",
    locked: "Locked",
    unlocked: "Unlocked",
    weeklyActivity: "Weekly Activity",
    parentSummary: "Parent Summary",
    sessionsThisWeek: "Learning sessions this week",
    focusNext: "Focus next on",
    currentStreakLabel: "Current streak",
    noFocus: "No clear focus yet",
    noActivity: "No activity",
    loading: "Loading...",
    back: "Back",
    keepLearning: "Keep learning to unlock more achievements!",
    sun: "Sun",
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
  },
};

const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  chart: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  book: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  clipboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  fire: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23c-4.97 0-9-3.582-9-8 0-2.79 1.378-5.313 3.5-6.938.281-.216.625-.313.969-.25.344.063.625.281.781.594.438.875.969 1.625 1.625 2.25.125.125.281.188.438.188.281 0 .531-.188.625-.438.156-.438.188-.938.188-1.406 0-2.063-.875-4.063-2.375-5.5-.219-.219-.313-.531-.25-.844.063-.313.25-.563.531-.719C9.5 1.313 10.719 1 12 1c5.523 0 10 4.477 10 10 0 6.627-4.925 12-10 12z"/>
    </svg>
  ),
  star: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  trophy: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H8v2h8v-2h-3v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/>
    </svg>
  ),
  lock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
};

// Achievement definitions
const achievements = [
  { id: "first_lesson", icon: "🎬", titleAr: "أول درس", titleEn: "First Lesson", descAr: "أكمل درسك الأول", descEn: "Complete your first lesson", requirement: (stats: Stats) => stats.lessons >= 1 },
  { id: "five_lessons", icon: "📚", titleAr: "قارئ نهم", titleEn: "Bookworm", descAr: "أكمل 5 دروس", descEn: "Complete 5 lessons", requirement: (stats: Stats) => stats.lessons >= 5 },
  { id: "ten_lessons", icon: "🎓", titleAr: "طالب مجتهد", titleEn: "Dedicated Student", descAr: "أكمل 10 دروس", descEn: "Complete 10 lessons", requirement: (stats: Stats) => stats.lessons >= 10 },
  { id: "first_homework", icon: "✏️", titleAr: "أول واجب", titleEn: "First Homework", descAr: "أكمل واجبك الأول", descEn: "Complete your first homework", requirement: (stats: Stats) => stats.homework >= 1 },
  { id: "five_homework", icon: "📝", titleAr: "منجز الواجبات", titleEn: "Homework Hero", descAr: "أكمل 5 واجبات", descEn: "Complete 5 homework assignments", requirement: (stats: Stats) => stats.homework >= 5 },
  { id: "three_streak", icon: "🔥", titleAr: "3 أيام متتالية", titleEn: "3 Day Streak", descAr: "حافظ على سلسلة 3 أيام", descEn: "Maintain a 3-day streak", requirement: (stats: Stats) => stats.streak >= 3 },
  { id: "week_streak", icon: "⭐", titleAr: "أسبوع كامل", titleEn: "Week Warrior", descAr: "حافظ على سلسلة 7 أيام", descEn: "Maintain a 7-day streak", requirement: (stats: Stats) => stats.streak >= 7 },
  { id: "month_streak", icon: "🏆", titleAr: "بطل الشهر", titleEn: "Monthly Champion", descAr: "حافظ على سلسلة 30 يوم", descEn: "Maintain a 30-day streak", requirement: (stats: Stats) => stats.longestStreak >= 30 },
  { id: "hundred_points", icon: "💯", titleAr: "100 نقطة", titleEn: "Century", descAr: "اجمع 100 نقطة", descEn: "Earn 100 points", requirement: (stats: Stats) => stats.points >= 100 },
  { id: "five_hundred_points", icon: "🌟", titleAr: "نجم ساطع", titleEn: "Rising Star", descAr: "اجمع 500 نقطة", descEn: "Earn 500 points", requirement: (stats: Stats) => stats.points >= 500 },
];

type Stats = {
  lessons: number;
  homework: number;
  streak: number;
  longestStreak: number;
  points: number;
};

type SubjectProgress = {
  subject: Subject;
  completed: number;
  total: number;
};

export default function ProgressPage() {
  const [stats, setStats] = useState<Stats>({ lessons: 0, homework: 0, streak: 0, longestStreak: 0, points: 0 });
  const [subjectProgress, setSubjectProgress] = useState<SubjectProgress[]>([]);
  const [weeklyActivity, setWeeklyActivity] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Fetch streak data
      const { data: streakData } = await supabase
        .from("student_streaks")
        .select("*")
        .eq("student_id", user.id)
        .single();

      if (streakData) {
        setStats({
          lessons: streakData.total_lessons_completed,
          homework: streakData.total_homework_completed,
          streak: streakData.current_streak_days,
          longestStreak: streakData.longest_streak_days,
          points: streakData.total_lessons_completed * 10 + streakData.total_homework_completed * 20,
        });
      }

      // Fetch subjects and lesson progress
      const { data: subjects } = await supabase
        .from("subjects")
        .select("*")
        .order("display_order");

      if (subjects) {
        const progressBySubject = await Promise.all(
          subjects.map(async (subject) => {
            // Get total lessons for subject
            const { count: total } = await supabase
              .from("lessons")
              .select("*", { count: "exact", head: true })
              .eq("subject_id", subject.id)
              .eq("is_published", true);

            // Get completed lessons for subject
            const { data: completedLessons } = await supabase
              .from("lesson_progress")
              .select("lesson_id, lessons!inner(subject_id)")
              .eq("student_id", user.id)
              .eq("completed", true);

            const completed = completedLessons?.filter(
              (lp: any) => lp.lessons?.subject_id === subject.id
            ).length || 0;

            return {
              subject,
              completed,
              total: total || 0,
            };
          })
        );

        setSubjectProgress(progressBySubject);
      }

      // Calculate weekly activity (mock data for now)
      // In production, this would query lesson_progress and homework_submissions by date
      const today = new Date();
      const activity = [0, 0, 0, 0, 0, 0, 0];

      // Get lesson progress for the past week
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: recentProgress } = await supabase
        .from("lesson_progress")
        .select("updated_at")
        .eq("student_id", user.id)
        .gte("updated_at", weekAgo.toISOString());

      if (recentProgress) {
        recentProgress.forEach((p) => {
          const date = new Date(p.updated_at);
          const dayDiff = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
          if (dayDiff >= 0 && dayDiff < 7) {
            activity[6 - dayDiff]++;
          }
        });
      }

      setWeeklyActivity(activity);
      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Calculate unlocked achievements
  const unlockedAchievements = useMemo(() => {
    return achievements.filter((a) => a.requirement(stats));
  }, [stats]);

  const subjectColors = [
    { bg: "bg-violet-100", text: "text-violet-600", bar: "bg-violet-500" },
    { bg: "bg-cyan-100", text: "text-cyan-600", bar: "bg-cyan-500" },
    { bg: "bg-emerald-100", text: "text-[#007229]", bar: "bg-[#007229]/100" },
    { bg: "bg-amber-100", text: "text-amber-600", bar: "bg-amber-500" },
    { bg: "bg-pink-100", text: "text-pink-600", bar: "bg-pink-500" },
  ];

  const weekDays = [t.sun, t.mon, t.tue, t.wed, t.thu, t.fri, t.sat];
  const parentSummary = useMemo(() => {
    const weeklyTotal = weeklyActivity.reduce((sum, count) => sum + count, 0);
    const focusSubject = subjectProgress
      .map((sp) => ({
        name: isRtl ? sp.subject.name_ar : sp.subject.name_en,
        percentage: sp.total > 0 ? sp.completed / sp.total : 0,
      }))
      .sort((a, b) => a.percentage - b.percentage)[0];

    return {
      weeklyTotal,
      focusSubjectName: focusSubject?.name || "",
      streak: stats.streak,
    };
  }, [weeklyActivity, subjectProgress, stats.streak, isRtl]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
              {Icons.chart}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t.progress}</h1>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.overview}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
                  {Icons.book}
                </div>
                <span className="text-sm text-gray-500">{t.lessonsCompleted}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.lessons}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#007229] flex items-center justify-center">
                  {Icons.clipboard}
                </div>
                <span className="text-sm text-gray-500">{t.homeworkCompleted}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.homework}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
                  {Icons.fire}
                </div>
                <span className="text-sm text-gray-500">{t.currentStreak}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.streak}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                  {Icons.star}
                </div>
                <span className="text-sm text-gray-500">{t.totalPoints}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.points}</p>
            </div>
          </div>
        </div>

        {/* Parent Summary */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.parentSummary}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-xs text-emerald-700">{t.sessionsThisWeek}</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{parentSummary.weeklyTotal}</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-xs text-amber-700">{t.focusNext}</p>
              <p className="text-lg font-semibold text-amber-700 mt-1">
                {parentSummary.focusSubjectName || t.noFocus}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-100">
              <p className="text-xs text-cyan-700">{t.currentStreakLabel}</p>
              <p className="text-2xl font-bold text-cyan-700 mt-1">{parentSummary.streak}</p>
            </div>
          </div>
        </div>

        {/* Weekly Activity */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.weeklyActivity}</h2>
          <div className="flex items-end justify-between gap-2 h-32">
            {weeklyActivity.map((count, idx) => {
              const maxCount = Math.max(...weeklyActivity, 1);
              const height = count > 0 ? Math.max(20, (count / maxCount) * 100) : 8;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-lg transition-all ${
                      count > 0 ? "bg-gradient-to-t from-emerald-500 to-cyan-400" : "bg-gray-200"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-xs text-gray-400 font-medium">{weekDays[idx]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress by Subject */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.bySubject}</h2>
          <div className="space-y-4">
            {subjectProgress.map((sp, idx) => {
              const percentage = sp.total > 0 ? Math.round((sp.completed / sp.total) * 100) : 0;
              const colors = subjectColors[idx % subjectColors.length];

              return (
                <div key={sp.subject.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{sp.subject.icon}</span>
                      <span className="font-medium text-gray-900">
                        {language === "ar" ? sp.subject.name_ar : sp.subject.name_en}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">
                      {sp.completed}/{sp.total} {t.lessons}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors.bar} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t.achievements}</h2>
            <span className="text-sm text-gray-500">
              {unlockedAchievements.length}/{achievements.length} {t.unlocked}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {achievements.map((achievement) => {
              const isUnlocked = achievement.requirement(stats);

              return (
                <div
                  key={achievement.id}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    isUnlocked
                      ? "bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-200"
                      : "bg-gray-50 border border-gray-200 opacity-60"
                  }`}
                >
                  {!isUnlocked && (
                    <div className="absolute top-2 right-2 text-gray-400">
                      {Icons.lock}
                    </div>
                  )}
                  <span className="text-3xl mb-2 block filter" style={{ filter: isUnlocked ? "none" : "grayscale(100%)" }}>
                    {achievement.icon}
                  </span>
                  <p className={`text-sm font-medium ${isUnlocked ? "text-gray-900" : "text-gray-500"}`}>
                    {language === "ar" ? achievement.titleAr : achievement.titleEn}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {language === "ar" ? achievement.descAr : achievement.descEn}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-6 flex items-center justify-center gap-3">
            <OwlCelebrating className="w-12 h-12" />
            <p className="text-gray-500 text-sm">{t.keepLearning}</p>
          </div>
        </div>
        </>
        )}
    </div>
  );
}
