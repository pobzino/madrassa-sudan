"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Profile, Subject } from "@/lib/database.types";

const translations = {
  ar: {
    dashboard: "لوحة التحكم",
    welcomeBack: "مرحباً",
    continueJourney: "استمر في رحلة التعلم",
    lessons: "الدروس",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    classes: "الفصول",
    logout: "خروج",
    lessonsCompleted: "دروس مكتملة",
    dayStreak: "أيام متتالية",
    homeworkDone: "واجبات منجزة",
    points: "نقاط",
    quickActions: "إجراءات سريعة",
    startLesson: "ابدأ درساً",
    askTutor: "اسأل المعلم",
    viewHomework: "الواجبات",
    joinClass: "انضم لفصل",
    subjects: "المواد الدراسية",
    viewAll: "عرض الكل",
    continueWatching: "أكمل المشاهدة",
    noLessons: "لم تبدأ أي دروس بعد",
    startLearning: "ابدأ رحلة التعلم الآن",
    browseSubjects: "تصفح المواد",
    loading: "جاري التحميل...",
  },
  en: {
    dashboard: "Dashboard",
    welcomeBack: "Welcome back",
    continueJourney: "Continue your learning journey",
    lessons: "Lessons",
    homework: "Homework",
    aiTutor: "AI Tutor",
    classes: "Classes",
    logout: "Log out",
    lessonsCompleted: "Lessons",
    dayStreak: "Day Streak",
    homeworkDone: "Homework",
    points: "Points",
    quickActions: "Quick Actions",
    startLesson: "Start Lesson",
    askTutor: "Ask Tutor",
    viewHomework: "Homework",
    joinClass: "Join Class",
    subjects: "Subjects",
    viewAll: "View all",
    continueWatching: "Continue Watching",
    noLessons: "No lessons started yet",
    startLearning: "Start your learning journey",
    browseSubjects: "Browse Subjects",
    loading: "Loading...",
  },
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState({ lessons: 0, streak: 0, homework: 0, points: 0 });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (profileData) setProfile(profileData);

      const { data: subjectsData } = await supabase.from("subjects").select("*").order("display_order");
      if (subjectsData) setSubjects(subjectsData);

      const { data: streakData } = await supabase.from("student_streaks").select("*").eq("student_id", user.id).single();
      if (streakData) {
        setStats({
          lessons: streakData.total_lessons_completed,
          streak: streakData.current_streak_days,
          homework: streakData.total_homework_completed,
          points: streakData.total_lessons_completed * 10 + streakData.total_homework_completed * 20,
        });
      }
      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3 animate-pulse">م</div>
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Student";

  return (
    <div className={`min-h-screen bg-gray-50 ${isRtl ? "rtl" : "ltr"}`} dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">م</div>
              <span className="font-bold text-gray-900 hidden sm:block">
                {language === "ar" ? "مدرسة السودان" : "Madrassa Sudan"}
              </span>
            </Link>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-1">
              {[
                { href: "/dashboard", label: t.dashboard, active: true },
                { href: "/lessons", label: t.lessons },
                { href: "/homework", label: t.homework },
                { href: "/tutor", label: t.aiTutor },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    item.active ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {language === "ar" ? "EN" : "عربي"}
              </button>
              <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold text-sm">
                {firstName.charAt(0)}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t.welcomeBack}, {firstName} 👋</h1>
          <p className="text-gray-500 mt-1">{t.continueJourney}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: t.lessonsCompleted, value: stats.lessons, color: "bg-blue-500", icon: "📚" },
            { label: t.dayStreak, value: stats.streak, color: "bg-orange-500", icon: "🔥" },
            { label: t.homeworkDone, value: stats.homework, color: "bg-green-500", icon: "✅" },
            { label: t.points, value: stats.points, color: "bg-purple-500", icon: "⭐" },
          ].map((stat, i) => (
            <div key={i} className="bg-white rounded-xl p-5 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{stat.icon}</span>
                <span className={`w-2 h-2 rounded-full ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.quickActions}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: "/lessons", label: t.startLesson, color: "from-emerald-500 to-emerald-600", icon: "▶️" },
              { href: "/tutor", label: t.askTutor, color: "from-violet-500 to-violet-600", icon: "🤖" },
              { href: "/homework", label: t.viewHomework, color: "from-amber-500 to-amber-600", icon: "📝" },
              { href: "/cohorts/join", label: t.joinClass, color: "from-sky-500 to-sky-600", icon: "👥" },
            ].map((action, i) => (
              <Link
                key={i}
                href={action.href}
                className={`bg-gradient-to-br ${action.color} rounded-xl p-5 text-white hover:opacity-90 transition-opacity`}
              >
                <span className="text-2xl mb-2 block">{action.icon}</span>
                <span className="font-semibold">{action.label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Subjects */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t.subjects}</h2>
            <Link href="/lessons" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              {t.viewAll} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {subjects.map((subject) => (
              <Link
                key={subject.id}
                href={`/lessons?subject=${subject.id}`}
                className="bg-white rounded-xl p-5 border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition-all text-center"
              >
                <span className="text-3xl mb-2 block">{subject.icon}</span>
                <span className="font-medium text-gray-900 text-sm">
                  {language === "ar" ? subject.name_ar : subject.name_en}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Continue Watching */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.continueWatching}</h2>
          <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
            <span className="text-4xl mb-4 block">🎯</span>
            <h3 className="font-semibold text-gray-900 mb-2">{t.noLessons}</h3>
            <p className="text-gray-500 mb-4">{t.startLearning}</p>
            <Link
              href="/lessons"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              {t.browseSubjects}
            </Link>
          </div>
        </section>

        {/* Mobile Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-50">
          <div className="flex items-center justify-around">
            {[
              { href: "/dashboard", label: t.dashboard, icon: "🏠", active: true },
              { href: "/lessons", label: t.lessons, icon: "📚" },
              { href: "/homework", label: t.homework, icon: "📝" },
              { href: "/tutor", label: t.aiTutor, icon: "🤖" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-1 px-3 ${item.active ? "text-emerald-600" : "text-gray-500"}`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs mt-1">{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </main>
    </div>
  );
}
