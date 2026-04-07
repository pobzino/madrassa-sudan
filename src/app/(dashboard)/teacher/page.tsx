"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { OwlTutorIcon } from "@/components/illustrations";
import { Users, BookOpen, ClipboardList, PenLine, Plus, School, CheckSquare, FileText, UserCircle } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { useTourState } from "@/hooks/useTourState";

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
  timestamp: string;
}

interface TeacherInsights {
  weakSubjects: Array<{ name: string; averageScore: number | null; pending: number }>;
  onTimeRate: number | null;
  lowPerformers: Array<{ id: string; name: string; averageScore: number | null }>;
}

export default function TeacherDashboard() {
  const { loading: authLoading } = useTeacherGuard();
  const tourState = useTourState();
  const teacherDevBypass = process.env.NEXT_PUBLIC_DEV_ALLOW_TEACHER_VIEW === "1";
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

  function formatRelativeTime(timestamp: string) {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    return new Intl.DateTimeFormat("en-GB", {
      month: "short",
      day: "numeric",
    }).format(new Date(timestamp));
  }

  const loadTeacherData = useCallback(async () => {
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) return;

    // Get teacher profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    const isTeacher = profile?.role === "teacher" || profile?.role === "admin";
    if (!isTeacher && !teacherDevBypass) {
      // Redirect non-teachers unless explicit local dev bypass is enabled.
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
    let teacherAssignmentIds: string[] = [];

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
      teacherAssignmentIds = assignments?.map((a) => a.id) || [];

      // Count pending submissions
      if (teacherAssignmentIds.length > 0) {
        const { count: pendingCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .in("assignment_id", teacherAssignmentIds)
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

    let recentActivityPayload: RecentActivity[] = [];

    if (cohortIds.length > 0) {
      const [recentSubmissionsResult, recentEnrollmentsResult] = await Promise.all([
        teacherAssignmentIds.length > 0
          ? supabase
              .from("homework_submissions")
              .select(`
                id,
                student_id,
                submitted_at,
                assignment:homework_assignments (
                  title_ar,
                  title_en,
                  subject:subjects (
                    name_ar,
                    name_en
                  )
                )
              `)
              .in("assignment_id", teacherAssignmentIds)
              .not("submitted_at", "is", null)
              .order("submitted_at", { ascending: false })
              .limit(6)
          : Promise.resolve({ data: [] as unknown[] }),
        supabase
          .from("cohort_students")
          .select(`
            id,
            student_id,
            enrolled_at,
            cohort:cohorts (
              name
            )
          `)
          .in("cohort_id", cohortIds)
          .eq("is_active", true)
          .order("enrolled_at", { ascending: false })
          .limit(6),
      ]);

      const submissionRows = (recentSubmissionsResult.data || []) as Array<{
        id: string;
        student_id: string;
        submitted_at: string | null;
        assignment: {
          title_ar?: string | null;
          title_en?: string | null;
          subject?: { name_ar?: string | null; name_en?: string | null } | null;
        } | null;
      }>;
      const enrollmentRows = (recentEnrollmentsResult.data || []) as Array<{
        id: string;
        student_id: string;
        enrolled_at: string;
        cohort: { name?: string | null } | null;
      }>;

      const studentIds = Array.from(
        new Set([
          ...submissionRows.map((row) => row.student_id),
          ...enrollmentRows.map((row) => row.student_id),
        ])
      );

      const { data: profiles } = studentIds.length > 0
        ? await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", studentIds)
        : { data: [] as Array<{ id: string; full_name: string | null }> };

      const profileMap = new Map(
        (profiles || []).map((profile) => [profile.id, profile.full_name || "Student"])
      );

      const submissionActivities: RecentActivity[] = submissionRows
        .filter((row) => row.submitted_at)
        .map((row) => {
          const assignmentTitle =
            row.assignment?.title_en ||
            row.assignment?.title_ar ||
            row.assignment?.subject?.name_en ||
            row.assignment?.subject?.name_ar ||
            "homework";
          const studentName = profileMap.get(row.student_id) || "Student";
          const timestamp = row.submitted_at as string;

          return {
            id: `submission-${row.id}`,
            type: "submission",
            description: `${studentName} submitted ${assignmentTitle}`,
            time: formatRelativeTime(timestamp),
            timestamp,
          };
        });

      const enrollmentActivities: RecentActivity[] = enrollmentRows.map((row) => {
        const studentName = profileMap.get(row.student_id) || "Student";
        const cohortName = row.cohort?.name || "a class";
        const timestamp = row.enrolled_at;

        return {
          id: `enrollment-${row.id}`,
          type: "enrollment",
          description: `${studentName} joined ${cohortName}`,
          time: formatRelativeTime(timestamp),
          timestamp,
        };
      });

      recentActivityPayload = [...submissionActivities, ...enrollmentActivities]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 6);
    }

    setRecentActivity(recentActivityPayload);

    setLoading(false);
  }, [teacherDevBypass]);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadTeacherData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadTeacherData]);

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

        {/* Getting Started Guide Card */}
        {!tourState.hasCompletedTour && (
          <div className="mb-8 bg-gradient-to-r from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-2xl p-6 relative">
            <button
              onClick={() => tourState.dismissTour()}
              className="absolute top-4 right-4 text-emerald-400 hover:text-emerald-600 transition-colors"
              aria-label="Dismiss guide"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-emerald-900">New here? Take the lesson guide</h2>
                <p className="text-sm text-emerald-700 mt-1">
                  Learn how to create lessons, build slides, add interactive activities, and record a sim — step by step. Takes about 2 minutes.
                </p>
                <Link
                  href="/teacher/lessons"
                  onClick={() => tourState.startTour("lesson-list")}
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                  Start Guide
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-7 h-7 text-emerald-600" />
              <span className="text-2xl font-bold text-gray-900">{stats.totalStudents}</span>
            </div>
            <p className="text-sm text-gray-500">Total Students</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <BookOpen className="w-7 h-7 text-purple-600" />
              <span className="text-2xl font-bold text-gray-900">{stats.totalClasses}</span>
            </div>
            <p className="text-sm text-gray-500">My Classes</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <ClipboardList className="w-7 h-7 text-amber-600" />
              <span className="text-2xl font-bold text-amber-600">{stats.pendingGrading}</span>
            </div>
            <p className="text-sm text-gray-500">Pending Grading</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <PenLine className="w-7 h-7 text-blue-600" />
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
            <Plus className="w-8 h-8 mb-3" />
            <h3 className="font-semibold text-lg mb-1">Create Assignment</h3>
            <p className="text-emerald-100 text-sm">Create new homework for your classes</p>
          </Link>

          <Link
            href="/teacher/lessons"
            className="bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <BookOpen className="w-8 h-8 mb-3" />
            <h3 className="font-semibold text-lg mb-1">Manage Lessons</h3>
            <p className="text-purple-100 text-sm">Edit lessons and content blocks</p>
          </Link>

          <Link
            href="/teacher/cohorts"
            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <School className="w-8 h-8 mb-3" />
            <h3 className="font-semibold text-lg mb-1">Manage Classes</h3>
            <p className="text-blue-100 text-sm">View and manage your classes</p>
          </Link>

          <Link
            href="/teacher/homework"
            className="bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl p-6 hover:opacity-90 transition-opacity"
          >
            <CheckSquare className="w-8 h-8 mb-3" />
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
                    {activity.type === "submission" ? <FileText className="w-5 h-5 text-emerald-700" /> : <UserCircle className="w-5 h-5 text-blue-700" />}
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
