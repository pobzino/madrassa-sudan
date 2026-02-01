"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Profile, Subject } from "@/lib/database.types";

const translations = {
  ar: {
    // Navigation
    dashboard: "لوحة التحكم",
    lessons: "الدروس",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    classes: "الفصول",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",

    // Welcome
    welcomeBack: "مرحباً بعودتك",
    continueJourney: "استمر في رحلة التعلم الخاصة بك",

    // Stats
    lessonsCompleted: "درس مكتمل",
    dayStreak: "يوم متواصل",
    homeworkDone: "واجب منجز",
    totalPoints: "مجموع النقاط",

    // Sections
    continueWatching: "أكمل المشاهدة",
    quickActions: "إجراءات سريعة",
    subjects: "المواد الدراسية",
    upcomingHomework: "الواجبات القادمة",
    recentActivity: "النشاط الأخير",

    // Quick Actions
    startLesson: "ابدأ درس جديد",
    askTutor: "اسأل المعلم الذكي",
    viewHomework: "عرض الواجبات",
    joinClass: "انضم لفصل",

    // Empty states
    noLessonsYet: "لم تبدأ أي دروس بعد",
    startLearning: "ابدأ رحلة التعلم الآن!",
    browseSubjects: "تصفح المواد",
    noHomework: "لا توجد واجبات حالياً",
    allCaughtUp: "أنت مجتهد! لا توجد واجبات مستحقة.",

    // Loading
    loading: "جاري التحميل...",
  },
  en: {
    // Navigation
    dashboard: "Dashboard",
    lessons: "Lessons",
    homework: "Homework",
    aiTutor: "AI Tutor",
    classes: "Classes",
    settings: "Settings",
    logout: "Log out",

    // Welcome
    welcomeBack: "Welcome back",
    continueJourney: "Continue your learning journey",

    // Stats
    lessonsCompleted: "Lessons Done",
    dayStreak: "Day Streak",
    homeworkDone: "Homework Done",
    totalPoints: "Total Points",

    // Sections
    continueWatching: "Continue Watching",
    quickActions: "Quick Actions",
    subjects: "Subjects",
    upcomingHomework: "Upcoming Homework",
    recentActivity: "Recent Activity",

    // Quick Actions
    startLesson: "Start New Lesson",
    askTutor: "Ask AI Tutor",
    viewHomework: "View Homework",
    joinClass: "Join a Class",

    // Empty states
    noLessonsYet: "No lessons started yet",
    startLearning: "Start your learning journey!",
    browseSubjects: "Browse Subjects",
    noHomework: "No homework right now",
    allCaughtUp: "You're all caught up! No homework due.",

    // Loading
    loading: "Loading...",
  },
};

// Sidebar navigation items
const getNavItems = (t: typeof translations.en) => [
  { href: "/dashboard", icon: "home", label: t.dashboard, active: true },
  { href: "/lessons", icon: "book", label: t.lessons },
  { href: "/homework", icon: "clipboard", label: t.homework },
  { href: "/tutor", icon: "bot", label: t.aiTutor },
  { href: "/cohorts/join", icon: "users", label: t.classes },
];

