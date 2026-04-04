"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { OwlThinking, OwlSad } from "@/components/illustrations";
import { StudentHomeworkList } from "@/components/homework/HomeworkList";
import type { HomeworkAssignment, HomeworkSubmission, Subject } from "@/lib/database.types";
import { getCachedUser } from "@/lib/supabase/auth-cache";

const translations = {
  ar: {
    homework: "الواجبات",
    all: "الكل",
    pending: "قيد الانتظار",
    submitted: "مُرسل",
    graded: "مُصحح",
    noHomework: "لا توجد واجبات",
    noHomeworkDesc: "عندما يعطيك معلمك واجبات، ستظهر هنا",
    back: "العودة",
    subject: "المادة",
    allSubjects: "جميع المواد",
    loading: "جاري التحميل...",
  },
  en: {
    homework: "Homework",
    all: "All",
    pending: "Pending",
    submitted: "Submitted",
    graded: "Graded",
    noHomework: "No homework",
    noHomeworkDesc: "When your teacher assigns homework, it will appear here",
    back: "Back",
    subject: "Subject",
    allSubjects: "All Subjects",
    loading: "Loading...",
  },
};

type FilterStatus = "all" | "pending" | "submitted" | "graded";

interface HomeworkWithDetails extends HomeworkAssignment {
  submission?: HomeworkSubmission | null;
  subject?: Subject | null;
}

export default function HomeworkPage() {
  const [assignments, setAssignments] = useState<HomeworkWithDetails[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = translations[language];

  useEffect(() => {
    async function loadData() {
      const user = await getCachedUser(supabase);
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
          .select(
            `
            *,
            subject:subjects(*),
            submission:homework_submissions(*)
          `
          )
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

      const status = a.submission?.status || "not_started";
      if (filter === "pending") return status === "not_started" || status === "in_progress";
      if (filter === "submitted") return status === "submitted";
      if (filter === "graded") return status === "graded" || status === "returned";

      return true;
    });
  }, [assignments, filter, subjectFilter]);

  // Format for StudentHomeworkList
  const homeworkList = filteredAssignments.map((a) => ({
    id: a.id,
    title_ar: a.title_ar,
    title_en: a.title_en,
    due_at: a.due_at,
    total_points: a.total_points,
    status: (a.submission?.status || "not_started") as
      | "not_started"
      | "in_progress"
      | "submitted"
      | "graded"
      | "returned",
    score: a.submission?.score ?? null,
    subject_name:
      language === "ar"
        ? a.subject?.name_ar
        : a.subject?.name_en || a.subject?.name_ar,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <OwlThinking className="w-20 h-20 mx-auto mb-4" />
          <p className="text-gray-500">{t.loading}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-500/30">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold font-fredoka text-gray-900">{t.homework}</h1>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Status tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            {([
              { id: "all", label: t.all },
              { id: "pending", label: t.pending },
              { id: "submitted", label: t.submitted },
              { id: "graded", label: t.graded },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-5 py-2.5 rounded-xl text-base font-semibold font-fredoka whitespace-nowrap transition-all ${
                  filter === tab.id
                    ? "bg-emerald-100 text-emerald-700"
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
            className="px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-base font-fredoka focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer min-w-[140px]"
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

      {/* Homework List */}
      <StudentHomeworkList homework={homeworkList} isLoading={loading} />
    </div>
  );
}
