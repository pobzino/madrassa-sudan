"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOffline } from "@/contexts/OfflineContext";
import type { Profile } from "@/lib/database.types";
import { AUTH_RESOLVED_EVENT, getAuthStateOrPending, getCachedProfile, type AuthStatus } from "@/lib/supabase/auth-cache";
import { logOut } from "@/lib/auth/logout";
import { getOwner, saveOwner } from "@/lib/offline/identity";
import { OFFLINE_HUB_PATH } from "@/lib/offline/cache-names";
import { confirmLogOutIfUnsynced } from "@/components/settings/AccountActions";
import FeedbackModal from "@/components/FeedbackModal";
import NavigationProgress from "@/components/NavigationProgress";
import OfflineBanner from "@/components/OfflineBanner";
import { AutoNudges } from "@/components/pwa/InstallNudges";
import { useInstallPlatform } from "@/components/pwa/AddToPhone";
import {
  FloatingRocket,
  GraduationCapIcon,
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
    homework: "التدريب",
    aiTutor: "المعلم الذكي",
    myClasses: "فصولي",
    progress: "التقدم",
    diagnostic: "اختبار المستوى",
    downloads: "التحميلات",
    home: "الرئيسية",
    // Teacher nav
    teacherDashboard: "لوحة المعلم",
    manageLessons: "إدارة الدروس",
    manageHomework: "إدارة التدريب",
    manageClasses: "إدارة الفصول",
    learningPath: "مسار التعلم",
    studentView: "عرض الطالب",
    admin: "الإدارة",
    // Common
    settings: "الإعدادات",
    reportIssue: "الإبلاغ عن مشكلة",
    privacy: "الخصوصية",
    terms: "الشروط",
    logout: "تسجيل الخروج",
    loggingOut: "جارٍ تسجيل الخروج…",
    loading: "جاري التحميل...",
    slowConnection: "الاتصال بطيء — ما زلنا نحاول…",
    openSavedLessons: "افتح دروسي المحفوظة",
  },
  en: {
    // Student nav
    dashboard: "Dashboard",
    startLearning: "Start Learning",
    lessons: "Lessons",
    homework: "Practice",
    aiTutor: "AI Tutor",
    myClasses: "My Classes",
    progress: "Progress",
    diagnostic: "Level Test",
    downloads: "Downloads",
    home: "Home",
    // Teacher nav
    teacherDashboard: "Teacher Dashboard",
    manageLessons: "Manage Lessons",
    manageHomework: "Manage Practice",
    manageClasses: "Manage Classes",
    learningPath: "Learning Path",
    studentView: "Student View",
    admin: "Admin",
    // Common
    settings: "Settings",
    reportIssue: "Report Issue",
    privacy: "Privacy",
    terms: "Terms",
    logout: "Log out",
    loggingOut: "Logging out…",
    loading: "Loading...",
    slowConnection: "Slow connection — still trying…",
    openSavedLessons: "Open my saved lessons",
  },
};

/** Saved-for-offline lessons, in the colourful style of the other nav icons. */
const DownloadsNavIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {/* Tray */}
    <path d="M3.5 14.5v3.75A2.75 2.75 0 006.25 21h11.5a2.75 2.75 0 002.75-2.75V14.5" stroke="#005C22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    {/* Arrow into it */}
    <path d="M12 3v11" stroke="#007229" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M7.75 10.25L12 14.5l4.25-4.25" stroke="#D21034" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Pages that work from what's saved on the phone, so they stay put offline.