// Icon component
function Icon({ name, className = "w-5 h-5" }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    book: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
    clipboard: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    bot: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    users: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    settings: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    logout: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    ),
    fire: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    ),
    star: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    play: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    arrow: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    ),
    check: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return icons[name] || null;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState({
    lessonsCompleted: 0,
    currentStreak: 0,
    homeworkCompleted: 0,
    totalPoints: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { language, isRtl, setLanguage } = useLanguage();
  const t = translations[language];

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
      }

      // Load subjects
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .order("display_order");

      if (subjectsData) {
        setSubjects(subjectsData);
      }

      // Load stats from student_streaks
      const { data: streakData } = await supabase
        .from("student_streaks")
        .select("*")
        .eq("student_id", user.id)
        .single();

      if (streakData) {
        setStats({
          lessonsCompleted: streakData.total_lessons_completed,
          currentStreak: streakData.current_streak_days,
          homeworkCompleted: streakData.total_homework_completed,
          totalPoints: (streakData.total_lessons_completed * 10) + (streakData.total_homework_completed * 20),
        });
      }

      setLoading(false);
    }

    loadDashboard();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl animate-pulse">
            م
          </div>
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Student";
  const navItems = getNavItems(t);

  return (
    <div className={`min-h-screen bg-gray-50 ${isRtl ? 'rtl' : 'ltr'}`}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 ${isRtl ? 'right-0' : 'left-0'} h-full w-64 bg-white border-gray-200 ${isRtl ? 'border-l' : 'border-r'} z-50 transform transition-transform duration-200 lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full'
      } lg:transform-none`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-gray-100">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-600/20">
                م
              </div>
              <div>
                <h1 className="font-bold text-gray-900">
                  {language === 'ar' ? 'مدرسة السودان' : 'Madrassa Sudan'}
                </h1>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  item.active
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon name={item.icon} className={item.active ? 'text-emerald-600' : ''} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* Bottom section */}
          <div className="p-4 border-t border-gray-100 space-y-1">
            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all"
            >
              <span className="w-5 h-5 flex items-center justify-center text-sm">🌐</span>
              <span>{language === 'ar' ? 'English' : 'العربية'}</span>
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
            >
              <Icon name="logout" />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className={`min-h-screen ${isRtl ? 'lg:mr-64' : 'lg:ml-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 bg-white/80 backdrop-blur-lg border-b border-gray-100 z-30">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Welcome message */}
            <div className="hidden lg:block">
              <h2 className="text-xl font-bold text-gray-900">
                {t.welcomeBack}, {firstName}! 👋
              </h2>
              <p className="text-sm text-gray-500">{t.continueJourney}</p>
            </div>

            {/* Profile */}
            <div className="flex items-center gap-3">
              <div className={`${isRtl ? 'text-left' : 'text-right'} hidden sm:block`}>
                <p className="font-medium text-gray-900">{profile?.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{profile?.role}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-semibold">
                {firstName.charAt(0)}
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard content */}
        <div className="p-4 lg:p-8 space-y-6">
          {/* Mobile welcome */}
          <div className="lg:hidden">
            <h2 className="text-xl font-bold text-gray-900">
              {t.welcomeBack}, {firstName}! 👋
            </h2>
            <p className="text-sm text-gray-500">{t.continueJourney}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Icon name="book" className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.lessonsCompleted}</p>
              <p className="text-sm text-gray-500">{t.lessonsCompleted}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Icon name="fire" className="w-5 h-5 text-orange-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.currentStreak}</p>
              <p className="text-sm text-gray-500">{t.dayStreak}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <Icon name="check" className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.homeworkCompleted}</p>
              <p className="text-sm text-gray-500">{t.homeworkDone}</p>
            </div>

            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Icon name="star" className="w-5 h-5 text-purple-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPoints}</p>
              <p className="text-sm text-gray-500">{t.totalPoints}</p>
            </div>
          </div>

          {/* Quick Actions */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.quickActions}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link
                href="/lessons"
                className="group bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="play" className="w-5 h-5" />
                </div>
                <p className="font-semibold">{t.startLesson}</p>
              </Link>

              <Link
                href="/tutor"
                className="group bg-gradient-to-br from-violet-500 to-violet-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-600/20 hover:shadow-xl hover:shadow-violet-600/30 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="bot" className="w-5 h-5" />
                </div>
                <p className="font-semibold">{t.askTutor}</p>
              </Link>

              <Link
                href="/homework"
                className="group bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white shadow-lg shadow-amber-600/20 hover:shadow-xl hover:shadow-amber-600/30 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="clipboard" className="w-5 h-5" />
                </div>
                <p className="font-semibold">{t.viewHomework}</p>
              </Link>

              <Link
                href="/cohorts/join"
                className="group bg-gradient-to-br from-sky-500 to-sky-600 rounded-2xl p-5 text-white shadow-lg shadow-sky-600/20 hover:shadow-xl hover:shadow-sky-600/30 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon name="users" className="w-5 h-5" />
                </div>
                <p className="font-semibold">{t.joinClass}</p>
              </Link>
            </div>
          </section>

          {/* Subjects Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t.subjects}</h3>
              <Link href="/lessons" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                {language === 'ar' ? 'عرض الكل' : 'View all'}
                <Icon name="arrow" className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {subjects.map((subject) => (
                <Link
                  key={subject.id}
                  href={`/lessons?subject=${subject.id}`}
                  className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-emerald-200 transition-all text-center"
                >
                  <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">{subject.icon}</div>
                  <p className="font-medium text-gray-900">
                    {language === 'ar' ? subject.name_ar : subject.name_en}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          {/* Continue Watching / Empty State */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.continueWatching}</h3>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <Icon name="play" className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">{t.noLessonsYet}</h4>
              <p className="text-gray-500 mb-4">{t.startLearning}</p>
              <Link
                href="/lessons"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
              >
                {t.browseSubjects}
                <Icon name="arrow" className={`w-4 h-4 ${isRtl ? 'rotate-180' : ''}`} />
              </Link>
            </div>
          </section>

          {/* Upcoming Homework */}
          <section>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.upcomingHomework}</h3>
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
                <Icon name="check" className="w-8 h-8 text-green-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">{t.noHomework}</h4>
              <p className="text-gray-500">{t.allCaughtUp}</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
