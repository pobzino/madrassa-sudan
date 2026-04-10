"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Profile, Subject } from "@/lib/database.types";
import { getCachedProfile, getCachedUser } from "@/lib/supabase/auth-cache";
import {
  TrophyIcon,
  BookOpenIcon,
  OwlWaving,
  OwlThinking,
  OwlMath,
  OwlScience,
  OwlEnglish,
} from "@/components/illustrations";

const translations = {
  ar: {
    welcomeBack: "أهلاً",
    welcomeSubtitle: "مستعد لمغامرة تعليمية جديدة؟",
    yourProgress: "إنجازاتك",
    lessonsCompleted: "درس",
    dayStreak: "يوم متتالي",
    homeworkDone: "واجب",
    totalPoints: "نقطة",
    subjects: "اختر مادة",
    loading: "جاري التحميل...",
    keepGoing: "استمر! أنت تبلي بلاءً حسناً",
  },
  en: {
    welcomeBack: "Hey",
    welcomeSubtitle: "Ready for a new learning adventure?",
    yourProgress: "Your Achievements",
    lessonsCompleted: "Lessons",
    dayStreak: "Day Streak",
    homeworkDone: "Homework",
    totalPoints: "Points",
    subjects: "Pick a Subject",
    loading: "Loading...",
    keepGoing: "Keep going! You're doing great",
  },
};

// Subject icon mapping — kid-friendly owl variants
const getSubjectIcon = (subject: Subject, className: string = "w-20 h-20") => {
  const name = subject.name_en?.toLowerCase() || "";

  if (name.includes("math")) return <OwlMath className={className} />;
  if (name.includes("science")) return <OwlScience className={className} />;
  if (name.includes("english")) return <OwlEnglish className={className} />;

  // Default fallback
  return <BookOpenIcon className={className} />;
};

const Icons = {
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
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23c-4.97 0-9-3.582-9-8 0-2.79 1.378-5.313 3.5-6.938.281-.216.625-.313.969-.25.344.063.625.281.781.594.438.875.969 1.625 1.625 2.25.125.125.281.188.438.188.281 0 .531-.188.625-.438.156-.438.188-.938.188-1.406 0-2.063-.875-4.063-2.375-5.5-.219-.219-.313-.531-.25-.844.063-.313.25-.563.531-.719C9.5 1.313 10.719 1 12 1c5.523 0 10 4.477 10 10 0 6.627-4.925 12-10 12zm0-2c3.859 0 7-3.582 7-8 0-4.411-3.589-8-8-8-.469 0-.938.031-1.406.094 1.063 1.563 1.656 3.438 1.656 5.406 0 .75-.063 1.5-.219 2.219-.438-.156-.875-.344-1.281-.563-.844-.469-1.594-1.094-2.188-1.844C6.594 12.156 6 13.531 6 15c0 3.314 2.686 6 6 6z"/>
    </svg>
  ),
  star: (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
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
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
      if (!user) { router.push("/auth/login"); return; }

      const profileData = await getCachedProfile(supabase, user.id);
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

      const { data: streakData } = await supabase
        .from("student_streaks")
        .select("*")
        .eq("student_id", user.id)
        .maybeSingle();
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
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center">
        <div className="text-center">
          <OwlThinking className="w-20 h-20 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  const firstName = (profile?.full_name?.split(" ")[0] || "Student").trim();

  // Subject card colors - Sudan themed
  const subjectColors = [
    "from-[#007229] to-[#00913D]",
    "from-[#D21034] to-[#E8334F]",
    "from-[#005C22] to-[#007229]",
    "from-amber-500 to-orange-600",
    "from-[#a01028] to-[#D21034]",
    "from-[#00913D] to-[#007229]",
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8" dir={isRtl ? "rtl" : "ltr"}>
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
              <h1 className="text-3xl sm:text-4xl font-bold mb-2 font-fredoka">{t.welcomeBack}, {firstName}!</h1>
              <p className="text-green-100 text-lg font-fredoka">{t.welcomeSubtitle}</p>

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
              <h2 className="text-xl font-bold text-gray-900 font-fredoka">{t.yourProgress}</h2>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-violet-500/30 animate-pop-in">
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-violet-200 mb-1">{Icons.book}</div>
                  <p className="text-5xl font-bold font-fredoka">{stats.lessons}</p>
                  <p className="text-violet-200 text-base font-medium font-fredoka">{t.lessonsCompleted}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-6 text-white shadow-lg shadow-orange-500/30 animate-pop-in" style={{ animationDelay: "0.1s" }}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-orange-200 mb-1">{Icons.fire}</div>
                  <p className="text-5xl font-bold font-fredoka">{stats.streak}</p>
                  <p className="text-orange-200 text-base font-medium font-fredoka">{t.dayStreak}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-[#007229] to-[#00913D] rounded-2xl p-6 text-white shadow-lg shadow-[#007229]/30 animate-pop-in" style={{ animationDelay: "0.2s" }}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-green-200 mb-1">{Icons.clipboard}</div>
                  <p className="text-5xl font-bold font-fredoka">{stats.homework}</p>
                  <p className="text-green-200 text-base font-medium font-fredoka">{t.homeworkDone}</p>
                </div>
              </div>

              <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-yellow-500 rounded-2xl p-6 text-white shadow-lg shadow-amber-500/30 animate-pop-in" style={{ animationDelay: "0.3s" }}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="text-amber-200 mb-1">{Icons.star}</div>
                  <p className="text-5xl font-bold font-fredoka">{stats.points}</p>
                  <p className="text-amber-200 text-base font-medium font-fredoka">{t.totalPoints}</p>
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
              <h2 className="text-xl font-bold text-gray-900 font-fredoka">{t.subjects}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {subjects.map((subject, index) => (
                <Link
                  key={subject.id}
                  href={`/lessons?subject=${subject.id}`}
                  className="group relative overflow-hidden rounded-3xl p-10 text-white transition-all hover:-translate-y-1 hover:shadow-xl animate-pop-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${subjectColors[index % subjectColors.length]}`} />
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />

                  <div className="relative text-center flex flex-col items-center">
                    <div className="mb-4 drop-shadow-lg group-hover:animate-wiggle">
                      {getSubjectIcon(subject, "w-20 h-20")}
                    </div>
                    <span className="font-bold text-xl text-white/90 group-hover:text-white transition-colors font-fredoka">
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
  );
}
