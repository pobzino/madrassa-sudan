"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import type { Profile } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    myClasses: "فصولي",
    browseClasses: "تصفح الفصول",
    browseDesc: "اطلب الانضمام لفصل",
    requestJoin: "طلب انضمام",
    requesting: "جاري الطلب...",
    pendingApproval: "في انتظار الموافقة",
    member: "عضو",
    requestSent: "تم إرسال الطلب!",
    students: "طالب",
    teacher: "المعلم",
    grade: "الصف",
    loading: "جاري التحميل...",
    leaveClass: "مغادرة الفصل",
    leaveConfirm: "هل أنت متأكد من مغادرة هذا الفصل؟",
    cancel: "إلغاء",
    yes: "نعم",
    noClasses: "لم تنضم لأي فصل بعد",
    noClassesDesc: "تصفح الفصول المتاحة وأرسل طلب انضمام",
    noAvailableClasses: "لا توجد فصول متاحة",
    active: "نشط",
    rejected: "مرفوض",
    requestAgain: "أعد الطلب",
  },
  en: {
    myClasses: "My Classes",
    browseClasses: "Browse Classes",
    browseDesc: "Request to join a class",
    requestJoin: "Request to Join",
    requesting: "Requesting...",
    pendingApproval: "Pending Approval",
    member: "Member",
    requestSent: "Request sent!",
    students: "students",
    teacher: "Teacher",
    grade: "Grade",
    loading: "Loading...",
    leaveClass: "Leave Class",
    leaveConfirm: "Are you sure you want to leave this class?",
    cancel: "Cancel",
    yes: "Yes",
    noClasses: "You haven't joined any classes yet",
    noClassesDesc: "Browse available classes and request to join",
    noAvailableClasses: "No classes available",
    active: "Active",
    rejected: "Rejected",
    requestAgain: "Request Again",
  },
};

const Icons = {
  users: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  academic: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
  clock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
};

interface CohortWithDetails {
  id: string;
  name: string;
  description: string | null;
  grade_level: number;
  is_active: boolean;
  student_count: number;
  teachers: Profile[];
  enrollment_status: "none" | "pending" | "approved" | "rejected";
}

