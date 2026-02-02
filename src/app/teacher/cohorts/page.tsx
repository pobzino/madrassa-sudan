"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";

interface Cohort {
  id: string;
  name: string;
  description: string | null;
  grade_level: number;
  join_code: string;
  is_active: boolean;
  student_count: number;
}

export default function TeacherCohortsPage() {
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create form state
  const [newCohort, setNewCohort] = useState({
    name: "",
    description: "",
    grade_level: 1,
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCohorts();
  }, []);

  async function loadCohorts() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Get teacher's cohorts with student count
    const { data: cohortTeachers } = await supabase
      .from("cohort_teachers")
      .select(`
        cohort_id,
        cohorts (
          id,
          name,
          description,
          grade_level,
          join_code,
          is_active
        )
      `)
      .eq("teacher_id", user.id);

    const cohortsData: Cohort[] = [];

    for (const ct of cohortTeachers || []) {
      const cohort = ct.cohorts as unknown as Cohort;
      if (cohort) {
        // Get student count
        const { count } = await supabase
          .from("cohort_students")
          .select("*", { count: "exact", head: true })
          .eq("cohort_id", cohort.id)
          .eq("is_active", true);

        cohortsData.push({
          ...cohort,
          student_count: count || 0,
        });
      }
    }

    setCohorts(cohortsData);
    setLoading(false);
  }

  async function createCohort() {
    if (!newCohort.name.trim()) return;

    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Create cohort
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .insert({
        name: newCohort.name,
        description: newCohort.description || null,
        grade_level: newCohort.grade_level,
      })
      .select()
      .single();

    if (cohortError) {
      console.error("Error creating cohort:", cohortError);
      setCreating(false);
      return;
    }

    // Add teacher to cohort
    await supabase.from("cohort_teachers").insert({
      cohort_id: cohort.id,
      teacher_id: user.id,
      is_primary: true,
    });

    // Reset form and reload
    setNewCohort({ name: "", description: "", grade_level: 1 });
    setShowCreateModal(false);
    setCreating(false);
    loadCohorts();
  }

  function copyJoinCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
            <p className="text-gray-500">Manage your classes and students</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <span>➕</span>
            Create Class
          </button>
        </div>

        {/* Classes Grid */}
        {cohorts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <span className="text-6xl mb-4 block">🏫</span>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No classes yet</h2>
            <p className="text-gray-500 mb-4">Create your first class to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Create First Class
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {cohorts.map((cohort) => (
              <div
                key={cohort.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{cohort.name}</h3>
                      <p className="text-sm text-gray-500">Grade {cohort.grade_level}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      cohort.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {cohort.is_active ? "Active" : "Archived"}
                    </span>
                  </div>

                  {cohort.description && (
                    <p className="text-gray-600 text-sm mb-4">{cohort.description}</p>
                  )}

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👥</span>
                      <span className="text-gray-600">{cohort.student_count} students</span>
                    </div>
                  </div>

                  {/* Join Code */}
                  <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Join Code</p>
                      <p className="font-mono font-semibold text-gray-900">{cohort.join_code}</p>
                    </div>
                    <button
                      onClick={() => copyJoinCode(cohort.join_code)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                    >
                      {copiedCode === cohort.join_code ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-100 p-4 bg-gray-50 flex gap-2">
                  <Link
                    href={`/teacher/cohorts/${cohort.id}`}
                    className="flex-1 text-center py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    View Details
                  </Link>
                  <Link
                    href={`/teacher/homework/create?cohort=${cohort.id}`}
                    className="flex-1 text-center py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Assign Homework
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Create New Class</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Class Name *
                  </label>
                  <input
                    type="text"
                    value={newCohort.name}
                    onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })}
                    placeholder="e.g., Grade 5 Mathematics"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newCohort.description}
                    onChange={(e) => setNewCohort({ ...newCohort, description: e.target.value })}
                    placeholder="Optional description..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grade Level *
                  </label>
                  <select
                    value={newCohort.grade_level}
                    onChange={(e) => setNewCohort({ ...newCohort, grade_level: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
                      <option key={grade} value={grade}>Grade {grade}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createCohort}
                  disabled={creating || !newCohort.name.trim()}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Class"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
