"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import type { HomeworkAssignment, HomeworkSubmission, Subject } from "@/lib/database.types";

const translations = {
  ar: {
    homework: "الواجبات",
    all: "الكل",
    pending: "قيد الانتظار",
    submitted: "مُرسل",
    graded: "مُصحح",
    noHomework: "لا توجد واجبات",
    noHomeworkDesc: "عندما يعطيك معلمك واجبات، ستظهر هنا",
    dueIn: "موعد التسليم",
    days: "أيام",
    hours: "ساعات",
    overdue: "متأخر",
    dueToday: "اليوم",
    points: "نقطة",
    score: "الدرجة",
    startNow: "ابدأ الآن",
    continue: "متابعة",
    viewFeedback: "عرض التقييم",
    loading: "جاري التحميل...",
    back: "العودة",
    subject: "المادة",
    allSubjects: "جميع المواد",
  },
  en: {
    homework: "Homework",
    all: "All",
    pending: "Pending",
    submitted: "Submitted",
    graded: "Graded",
    noHomework: "No homework",
    noHomeworkDesc: "When your teacher assigns homework, it will appear here",
    dueIn: "Due in",
    days: "days",
    hours: "hours",
    overdue: "Overdue",
    dueToday: "Due today",
    points: "points",
    score: "Score",
    startNow: "Start Now",
    continue: "Continue",
    viewFeedback: "View Feedback",
    loading: "Loading...",
    back: "Back",
    subject: "Subject",
    allSubjects: "All Subjects",
  },
};

