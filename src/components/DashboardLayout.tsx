"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Profile } from "@/lib/database.types";
import { clearAuthCache, getCachedProfile, getCachedUser } from "@/lib/supabase/auth-cache";
import {
  FloatingBook,
  FloatingRocket,
  RobotIcon,
  TrophyIcon,
  BookOpenIcon,
  GraduationCapIcon,
  OwlTutorIcon,
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
    // Student nav
    dashboard: "لوحة التحكم",
    startLearning: "ابدأ التعلم",
    lessons: "الدروس",
    homework: "الواجبات",
    aiTutor: "المعلم الذكي",
    myClasses: "فصولي",
    progress: "التقدم",
    // Teacher nav
    teacherDashboard: "لوحة المعلم",
    manageLessons: "إدارة الدروس",
    manageHomework: "إدارة الواجبات",
    gradeSubmissions: "تصحيح الواجبات",
    manageClasses: "إدارة الفصول",
    studentView: "عرض الطالب",
    // Common
    settings: "الإعدادات",
    logout: "تسجيل الخروج",
    loading: "جاري التحميل...",
  },
  en: {
    // Student nav
    dashboard: "Dashboard",
    startLearning: "Start Learning",
    lessons: "Lessons",
    homework: "Homework",
    aiTutor: "AI Tutor",
    myClasses: "My Classes",
    progress: "Progress",
    // Teacher nav
    teacherDashboard: "Teacher Dashboard",
    manageLessons: "Manage Lessons",
    manageHomework: "Manage Homework",
    gradeSubmissions: "Grade Submissions",
    manageClasses: "Manage Classes",
    studentView: "Student View",
    // Common
    settings: "Settings",
    logout: "Log out",
    loading: "Loading...",
  },
};

// Icons - Clean, friendly navigation icons
const Icons = {
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
    </svg>
  ),
  users: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  chart: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
  logout: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  ),
};

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const { language, setLanguage } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";
  const authCheckRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate auth checks
    if (authCheckRef.current) return;
    authCheckRef.current = true;

    async function loadProfile() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const profileData = await getCachedProfile(supabase, user.id);
      if (profileData) setProfile(profileData);
      setAuthChecked(true);
    }
    loadProfile();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuthCache();
    router.push("/");
  };

  // Get first name or default - don't block render for this
  const firstName = profile?.full_name?.split(" ")[0] || "";

  const isTeacherOrAdmin = profile?.role === "teacher" || profile?.role === "admin";

  // Show teacher nav when on /teacher/* routes, student nav otherwise
  const isInTeacherView = pathname.startsWith("/teacher");

  // Different nav items for teachers vs students
  const studentNavItems = [
    { href: "/dashboard", label: t.dashboard, icon: <HomeNavIcon className="w-5 h-5" /> },
    { href: "/lessons", label: t.lessons, icon: <BookNavIcon className="w-5 h-5" /> },
    { href: "/homework", label: t.homework, icon: <ClipboardNavIcon className="w-5 h-5" /> },
    { href: "/tutor", label: t.aiTutor, icon: <OwlTutorIcon className="w-5 h-5" /> },
    { href: "/cohorts", label: t.myClasses, icon: <UsersNavIcon className="w-5 h-5" /> },
    { href: "/progress", label: t.progress, icon: <ChartNavIcon className="w-5 h-5" /> },
  ];

  // Add teacher link for teachers/admins when in student view
  if (isTeacherOrAdmin && !isInTeacherView) {
    studentNavItems.push({
      href: "/teacher",
      label: t.teacherDashboard,
      icon: <GraduationCapIcon className="w-5 h-5" />,
    });
  }

  const teacherNavItems = [
    { href: "/teacher", label: t.teacherDashboard, icon: <HomeNavIcon className="w-5 h-5" /> },
    { href: "/teacher/lessons", label: t.manageLessons, icon: <BookNavIcon className="w-5 h-5" /> },
    { href: "/teacher/homework", label: t.manageHomework, icon: <ClipboardNavIcon className="w-5 h-5" /> },
    { href: "/teacher/cohorts", label: t.manageClasses, icon: <UsersNavIcon className="w-5 h-5" /> },
    { href: "/dashboard", label: t.studentView, icon: <GraduationCapIcon className="w-5 h-5" /> },
  ];

  const navItems = isInTeacherView ? teacherNavItems : studentNavItems;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-white ${mobile ? "" : "border-r border-gray-100"}`}>
      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <Link href="/">
          <MadrassaLogo size="sm" />
        </Link>
      </div>

      {/* Primary Action Button */}
      <div className="p-4">
        <Link
          href={isInTeacherView ? "/teacher/homework/create" : "/lessons"}
          onClick={() => mobile && setSidebarOpen(false)}
          className="group flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#007229] hover:bg-[#005C22] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#007229]/30 hover:shadow-xl hover:shadow-[#007229]/40 hover:-translate-y-0.5"
        >
          {isInTeacherView ? (
            <>
              <ClipboardNavIcon className="w-6 h-6" />
              <span>{language === "ar" ? "إنشاء واجب" : "Create Assignment"}</span>
            </>
          ) : (
            <>
              <FloatingRocket className="w-6 h-6 group-hover:animate-bounce" />
              <span>{t.startLearning}</span>
            </>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => mobile && setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-[15px] font-semibold transition-all ${
                active
                  ? "bg-[#007229]/10 text-[#007229] shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-100">
        <Link
          href="/settings"
          onClick={() => mobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all ${
            pathname === "/settings"
              ? "bg-[#007229]/10 text-[#007229] shadow-sm"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <SettingsNavIcon className="w-5 h-5" />
          {t.settings}
        </Link>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-gray-100 pt-4">
          <div className="w-10 h-10 rounded-full bg-[#D21034] flex items-center justify-center text-white font-bold shadow-md">
            {firstName ? firstName.charAt(0) : "•"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {profile?.full_name || <span className="text-gray-300">...</span>}
            </p>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#D21034] transition-colors"
            >
              {Icons.logout}
              {t.logout}
            </button>
          </div>
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="text-xs font-bold text-gray-500 hover:text-[#007229] px-2 py-1.5 rounded-lg hover:bg-[#007229]/10 transition-all border border-transparent hover:border-[#007229]/20"
          >
            {language === "ar" ? "EN" : "عربي"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5" dir={isRtl ? "rtl" : "ltr"}>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-lg border-b border-gray-100 z-40 flex items-center justify-between px-4">
        <Link href="/">
          <MadrassaLogo size="sm" />
        </Link>
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          {Icons.menu}
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className={`absolute top-0 ${isRtl ? "right-0" : "left-0"} w-72 h-full bg-white shadow-2xl`}>
            <button
              onClick={() => setSidebarOpen(false)}
              className={`absolute top-4 ${isRtl ? "left-4" : "right-4"} p-2 rounded-xl hover:bg-gray-100 transition-colors`}
            >
              {Icons.close}
            </button>
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={`hidden lg:block fixed top-0 ${isRtl ? "right-0" : "left-0"} w-64 h-screen`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className={`${isRtl ? "lg:mr-64" : "lg:ml-64"} pt-16 lg:pt-0`}>
        {children}
      </div>
    </div>
  );
}
