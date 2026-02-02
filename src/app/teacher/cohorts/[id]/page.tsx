"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";

interface Student {
  id: string;
  full_name: string;
  avatar_url: string | null;
  enrolled_at: string;
  lessons_completed: number;
  homework_submitted: number;
}

interface Assignment {
  id: string;
  title_ar: string;
  title_en: string | null;
  due_at: string | null;
  total_points: number;
  submissions_count: number;
  graded_count: number;
}

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  grade_level: number;
  join_code: string;
  is_active: boolean;
}

export default function CohortDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"students" | "assignments">("students");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    loadCohortData();
  }, [id]);

  async function loadCohortData() {
    const supabase = createClient();

    // Get cohort details
    const { data: cohortData, error: cohortError } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", id)
      .single();

    if (cohortError || !cohortData) {
      console.error("Error loading cohort:", cohortError);
      setLoading(false);
      return;
    }

    setCohort(cohortData);

    // Get students in cohort
    const { data: cohortStudents } = await supabase
      .from("cohort_students")
      .select(`
        enrolled_at,
        profiles (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq("cohort_id", id)
      .eq("is_active", true);

    const studentsData: Student[] = [];
    for (const cs of cohortStudents || []) {
      const profile = cs.profiles as unknown as { id: string; full_name: string; avatar_url: string | null };
      if (profile) {
        // Get lesson progress count
        const { count: lessonsCount } = await supabase
          .from("lesson_progress")
          .select("*", { count: "exact", head: true })
          .eq("student_id", profile.id)
          .eq("completed", true);

        // Get homework submissions count
        const { count: homeworkCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("student_id", profile.id)
          .in("status", ["submitted", "graded"]);

        studentsData.push({
          id: profile.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          enrolled_at: cs.enrolled_at,
          lessons_completed: lessonsCount || 0,
          homework_submitted: homeworkCount || 0,
        });
      }
    }
    setStudents(studentsData);

    // Get assignments for this cohort
    const { data: assignmentsData } = await supabase
      .from("homework_assignments")
      .select("*")
      .eq("cohort_id", id)
      .order("created_at", { ascending: false });

    const assignmentsWithCounts: Assignment[] = [];
    for (const assignment of assignmentsData || []) {
      const { count: submissionsCount } = await supabase
        .from("homework_submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment.id);

      const { count: gradedCount } = await supabase
        .from("homework_submissions")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", assignment.id)
        .eq("status", "graded");

      assignmentsWithCounts.push({
        id: assignment.id,
        title_ar: assignment.title_ar,
        title_en: assignment.title_en,
        due_at: assignment.due_at,
        total_points: assignment.total_points,
        submissions_count: submissionsCount || 0,
        graded_count: gradedCount || 0,
      });
    }
    setAssignments(assignmentsWithCounts);

    setLoading(false);
  }

  function copyJoinCode() {
    if (cohort) {
      navigator.clipboard.writeText(cohort.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!cohort) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Class not found</h1>
          <Link href="/teacher/cohorts" className="text-emerald-600 hover:underline">
            Back to My Classes
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Back Link */}
        <Link
          href="/teacher/cohorts"
          className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6"
        >
          ← Back to My Classes
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{cohort.name}</h1>
              <p className="text-gray-500">Grade {cohort.grade_level}</p>
              {cohort.description && (
                <p className="text-gray-600 mt-2">{cohort.description}</p>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-sm ${
              cohort.is_active
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {cohort.is_active ? "Active" : "Archived"}
            </span>
          </div>

          {/* Stats and Join Code */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-500">Students</p>
              <p className="text-2xl font-bold text-gray-900">{students.length}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-500">Assignments</p>
              <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 col-span-2">
              <p className="text-sm text-gray-500 mb-1">Join Code</p>
              <div className="flex items-center gap-2">
                <code className="text-xl font-mono font-bold text-emerald-600">{cohort.join_code}</code>
                <button
                  onClick={copyJoinCode}
                  className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  {copiedCode ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("students")}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === "students"
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Students ({students.length})
          </button>
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
              activeTab === "assignments"
                ? "bg-emerald-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Assignments ({assignments.length})
          </button>
        </div>

        {/* Students Tab */}
        {activeTab === "students" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {students.length === 0 ? (
              <div className="p-12 text-center">
                <span className="text-5xl mb-4 block">👥</span>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">No students yet</h2>
                <p className="text-gray-500">Share the join code with your students to get started</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Student</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Lessons</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Homework</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-semibold">
                            {student.full_name.charAt(0)}
                          </div>
                          <span className="font-medium text-gray-900">{student.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{student.lessons_completed} completed</td>
                      <td className="px-6 py-4 text-gray-600">{student.homework_submitted} submitted</td>
                      <td className="px-6 py-4 text-gray-500 text-sm">
                        {new Date(student.enrolled_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === "assignments" && (
          <div>
            <div className="flex justify-end mb-4">
              <Link
                href={`/teacher/homework/create?cohort=${cohort.id}`}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
              >
                <span>➕</span>
                Create Assignment
              </Link>
            </div>

            {assignments.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <span className="text-5xl mb-4 block">📝</span>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">No assignments yet</h2>
                <p className="text-gray-500 mb-4">Create your first assignment for this class</p>
                <Link
                  href={`/teacher/homework/create?cohort=${cohort.id}`}
                  className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  Create Assignment
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {assignment.title_en || assignment.title_ar}
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>{assignment.total_points} points</span>
                        {assignment.due_at && (
                          <span>Due: {new Date(assignment.due_at).toLocaleDateString()}</span>
                        )}
                        <span>
                          {assignment.submissions_count} submissions • {assignment.graded_count} graded
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/teacher/homework/${assignment.id}/grade`}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Grade
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
