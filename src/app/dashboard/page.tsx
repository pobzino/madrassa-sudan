"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Profile, Subject } from "@/lib/database.types";
import {
  MathIcon,
  ScienceIcon,
  GlobeIcon,
  TrophyIcon,
  FloatingRocket,
  BookOpenIcon,
  OwlTutorIcon,
  OwlWaving,
  OwlThinking,
  MadrassaLogo,
  HomeNavIcon,
  BookNavIcon,
  ClipboardNavIcon,
  UsersNavIcon,
  ChartNavIcon,
  SettingsNavIcon,
} from "@/components/illustrations";

const translations = {
  ar: {
    dashboard: "لوحة التحكم",
    welcomeBack: "أهلاً",
    welcomeSubtitle: "مستعد لمغامرة تعليمية جديدة؟",
    startLearning: "ابدأ التعلم",
    lessons: "الدروس",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    myClasses: "فصولي",
    progress: "التقدم",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    yourProgress: "إنجازاتك",
    lessonsCompleted: "درس",
    dayStreak: "يوم متتالي",
    homeworkDone: "واجب",
    totalPoints: "نقطة",
    subjects: "اختر مادة",
    exploreSubjects: "اكتشف المواد",
    loading: "جاري التحميل...",
    keepGoing: "استمر! أنت تبلي بلاءً حسناً",
  },
  en: {
    dashboard: "Dashboard",
    welcomeBack: "Hey",
    welcomeSubtitle: "Ready for a new learning adventure?",
    startLearning: "Start Learning",
    lessons: "Lessons",
    homework: "Homework",
    aiTutor: "AI Tutor",
    myClasses: "My Classes",
    progress: "Progress",
    settings: "Settings",
    logout: "Log out",
    yourProgress: "Your Achievements",
    lessonsCompleted: "Lessons",
    dayStreak: "Day Streak",
    homeworkDone: "Homework",
    totalPoints: "Points",
    subjects: "Pick a Subject",
    exploreSubjects: "Explore Subjects",
    loading: "Loading...",
    keepGoing: "Keep going! You're doing great",
  },
};

// Subject icon mapping based on subject name
const getSubjectIcon = (subject: Subject, className: string = "w-12 h-12") => {
  const name = subject.name_en?.toLowerCase() || "";

  if (name.includes("math")) return <MathIcon className={className} />;
  if (name.includes("science")) return <ScienceIcon className={className} />;
  if (name.includes("english")) return <GlobeIcon className={className} />;

  // Default fallback
  return <BookOpenIcon className={className} />;
};

