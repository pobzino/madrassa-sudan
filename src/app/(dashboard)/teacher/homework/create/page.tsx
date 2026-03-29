"use client";

import { useCallback, useEffect, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { QuestionBuilder } from "@/components/homework/QuestionBuilder";
import type { CreateQuestionInput } from "@/lib/homework.types";

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

function CreateHomeworkContent() {
  const { loading: authLoading } = useTeacherGuard();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedCohort = searchParams.get("cohort");
  const assignmentId = searchParams.get("assignment");

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
  const [questions, setQuestions] = useState<CreateQuestionInput[]>([]);
  const [loadingAssignment, setLoadingAssignment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) return;

    // Get teacher's cohorts
    const { data: cohortTeachers } = await supabase
      .from("cohort_teachers")
      .select(
        `
        cohorts (
          id,
          name,
          grade_level
        )
      `
      )
      .eq("teacher_id", user.id);

    const cohortsData =
      cohortTeachers
        ?.map((ct) => ct.cohorts as unknown as Cohort)
        .filter(Boolean) || [];

    setCohorts(cohortsData);

    // Get subjects
    const { data: subjectsData } = await supabase
      .from("subjects")
      .select("*")
      .order("display_order");

    setSubjects(subjectsData || []);

    // Load existing assignment if editing
    if (assignmentId) {
      setLoadingAssignment(true);
      const response = await fetch(`/api/homework/${assignmentId}`);

      if (response.ok) {
        const data = await response.json();
        const assignment = data.data;

        setSelectedCohort(assignment.cohort_id);
        setSelectedSubject(assignment.subject_id || "");
        setTitleAr(assignment.title_ar || "");
        setTitleEn(assignment.title_en || "");
        setInstructionsAr(assignment.instructions_ar || "");
        setInstructionsEn(assignment.instructions_en || "");
        setDueDate(
          assignment.due_at
            ? new Date(assignment.due_at).toISOString().slice(0, 16)
            : ""
        );

        // Load questions
        const formattedQuestions = (assignment.questions || []).map(
          (q: {
            id: string;
            question_type: string;
            question_text_ar: string;
            question_text_en: string | null;
            options: string[] | null;
            correct_answer: string | null;
            points: number;
            display_order: number;
            rubric: unknown;
            instructions: string | null;
          }) => ({
            id: q.id,
            type: q.question_type,
            question_ar: q.question_text_ar,
            question_en: q.question_text_en || "",
            options: q.options || ["", "", "", ""],
            correct_answer: q.correct_answer || "",
            points: q.points,
            display_order: q.display_order,
            rubric: q.rubric,
            instructions: q.instructions,
          })
        );
        setQuestions(formattedQuestions);
      }

      setLoadingAssignment(false);
    }
    setLoading(false);
  }, [assignmentId]);

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadData]);

  function addQuestion(type: CreateQuestionInput["question_type"] = "multiple_choice") {
    const newQuestion: CreateQuestionInput = {
      question_type: type,
      question_text_ar: "",
      question_text_en: "",
      options: type === "multiple_choice" ? ["", "", "", ""] : null,
      correct_answer: null,
      points: 10,
      display_order: questions.length + 1,
    };
    setQuestions([...questions, newQuestion]);
  }

  function updateQuestion(index: number, updates: Partial<CreateQuestionInput>) {
    setQuestions(questions.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function duplicateQuestion(index: number) {
    const question = questions[index];
    const duplicated = {
      ...question,
      display_order: questions.length + 1,
    };
    setQuestions([...questions, duplicated]);
  }

  async function saveAssignment(publish: boolean) {
    if (!selectedCohort || !titleAr || questions.length === 0) {
      setError("Please fill in all required fields and add at least one question");
      return;
    }

    // Validate questions
    const invalidQuestions = questions.filter((q) => !q.question_text_ar);
    if (invalidQuestions.length > 0) {
      setError("All questions must have text in Arabic");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        cohort_id: selectedCohort,
        subject_id: selectedSubject || null,
        title_ar: titleAr,
        title_en: titleEn || null,
        instructions_ar: instructionsAr || null,
        instructions_en: instructionsEn || null,
        due_at: dueDate ? new Date(dueDate).toISOString() : null,
        is_published: publish,
        questions: questions.map((q, index) => ({
          question_type: q.question_type,
          question_text_ar: q.question_text_ar,
          question_text_en: q.question_text_en || null,
          options: q.options,
          correct_answer: q.correct_answer,
          points: q.points,
          display_order: q.display_order || index + 1,
          rubric: q.rubric,
          instructions: q.instructions,
        })),
      };

      const url = assignmentId ? `/api/homework/${assignmentId}` : "/api/homework";
      const method = assignmentId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push("/teacher/homework");
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to save assignment");
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading || loadingAssignment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/teacher/homework"
            className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block"
          >
            ← Back to Homework
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {assignmentId ? "Edit Assignment" : "Create Assignment"}
          </h1>
        </div>

        <div className="text-right">
          <p className="text-sm text-gray-500">Total Points</p>
          <p className="text-2xl font-bold text-emerald-600">{totalPoints}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          {error}
        </div>
      )}

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
                disabled={!!assignmentId || !!preselectedCohort}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-50"
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
            <h2 className="text-lg font-semibold text-gray-900">
              Questions ({questions.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => addQuestion("multiple_choice")}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                + Multiple Choice
              </button>
              <button
                onClick={() => addQuestion("short_answer")}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                + Short Answer
              </button>
              <button
                onClick={() => addQuestion("long_answer")}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                + Long Answer
              </button>
              <button
                onClick={() => addQuestion("file_upload")}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                + File Upload
              </button>
              <button
                onClick={() => addQuestion("true_false")}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                + True/False
              </button>
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-lg mb-2">No questions yet</p>
              <p className="text-sm">Click a button above to add your first question</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((question, index) => (
                <QuestionBuilder
                  key={index}
                  question={question}
                  index={index}
                  onUpdate={(updates) => updateQuestion(index, updates)}
                  onRemove={() => removeQuestion(index)}
                  onDuplicate={() => duplicateQuestion(index)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Link
            href="/teacher/homework"
            className="px-6 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={() => saveAssignment(false)}
            disabled={saving}
            className="px-6 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save as Draft"}
          </button>
          <button
            onClick={() => saveAssignment(true)}
            disabled={saving}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Publishing..." : "Publish Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateHomeworkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      }
    >
      <CreateHomeworkContent />
    </Suspense>
  );
}
