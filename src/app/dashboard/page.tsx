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
    welcomeBack: "مرحباً بعودتك",
    welcomeSubtitle: "تابع رحلتك التعليمية واكتشف دروساً جديدة",
    startLearning: "ابدأ التعلم",
    lessons: "الدروس",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    myClasses: "فصولي",
    progress: "التقدم",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    gettingStarted: "البداية",
    completed: "مكتمل",
    of: "من",
    watchFirstLesson: "شاهد أول درس",
    watchFirstLessonDesc: "ابدأ بمشاهدة درس في مادتك المفضلة",
    completeHomework: "أكمل واجباً",
    completeHomeworkDesc: "حل واجبك الأول واحصل على نقاط",
    askTutor: "اسأل المعلم الذكي",
    askTutorDesc: "احصل على مساعدة فورية في أي سؤال",
    joinClass: "انضم لفصل دراسي",
    joinClassDesc: "تعلم مع زملائك في الفصول المباشرة",
    earnPoints: "اجمع 100 نقطة",
    earnPointsDesc: "اجمع النقاط من إتمام الدروس والواجبات",
    yourProgress: "تقدمك",
    lessonsCompleted: "درس مكتمل",
    dayStreak: "يوم متتالي",
    homeworkDone: "واجب منجز",
    totalPoints: "نقطة",
    subjects: "المواد الدراسية",
    exploreSubjects: "اكتشف المواد",
    loading: "جاري التحميل...",
  },
  en: {
    dashboard: "Dashboard",
    welcomeBack: "Welcome back",
    welcomeSubtitle: "Continue your learning journey and discover new lessons",
    startLearning: "Start Learning",
    lessons: "Lessons",
    homework: "Homework",
    aiTutor: "AI Tutor",
    myClasses: "My Classes",
    progress: "Progress",
    settings: "Settings",
    logout: "Log out",
    gettingStarted: "Getting Started",
    completed: "completed",
    of: "of",
    watchFirstLesson: "Watch your first lesson",
    watchFirstLessonDesc: "Start by watching a lesson in your favorite subject",
    completeHomework: "Complete a homework",
    completeHomeworkDesc: "Solve your first homework and earn points",
    askTutor: "Ask the AI Tutor",
    askTutorDesc: "Get instant help with any question",
    joinClass: "Join a classroom",
    joinClassDesc: "Learn together with classmates in live sessions",
    earnPoints: "Earn 100 points",
    earnPointsDesc: "Collect points by completing lessons and homework",
    yourProgress: "Your Progress",
    lessonsCompleted: "Lessons",
    dayStreak: "Day Streak",
    homeworkDone: "Homework",
    totalPoints: "Points",
    subjects: "Subjects",
    exploreSubjects: "Explore Subjects",
    loading: "Loading...",
  },
};