const Icons = {
  clipboard: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  star: (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  alert: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  empty: (
    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
};

type HomeworkWithSubmission = HomeworkAssignment & {
  submission?: HomeworkSubmission | null;
  subject?: Subject | null;
};

type FilterStatus = "all" | "pending" | "submitted" | "graded";

export default function HomeworkPage() {
  const [assignments, setAssignments] = useState<HomeworkWithSubmission[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];
  const isRtl = language === "ar";

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }

      // Get user's cohorts
      const { data: cohortStudents } = await supabase
        .from("cohort_students")
        .select("cohort_id")
        .eq("student_id", user.id)
        .eq("is_active", true);

      const cohortIds = cohortStudents?.map((cs) => cs.cohort_id) || [];

      // Fetch subjects
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("*")
        .order("display_order");
      if (subjectsData) setSubjects(subjectsData);

      if (cohortIds.length > 0) {
        // Fetch assignments for user's cohorts
        const { data: assignmentsData } = await supabase
          .from("homework_assignments")
          .select(`
            *,
            subject:subjects(*),
            submission:homework_submissions(*)
          `)
          .in("cohort_id", cohortIds)
          .eq("is_published", true)
          .order("due_at", { ascending: true });

        if (assignmentsData) {
          const mapped = assignmentsData.map((a) => ({
            ...a,
            submission: Array.isArray(a.submission)
              ? a.submission.find((s: HomeworkSubmission) => s.student_id === user.id) || null
              : a.submission,
          }));
          setAssignments(mapped);
        }
      }

      setLoading(false);
    }
    loadData();
  }, [router, supabase]);

  // Filter assignments
  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      // Subject filter
      if (subjectFilter !== "all" && a.subject_id !== subjectFilter) {
        return false;
      }

      // Status filter
      if (filter === "all") return true;

      const status = getStatus(a);
      if (filter === "pending") return status === "not_started" || status === "in_progress";
      if (filter === "submitted") return status === "submitted";
      if (filter === "graded") return status === "graded" || status === "returned";

      return true;
    });
  }, [assignments, filter, subjectFilter]);

  // Get assignment status
  function getStatus(assignment: HomeworkWithSubmission) {
    if (!assignment.submission) return "not_started";
    return assignment.submission.status;
  }

  // Get due date info
  function getDueInfo(dueAt: string | null) {
    if (!dueAt) return null;

    const now = new Date();
    const due = new Date(dueAt);
    const diff = due.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (diff < 0) {
      return { text: t.overdue, color: "text-red-600 bg-red-100", urgent: true };
    }
    if (hours < 24) {
      return { text: t.dueToday, color: "text-amber-600 bg-amber-100", urgent: true };
    }
    if (days <= 3) {
      return { text: `${t.dueIn} ${days} ${t.days}`, color: "text-amber-600 bg-amber-100", urgent: false };
    }
    return { text: `${t.dueIn} ${days} ${t.days}`, color: "text-gray-600 bg-gray-100", urgent: false };
  }

  // Get subject color
  function getSubjectColor(subjectId: string | null) {
    if (!subjectId) return "bg-gray-100 text-gray-700";
    const index = subjects.findIndex((s) => s.id === subjectId);
    const colors = [
      "bg-violet-100 text-violet-700",
      "bg-cyan-100 text-cyan-700",
      "bg-emerald-100 text-[#007229]",
      "bg-amber-100 text-amber-700",
      "bg-pink-100 text-pink-700",
    ];
    return colors[index % colors.length];
  }

  // Get status badge
  function getStatusBadge(assignment: HomeworkWithSubmission) {
    const status = getStatus(assignment);
    switch (status) {
      case "submitted":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            {Icons.check}
            {t.submitted}
          </span>
        );
      case "graded":
      case "returned":
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-[#007229] text-xs font-medium rounded-full">
            {Icons.star}
            {t.graded}
          </span>
        );
      default:
        return null;
    }
  }

  // Get action button
  function getActionButton(assignment: HomeworkWithSubmission) {
    const status = getStatus(assignment);
    switch (status) {
      case "not_started":
        return (
          <span className="text-[#007229] font-medium text-sm flex items-center gap-1">
            {t.startNow}
            <span className={isRtl ? "rotate-180" : ""}>{Icons.chevronRight}</span>
          </span>
        );
      case "in_progress":
        return (
          <span className="text-amber-600 font-medium text-sm flex items-center gap-1">
            {t.continue}
            <span className={isRtl ? "rotate-180" : ""}>{Icons.chevronRight}</span>
          </span>
        );
      case "graded":
      case "returned":
        return (
          <span className="text-blue-600 font-medium text-sm flex items-center gap-1">
            {t.viewFeedback}
            <span className={isRtl ? "rotate-180" : ""}>{Icons.chevronRight}</span>
          </span>
        );
      default:
        return (
          <span className="text-gray-400 font-medium text-sm flex items-center gap-1">
            {t.submitted}
          </span>
        );
    }
  }

  const filterTabs = [
    { id: "all" as FilterStatus, label: t.all },
    { id: "pending" as FilterStatus, label: t.pending },
    { id: "submitted" as FilterStatus, label: t.submitted },
    { id: "graded" as FilterStatus, label: t.graded },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
            {Icons.clipboard}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t.homework}</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <OwlThinking className="w-20 h-20 mx-auto mb-4" />
              <p className="text-gray-500">{t.loading}</p>
            </div>
          </div>
        ) : (
          <>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Status tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    filter === tab.id
                      ? "bg-emerald-100 text-[#007229]"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Subject filter */}
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer min-w-[140px]"
            >
              <option value="all">{t.allSubjects}</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {language === "ar" ? subject.name_ar : subject.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Assignments List */}
        {filteredAssignments.length > 0 ? (
          <div className="space-y-4">
            {filteredAssignments.map((assignment) => {
              const dueInfo = getDueInfo(assignment.due_at);
              const status = getStatus(assignment);

              return (
                <Link
                  key={assignment.id}
                  href={`/homework/${assignment.id}`}
                  className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title and badges */}
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 text-lg">
                          {language === "ar" ? assignment.title_ar : assignment.title_en || assignment.title_ar}
                        </h3>
                        {getStatusBadge(assignment)}
                      </div>

                      {/* Description */}
                      {(assignment.instructions_ar || assignment.instructions_en) && (
                        <p className="text-gray-500 text-sm line-clamp-2 mb-3">
                          {language === "ar" ? assignment.instructions_ar : assignment.instructions_en}
                        </p>
                      )}

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Subject */}
                        {assignment.subject && (
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getSubjectColor(assignment.subject_id)}`}>
                            {language === "ar" ? assignment.subject.name_ar : assignment.subject.name_en}
                          </span>
                        )}

                        {/* Due date */}
                        {dueInfo && status !== "submitted" && status !== "graded" && (
                          <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${dueInfo.color}`}>
                            {dueInfo.urgent && Icons.alert}
                            {Icons.clock}
                            {dueInfo.text}
                          </span>
                        )}

                        {/* Points */}
                        <span className="text-xs text-gray-500">
                          {assignment.total_points} {t.points}
                        </span>

                        {/* Score if graded */}
                        {assignment.submission?.score !== null && assignment.submission?.score !== undefined && (
                          <span className="flex items-center gap-1 text-sm font-medium text-[#007229]">
                            {Icons.star}
                            {t.score}: {assignment.submission.score}/{assignment.total_points}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0">
                      {getActionButton(assignment)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-16">
            <OwlSad className="w-24 h-24 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t.noHomework}</h3>
            <p className="text-gray-500">{t.noHomeworkDesc}</p>
          </div>
        )}
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
