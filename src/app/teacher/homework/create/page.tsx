"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";

interface Cohort {
  id: string;
  name: string;
  grade_level: number;
}

interface Subject {
  id: string;
  name_ar: string;
  name_en: string;
}

interface Question {
  id: string;
  type: "multiple_choice" | "short_answer" | "long_answer";
  question_ar: string;
  question_en: string;
  options: string[];
  correct_answer: string;
  points: number;
}

function CreateHomeworkContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCohort = searchParams.get("cohort");

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [selectedCohort, setSelectedCohort] = useState(preselectedCohort || "");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [instructionsAr, setInstructionsAr] = useState("");
  const [instructionsEn, setInstructionsEn] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Get teacher's cohorts
    const { data: cohortTeachers } = await supabase
      .from("cohort_teachers")
      .select(`
        cohorts (
          id,
          name,
          grade_level
        )
      `)
      .eq("teacher_id", user.id);

    const cohortsData = cohortTeachers
      ?.map((ct) => ct.cohorts as unknown as Cohort)
      .filter(Boolean) || [];

    setCohorts(cohortsData);

    // Get subjects
    const { data: subjectsData } = await supabase
      .from("subjects")
      .select("*")
      .order("display_order");

    setSubjects(subjectsData || []);
    setLoading(false);
  }

  function addQuestion() {
    setQuestions([
      ...questions,
      {
        id: crypto.randomUUID(),
        type: "multiple_choice",
        question_ar: "",
        question_en: "",
        options: ["", "", "", ""],
        correct_answer: "",
        points: 10,
      },
    ]);
  }

  function updateQuestion(id: string, updates: Partial<Question>) {
    setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  }

  function removeQuestion(id: string) {
    setQuestions(questions.filter((q) => q.id !== id));
  }

  async function saveAssignment(publish: boolean) {
    if (!selectedCohort || !titleAr || questions.length === 0) {
      alert("Please fill in all required fields and add at least one question");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Calculate total points
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

    // Create assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .insert({
        cohort_id: selectedCohort,
        subject_id: selectedSubject || null,
        title_ar: titleAr,
        title_en: titleEn || null,
        instructions_ar: instructionsAr || null,
        instructions_en: instructionsEn || null,
        due_at: dueDate ? new Date(dueDate).toISOString() : null,
        total_points: totalPoints,
        is_published: publish,
        created_by: user.id,
      })
      .select()
      .single();

    if (assignmentError) {
      console.error("Error creating assignment:", assignmentError);
      setSaving(false);
      return;
    }

    // Create questions
    const questionsToInsert = questions.map((q, index) => ({
      assignment_id: assignment.id,
      question_type: q.type,
      question_text_ar: q.question_ar,
      question_text_en: q.question_en || null,
      options: q.type === "multiple_choice" ? q.options.filter((o) => o.trim()) : null,
      correct_answer: q.type === "multiple_choice" ? q.correct_answer : null,
      points: q.points,
      display_order: index,
    }));

    const { error: questionsError } = await supabase
      .from("homework_questions")
      .insert(questionsToInsert);

    if (questionsError) {
      console.error("Error creating questions:", questionsError);
      setSaving(false);
      return;
    }

    router.push(`/teacher/cohorts/${selectedCohort}`);
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
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/teacher/cohorts"
              className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block"
            >
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Create Assignment</h1>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Class *
                </label>
                <select
                  value={selectedCohort}
                  onChange={(e) => setSelectedCohort(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Select a class</option>
                  {cohorts.map((cohort) => (
                    <option key={cohort.id} value={cohort.id}>
                      {cohort.name} (Grade {cohort.grade_level})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Select a subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name_en} / {subject.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (Arabic) *
                </label>
                <input
                  type="text"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="عنوان الواجب"
                  dir="rtl"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (English)
                </label>
                <input
                  type="text"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="Assignment title"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instructions (Arabic)
                </label>
                <textarea
                  value={instructionsAr}
                  onChange={(e) => setInstructionsAr(e.target.value)}
                  placeholder="تعليمات الواجب"
                  dir="rtl"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instructions (English)
                </label>
                <textarea
                  value={instructionsEn}
                  onChange={(e) => setInstructionsEn(e.target.value)}
                  placeholder="Assignment instructions"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Questions</h2>
              <button
                onClick={addQuestion}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm"
              >
                + Add Question
              </button>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No questions added yet. Click &quot;Add Question&quot; to start.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <div key={question.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-4">
                      <span className="font-medium text-gray-900">Question {index + 1}</span>
                      <button
                        onClick={() => removeQuestion(question.id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Type</label>
                        <select
                          value={question.type}
                          onChange={(e) =>
                            updateQuestion(question.id, {
                              type: e.target.value as Question["type"],
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        >
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="short_answer">Short Answer</option>
                          <option value="long_answer">Long Answer</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Points</label>
                        <input
                          type="number"
                          value={question.points}
                          onChange={(e) =>
                            updateQuestion(question.id, { points: parseInt(e.target.value) || 10 })
                          }
                          min="1"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Question (Arabic) *</label>
                        <textarea
                          value={question.question_ar}
                          onChange={(e) =>
                            updateQuestion(question.id, { question_ar: e.target.value })
                          }
                          placeholder="السؤال بالعربية"
                          dir="rtl"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Question (English)</label>
                        <textarea
                          value={question.question_en}
                          onChange={(e) =>
                            updateQuestion(question.id, { question_en: e.target.value })
                          }
                          placeholder="Question in English"
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>

                      {question.type === "multiple_choice" && (
                        <>
                          <div className="md:col-span-2">
                            <label className="block text-sm text-gray-600 mb-2">Options</label>
                            <div className="grid md:grid-cols-2 gap-2">
                              {question.options.map((option, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct-${question.id}`}
                                    checked={question.correct_answer === option && option !== ""}
                                    onChange={() =>
                                      updateQuestion(question.id, { correct_answer: option })
                                    }
                                    className="text-emerald-600"
                                  />
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => {
                                      const newOptions = [...question.options];
                                      newOptions[optIndex] = e.target.value;
                                      updateQuestion(question.id, { options: newOptions });
                                    }}
                                    placeholder={`Option ${optIndex + 1}`}
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                  />
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              Select the radio button next to the correct answer
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => saveAssignment(false)}
              disabled={saving}
              className="px-6 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              onClick={() => saveAssignment(true)}
              disabled={saving}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Publish Assignment"}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function CreateHomeworkPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      </DashboardLayout>
    }>
      <CreateHomeworkContent />
    </Suspense>
  );
}
