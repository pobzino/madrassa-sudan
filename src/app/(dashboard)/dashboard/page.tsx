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
import { HeroScene, SubjectScene } from "@/components/dashboard/DashboardScenes";

const translations = {
  ar: {
    welcomeBack: "أهلاً",
    welcomeSubtitle: "مستعد لمغامرة تعليمية جديدة؟",
    continueLearning: "واصل التعلم",
    yourProgress: "إنجازاتك",
    lessonsCompleted: "دروس",
    lessonsSub: "دروس مكتملة",
    dayStreak: "يوم متتالي",
    streakSub: "واصل التقدم!",
    homeworkDone: "واجبات",
    homeworkSub: "واجبات",
    totalPoints: "نقاط",
    pointsSub: "اجمع المزيد!",
    subjects: "اختر مادة",
    mathDesc: "حل المسائل. كوّن مهاراتك. استمتع!",
    englishDesc: "اقرأ واكتب واستكشف عالم الكلمات!",
    loading: "جاري التحميل...",
    keepGoing: "استمر! أنت تبلي بلاءً حسناً",
  },
  en: {
    welcomeBack: "Hey",
    welcomeSubtitle: "Ready for a new learning adventure?",
    continueLearning: "Continue learning",
    yourProgress: "Your Achievements",
    lessonsCompleted: "Lessons",
    lessonsSub: "Lessons completed",
    dayStreak: "Day Streak",
    streakSub: "Keep it up!",
    homeworkDone: "Homework",
    homeworkSub: "Assignments",
    totalPoints: "Points",
    pointsSub: "Keep earning!",
    subjects: "Pick a Subject",
    mathDesc: "Solve problems. Build skills. Have fun!",
    englishDesc: "Read, write & explore the world of words!",
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
        // Only Maths and English are live for the first cohort. Science is hidden
        // for now so students aren't confused into thinking it's available yet.
        const coreSubjects = subjectsData.filter((s) => {
          const name = s.name_en?.toLowerCase() || "";
          return name.includes("math") || name.includes("english");
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8" dir={isRtl ? "rtl" : "ltr"}>
          {/* Welcome Banner — illustrated "learning world" hero */}
          <div className="relative mb-8 rounded-3xl overflow-hidden shadow-sm min-h-[230px] sm:min-h-[260px]">
            <HeroScene />

            {/* Owl mascot */}
            <div className="absolute -bottom-1 right-1 sm:right-10 z-10">
              <OwlWaving className="w-24 h-24 sm:w-44 sm:h-44 drop-shadow-xl" />
            </div>

            <div className="relative z-10 p-5 sm:p-10 max-w-[64%] sm:max-w-xl">
              <h1 className="text-3xl sm:text-4xl font-bold font-fredoka text-gray-800">
                {t.welcomeBack}, <span className="text-[#007229]">{firstName}</span>! 👋
              </h1>
              <p className="text-gray-600 text-base sm:text-lg font-fredoka mt-1">{t.welcomeSubtitle}</p>

              {/* Quick stats */}
              <div className="flex flex-wrap gap-2.5 sm:gap-3 mt-5">
                <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm">
                  <span className="text-orange-500">{Icons.fire}</span>
                  <span className="font-bold font-fredoka text-gray-800">{stats.streak}</span>
                  <span className="text-gray-500 font-fredoka">{t.dayStreak}</span>
                </div>
                <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm">
                  <span className="text-amber-400">{Icons.star}</span>
                  <span className="font-bold font-fredoka text-gray-800">{stats.points}</span>
                  <span className="text-gray-500 font-fredoka">{t.totalPoints}</span>
                </div>
              </div>

              {/* Continue CTA — the clear "what to do next" */}
              <Link
                href="/lessons"
                className="inline-flex items-center gap-2 mt-5 px-6 py-3 bg-[#007229] hover:bg-[#005C22] text-white font-bold font-fredoka rounded-2xl shadow-lg shadow-[#007229]/30 transition-all hover:-translate-y-0.5"
              >
                {t.continueLearning}
                <span className="text-lg leading-none">{isRtl ? "←" : "→"}</span>
              </Link>
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
              {[
                { icon: Icons.book, n: stats.lessons, label: t.lessonsCompleted, sub: t.lessonsSub, tile: "bg-violet-500", card: "bg-violet-50", num: "text-violet-600", lbl: "text-violet-500" },
                { icon: Icons.fire, n: stats.streak, label: t.dayStreak, sub: t.streakSub, tile: "bg-orange-500", card: "bg-orange-50", num: "text-orange-600", lbl: "text-orange-500" },
                { icon: Icons.clipboard, n: stats.homework, label: t.homeworkDone, sub: t.homeworkSub, tile: "bg-emerald-500", card: "bg-emerald-50", num: "text-emerald-600", lbl: "text-emerald-600" },
                { icon: Icons.star, n: stats.points, label: t.totalPoints, sub: t.pointsSub, tile: "bg-amber-400", card: "bg-amber-50", num: "text-amber-600", lbl: "text-amber-500" },
              ].map((c, i) => (
                <div key={i} className={`flex items-center gap-3 rounded-2xl p-4 ${c.card} animate-pop-in`} style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className={`w-14 h-14 rounded-2xl ${c.tile} flex items-center justify-center text-white shadow-md shrink-0 [&>svg]:w-7 [&>svg]:h-7`}>
                    {c.icon}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-3xl font-bold font-fredoka leading-none ${c.num}`}>{c.n}</p>
                    <p className={`text-sm font-bold font-fredoka ${c.lbl}`}>{c.label}</p>
                    <p className="text-xs text-gray-400 font-fredoka">{c.sub}</p>
                  </div>
                </div>
              ))}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {subjects.map((subject, index) => {
                const name = subject.name_en?.toLowerCase() || "";
                const variant: "math" | "english" | "default" = name.includes("math")
                  ? "math"
                  : name.includes("english")
                    ? "english"
                    : "default";
                const desc = variant === "math" ? t.mathDesc : variant === "english" ? t.englishDesc : "";
                const titleColor = variant === "english" ? "text-[#c2185b]" : "text-[#007229]";
                const arrowBg = variant === "english" ? "bg-[#e8556d]" : "bg-[#007229]";
                return (
                  <Link
                    key={subject.id}
                    href={`/lessons?subject=${subject.id}`}
                    className="group relative overflow-hidden rounded-3xl p-6 sm:p-7 min-h-[180px] flex transition-all hover:-translate-y-1 hover:shadow-xl animate-pop-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <SubjectScene variant={variant} />

                    <div className="relative z-10 flex-1 max-w-[58%]">
                      <h3 className={`text-2xl font-bold font-fredoka ${titleColor}`}>
                        {language === "ar" ? subject.name_ar : subject.name_en}
                      </h3>
                      <p className="text-gray-600 font-fredoka mt-1 text-sm sm:text-base leading-snug">{desc}</p>
                      <span className={`inline-flex items-center justify-center w-11 h-11 rounded-full ${arrowBg} text-white text-lg mt-5 shadow-md group-hover:scale-110 transition-transform`}>
                        {isRtl ? "←" : "→"}
                      </span>
                    </div>

                    <div className="absolute bottom-2 right-3 sm:right-6 z-10 drop-shadow-md group-hover:animate-wiggle">
                      {getSubjectIcon(subject, "w-28 h-28 sm:w-36 sm:h-36")}
                    </div>
                  </Link>
                );
              })}
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
