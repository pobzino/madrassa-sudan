"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    title: "بوابة ولي الأمر",
    subtitle: "تابع تقدم أبنائك في التعلم",
    myStudents: "أبنائي",
    noStudents: "لم تقم بربط أي طالب بعد",
    linkStudent: "ربط طالب",
    viewDetails: "عرض التفاصيل",
    loading: "جاري التحميل...",
    lessonsCompleted: "درس مكتمل",
    currentStreak: "يوم متتالي",
    homeworkPending: "واجب معلق",
    lastActive: "آخر نشاط",
    relationship: {
      parent: "ولي أمر",
      guardian: "وصي",
      sibling: "أخ/أخت",
      other: "آخر",
    },
  },
  en: {
    title: "Parent/Guardian Portal",
    subtitle: "Track your children's learning progress",
    myStudents: "My Students",
    noStudents: "You haven't linked any students yet",
    linkStudent: "Link a Student",
    viewDetails: "View Details",
    loading: "Loading...",
    lessonsCompleted: "Lessons",
    currentStreak: "Day Streak",
    homeworkPending: "Pending",
    lastActive: "Last active",
    relationship: {
      parent: "Parent",
      guardian: "Guardian",
      sibling: "Sibling",
      other: "Other",
    },
  },
};

interface StudentLink {
  id: string;
  student_id: string;
  relationship_type: "parent" | "guardian" | "sibling" | "other";
  created_at: string;
  profiles: {
    id: string;
    full_name: string;
    email: string;
  };
  progress?: {
    lessonsCompleted: number;
    currentStreak: number;
    homeworkPending: number;
    lastActive: string | null;
  };
}

export default function GuardianDashboardPage() {
  const [students, setStudents] = useState<StudentLink[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadStudents() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Fetch linked students
      const { data: links, error: linksError } = await supabase
        .from("guardian_students")
        .select("*, profiles!guardian_students_student_id_fkey(id, full_name, email)")
        .eq("guardian_id", user.id)
        .eq("is_approved", true);

      if (linksError) {
        console.error("Error loading students:", linksError);
        setLoading(false);
        return;
      }

      if (!links || links.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch progress data for each student
      const studentsWithProgress = await Promise.all(
        links.map(async (link) => {
          // Get student streak data
          const { data: streak } = await supabase
            .from("student_streaks")
            .select("*")
            .eq("student_id", link.student_id)
            .single();

          // Get pending homework count
          const { count: pendingCount } = await supabase
            .from("homework_submissions")
            .select("*", { count: "exact", head: true })
            .eq("student_id", link.student_id)
            .in("status", ["not_started", "in_progress"]);

          // Get last lesson activity
          const { data: lastLesson } = await supabase
            .from("lesson_progress")
            .select("updated_at")
            .eq("student_id", link.student_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .single();

          return {
            ...link,
            progress: {
              lessonsCompleted: streak?.total_lessons_completed || 0,
              currentStreak: streak?.current_streak_days || 0,
              homeworkPending: pendingCount || 0,
              lastActive: lastLesson?.updated_at || null,
            },
          };
        })
      );

      setStudents(studentsWithProgress as unknown as StudentLink[]);
      setLoading(false);
    }

    loadStudents();
  }, [router, supabase]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return language === "ar" ? "لم يبدأ بعد" : "Not started yet";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return language === "ar" ? "منذ قليل" : "Just now";
    } else if (diffHours < 24) {
      return language === "ar" ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return language === "ar" ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#007229]/5 via-white to-[#D21034]/5 flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 mx-auto mb-4 text-[#007229]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-500 text-lg">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl mx-auto" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t.title}</h1>
        <p className="text-gray-600">{t.subtitle}</p>
      </div>

      {/* Link Student Button */}
      <div className="mb-8">
        <Link
          href="/guardian/link"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#007229] to-[#00913D] text-white font-semibold rounded-xl hover:shadow-lg transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {t.linkStudent}
        </Link>
      </div>

      {/* Students List */}
      {students.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
          <svg className="w-20 h-20 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-gray-500 text-lg mb-4">{t.noStudents}</p>
          <Link
            href="/guardian/link"
            className="inline-block px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
          >
            {t.linkStudent}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {students.map((student) => (
            <div
              key={student.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100"
            >
              {/* Student Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#007229] to-[#00913D] flex items-center justify-center text-white font-bold text-xl shadow-md">
                    {student.profiles.full_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{student.profiles.full_name}</h3>
                    <p className="text-sm text-gray-500">
                      {t.relationship[student.relationship_type]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Progress Stats */}
              {student.progress && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 bg-violet-50 rounded-xl">
                    <div className="text-2xl font-bold text-violet-700">
                      {student.progress.lessonsCompleted}
                    </div>
                    <div className="text-xs text-violet-600 font-medium mt-1">
                      {t.lessonsCompleted}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-xl">
                    <div className="text-2xl font-bold text-orange-700">
                      {student.progress.currentStreak}
                    </div>
                    <div className="text-xs text-orange-600 font-medium mt-1">
                      {t.currentStreak}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-xl">
                    <div className="text-2xl font-bold text-amber-700">
                      {student.progress.homeworkPending}
                    </div>
                    <div className="text-xs text-amber-600 font-medium mt-1">
                      {t.homeworkPending}
                    </div>
                  </div>
                </div>
              )}

              {/* Last Active */}
              {student.progress && (
                <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                  <span>{t.lastActive}</span>
                  <span className="font-medium">{formatDate(student.progress.lastActive)}</span>
                </div>
              )}

              {/* View Details Button */}
              <Link
                href={`/guardian/students/${student.student_id}`}
                className="block w-full py-3 text-center bg-gradient-to-r from-[#007229]/10 to-[#00913D]/10 text-[#007229] font-semibold rounded-xl hover:from-[#007229]/20 hover:to-[#00913D]/20 transition-colors"
              >
                {t.viewDetails}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