// Icons
const Icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
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
  cpu: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  ),
  play: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  fire: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  ),
  star: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  ),
  chevronUp: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  ),
  menu: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  ),
  close: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState({ lessons: 0, streak: 0, homework: 0, points: 0 });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [gettingStartedOpen, setGettingStartedOpen] = useState(true);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFBFC] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-[#0D9488] flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3 animate-pulse">م</div>
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Student";

  // Getting started tasks
  const tasks = [
    { id: 1, label: t.watchFirstLesson, desc: t.watchFirstLessonDesc, done: stats.lessons > 0, href: "/lessons" },
    { id: 2, label: t.completeHomework, desc: t.completeHomeworkDesc, done: stats.homework > 0, href: "/homework" },
    { id: 3, label: t.askTutor, desc: t.askTutorDesc, done: false, href: "/tutor" },
    { id: 4, label: t.joinClass, desc: t.joinClassDesc, done: false, href: "/cohorts/join" },
    { id: 5, label: t.earnPoints, desc: t.earnPointsDesc, done: stats.points >= 100, href: "/lessons" },
  ];
  const completedTasks = tasks.filter(task => task.done).length;

  const navItems = [
    { href: "/dashboard", label: t.dashboard, icon: Icons.dashboard, active: true },
    { href: "/lessons", label: t.lessons, icon: Icons.book },
    { href: "/homework", label: t.homework, icon: Icons.clipboard },
    { href: "/tutor", label: t.aiTutor, icon: Icons.cpu },
    { href: "/cohorts", label: t.myClasses, icon: Icons.users },
    { href: "/progress", label: t.progress, icon: Icons.chart },
  ];

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-white ${mobile ? "" : "border-r border-gray-200"}`}>
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0D9488] flex items-center justify-center text-white font-bold text-xl shadow-sm">
            م
          </div>
          <span className="font-bold text-gray-900 text-lg">
            {language === "ar" ? "مدرسة السودان" : "Madrassa"}
          </span>
        </Link>
      </div>

      {/* Start Learning Button */}
      <div className="p-4">
        <Link
          href="/lessons"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          {Icons.play}
          <span>{t.startLearning}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => mobile && setSidebarOpen(false)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-[15px] font-medium transition-colors ${
              item.active
                ? "bg-[#F0FDFA] text-[#0D9488]"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <span className={item.active ? "text-[#0D9488]" : "text-gray-400"}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-100">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="text-gray-400">{Icons.settings}</span>
          {t.settings}
        </Link>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-gray-100 pt-4">
          <div className="w-10 h-10 rounded-full bg-[#0D9488] flex items-center justify-center text-white font-semibold">
            {firstName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{profile?.full_name}</p>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-[#0D9488] transition-colors"
            >
              {t.logout}
            </button>
          </div>
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="text-xs font-medium text-gray-500 hover:text-[#0D9488] px-2 py-1 rounded transition-colors"
          >
            {language === "ar" ? "EN" : "عربي"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFBFC]" dir={isRtl ? "rtl" : "ltr"}>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          {Icons.menu}
        </button>
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0D9488] flex items-center justify-center text-white font-bold">م</div>
          <span className="font-bold text-gray-900">{language === "ar" ? "مدرسة السودان" : "Madrassa"}</span>
        </Link>
        <div className="w-8 h-8 rounded-full bg-[#0D9488] flex items-center justify-center text-white font-semibold text-sm">
          {firstName.charAt(0)}
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute top-0 ${isRtl ? "right-0" : "left-0"} w-72 h-full bg-white shadow-xl`}>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} p-2 text-gray-500 hover:bg-gray-100 rounded-lg`}
            >
              {Icons.close}
            </button>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block fixed top-0 ${isRtl ? "right-0" : "left-0"} w-64 h-screen z-30`}>
        <Sidebar />
      </aside>

      {/* Main Content */}
      <main className={`pt-16 lg:pt-0 ${isRtl ? "lg:mr-64" : "lg:ml-64"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{t.welcomeBack}, {firstName}</h1>
            <p className="text-gray-500 mt-1">{t.welcomeSubtitle}</p>
          </div>

          {/* Getting Started Card */}
          <div className="bg-white rounded-2xl border border-gray-200 mb-8 overflow-hidden">
            <button
              onClick={() => setGettingStartedOpen(!gettingStartedOpen)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900">{t.gettingStarted}</h2>
                <span className="text-sm text-gray-500">
                  {completedTasks} {t.of} {tasks.length} {t.completed}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0D9488] rounded-full transition-all duration-500"
                      style={{ width: `${(completedTasks / tasks.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-[#0D9488]">
                    {Math.round((completedTasks / tasks.length) * 100)}%
                  </span>
                </div>
                <span className={`text-gray-400 transition-transform ${gettingStartedOpen ? "" : "rotate-180"}`}>
                  {Icons.chevronUp}
                </span>
              </div>
            </button>

            {gettingStartedOpen && (
              <div className="border-t border-gray-100">
                {tasks.map((task, index) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    className={`flex items-start gap-4 p-5 hover:bg-gray-50 transition-colors ${
                      index < tasks.length - 1 ? "border-b border-gray-100" : ""
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      task.done
                        ? "bg-[#0D9488] text-white"
                        : "bg-gray-100 text-gray-400 border-2 border-gray-200"
                    }`}>
                      {task.done ? Icons.check : <span className="text-xs font-semibold">{task.id}</span>}
                    </div>
                    <div className="flex-1">
                      <p className={`font-medium ${task.done ? "text-[#0D9488]" : "text-gray-900"}`}>
                        {task.label}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">{task.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.yourProgress}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    {Icons.book}
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.lessons}</p>
                <p className="text-sm text-gray-500">{t.lessonsCompleted}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
                    {Icons.fire}
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.streak}</p>
                <p className="text-sm text-gray-500">{t.dayStreak}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    {Icons.clipboard}
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.homework}</p>
                <p className="text-sm text-gray-500">{t.homeworkDone}</p>
              </div>
              <div className="bg-white rounded-xl p-5 border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
                    {Icons.star}
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stats.points}</p>
                <p className="text-sm text-gray-500">{t.totalPoints}</p>
              </div>
            </div>
          </div>

          {/* Subjects */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.subjects}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {subjects.map((subject) => (
                <Link
                  key={subject.id}
                  href={`/lessons?subject=${subject.id}`}
                  className="bg-white rounded-xl p-5 border border-gray-200 hover:border-[#0D9488] hover:shadow-sm transition-all text-center group"
                >
                  <span className="text-4xl mb-3 block">{subject.icon}</span>
                  <span className="font-medium text-gray-900 group-hover:text-[#0D9488] transition-colors">
                    {language === "ar" ? subject.name_ar : subject.name_en}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
