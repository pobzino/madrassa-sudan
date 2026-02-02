"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

type HomeworkItem = {
  id: string;
  title_ar: string;
  title_en: string | null;
  due_at: string | null;
  total_points: number;
  is_published: boolean;
  cohort_name: string;
  subject_name: string | null;
  submissions_count: number;
  graded_count: number;
};

export default function TeacherHomeworkPage() {
  const { loading: authLoading } = useTeacherGuard();
  const [assignments, setAssignments] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      loadAssignments();
    }
  }, [authLoading]);

  async function loadAssignments() {
    const supabase = createClient();
    const user = await getCachedUser(supabase);
    if (!user) return;

    const { data: cohortTeachers } = await supabase
      .from("cohort_teachers")
      .select("cohort_id")
      .eq("teacher_id", user.id);

    const cohortIds = cohortTeachers?.map((c) => c.cohort_id) || [];
    if (cohortIds.length === 0) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const { data: assignmentRows } = await supabase
      .from("homework_assignments")
      .select(
        `
        id,
        title_ar,
        title_en,
        due_at,
        total_points,
        is_published,
        cohorts (name),
        subjects (name_ar, name_en)
      `
      )
      .in("cohort_id", cohortIds)
      .order("created_at", { ascending: false });

    const enriched: HomeworkItem[] = [];
    for (const assignment of assignmentRows || []) {
      const { count: submissionsCount } = await supabase
        .from("homework_submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment.id);

      const { count: gradedCount } = await supabase
        .from("homework_submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment.id)
        .eq("status", "graded");

      enriched.push({
        id: assignment.id,
        title_ar: assignment.title_ar,
        title_en: assignment.title_en,
        due_at: assignment.due_at,
        total_points: assignment.total_points,
        is_published: assignment.is_published,
        cohort_name: (assignment.cohorts as { name: string } | null)?.name || "Class",
        subject_name:
          (assignment.subjects as { name_ar: string | null; name_en: string | null } | null)?.name_en ||
          (assignment.subjects as { name_ar: string | null; name_en: string | null } | null)?.name_ar ||
          null,
        submissions_count: submissionsCount || 0,
        graded_count: gradedCount || 0,
      });
    }

    setAssignments(enriched);
    setLoading(false);
  }

  async function togglePublish(assignmentId: string, nextState: boolean) {
    setUpdatingId(assignmentId);
    const supabase = createClient();
    await supabase
      .from("homework_assignments")
      .update({ is_published: nextState, updated_at: new Date().toISOString() })
      .eq("id", assignmentId);
    setUpdatingId(null);
    loadAssignments();
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework Library</h1>
          <p className="text-gray-500">Manage assignments across your classes</p>
        </div>
        <Link
          href="/teacher/homework/create"
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Create Assignment
        </Link>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <span className="text-6xl mb-4 block">📝</span>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No assignments yet</h2>
          <p className="text-gray-500 mb-4">Create your first assignment to get started</p>
          <Link
            href="/teacher/homework/create"
            className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Create Assignment
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {assignment.title_en || assignment.title_ar}
                </h3>
                <div className="text-sm text-gray-500 flex flex-wrap gap-3 mt-1">
                  <span>{assignment.cohort_name}</span>
                  {assignment.subject_name && <span>{assignment.subject_name}</span>}
                  <span>{assignment.total_points} points</span>
                  {assignment.due_at && <span>Due {new Date(assignment.due_at).toLocaleDateString()}</span>}
                  <span>{assignment.submissions_count} submissions</span>
                  <span>{assignment.graded_count} graded</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => togglePublish(assignment.id, !assignment.is_published)}
                  disabled={updatingId === assignment.id}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    assignment.is_published
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}
                >
                  {updatingId === assignment.id
                    ? "Updating..."
                    : assignment.is_published
                      ? "Published"
                      : "Draft"}
                </button>
                <Link
                  href={`/teacher/homework/create?assignment=${assignment.id}`}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Edit
                </Link>
                <Link
                  href={`/teacher/homework/${assignment.id}/grade`}
                  className="px-3 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                  Grade
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
