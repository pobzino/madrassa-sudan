"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { OwlTutorIcon } from "@/components/illustrations";

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

export default function TeacherDashboard() {
  const [stats, setStats] = useState<TeacherStats>({
    totalStudents: 0,
    totalClasses: 0,
    pendingGrading: 0,
    assignmentsCreated: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    loadTeacherData();
  }, []);

  async function loadTeacherData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

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

    // Get recent activity (mock for now - would need more complex queries)
    setRecentActivity([
      { id: "1", type: "submission", description: "أحمد submitted Math homework", time: "10 min ago" },
      { id: "2", type: "enrollment", description: "New student joined Grade 5 Science", time: "1 hour ago" },
      { id: "3", type: "submission", description: "فاطمة submitted English assignment", time: "2 hours ago" },
    ]);

    setLoading(false);
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

  return (
    <DashboardLayout>
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

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/teacher/homework/create"
            className="bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <span className="text-3xl mb-3 block">➕</span>
            <h3 className="font-semibold text-lg mb-1">Create Assignment</h3>
            <p className="text-emerald-100 text-sm">Create new homework for your classes</p>
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
            href="/teacher/grading"
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
    </DashboardLayout>
  );
}
