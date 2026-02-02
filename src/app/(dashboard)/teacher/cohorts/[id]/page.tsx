"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

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
  const { loading: authLoading } = useTeacherGuard();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"students" | "assignments">("students");
  const [copiedCode, setCopiedCode] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingCohort, setSavingCohort] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<Array<{ id: string; full_name: string; avatar_url: string | null }>>([]);
  const [addingStudentId, setAddingStudentId] = useState<string | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    grade_level: 1,
    is_active: true,
  });

  useEffect(() => {
    if (!authLoading) {
      loadCohortData();
    }
  }, [id, authLoading]);

  useEffect(() => {
    const supabase = createClient();
    const search = studentSearch.trim();
    if (!search || search.length < 2) {
      setStudentResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const { data: results } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("role", "student")
        .ilike("full_name", `%${search}%`)
        .limit(10);

      const filtered = (results || []).filter(
        (result) => !students.find((student) => student.id === result.id)
      );

      setStudentResults(filtered);
    }, 250);

    return () => clearTimeout(timeout);
  }, [studentSearch, students]);

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
    setEditForm({
      name: cohortData.name,
      description: cohortData.description || "",
      grade_level: cohortData.grade_level,
      is_active: cohortData.is_active,
    });

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

  function generateJoinCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  async function saveCohortChanges() {
    if (!cohort) return;
    setSavingCohort(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("cohorts")
      .update({
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        grade_level: editForm.grade_level,
        is_active: editForm.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cohort.id);

    if (!error) {
      setShowEditModal(false);
      loadCohortData();
    }
    setSavingCohort(false);
  }

  async function regenerateJoinCode() {
    if (!cohort) return;
    setRegeneratingCode(true);
    const supabase = createClient();
    const nextCode = generateJoinCode();
    await supabase
      .from("cohorts")
      .update({ join_code: nextCode, updated_at: new Date().toISOString() })
      .eq("id", cohort.id);
    setRegeneratingCode(false);
    loadCohortData();
  }

  async function addStudent(studentId: string) {
    setAddingStudentId(studentId);
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("cohort_students")
      .select("id, is_active")
      .eq("cohort_id", id)
      .eq("student_id", studentId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("cohort_students")
        .update({ is_active: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("cohort_students")
        .insert({ cohort_id: id, student_id: studentId, is_active: true });
    }

    setStudentSearch("");
    setStudentResults([]);
    setAddingStudentId(null);
    loadCohortData();
  }

  async function removeStudent(studentId: string) {
    setRemovingStudentId(studentId);
    const supabase = createClient();
    await supabase
      .from("cohort_students")
      .update({ is_active: false })
      .eq("cohort_id", id)
      .eq("student_id", studentId);
    setRemovingStudentId(null);
    loadCohortData();
  }

  function copyJoinCode() {
    if (cohort) {
      navigator.clipboard.writeText(cohort.join_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!cohort) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Class not found</h1>
        <Link href="/teacher/cohorts" className="text-emerald-600 hover:underline">
          Back to My Classes
        </Link>
      </div>
    );
  }

  return (
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

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Edit Class
          </button>
          <button
            onClick={regenerateJoinCode}
            disabled={regeneratingCode}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {regeneratingCode ? "Regenerating..." : "Regenerate Join Code"}
          </button>
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
            <div className="p-4 border-b border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">Add student</label>
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students by name..."
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              {studentResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {studentResults.map((student) => (
                    <div key={student.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold">
                          {student.full_name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-gray-700">{student.full_name}</span>
                      </div>
                      <button
                        onClick={() => addStudent(student.id)}
                        disabled={addingStudentId === student.id}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-60"
                      >
                        {addingStudentId === student.id ? "Adding..." : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                        <div className="flex items-center justify-between gap-2">
                          <span>{new Date(student.enrolled_at).toLocaleDateString()}</span>
                          <button
                            onClick={() => removeStudent(student.id)}
                            disabled={removingStudentId === student.id}
                            className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                          >
                            {removingStudentId === student.id ? "Removing..." : "Remove"}
                          </button>
                        </div>
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

        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Edit Class</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
                  <select
                    value={editForm.grade_level}
                    onChange={(e) => setEditForm({ ...editForm, grade_level: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                      <option key={grade} value={grade}>Grade {grade}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Active Class</span>
                  <button
                    onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                    className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
                      editForm.is_active ? "bg-emerald-500 justify-end" : "bg-gray-200 justify-start"
                    }`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full shadow" />
                  </button>
                </div>
              </div>
              <div className="p-6 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveCohortChanges}
                  disabled={savingCohort || !editForm.name.trim()}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  {savingCohort ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