const OFFLINE_CAPABLE_PATHS = ["/downloads"];
// A lesson page handles a missing connection itself (it opens this account's
// saved copy in the offline player, or says it isn't saved); sending it to
// the hub from here as well would race that.
const HANDLES_OFFLINE_ITSELF = /^\/lessons\/[^/]+\/?$/;

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
  // Offline there's no profile query; the phone's owner record gives the name.
  const [savedOwner, setSavedOwner] = useState<{ fullName: string; role: string | null } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  // Online, but the sign-in check is taking a while (a slow connection).
  const [slowConnection, setSlowConnection] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const { refreshDownloads } = useOffline();
  const t = translations[language];
  const isRtl = language === "ar";
  const authCheckRef = useRef(false);
  const authStatusRef = useRef<AuthStatus | null>(null);
  const loadProfileRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // Prevent duplicate auth checks
    if (authCheckRef.current) return;
    authCheckRef.current = true;

    const showSavedOwner = async () => {
      const owner = await getOwner();
      if (owner) setSavedOwner({ fullName: owner.fullName, role: owner.role });
    };

    // "Signed out" and "no connection" are different answers: only the first
    // goes to the login page. Offline (or lie-fi timing out) with nobody
    // verified in this visit, the saved-lessons hub is the useful place.
    async function loadProfile() {
      const supabase = createClient();
      let auth = await getAuthStateOrPending(supabase);
      if (auth.status === "pending") {
        // A slow answer isn't "offline": this page just loaded, so the network
        // works. Stay here and keep waiting, with the saved lessons one tap away.
        authStatusRef.current = "pending";
        setSlowConnection(true);
        auth = await auth.verification;
        setSlowConnection(false);
      }
      authStatusRef.current = auth.status;
      if (auth.status === "signed_out") {
        router.push("/auth/login");
        return;
      }
      if (!auth.user) {
        const here = window.location.pathname;
        const staysPut =
          OFFLINE_CAPABLE_PATHS.some((path) => here === path || here.startsWith(`${path}/`)) ||
          HANDLES_OFFLINE_ITSELF.test(here);
        if (!staysPut) {
          window.location.assign(OFFLINE_HUB_PATH);
        }
        await showSavedOwner();
        return;
      }

      const profileData = await getCachedProfile(supabase, auth.user.id);
      if (profileData) {
        setProfile(profileData);
        // A verified account owns this phone's downloads from now on (an
        // account switch clears the previous one's first).
        if (auth.status === "verified") {
          const saved = await saveOwner(profileData).catch(() => null);
          // Downloads saved before this phone had an owner record show up now.
          if (saved) await refreshDownloads();
        }
      } else {
        await showSavedOwner();
      }
    }
    loadProfileRef.current = loadProfile;
    void loadProfile().catch(() => undefined);
  }, [router, refreshDownloads]);

  // Back online after an offline start, or a sign-in check we gave up on
  // answered after all (the browser was online throughout, so "online" never
  // fires): verify now, so the profile loads and the owner record is
  // refreshed without a reload.
  useEffect(() => {
    const recheck = () => {
      if (authStatusRef.current !== "offline") return;
      void loadProfileRef.current?.().catch(() => undefined);
    };
    window.addEventListener("online", recheck);
    window.addEventListener(AUTH_RESOLVED_EVENT, recheck);
    return () => {
      window.removeEventListener("online", recheck);
      window.removeEventListener(AUTH_RESOLVED_EVENT, recheck);
    };
  }, []);

  // The shared log-out (sync first, end the session even offline, clear this
  // phone, full page load). It navigates itself, so the busy state stays.
  const handleLogout = async () => {
    if (loggingOut || !(await confirmLogOutIfUnsynced(language))) return;
    setLoggingOut(true);
    await logOut();
  };

  // Get first name or default - don't block render for this
  const displayName = profile?.full_name || savedOwner?.fullName || "";
  const firstName = displayName.split(" ")[0] || "";
  const role = profile?.role ?? savedOwner?.role ?? null;
  const teacherDevBypass = process.env.NEXT_PUBLIC_DEV_ALLOW_TEACHER_VIEW === "1";

  const isTeacherOrAdmin = teacherDevBypass || role === "teacher" || role === "admin";
  const hideUnusedStudentNavigation = process.env.NODE_ENV === "production";

  // Show teacher nav when on /teacher/* or /admin routes, student nav otherwise
  const isInTeacherView = pathname.startsWith("/teacher") || pathname.startsWith("/admin");
  const inInstalledApp = useInstallPlatform() === "installed";

  // Different nav items for teachers vs students
  // Student nav: 4 primary items with colored icon backgrounds for kids
  const studentNavItems = [
    { href: "/dashboard", label: t.dashboard, icon: <HomeNavIcon className="w-6 h-6" />, color: "bg-emerald-100 text-emerald-600" },
    { href: "/lessons", label: t.lessons, icon: <BookNavIcon className="w-6 h-6" />, color: "bg-violet-100 text-violet-600" },
    { href: "/downloads", label: t.downloads, icon: <DownloadsNavIcon className="w-6 h-6" />, color: "bg-lime-100 text-lime-700" },
    ...(!hideUnusedStudentNavigation
      ? [{ href: "/homework", label: t.homework, icon: <ClipboardNavIcon className="w-6 h-6" />, color: "bg-amber-100 text-amber-600" }]
      : []),
    { href: "/progress", label: t.progress, icon: <ChartNavIcon className="w-6 h-6" />, color: "bg-cyan-100 text-cyan-600" },
  ];

  // Secondary student nav (smaller, below primary).
  // AI Tutor and Level Test (diagnostic) are intentionally hidden for the first
  // cohort to keep the site simple — the routes still exist for later use.
  const studentSecondaryNavItems = [
    ...(!hideUnusedStudentNavigation
      ? [{ href: "/cohorts", label: t.myClasses, icon: <UsersNavIcon className="w-5 h-5" /> }]
      : []),
  ];

  // Add teacher link for teachers/admins when in student view
  if (isTeacherOrAdmin && !isInTeacherView) {
    studentSecondaryNavItems.push({
      href: "/teacher",
      label: t.teacherDashboard,
      icon: <GraduationCapIcon className="w-5 h-5" />,
    });
  }

  const teacherNavItems = [
    { href: "/teacher", label: t.teacherDashboard, icon: <HomeNavIcon className="w-5 h-5" /> },
    { href: "/teacher/lessons", label: t.manageLessons, icon: <BookNavIcon className="w-5 h-5" /> },
    { href: "/teacher/learning-path", label: t.learningPath, icon: <ChartNavIcon className="w-5 h-5" /> },
    { href: "/teacher/homework", label: t.manageHomework, icon: <ClipboardNavIcon className="w-5 h-5" /> },
    { href: "/teacher/cohorts", label: t.manageClasses, icon: <UsersNavIcon className="w-5 h-5" /> },
    ...(role === "admin"
      ? [{
          href: "/admin",
          label: t.admin,
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          ),
        }]
      : []),
    { href: "/dashboard", label: t.studentView, icon: <GraduationCapIcon className="w-5 h-5" /> },
  ];

  const navItems = isInTeacherView ? teacherNavItems : studentNavItems;
  const isStudentView = !isInTeacherView;

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const renderSidebar = (mobile = false) => (
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
          href={isInTeacherView ? "/teacher/lessons/new" : "/lessons"}
          onClick={() => mobile && setSidebarOpen(false)}
          className={`group flex items-center justify-center gap-2 w-full px-4 bg-[#007229] hover:bg-[#005C22] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#007229]/30 hover:shadow-xl hover:shadow-[#007229]/40 hover:-translate-y-0.5 ${
            isStudentView ? "py-4 text-base font-fredoka" : "py-3"
          }`}
        >
          {isInTeacherView ? (
            <>
              <ClipboardNavIcon className="w-6 h-6" />
              <span>{language === "ar" ? "درس جديد" : "New Lesson"}</span>
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
          const isNavigating = navigatingTo === item.href && !active;
          const itemColor = "color" in item ? (item as { color: string }).color : null;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (!active) setNavigatingTo(item.href);
                if (mobile) setSidebarOpen(false);
              }}
              className={`flex items-center gap-3 rounded-xl transition-all ${
                isStudentView
                  ? `px-4 py-4 mb-2 text-base font-semibold font-fredoka ${
                      active
                        ? "bg-[#007229]/10 text-[#007229] shadow-sm"
                        : isNavigating
                          ? "bg-gray-100 text-[#007229]"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`
                  : `px-4 py-3 mb-1 text-[15px] font-semibold ${
                      active
                        ? "bg-[#007229]/10 text-[#007229] shadow-sm"
                        : isNavigating
                          ? "bg-gray-100 text-[#007229]"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`
              }`}
            >
              {isNavigating ? (
                <div className={`${isStudentView ? "w-6 h-6" : "w-5 h-5"} animate-spin rounded-full border-2 border-gray-200 border-t-[#007229]`} />
              ) : isStudentView && itemColor ? (
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${itemColor}`}>
                  {item.icon}
                </div>
              ) : (
                item.icon
              )}
              {item.label}
            </Link>
          );
        })}

        {/* Secondary nav items for students (smaller, separated) */}
        {isStudentView && studentSecondaryNavItems.length > 0 && (
          <>
            <div className="my-2 border-t border-gray-100" />
            {studentSecondaryNavItems.map((item) => {
              const active = isActive(item.href);
              const isNavigating = navigatingTo === item.href && !active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (!active) setNavigatingTo(item.href);
                    if (mobile) setSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-1 text-sm font-medium transition-all ${
                    active
                      ? "bg-[#007229]/10 text-[#007229] shadow-sm"
                      : isNavigating
                        ? "bg-gray-100 text-[#007229]"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  {isNavigating ? (
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#007229]" />
                  ) : (
                    item.icon
                  )}
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Bottom Section */}
      <div className="p-3 border-t border-gray-100">
        {isTeacherOrAdmin && (
          <button
            onClick={() => { setShowFeedback(true); if (mobile) setSidebarOpen(false); }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-all text-amber-600 hover:bg-amber-50 hover:text-amber-700 w-full"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {t.reportIssue}
          </button>
        )}
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
        <div className="flex items-center gap-3 px-4 pt-1">
          <Link
            href="/privacy"
            target="_blank"
            onClick={() => mobile && setSidebarOpen(false)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t.privacy}
          </Link>
          <span className="text-gray-300">·</span>
          <Link
            href="/terms"
            target="_blank"
            onClick={() => mobile && setSidebarOpen(false)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {t.terms}
          </Link>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-gray-100 pt-4">
          <div className="w-10 h-10 rounded-full bg-[#D21034] flex items-center justify-center text-white font-bold shadow-md">
            {firstName ? firstName.charAt(0) : "•"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {displayName || <span className="text-gray-300">...</span>}
            </p>
            <button
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-[#D21034] transition-colors disabled:opacity-60"
            >
              {Icons.logout}
              {loggingOut ? t.loggingOut : t.logout}
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
      <OfflineBanner />
      {slowConnection && (
        <div role="status" className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white">
          <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span>{t.slowConnection}</span>
            {/* A full page load: the saved-lessons hub works with no connection. */}
            <a href={OFFLINE_HUB_PATH} className="rounded-full bg-white/20 px-3 py-0.5 font-bold underline-offset-2 hover:bg-white/30 hover:underline">
              {t.openSavedLessons}
            </a>
          </span>
        </div>
      )}
      <NavigationProgress />

      {/* Mobile Header. In the installed app, learner pages use the bottom tab bar
          instead of the menu, and the logo opens the dashboard, not the website. */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-lg border-b border-gray-100 z-40 flex items-center justify-between px-4">
        <Link href={inInstalledApp && !isInTeacherView ? "/dashboard" : "/"}>
          <MadrassaLogo size="sm" />
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Language switch, always one tap away (the installed app has no menu). */}
          <button
            onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-600 transition-colors hover:border-[#007229]/30 hover:text-[#007229]"
            aria-label={language === "ar" ? "Switch to English" : "التبديل إلى العربية"}
          >
            {language === "ar" ? "EN" : "عربي"}
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className={`p-2 rounded-xl hover:bg-gray-100 transition-colors ${isInTeacherView ? "" : "standalone:hidden"}`}
          >
            {Icons.menu}
          </button>
        </div>
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
            {renderSidebar(true)}
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={`hidden lg:block fixed top-0 ${isRtl ? "right-0" : "left-0"} w-64 h-screen`}>
        {renderSidebar()}
      </div>

      {/* Main Content */}
      <div
        className={`${isRtl ? "lg:mr-64" : "lg:ml-64"} pt-16 lg:pt-0 ${
          isInTeacherView ? "" : "standalone:pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:standalone:pb-0"
        }`}
      >
        {children}
      </div>

      {/* In the installed app on phones, a bottom tab bar like a native app. */}
      {!isInTeacherView && (
        <nav
          aria-label={t.home}
          className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg standalone:flex lg:standalone:hidden"
        >
          {[
            { href: "/dashboard", label: t.home, icon: <HomeNavIcon className="h-6 w-6" /> },
            { href: "/lessons", label: t.lessons, icon: <BookNavIcon className="h-6 w-6" /> },
            { href: "/downloads", label: t.downloads, icon: <DownloadsNavIcon className="h-6 w-6" /> },
            { href: "/progress", label: t.progress, icon: <ChartNavIcon className="h-6 w-6" /> },
            { href: "/settings", label: t.settings, icon: <span className="[&>svg]:h-6 [&>svg]:w-6">{Icons.settings}</span> },
          ].map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-bold font-fredoka ${active ? "text-[#007229]" : "text-gray-500"}`}
              >
                <span className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-[#007229]/10" : ""}`}>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Offers to add Amal to the phone and turn on reminders, at calm moments. */}
      {!isInTeacherView && profile && (
        <AutoNudges allowReminders={profile.role === "parent" || profile.role === "admin"} pathname={pathname} />
      )}

      {/* Feedback Modal */}
      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
    </div>
  );
}
