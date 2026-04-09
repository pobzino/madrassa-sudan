"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { toast } from "sonner";
import {
  Users,
  BookOpen,
  School,
  LayoutDashboard,
  FileText,
  Shield,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

type AdminUser = {
  id: string;
  full_name: string | null;
  role: string;
  is_approved: boolean;
  preferred_language?: string | null;
  created_at: string;
};

type AdminCohort = {
  id: string;
  name: string;
  description: string | null;
  grade_level: number;
  join_code: string;
  is_active: boolean;
  created_at: string;
  teachers: string[];
  student_count: number;
};

type AdminLesson = {
  id: string;
  title_ar: string;
  title_en: string;
  grade_level: number;
  is_published: boolean;
  submitted_for_review: boolean;
  submitted_for_review_at: string | null;
  created_at: string;
  updated_at: string;
  subject: { id: string; name_ar: string; name_en: string } | null;
  creator: { id: string; full_name: string } | null;
};

type Tab = "overview" | "members" | "classes" | "content";

// ─── Helpers ─────────────────────────────────────────────────────

function roleBadge(role: string) {
  const colors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-700",
    teacher: "bg-blue-100 text-blue-700",
    student: "bg-emerald-100 text-emerald-700",
    parent: "bg-amber-100 text-amber-700",
  };
  return colors[role] || "bg-gray-100 text-gray-600";
}

function lessonStatus(lesson: AdminLesson) {
  if (lesson.is_published) return { label: "Published", color: "bg-emerald-100 text-emerald-700" };
  if (lesson.submitted_for_review) return { label: "Pending Review", color: "bg-amber-100 text-amber-700" };
  return { label: "Draft", color: "bg-gray-100 text-gray-600" };
}

// ─── Component ───────────────────────────────────────────────────

