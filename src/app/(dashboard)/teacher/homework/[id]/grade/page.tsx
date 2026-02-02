"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser } from "@/lib/supabase/auth-cache";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";

interface Question {
  id: string;
  question_type: string;
  question_text_ar: string;
  question_text_en: string | null;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
}

interface Response {
  id: string;
  question_id: string;
  response_text: string | null;
  points_earned: number | null;
  teacher_comment: string | null;
}

interface Submission {
  id: string;
  student_id: string;
  student_name: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
  responses: Response[];
}

interface Assignment {
  id: string;
  title_ar: string;
  title_en: string | null;
  total_points: number;
  cohort_name: string;
}

export default function GradeHomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { loading: authLoading } = useTeacherGuard();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoGrading, setAutoGrading] = useState(false);

  // Grading state
  const [grades, setGrades] = useState<Record<string, { points: number; comment: string }>>({});

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [id, authLoading]);

  async function loadData() {
    const supabase = createClient();

    // Get assignment with cohort name
    const { data: assignmentData, error: assignmentError } = await supabase
      .from("homework_assignments")
      .select(`
        *,
        cohorts (name)
      `)
      .eq("id", id)
      .single();

    if (assignmentError || !assignmentData) {
      console.error("Error loading assignment:", assignmentError);
      setLoading(false);
      return;
    }

    setAssignment({
      id: assignmentData.id,
      title_ar: assignmentData.title_ar,
      title_en: assignmentData.title_en,
      total_points: assignmentData.total_points,
      cohort_name: (assignmentData.cohorts as { name: string })?.name || "Unknown",
    });

    // Get questions
    const { data: questionsData } = await supabase
      .from("homework_questions")
      .select("*")
      .eq("assignment_id", id)
      .order("display_order");

    const formattedQuestions: Question[] = (questionsData || []).map((q) => ({
      id: q.id,
      question_type: q.question_type,
      question_text_ar: q.question_text_ar,
      question_text_en: q.question_text_en,
      options: q.options as string[] | null,
      correct_answer: q.correct_answer,
      points: q.points,
    }));
    setQuestions(formattedQuestions);

    // Get submissions with responses
    const { data: submissionsData } = await supabase
      .from("homework_submissions")
      .select(`
        *,
        homework_responses (*)
      `)
      .eq("assignment_id", id)
      .order("submitted_at", { ascending: false });

    // Get student names separately to avoid the multiple relationship issue
    const formattedSubmissions: Submission[] = [];
    for (const sub of submissionsData || []) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", sub.student_id)
        .single();

      formattedSubmissions.push({
        id: sub.id,
        student_id: sub.student_id,
        student_name: profile?.full_name || "Unknown",
        status: sub.status,
        score: sub.score,
        submitted_at: sub.submitted_at,
        responses: (sub.homework_responses || []) as Response[],
      });
    }

    setSubmissions(formattedSubmissions);
    setLoading(false);
  }

  function selectSubmission(submission: Submission) {
    setSelectedSubmission(submission);

    // Initialize grades from existing responses
    const initialGrades: Record<string, { points: number; comment: string }> = {};
    for (const response of submission.responses) {
      initialGrades[response.question_id] = {
        points: response.points_earned || 0,
        comment: response.teacher_comment || "",
      };
    }
    setGrades(initialGrades);
  }

  function updateGrade(questionId: string, field: "points" | "comment", value: number | string) {
    setGrades({
      ...grades,
      [questionId]: {
        ...grades[questionId],
        [field]: value,
      },
    });
  }

  async function saveGrades() {
    if (!selectedSubmission) return;

    setSaving(true);
    const supabase = createClient();
    const user = await getCachedUser(supabase);

    if (!user) return;

    // Update each response
    for (const response of selectedSubmission.responses) {
      const grade = grades[response.question_id];
      if (grade) {
        await supabase
          .from("homework_responses")
          .update({
            points_earned: grade.points,
            teacher_comment: grade.comment || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", response.id);
      }
    }

    // Calculate total score
    const totalScore = Object.values(grades).reduce((sum, g) => sum + (g.points || 0), 0);

    // Update submission
    await supabase
      .from("homework_submissions")
      .update({
        score: totalScore,
        status: "graded",
        graded_by: user.id,
        graded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedSubmission.id);

    setSaving(false);
    loadData();
    setSelectedSubmission(null);
  }

  async function autoGradeAll() {
    setAutoGrading(true);

    try {
      const response = await fetch("/api/homework/auto-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: id }),
      });

      if (response.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Auto-grade error:", error);
    }

    setAutoGrading(false);
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Assignment not found</h1>
        <Link href="/teacher" className="text-emerald-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const pendingSubmissions = submissions.filter((s) => s.status === "submitted");
  const gradedSubmissions = submissions.filter((s) => s.status === "graded");

  return (
    <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/teacher"
            className="text-gray-500 hover:text-gray-700 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {assignment.title_en || assignment.title_ar}
              </h1>
              <p className="text-gray-500">{assignment.cohort_name} • {assignment.total_points} points</p>
            </div>
            <button
              onClick={autoGradeAll}
              disabled={autoGrading || pendingSubmissions.length === 0}
              className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {autoGrading ? "Auto-grading..." : "Auto-grade MCQs"}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Submissions List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Submissions</h2>
                <p className="text-sm text-gray-500">
                  {pendingSubmissions.length} pending • {gradedSubmissions.length} graded
                </p>
              </div>

              {submissions.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No submissions yet
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                  {submissions.map((submission) => (
                    <button
                      key={submission.id}
                      onClick={() => selectSubmission(submission)}
                      className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                        selectedSubmission?.id === submission.id ? "bg-emerald-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{submission.student_name}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          submission.status === "graded"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {submission.status === "graded" ? `${submission.score}/${assignment.total_points}` : "Pending"}
                        </span>
                      </div>
                      {submission.submitted_at && (
                        <p className="text-sm text-gray-500 mt-1">
                          Submitted {new Date(submission.submitted_at).toLocaleDateString()}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grading Panel */}
          <div className="lg:col-span-2">
            {selectedSubmission ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedSubmission.student_name}</h2>
                    <p className="text-sm text-gray-500">
                      Total: {Object.values(grades).reduce((sum, g) => sum + (g.points || 0), 0)} / {assignment.total_points}
                    </p>
                  </div>
                  <button
                    onClick={saveGrades}
                    disabled={saving}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save & Mark Graded"}
                  </button>
                </div>

                <div className="p-4 space-y-6 max-h-[600px] overflow-y-auto">
                  {questions.map((question, index) => {
                    const response = selectedSubmission.responses.find(
                      (r) => r.question_id === question.id
                    );
                    const grade = grades[question.id] || { points: 0, comment: "" };
                    const isCorrect = question.correct_answer && response?.response_text === question.correct_answer;

                    return (
                      <div key={question.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="text-sm text-gray-500">Question {index + 1}</span>
                            <p className="font-medium text-gray-900">
                              {question.question_text_en || question.question_text_ar}
                            </p>
                            {question.question_type === "multiple_choice" && question.options && (
                              <div className="mt-2 space-y-1">
                                {question.options.map((opt, i) => (
                                  <div
                                    key={i}
                                    className={`text-sm px-2 py-1 rounded ${
                                      opt === question.correct_answer
                                        ? "bg-emerald-100 text-emerald-700"
                                        : opt === response?.response_text
                                        ? "bg-red-100 text-red-700"
                                        : "text-gray-600"
                                    }`}
                                  >
                                    {opt}
                                    {opt === question.correct_answer && " ✓"}
                                    {opt === response?.response_text && opt !== question.correct_answer && " (selected)"}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-sm text-gray-500">{question.points} pts</span>
                        </div>

                        {/* Student's Answer */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <p className="text-sm text-gray-500 mb-1">Student&apos;s Answer:</p>
                          <p className={`${
                            question.question_type === "multiple_choice"
                              ? isCorrect ? "text-emerald-700" : "text-red-700"
                              : "text-gray-900"
                          }`}>
                            {response?.response_text || <span className="text-gray-400 italic">No answer</span>}
                          </p>
                        </div>

                        {/* Grading */}
                        <div className="grid md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Points</label>
                            <input
                              type="number"
                              value={grade.points}
                              onChange={(e) =>
                                updateGrade(question.id, "points", Math.min(parseInt(e.target.value) || 0, question.points))
                              }
                              min="0"
                              max={question.points}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-600 mb-1">Comment</label>
                            <input
                              type="text"
                              value={grade.comment}
                              onChange={(e) => updateGrade(question.id, "comment", e.target.value)}
                              placeholder="Optional feedback..."
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <span className="text-5xl mb-4 block">📝</span>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Select a submission</h2>
                <p className="text-gray-500">Choose a student&apos;s submission from the list to start grading</p>
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
