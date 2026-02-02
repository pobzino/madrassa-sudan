"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { OwlTutorIcon } from "@/components/illustrations";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

interface TeacherStats {
  totalStudents: number;
  totalClasses: number;
  pendingGrading: number;
  assignmentsCreated: number;
}

interface RecentActivity {
  id: string;
  type: "submission" | "enrollment";
  description: string;
  time: string;
}

interface TeacherInsights {
  weakSubjects: Array<{ name: string; averageScore: number | null; pending: number }>;
  onTimeRate: number | null;
  lowPerformers: Array<{ id: string; name: string; averageScore: number | null }>;
}

export default function TeacherDashboard() {
  const { loading: authLoading } = useTeacherGuard();
  const [stats, setStats] = useState<TeacherStats>({
    totalStudents: 0,
    totalClasses: 0,
    pendingGrading: 0,
    assignmentsCreated: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");
  const [insights, setInsights] = useState<TeacherInsights | null>(null);

  useEffect(() => {
    if (!authLoading) {
      loadTeacherData();
    }
  }, [authLoading]);

  async function loadTeacherData() {
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) return;

    // Get teacher profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "teacher" && profile?.role !== "admin") {
      // Redirect non-teachers
      window.location.href = "/dashboard";
      return;
    }

    setTeacherName(profile?.full_name || "Teacher");

    // Get teacher's cohorts
    const { data: cohortTeachers } = await supabase
      .from("cohort_teachers")
      .select("cohort_id")
      .eq("teacher_id", user.id);

    const cohortIds = cohortTeachers?.map((ct) => ct.cohort_id) || [];

    // Get stats
    let totalStudents = 0;
    let pendingGrading = 0;
    let assignmentsCreated = 0;

    if (cohortIds.length > 0) {
      // Count students in teacher's cohorts
      const { count: studentCount } = await supabase
        .from("cohort_students")
        .select("*", { count: "exact", head: true })
        .in("cohort_id", cohortIds)
        .eq("is_active", true);

      totalStudents = studentCount || 0;

      // Get assignments created by teacher
      const { data: assignments, count: assignmentCount } = await supabase
        .from("homework_assignments")
        .select("id", { count: "exact" })
        .eq("created_by", user.id);

      assignmentsCreated = assignmentCount || 0;
      const assignmentIds = assignments?.map((a) => a.id) || [];

      // Count pending submissions
      if (assignmentIds.length > 0) {
        const { count: pendingCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", assignmentIds)
          .eq("status", "submitted");

        pendingGrading = pendingCount || 0;
      }
    }

    setStats({
      totalStudents,
      totalClasses: cohortIds.length,
      pendingGrading,
      assignmentsCreated,
    });

    let insightPayload: TeacherInsights | null = null;

    if (cohortIds.length > 0) {
      const { data: cohortAssignments } = await supabase
        .from("homework_assignments")
        .select(
          `
          id,
          subject_id,
          total_points,
          due_at,
          subject:subjects (
            name_ar,
            name_en
          )
        `
        )
        .in("cohort_id", cohortIds);

      const assignmentIds = cohortAssignments?.map((a) => a.id) || [];

      if (assignmentIds.length > 0) {
        const { data: submissions } = await supabase
          .from("homework_submissions")
          .select(
            `
            id,
            status,
            score,
            submitted_at,
            student_id,
            assignment:homework_assignments (
              id,
              subject_id,
              total_points,
              due_at,
              subject:subjects (
                name_ar,
                name_en
              )
            )
          `
          )
          .in("assignment_id", assignmentIds);

        const subjectStats: Record<string, { name: string; totalScore: number; gradedCount: number; pending: number }> = {};
        const studentStats: Record<string, { totalScore: number; gradedCount: number }> = {};
        let submittedCount = 0;
        let onTimeCount = 0;

        (submissions || []).forEach((sub) => {
          const assignment = sub.assignment as unknown as {
            subject_id: string | null;
            total_points: number | null;
            due_at: string | null;
            subject: { name_ar?: string | null; name_en?: string | null } | null;
          } | null;

          if (!assignment?.subject_id) return;

          const subjectName = assignment.subject?.name_en || assignment.subject?.name_ar || "Subject";
          if (!subjectStats[assignment.subject_id]) {
            subjectStats[assignment.subject_id] = {
              name: subjectName,
              totalScore: 0,
              gradedCount: 0,
              pending: 0,
            };
          }

          if (sub.status === "graded" && sub.score !== null && assignment.total_points) {
            const percentage = Math.round((sub.score / assignment.total_points) * 100);
            subjectStats[assignment.subject_id].totalScore += percentage;
            subjectStats[assignment.subject_id].gradedCount += 1;

            if (!studentStats[sub.student_id]) {
              studentStats[sub.student_id] = { totalScore: 0, gradedCount: 0 };
            }
            studentStats[sub.student_id].totalScore += percentage;
            studentStats[sub.student_id].gradedCount += 1;
          } else if (sub.status === "not_started" || sub.status === "in_progress") {
            subjectStats[assignment.subject_id].pending += 1;
          }

          if (sub.submitted_at && assignment.due_at) {
            submittedCount += 1;
            if (new Date(sub.submitted_at) <= new Date(assignment.due_at)) {
              onTimeCount += 1;
            }
          }
        });

        const weakSubjects = Object.values(subjectStats)
          .map((s) => ({
            name: s.name,
            averageScore: s.gradedCount > 0 ? Math.round(s.totalScore / s.gradedCount) : null,
            pending: s.pending,
          }))
          .sort((a, b) => (a.averageScore ?? 101) - (b.averageScore ?? 101))
          .slice(0, 3);

        const lowPerformerIds = Object.entries(studentStats)
          .map(([id, stats]) => ({
            id,
            averageScore: stats.gradedCount > 0 ? Math.round(stats.totalScore / stats.gradedCount) : null,
          }))
          .sort((a, b) => (a.averageScore ?? 101) - (b.averageScore ?? 101))
          .slice(0, 3);

        let lowPerformers: Array<{ id: string; name: string; averageScore: number | null }> = [];
        if (lowPerformerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", lowPerformerIds.map((s) => s.id));

          lowPerformers = lowPerformerIds.map((student) => ({
            id: student.id,
            name: profiles?.find((p) => p.id === student.id)?.full_name || "Student",
            averageScore: student.averageScore,
          }));
        }

        insightPayload = {
          weakSubjects,
          onTimeRate: submittedCount > 0 ? Math.round((onTimeCount / submittedCount) * 100) : null,
          lowPerformers,
        };
      }
    }

    setInsights(insightPayload);

    // Get recent activity (mock for now - would need more complex queries)
    setRecentActivity([
      { id: "1", type: "submission", description: "أحمد submitted Math homework", time: "10 min ago" },
      { id: "2", type: "enrollment", description: "New student joined Grade 5 Science", time: "1 hour ago" },
      { id: "3", type: "submission", description: "فاطمة submitted English assignment", time: "2 hours ago" },
    ]);

    setLoading(false);
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <OwlTutorIcon className="w-16 h-16" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome back, {teacherName}!</h1>
            <p className="text-gray-500">Here&apos;s what&apos;s happening with your classes</p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl">👥</span>
              <span className="text-2xl font-bold text-gray-900">{stats.totalStudents}</span>
            </div>
            <p className="text-sm text-gray-500">Total Students</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl">📚</span>
              <span className="text-2xl font-bold text-gray-900">{stats.totalClasses}</span>
            </div>
            <p className="text-sm text-gray-500">My Classes</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl">📝</span>
              <span className="text-2xl font-bold text-amber-600">{stats.pendingGrading}</span>
            </div>
            <p className="text-sm text-gray-500">Pending Grading</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl">✏️</span>
              <span className="text-2xl font-bold text-gray-900">{stats.assignmentsCreated}</span>
            </div>
            <p className="text-sm text-gray-500">Assignments Created</p>
          </div>
        </div>

        {/* Class Insights */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Class Insights</h2>
          {insights ? (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3">Weak Subjects</h3>
                {insights.weakSubjects.length === 0 ? (
                  <p className="text-sm text-gray-500">No subject data yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-gray-600">
                    {insights.weakSubjects.map((subject, index) => (
                      <li key={index} className="flex items-center justify-between">
                        <span>{subject.name}</span>
                        <span className="text-amber-600 font-semibold">
                          {subject.averageScore !== null ? `${subject.averageScore}%` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3">On-time Submissions</h3>
                <div className="text-3xl font-bold text-emerald-600 mb-2">
                  {insights.onTimeRate !== null ? `${insights.onTimeRate}%` : "—"}
                </div>
                <p className="text-sm text-gray-500">Across all classes this term.</p>
              </div>

              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3">Students to Support</h3>
                {insights.lowPerformers.length === 0 ? (
                  <p className="text-sm text-gray-500">No graded data yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-gray-600">
                    {insights.lowPerformers.map((student) => (
                      <li key={student.id} className="flex items-center justify-between">
                        <span>{student.name}</span>
                        <span className="text-amber-600 font-semibold">
                          {student.averageScore !== null ? `${student.averageScore}%` : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-sm text-gray-500">
              Insights will appear once students submit work.
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Link
            href="/teacher/homework/create"
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <span className="text-3xl mb-3 block">➕</span>
            <h3 className="font-semibold text-lg mb-1">Create Assignment</h3>
            <p className="text-emerald-100 text-sm">Create new homework for your classes</p>
          </Link>

          <Link
            href="/teacher/lessons"
            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <span className="text-3xl mb-3 block">📚</span>
            <h3 className="font-semibold text-lg mb-1">Manage Lessons</h3>
            <p className="text-purple-100 text-sm">Edit lessons and content blocks</p>
          </Link>

          <Link
            href="/teacher/cohorts"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <span className="text-3xl mb-3 block">🏫</span>
            <h3 className="font-semibold text-lg mb-1">Manage Classes</h3>
            <p className="text-blue-100 text-sm">View and manage your classes</p>
          </Link>

          <Link
            href="/teacher/homework"
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <span className="text-3xl mb-3 block">✅</span>
            <h3 className="font-semibold text-lg mb-1">Grade Submissions</h3>
            <p className="text-amber-100 text-sm">{stats.pendingGrading} submissions waiting</p>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No recent activity
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="p-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    activity.type === "submission" ? "bg-emerald-100" : "bg-blue-100"
                  }`}>
                    {activity.type === "submission" ? "📄" : "👤"}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-900">{activity.description}</p>
                    <p className="text-sm text-gray-500">{activity.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
    </div>
  );
}