// Icons
const Icons = {
  wave: (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15m.002 0h-.002" />
    </svg>
  ),
  dashboard: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
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
  play: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  fire: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23c-4.97 0-9-3.582-9-8 0-2.79 1.378-5.313 3.5-6.938.281-.216.625-.313.969-.25.344.063.625.281.781.594.438.875.969 1.625 1.625 2.25.125.125.281.188.438.188.281 0 .531-.188.625-.438.156-.438.188-.938.188-1.406 0-2.063-.875-4.063-2.375-5.5-.219-.219-.313-.531-.25-.844.063-.313.25-.563.531-.719C9.5 1.313 10.719 1 12 1c5.523 0 10 4.477 10 10 0 6.627-4.925 12-10 12zm0-2c3.859 0 7-3.582 7-8 0-4.411-3.589-8-8-8-.469 0-.938.031-1.406.094 1.063 1.563 1.656 3.438 1.656 5.406 0 .75-.063 1.5-.219 2.219-.438-.156-.875-.344-1.281-.563-.844-.469-1.594-1.094-2.188-1.844C6.594 12.156 6 13.531 6 15c0 3.314 2.686 6 6 6z"/>
    </svg>
  ),
  star: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  trophy: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H8v2h8v-2h-3v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
    </svg>
  ),
  rocket: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.5c2.5 0 5.5 1.5 7.5 4.5 1.5 2.5 2 5 2 7.5 0 1-.5 2-1 2.5-.5.5-1 .5-1.5.5h-2l-1.5 3.5c-.5 1-1.5 1-2 0L12 17l-1.5 3.5c-.5 1-1.5 1-2 0L7 17H5c-.5 0-1 0-1.5-.5s-1-1.5-1-2.5c0-2.5.5-5 2-7.5C6.5 4 9.5 2.5 12 2.5zm-2 8.5c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2z"/>
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
  sparkle: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3zm6 10l.75 2.25L21 16l-2.25.75L18 19l-.75-2.25L15 16l2.25-.75L18 13zM6 13l.75 2.25L9 16l-2.25.75L6 19l-.75-2.25L3 16l2.25-.75L6 13z"/>
    </svg>
  ),
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [stats, setStats] = useState({ lessons: 0, streak: 0, homework: 0, points: 0 });
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      if (subjectsData) {
        // Filter to only show Math, English, and Science on dashboard
        const coreSubjects = subjectsData.filter((s) => {
          const name = s.name_en?.toLowerCase() || "";
          return name.includes("math") || name.includes("english") || name.includes("science");
        });
        setSubjects(coreSubjects);
      }

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
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center">
        <div className="text-center">
          <OwlThinking className="w-20 h-20 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  const firstName = profile?.full_name?.split(" ")[0] || "Student";

  const navItems = [
    { href: "/dashboard", label: t.dashboard, icon: <HomeNavIcon className="w-5 h-5" />, active: true },
    { href: "/lessons", label: t.lessons, icon: <BookNavIcon className="w-5 h-5" /> },
    { href: "/homework", label: t.homework, icon: <ClipboardNavIcon className="w-5 h-5" /> },
    { href: "/tutor", label: t.aiTutor, icon: <OwlTutorIcon className="w-5 h-5" /> },
    { href: "/cohorts", label: t.myClasses, icon: <UsersNavIcon className="w-5 h-5" /> },
    { href: "/progress", label: t.progress, icon: <ChartNavIcon className="w-5 h-5" /> },
  ];

  // Subject card colors - Sudan themed
  const subjectColors = [
    "from-[#007229] to-[#00913D]",
    "from-[#D21034] to-[#E8334F]",
    "from-[#005C22] to-[#007229]",
    "from-amber-500 to-orange-600",
    "from-[#a01028] to-[#D21034]",
    "from-[#00913D] to-[#007229]",
  ];

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-white ${mobile ? "" : "border-r border-gray-100"}`}>
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/">
          <MadrassaLogo size="md" />
        </Link>
      </div>

      {/* Start Learning Button */}
      <div className="p-4">
        <Link
          href="/lessons"
          className="group flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:-translate-y-0.5"
        >
          <FloatingRocket className="w-6 h-6 group-hover:animate-bounce" />
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
            className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-[15px] font-semibold transition-all ${
              item.active
                ? "bg-gradient-to-r from-emerald-50 to-cyan-50 text-emerald-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {item.icon}
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
          <SettingsNavIcon className="w-5 h-5" />
          {t.settings}
        </Link>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-gray-100 pt-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold shadow-md">
            {firstName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{profile?.full_name}</p>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-emerald-600 transition-colors"
            >
              {t.logout}
            </button>
          </div>
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="text-xs font-bold text-gray-500 hover:text-emerald-600 px-2 py-1 rounded-lg hover:bg-emerald-50 transition-all"
          >
            {language === "ar" ? "EN" : "عربي"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-white to-cyan-50/50" dir={isRtl ? "rtl" : "ltr"}>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-lg border-b border-gray-200/50 flex items-center justify-between px-4 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl"
        >
          {Icons.menu}
        </button>
        <Link href="/">
          <OwlTutorIcon className="w-9 h-9" />
        </Link>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
          {firstName.charAt(0)}
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute top-0 ${isRtl ? "right-0" : "left-0"} w-72 h-full bg-white shadow-2xl`}>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} p-2 text-gray-500 hover:bg-gray-100 rounded-xl`}
            >
              {Icons.close}
            </button>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:block fixed top-0 ${isRtl ? "right-0" : "left-0"} w-64 h-screen z-30 bg-white shadow-xl shadow-gray-200/50`}>
        <Sidebar />
      </aside>

      {/* Main Content */}
      <main className={`pt-16 lg:pt-0 ${isRtl ? "lg:mr-64" : "lg:ml-64"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Banner */}
          <div className="relative mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#007229] via-[#00913D] to-[#007229] text-white overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

            {/* Waving owl mascot */}
            <div className="absolute -bottom-2 right-4 sm:right-8 hidden sm:block">
              <OwlWaving className="w-28 h-28 drop-shadow-lg" />
            </div>

            <div className="relative">
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t.welcomeBack}, {firstName}!</h1>
              <p className="text-green-100 text-lg">{t.welcomeSubtitle}</p>

              {/* Quick stats in banner */}
              <div className="flex flex-wrap gap-4 mt-6">
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2">
                  <span className="text-yellow-300">{Icons.fire}</span>
                  <span className="font-bold">{stats.streak} {t.dayStreak}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2">
                  <span className="text-yellow-300">{Icons.star}</span>
                  <span className="font-bold">{stats.points} {t.totalPoints}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                <TrophyIcon className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t.yourProgress}</h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-500/30">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-violet-200 mb-1">{Icons.book}</div>
                  <p className="text-4xl font-bold">{stats.lessons}</p>
                  <p className="text-violet-200 text-sm font-medium">{t.lessonsCompleted}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-5 text-white shadow-lg shadow-orange-500/30">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-orange-200 mb-1">{Icons.fire}</div>
                  <p className="text-4xl font-bold">{stats.streak}</p>
                  <p className="text-orange-200 text-sm font-medium">{t.dayStreak}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-[#007229] to-[#00913D] rounded-2xl p-5 text-white shadow-lg shadow-[#007229]/30">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-green-200 mb-1">{Icons.clipboard}</div>
                  <p className="text-4xl font-bold">{stats.homework}</p>
                  <p className="text-green-200 text-sm font-medium">{t.homeworkDone}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-yellow-500 rounded-2xl p-5 text-white shadow-lg shadow-amber-500/30">
                <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-amber-200 mb-1">{Icons.star}</div>
                  <p className="text-4xl font-bold">{stats.points}</p>
                  <p className="text-amber-200 text-sm font-medium">{t.totalPoints}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Subjects */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#007229] to-[#00913D] flex items-center justify-center shadow-lg shadow-[#007229]/30">
                <BookOpenIcon className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t.subjects}</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {subjects.map((subject, index) => (
                <Link
                  key={subject.id}
                  href={`/lessons?subject=${subject.id}`}
                  className="group relative overflow-hidden rounded-2xl p-6 text-white transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${subjectColors[index % subjectColors.length]}`} />
                  <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-12 h-12 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                  <div className="relative text-center flex flex-col items-center">
                    <div className="mb-3 drop-shadow-lg">
                      {getSubjectIcon(subject, "w-14 h-14")}
                    </div>
                    <span className="font-bold text-white/90 group-hover:text-white transition-colors">
                      {language === "ar" ? subject.name_ar : subject.name_en}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Encouragement message */}
          <div className="mt-8 text-center">
            <p className="text-gray-500 flex items-center justify-center gap-2">
              <span className="text-yellow-500">{Icons.sparkle}</span>
              {t.keepGoing}
              <span className="text-yellow-500">{Icons.sparkle}</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