export default function CohortsPage() {
  const [myCohorts, setMyCohorts] = useState<CohortWithDetails[]>([]);
  const [availableCohorts, setAvailableCohorts] = useState<CohortWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"my" | "browse">("my");

  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];

  const loadData = useCallback(async () => {
    const user = await getCachedUser(supabase);
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setUserId(user.id);

    // Get all user's enrollments (any status)
    const { data: enrollments } = await supabase
      .from("cohort_students")
      .select("cohort_id, status, is_active")
      .eq("student_id", user.id);

    const enrollmentMap = new Map<string, { status: string; is_active: boolean }>();
    for (const e of enrollments || []) {
      enrollmentMap.set(e.cohort_id, { status: e.status, is_active: e.is_active });
    }

    // Get all active cohorts
    const { data: allCohorts } = await supabase
      .from("cohorts")
      .select("*")
      .eq("is_active", true);

    if (!allCohorts) {
      setLoading(false);
      return;
    }

    // Enrich all cohorts
    const enriched: CohortWithDetails[] = await Promise.all(
      allCohorts.map(async (cohort) => {
        const { count } = await supabase
          .from("cohort_students")
          .select("*", { count: "exact", head: true })
          .eq("cohort_id", cohort.id)
          .eq("is_active", true)
          .eq("status", "approved");

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

        const enrollment = enrollmentMap.get(cohort.id);
        let enrollment_status: CohortWithDetails["enrollment_status"] = "none";
        if (enrollment) {
          if (enrollment.status === "approved" && enrollment.is_active) {
            enrollment_status = "approved";
          } else if (enrollment.status === "pending") {
            enrollment_status = "pending";
          } else if (enrollment.status === "rejected") {
            enrollment_status = "rejected";
          }
        }

        return {
          ...cohort,
          student_count: count || 0,
          teachers,
          enrollment_status,
        };
      })
    );

    setMyCohorts(enriched.filter((c) => c.enrollment_status === "approved"));
    setAvailableCohorts(enriched.filter((c) => c.enrollment_status !== "approved"));
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadData]);

  const handleRequestJoin = async (cohortId: string) => {
    if (!userId) return;
    setRequestingId(cohortId);
    setMessage(null);

    // Check if there's an existing enrollment (rejected or inactive)
    const { data: existing } = await supabase
      .from("cohort_students")
      .select("id, status")
      .eq("cohort_id", cohortId)
      .eq("student_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("cohort_students")
        .update({ status: "pending", is_active: true })
        .eq("id", existing.id);
    } else {
      await supabase.from("cohort_students").insert({
        cohort_id: cohortId,
        student_id: userId,
        status: "pending",
      });
    }

    setMessage({ type: "success", text: t.requestSent });
    setRequestingId(null);
    void loadData();
  };

  const handleLeave = async (cohortId: string) => {
    if (!userId) return;
    await supabase
      .from("cohort_students")
      .update({ is_active: false })
      .eq("cohort_id", cohortId)
      .eq("student_id", userId);
    setShowLeaveModal(null);
    void loadData();
  };

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
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-pink-500/30">
              {Icons.users}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{t.myClasses}</h1>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("my")}
              className={`px-5 py-2.5 rounded-xl font-medium transition-colors ${
                activeTab === "my"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.myClasses} ({myCohorts.length})
            </button>
            <button
              onClick={() => setActiveTab("browse")}
              className={`px-5 py-2.5 rounded-xl font-medium transition-colors ${
                activeTab === "browse"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.browseClasses}
              {availableCohorts.filter((c) => c.enrollment_status === "none" || c.enrollment_status === "rejected").length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                  {availableCohorts.filter((c) => c.enrollment_status === "none" || c.enrollment_status === "rejected").length}
                </span>
              )}
            </button>
          </div>

          {/* Success/Error message */}
          {message && (
            <div className={`mb-6 p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}>
              {message.type === "success" && Icons.check}
              {message.text}
            </div>
          )}

          {/* My Classes Tab */}
          {activeTab === "my" && (
            <>
              {myCohorts.length > 0 ? (
                <div className="grid gap-4">
                  {myCohorts.map((cohort, idx) => (
                    <div
                      key={cohort.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="flex">
                        <div className={`w-2 bg-gradient-to-b ${cardColors[idx % cardColors.length]}`} />
                        <div className="flex-1 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900 text-lg">{cohort.name}</h3>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                                  {t.active}
                                </span>
                              </div>
                              {cohort.description && (
                                <p className="text-gray-500 text-sm mb-3">{cohort.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  {Icons.academic}
                                  <span>{t.grade} {cohort.grade_level}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  {Icons.users}
                                  <span>{cohort.student_count} {t.students}</span>
                                </div>
                                {cohort.teachers.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-gray-500">
                                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                                      {cohort.teachers[0].full_name.charAt(0)}
                                    </span>
                                    <span>{t.teacher}: {cohort.teachers[0].full_name}</span>
                                  </div>
                                )}
                              </div>
                            </div>
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
                <div className="text-center py-16">
                  <OwlSad className="w-24 h-24 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.noClasses}</h3>
                  <p className="text-gray-500 mb-4">{t.noClassesDesc}</p>
                  <button
                    onClick={() => setActiveTab("browse")}
                    className="px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                  >
                    {t.browseClasses}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Browse Classes Tab */}
          {activeTab === "browse" && (
            <>
              {availableCohorts.length > 0 ? (
                <div className="grid gap-4">
                  {availableCohorts.map((cohort, idx) => (
                    <div
                      key={cohort.id}
                      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="flex">
                        <div className={`w-2 bg-gradient-to-b ${cardColors[idx % cardColors.length]}`} />
                        <div className="flex-1 p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 text-lg mb-1">{cohort.name}</h3>
                              {cohort.description && (
                                <p className="text-gray-500 text-sm mb-3">{cohort.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  {Icons.academic}
                                  <span>{t.grade} {cohort.grade_level}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-gray-500">
                                  {Icons.users}
                                  <span>{cohort.student_count} {t.students}</span>
                                </div>
                                {cohort.teachers.length > 0 && (
                                  <div className="flex items-center gap-1.5 text-gray-500">
                                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                                      {cohort.teachers[0].full_name.charAt(0)}
                                    </span>
                                    <span>{t.teacher}: {cohort.teachers[0].full_name}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action button based on enrollment status */}
                            {cohort.enrollment_status === "pending" ? (
                              <span className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 text-sm font-medium rounded-xl border border-amber-200">
                                {Icons.clock}
                                {t.pendingApproval}
                              </span>
                            ) : cohort.enrollment_status === "rejected" ? (
                              <button
                                onClick={() => handleRequestJoin(cohort.id)}
                                disabled={requestingId === cohort.id}
                                className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                              >
                                {requestingId === cohort.id ? t.requesting : t.requestAgain}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRequestJoin(cohort.id)}
                                disabled={requestingId === cohort.id}
                                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                              >
                                {requestingId === cohort.id ? t.requesting : t.requestJoin}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <span className="text-6xl mb-4 block">🏫</span>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.noAvailableClasses}</h3>
                </div>
              )}
            </>
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
