"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { TeacherHomeworkList } from "@/components/homework/HomeworkList";
import type { AssignmentWithStats } from "@/lib/homework.types";

export default function TeacherHomeworkPage() {
  const { loading: authLoading } = useTeacherGuard();
  const [assignments, setAssignments] = useState<AssignmentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const user = await getCachedUser(supabase);
      if (!user) return;

      // Use the API instead of direct Supabase queries
      const statusParam = filter !== "all" ? `&status=${filter}` : "";
      const response = await fetch(`/api/homework?status=${filter}${statusParam}`);

      if (response.ok) {
        const data = await response.json();
        setAssignments(data.data.assignments);
      } else {
        // Fallback to direct query
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

        let query = supabase
          .from("homework_assignments")
          .select(
            `
            *,
            cohorts (name),
            subjects (name_ar, name_en)
          `
          )
          .in("cohort_id", cohortIds);

        if (filter === "published") {
          query = query.eq("is_published", true);
        } else if (filter === "draft") {
          query = query.eq("is_published", false);
        }

        const { data: assignmentRows } = await query.order("created_at", {
          ascending: false,
        });

        const enriched: AssignmentWithStats[] = [];
        for (const assignment of assignmentRows || []) {
          const { count: submissionsCount } = await supabase
            .from("homework_submissions")
            .select("*", { count: "exact", head: true })
            .eq("assignment_id", assignment.id);

          const { count: gradedCount } = await supabase
            .from("homework_submissions")
            .select("*", { count: "exact", head: true })
            .eq("assignment_id", assignment.id)
            .in("status", ["graded", "returned"]);

          const { count: pendingCount } = await supabase
            .from("homework_submissions")
            .select("*", { count: "exact", head: true })
            .eq("assignment_id", assignment.id)
            .eq("status", "submitted");

          enriched.push({
            ...assignment,
            cohort_name: (assignment.cohorts as { name: string })?.name || "Unknown",
            subject_name:
              (assignment.subjects as { name_ar: string; name_en: string } | null)
                ?.name_en ||
              (assignment.subjects as { name_ar: string; name_en: string } | null)
                ?.name_ar ||
              null,
            submissions_count: submissionsCount || 0,
            graded_count: gradedCount || 0,
            pending_count: pendingCount || 0,
            average_score: null,
          });
        }

        setAssignments(enriched);
      }
    } catch (error) {
      console.error("Error loading assignments:", error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadAssignments();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadAssignments]);

  async function handleTogglePublish(id: string, publish: boolean) {
    try {
      const response = await fetch(`/api/homework/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_published: publish }),
      });

      if (response.ok) {
        loadAssignments();
      }
    } catch (error) {
      console.error("Error toggling publish:", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this assignment?")) return;

    try {
      const response = await fetch(`/api/homework/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadAssignments();
      }
    } catch (error) {
      console.error("Error deleting assignment:", error);
    }
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Homework Library</h1>
          <p className="text-gray-500">Manage assignments across your classes</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(["all", "draft", "published"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <Link
            href="/teacher/homework/create"
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
          >
            + Create
          </Link>
        </div>
      </div>

      <TeacherHomeworkList
        assignments={assignments}
        onTogglePublish={handleTogglePublish}
        onDelete={handleDelete}
        isLoading={loading}
      />
    </div>
  );
}
