"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import type { Cohort, Profile } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    myClasses: "فصولي",
    joinClass: "انضم لفصل",
    joinClassDesc: "أدخل رمز الفصل للانضمام",
    enterCode: "أدخل رمز الفصل",
    join: "انضمام",
    joining: "جاري الانضمام...",
    noClasses: "لم تنضم لأي فصل بعد",
    noClassesDesc: "انضم لفصل باستخدام الرمز الذي أعطاك إياه معلمك",
    students: "طالب",
    teacher: "المعلم",
    grade: "الصف",
    loading: "جاري التحميل...",
    back: "العودة",
    leaveClass: "مغادرة الفصل",
    leaveConfirm: "هل أنت متأكد من مغادرة هذا الفصل؟",
    cancel: "إلغاء",
    yes: "نعم",
    invalidCode: "رمز الفصل غير صحيح",
    alreadyJoined: "أنت منضم لهذا الفصل بالفعل",
    joinedSuccess: "تم الانضمام للفصل بنجاح!",
    active: "نشط",
  },
  en: {
    myClasses: "My Classes",
    joinClass: "Join a Class",
    joinClassDesc: "Enter the class code to join",
    enterCode: "Enter class code",
    join: "Join",
    joining: "Joining...",
    noClasses: "You haven't joined any classes yet",
    noClassesDesc: "Join a class using the code your teacher gave you",
    students: "students",
    teacher: "Teacher",
    grade: "Grade",
    loading: "Loading...",
    back: "Back",
    leaveClass: "Leave Class",
    leaveConfirm: "Are you sure you want to leave this class?",
    cancel: "Cancel",
    yes: "Yes",
    invalidCode: "Invalid class code",
    alreadyJoined: "You're already in this class",
    joinedSuccess: "Successfully joined the class!",
    active: "Active",
  },
};

const Icons = {
  back: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  users: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  academic: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  exit: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  ),
};

type CohortWithDetails = Cohort & {
  student_count?: number;
  teachers?: Profile[];
};