export default function AdminPage() {
  const { loading: authLoading, profile } = useTeacherGuard();
  const isAdmin = profile?.role === "admin";

  const [tab, setTab] = useState<Tab>("overview");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Members state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userFilter, setUserFilter] = useState<"all" | "pending" | "student" | "teacher" | "admin">("all");

  // Classes state
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [loadingCohorts, setLoadingCohorts] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Content state
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(false);
  const [lessonFilter, setLessonFilter] = useState<"all" | "pending" | "published" | "draft">("all");

  // Overview counts
  const [counts, setCounts] = useState({
    totalUsers: 0,
    pendingApprovals: 0,
    totalLessons: 0,
    pendingReviews: 0,
    totalClasses: 0,
  });
  const [loadingCounts, setLoadingCounts] = useState(true);

  // ─── Data Fetchers ──────────────────────────────────────────────

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [usersRes, lessonsRes, cohortsRes, pendingUsersRes, pendingLessonsRes] = await Promise.all([
        fetch("/api/admin/users?filter=all"),
        fetch("/api/admin/lessons?filter=all"),
        fetch("/api/admin/cohorts"),
        fetch("/api/admin/users?filter=pending"),
        fetch("/api/admin/lessons?filter=pending"),
      ]);

      const [usersData, lessonsData, cohortsData, pendingUsersData, pendingLessonsData] = await Promise.all([
        usersRes.ok ? usersRes.json() : { users: [] },
        lessonsRes.ok ? lessonsRes.json() : { lessons: [] },
        cohortsRes.ok ? cohortsRes.json() : { cohorts: [] },
        pendingUsersRes.ok ? pendingUsersRes.json() : { users: [] },
        pendingLessonsRes.ok ? pendingLessonsRes.json() : { lessons: [] },
      ]);

      setCounts({
        totalUsers: usersData.users?.length || 0,
        pendingApprovals: pendingUsersData.users?.length || 0,
        totalLessons: lessonsData.lessons?.length || 0,
        pendingReviews: pendingLessonsData.lessons?.length || 0,
        totalClasses: cohortsData.cohorts?.length || 0,
      });
    } catch {
      // ignore
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const apiFilter = userFilter === "all" || userFilter === "student" || userFilter === "teacher" || userFilter === "admin"
        ? "all"
        : userFilter;
      const res = await fetch(`/api/admin/users?filter=${apiFilter}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false);
    }
  }, [userFilter]);

  const loadCohorts = useCallback(async () => {
    setLoadingCohorts(true);
    try {
      const res = await fetch("/api/admin/cohorts");
      if (!res.ok) return;
      const data = await res.json();
      setCohorts(data.cohorts || []);
    } catch {
      // ignore
    } finally {
      setLoadingCohorts(false);
    }
  }, []);

  const loadLessons = useCallback(async () => {
    setLoadingLessons(true);
    try {
      const res = await fetch(`/api/admin/lessons?filter=${lessonFilter}`);
      if (!res.ok) return;
      const data = await res.json();
      setLessons(data.lessons || []);
    } catch {
      // ignore
    } finally {
      setLoadingLessons(false);
    }
  }, [lessonFilter]);

  // Load data when tab changes
  useEffect(() => {
    if (!authLoading && isAdmin) {
      if (tab === "overview") void loadCounts();
      if (tab === "members") void loadUsers();
      if (tab === "classes") void loadCohorts();
      if (tab === "content") void loadLessons();
    }
  }, [authLoading, isAdmin, tab, loadCounts, loadUsers, loadCohorts, loadLessons]);

  // ─── Actions ────────────────────────────────────────────────────

  async function handleApproveUser(userId: string, approved: boolean) {
    setActionInProgress(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update user");
        return;
      }
      toast.success(approved ? "User approved" : "User rejected");
      void loadUsers();
    } catch {
      toast.error("Failed to update user");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    setActionInProgress(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to change role");
        return;
      }
      toast.success(`Role changed to ${newRole}`);
      void loadUsers();
    } catch {
      toast.error("Failed to change role");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleToggleCohort(cohortId: string, isActive: boolean) {
    setActionInProgress(cohortId);
    try {
      const res = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update class");
        return;
      }
      toast.success(isActive ? "Class activated" : "Class archived");
      void loadCohorts();
    } catch {
      toast.error("Failed to update class");
    } finally {
      setActionInProgress(null);
    }
  }

  function copyJoinCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Join code copied");
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function handlePublishLesson(lessonId: string) {
    setActionInProgress(lessonId);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/publish`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to publish lesson");
        return;
      }
      toast.success("Lesson published");
      void loadLessons();
    } catch {
      toast.error("Failed to publish lesson");
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleRejectLesson(lessonId: string) {
    setActionInProgress(lessonId);
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}/reject`, {
        method: "PATCH",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to reject lesson");
        return;
      }
      toast.success("Lesson returned to draft");
      void loadLessons();
    } catch {
      toast.error("Failed to reject lesson");
    } finally {
      setActionInProgress(null);
    }
  }

  // ─── Guards ─────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-700 font-semibold">Access denied. Admin only.</p>
        </div>
      </div>
    );
  }

  // ─── Filtered users (client-side role filter on top of API filter) ──

  const filteredUsers =
    userFilter === "pending"
      ? users.filter((u) => !u.is_approved)
      : userFilter === "student" || userFilter === "teacher" || userFilter === "admin"
        ? users.filter((u) => u.role === userFilter)
        : users;

  // ─── Tabs Config ────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: "members", label: "Members", icon: <Users className="w-4 h-4" /> },
    { key: "classes", label: "Classes", icon: <School className="w-4 h-4" /> },
    { key: "content", label: "Content", icon: <BookOpen className="w-4 h-4" /> },
  ];

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage members, classes, and content</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              tab === t.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Stats Row */}
          {loadingCounts ? (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-2xl h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={<Users className="w-6 h-6 text-emerald-600" />} label="Total Users" value={counts.totalUsers} />
              <StatCard
                icon={<Shield className="w-6 h-6 text-amber-600" />}
                label="Pending Approvals"
                value={counts.pendingApprovals}
                highlight={counts.pendingApprovals > 0}
              />
              <StatCard icon={<BookOpen className="w-6 h-6 text-purple-600" />} label="Total Lessons" value={counts.totalLessons} />
              <StatCard
                icon={<FileText className="w-6 h-6 text-amber-600" />}
                label="Pending Reviews"
                value={counts.pendingReviews}
                highlight={counts.pendingReviews > 0}
              />
              <StatCard icon={<School className="w-6 h-6 text-blue-600" />} label="Total Classes" value={counts.totalClasses} />
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid md:grid-cols-3 gap-4">
            <button
              onClick={() => { setUserFilter("pending"); setTab("members"); }}
              className="bg-white rounded-2xl border border-gray-100 p-5 text-left hover:border-emerald-200 hover:shadow-sm transition-all"
            >
              <Shield className="w-8 h-8 text-amber-600 mb-3" />
              <h3 className="font-semibold text-gray-900">Review Approvals</h3>
              <p className="text-sm text-gray-500 mt-1">{counts.pendingApprovals} users waiting</p>
            </button>
            <button
              onClick={() => { setLessonFilter("pending"); setTab("content"); }}
              className="bg-white rounded-2xl border border-gray-100 p-5 text-left hover:border-emerald-200 hover:shadow-sm transition-all"
            >
              <FileText className="w-8 h-8 text-purple-600 mb-3" />
              <h3 className="font-semibold text-gray-900">Review Lessons</h3>
              <p className="text-sm text-gray-500 mt-1">{counts.pendingReviews} lessons pending</p>
            </button>
            <button
              onClick={() => setTab("classes")}
              className="bg-white rounded-2xl border border-gray-100 p-5 text-left hover:border-emerald-200 hover:shadow-sm transition-all"
            >
              <School className="w-8 h-8 text-blue-600 mb-3" />
              <h3 className="font-semibold text-gray-900">Manage Classes</h3>
              <p className="text-sm text-gray-500 mt-1">{counts.totalClasses} classes</p>
            </button>
          </div>
        </div>
      )}

      {/* ─── Members Tab ──────────────────────────────────────── */}
      {tab === "members" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "student", "teacher", "admin"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setUserFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  userFilter === f
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "pending" && counts.pendingApprovals > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded-full text-[11px]">
                    {counts.pendingApprovals}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Users List */}
          {loadingUsers ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-16" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {user.full_name || "Unnamed user"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${roleBadge(user.role)}`}>
                        {user.role}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        user.is_approved ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                      }`}>
                        {user.is_approved ? "Approved" : "Not approved"}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Role Change Dropdown */}
                    <div className="relative">
                      <select
                        value={user.role}
                        onChange={(e) => handleChangeRole(user.id, e.target.value)}
                        disabled={actionInProgress === user.id}
                        className="appearance-none bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium text-gray-700 cursor-pointer hover:bg-gray-100 disabled:opacity-50"
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="parent">Parent</option>
                        <option value="admin">Admin</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                    </div>
                    {/* Approve/Reject */}
                    {!user.is_approved ? (
                      <>
                        <button
                          onClick={() => handleApproveUser(user.id, false)}
                          disabled={actionInProgress === user.id}
                          className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApproveUser(user.id, true)}
                          disabled={actionInProgress === user.id}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleApproveUser(user.id, false)}
                        disabled={actionInProgress === user.id}
                        className="px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Classes Tab ──────────────────────────────────────── */}
      {tab === "classes" && (
        <div className="space-y-4">
          {loadingCohorts ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-20" />
              ))}
            </div>
          ) : cohorts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No classes found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cohorts.map((cohort) => (
                <div
                  key={cohort.id}
                  className="bg-white rounded-xl border border-gray-100 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {cohort.name}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          cohort.is_active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {cohort.is_active ? "Active" : "Archived"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                          Grade {cohort.grade_level}
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">
                          {cohort.student_count} students
                        </span>
                        {cohort.teachers.length > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700">
                            {cohort.teachers.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Join Code */}
                      <button
                        onClick={() => copyJoinCode(cohort.join_code)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono hover:bg-gray-100 transition-colors"
                      >
                        {copiedCode === cohort.join_code ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                        {cohort.join_code}
                      </button>
                      {/* Archive / Activate */}
                      <button
                        onClick={() => handleToggleCohort(cohort.id, !cohort.is_active)}
                        disabled={actionInProgress === cohort.id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                          cohort.is_active
                            ? "text-gray-600 border border-gray-200 hover:bg-gray-50"
                            : "bg-emerald-600 text-white hover:bg-emerald-700"
                        }`}
                      >
                        {cohort.is_active ? "Archive" : "Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Content Tab ──────────────────────────────────────── */}
      {tab === "content" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "published", "draft"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLessonFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  lessonFilter === f
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "All" : f === "pending" ? "Pending Review" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Lessons List */}
          {loadingLessons ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-16" />
              ))}
            </div>
          ) : lessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm text-gray-400">No lessons found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson) => {
                const status = lessonStatus(lesson);
                return (
                  <div
                    key={lesson.id}
                    className="bg-white rounded-xl border border-gray-100 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {lesson.title_en || lesson.title_ar}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${status.color}`}>
                            {status.label}
                          </span>
                          {lesson.subject && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700">
                              {lesson.subject.name_en || lesson.subject.name_ar}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600">
                            Grade {lesson.grade_level}
                          </span>
                          {lesson.creator && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 text-indigo-700">
                              {lesson.creator.full_name}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">
                            {new Date(lesson.updated_at || lesson.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Link
                          href={`/teacher/lessons/${lesson.id}`}
                          className="px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                        >
                          Preview
                        </Link>
                        {lesson.submitted_for_review && !lesson.is_published && (
                          <>
                            <button
                              onClick={() => handleRejectLesson(lesson.id)}
                              disabled={actionInProgress === lesson.id}
                              className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handlePublishLesson(lesson.id)}
                              disabled={actionInProgress === lesson.id}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              Publish
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card Component ───────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        {icon}
        <span className={`text-2xl font-bold ${highlight ? "text-amber-600" : "text-gray-900"}`}>
          {value}
        </span>
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