export default function CohortsPage() {
  const [cohorts, setCohorts] = useState<CohortWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const user = await getCachedUser(supabase);
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setUserId(user.id);

    // Get user's enrolled cohorts
    const { data: enrollments } = await supabase
      .from("cohort_students")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("is_active", true);

    if (!enrollments || enrollments.length === 0) {
      setLoading(false);
      return;
    }

    const cohortIds = enrollments.map((e) => e.cohort_id);

    // Fetch cohort details
    const { data: cohortsData } = await supabase
      .from("cohorts")
      .select("*")
      .in("id", cohortIds)
      .eq("is_active", true);

    if (cohortsData) {
      // Get student counts and teachers for each cohort
      const enrichedCohorts = await Promise.all(
        cohortsData.map(async (cohort) => {
          // Get student count
          const { count } = await supabase
            .from("cohort_students")
            .select("*", { count: "exact", head: true })
            .eq("cohort_id", cohort.id)
            .eq("is_active", true);

          // Get teachers
          const { data: teacherLinks } = await supabase
            .from("cohort_teachers")
            .select("teacher_id")
            .eq("cohort_id", cohort.id);

          let teachers: Profile[] = [];
          if (teacherLinks && teacherLinks.length > 0) {
            const teacherIds = teacherLinks.map((t) => t.teacher_id);
            const { data: teachersData } = await supabase
              .from("profiles")
              .select("*")
              .in("id", teacherIds);
            if (teachersData) teachers = teachersData;
          }

          return {
            ...cohort,
            student_count: count || 0,
            teachers,
          };
        })
      );

      setCohorts(enrichedCohorts);
    }

    setLoading(false);
  }

  // Join class
  const handleJoin = async () => {
    if (!joinCode.trim() || !userId) return;

    setJoining(true);
    setMessage(null);

    // Find cohort by join code
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("*")
      .eq("join_code", joinCode.trim().toUpperCase())
      .eq("is_active", true)
      .single();

    if (!cohort) {
      setMessage({ type: "error", text: t.invalidCode });
      setJoining(false);
      return;
    }

    // Check if already enrolled
    const { data: existing } = await supabase
      .from("cohort_students")
      .select("*")
      .eq("cohort_id", cohort.id)
      .eq("student_id", userId)
      .single();

    if (existing) {
      if (existing.is_active) {
        setMessage({ type: "error", text: t.alreadyJoined });
        setJoining(false);
        return;
      } else {
        // Reactivate enrollment
        await supabase
          .from("cohort_students")
          .update({ is_active: true })
          .eq("id", existing.id);
      }
    } else {
      // Create new enrollment
      await supabase.from("cohort_students").insert({
        cohort_id: cohort.id,
        student_id: userId,
      });
    }

    setMessage({ type: "success", text: t.joinedSuccess });
    setJoinCode("");
    setJoining(false);
    loadData(); // Refresh list
  };

  // Leave class
  const handleLeave = async (cohortId: string) => {
    if (!userId) return;

    await supabase
      .from("cohort_students")
      .update({ is_active: false })
      .eq("cohort_id", cohortId)
      .eq("student_id", userId);

    setShowLeaveModal(null);
    loadData(); // Refresh list
  };

  // Cohort card colors
  const cardColors = [
    "from-violet-500 to-purple-600",
    "from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600",
  ];

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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/30">
              {Icons.users}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t.myClasses}</h1>
          </div>
        </div>

        {/* Join Class Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#007229] flex items-center justify-center">
              {Icons.plus}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{t.joinClass}</h2>
              <p className="text-sm text-gray-500">{t.joinClassDesc}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t.enterCode}
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white uppercase tracking-widest font-mono"
              maxLength={8}
            />
            <button
              onClick={handleJoin}
              disabled={!joinCode.trim() || joining}
              className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {joining ? t.joining : t.join}
            </button>
          </div>

          {message && (
            <div className={`mt-4 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-100 text-[#007229]"
                : "bg-red-100 text-red-700"
            }`}>
              {message.type === "success" && Icons.check}
              {message.text}
            </div>
          )}
        </div>

        {/* Classes List */}
        {cohorts.length > 0 ? (
          <div className="grid gap-4">
            {cohorts.map((cohort, idx) => (
              <div
                key={cohort.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="flex">
                  {/* Color bar */}
                  <div className={`w-2 bg-gradient-to-b ${cardColors[idx % cardColors.length]}`} />

                  <div className="flex-1 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 text-lg">{cohort.name}</h3>
                          <span className="px-2 py-0.5 bg-emerald-100 text-[#007229] text-xs font-medium rounded-full">
                            {t.active}
                          </span>
                        </div>

                        {cohort.description && (
                          <p className="text-gray-500 text-sm mb-3">{cohort.description}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          {/* Grade */}
                          <div className="flex items-center gap-1.5 text-gray-500">
                            {Icons.academic}
                            <span>{t.grade} {cohort.grade_level}</span>
                          </div>

                          {/* Students */}
                          <div className="flex items-center gap-1.5 text-gray-500">
                            {Icons.users}
                            <span>{cohort.student_count} {t.students}</span>
                          </div>

                          {/* Teacher */}
                          {cohort.teachers && cohort.teachers.length > 0 && (
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                                {cohort.teachers[0].full_name.charAt(0)}
                              </span>
                              <span>{t.teacher}: {cohort.teachers[0].full_name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Leave button */}
                      <button
                        onClick={() => setShowLeaveModal(cohort.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title={t.leaveClass}
                      >
                        {Icons.exit}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-16">
            <OwlSad className="w-24 h-24 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.noClasses}</h3>
            <p className="text-gray-500">{t.noClassesDesc}</p>
          </div>
        )}

      {/* Leave Confirmation Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t.leaveConfirm}</h3>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveModal(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleLeave(showLeaveModal)}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
              >
                {t.yes}
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
