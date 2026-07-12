"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTeacherGuard } from "@/lib/teacher/useTeacherGuard";
import { ClipboardList } from "lucide-react";
import { SubmissionQueue } from "@/components/homework/HomeworkList";
import { GradingInterface } from "@/components/homework/GradingInterface";
import type { SubmissionQueueItem, RubricCriterion } from "@/lib/homework.types";

export default function HomeworkSubmissionsPage() {
  const params = useParams();
  const assignmentId = params.id as string;
  const { loading: authLoading } = useTeacherGuard();
  const supabase = createClient();

  const [assignment, setAssignment] = useState<{
    id: string;
    title_ar: string;
    title_en: string | null;
    total_points: number;
  } | null>(null);

  const [submissions, setSubmissions] = useState<SubmissionQueueItem[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionQueueItem | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<{
    submission: {
      id: string;
      student_id: string;
      student_name: string;
      student_avatar: string | null;
      status: string;
      score: number | null;
      overall_feedback: string | null;
    };
    assignment: {
      total_points: number;
    };
    responses: {
      response_id: string | null;
      question_id: string;
      question_type: string;
      question_text_ar: string;
      question_text_en: string | null;
      options: string[] | null;
      correct_answer: string | null;
      points: number;
      display_order: number;
      rubric: RubricCriterion[] | null;
      response_text: string | null;
      response_file_url: string | null;
      response_file_urls: string[] | null;
      points_earned: number | null;
      teacher_comment: string | null;
    }[];
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "graded">("all");
  const [overallFeedback, setOverallFeedback] = useState("");

  type AttemptAnswer = {
    question_id: string;
    response_text: string | null;
    is_correct: boolean | null;
    points_earned: number | null;
  };
  type AttemptRow = {
    id: string;
    attempt_number: number;
    score: number | null;
    max_score: number | null;
    correct_count: number | null;
    total_questions: number | null;
    answers: AttemptAnswer[];
    submitted_at: string;
  };
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      // Get assignment details
      const { data: assignmentData } = await supabase
        .from("homework_assignments")
        .select("id, title_ar, title_en, total_points")
        .eq("id", assignmentId)
        .single();

      if (assignmentData) {
        setAssignment(assignmentData);
      }

      // Get submissions
      const statusParam = filter === "all" ? "" : filter;
      const response = await fetch(
        `/api/homework/submissions?assignment_id=${assignmentId}${statusParam ? `&status=${statusParam}` : ""}`
      );

      if (response.ok) {
        const data = await response.json();
        setSubmissions(data.data.submissions);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, filter, supabase]);

  useEffect(() => {
    if (!authLoading && assignmentId) {
      const timeout = setTimeout(() => {
        void loadData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, assignmentId, loadData]);

  async function loadSubmissionDetail(submissionId: string) {
    try {
      const response = await fetch(`/api/homework/submissions/${submissionId}`);
      if (response.ok) {
        const data = await response.json();
        setSubmissionDetail(data.data);
        setOverallFeedback(data.data.submission.overall_feedback || "");

        // Load the full attempt history for this student on this assignment.
        const studentId = data.data.submission.student_id as string | undefined;
        if (studentId) {
          const { data: attemptsData } = await supabase
            .from("homework_attempts")
            .select("id, attempt_number, score, max_score, correct_count, total_questions, answers, submitted_at")
            .eq("assignment_id", assignmentId)
            .eq("student_id", studentId)
            .order("attempt_number", { ascending: true });
          setAttempts(
            (attemptsData ?? []).map((a) => ({
              id: a.id,
              attempt_number: a.attempt_number,
              score: a.score,
              max_score: a.max_score,
              correct_count: a.correct_count,
              total_questions: a.total_questions,
              answers: Array.isArray(a.answers) ? (a.answers as unknown as AttemptAnswer[]) : [],
              submitted_at: a.submitted_at,
            }))
          );
        } else {
          setAttempts([]);
        }
        setExpandedAttempt(null);
      }
    } catch (error) {
      console.error("Error loading submission detail:", error);
    }
  }

  async function handleSelectSubmission(submission: SubmissionQueueItem) {
    setSelectedSubmission(submission);
    await loadSubmissionDetail(submission.id);
  }

  async function handleGrade(grades: { response_id: string; points: number; comment: string }[]) {
    if (!selectedSubmission || !submissionDetail) return;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/homework/submissions/${selectedSubmission.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grades: grades.map((g) => ({
            response_id: g.response_id,
            points_earned: g.points,
            teacher_comment: g.comment,
          })),
          overall_feedback: overallFeedback,
        }),
      });

      if (response.ok) {
        // Reload data
        await loadData();
        // Move to next submission
        const currentIndex = submissions.findIndex((s) => s.id === selectedSubmission.id);
        if (currentIndex < submissions.length - 1) {
          const nextSubmission = submissions[currentIndex + 1];
          await handleSelectSubmission(nextSubmission);
        } else {
          setSelectedSubmission(null);
          setSubmissionDetail(null);
        }
      }
    } catch (error) {
      console.error("Error saving grades:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDraft(responseId: string, points: number, comment: string) {
    // Auto-save draft - debounced
    if (!selectedSubmission) return;

    try {
      await fetch(`/api/homework/submissions/${selectedSubmission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response_id: responseId,
          points_earned: points,
          teacher_comment: comment,
        }),
      });
    } catch (error) {
      console.error("Error saving draft:", error);
    }
  }

  async function handleNavigate(direction: "prev" | "next") {
    if (!selectedSubmission) return;

    const currentIndex = submissions.findIndex((s) => s.id === selectedSubmission.id);
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;

    if (newIndex >= 0 && newIndex < submissions.length) {
      await handleSelectSubmission(submissions[newIndex]);
    }
  }

  const pendingCount = submissions.filter((s) => s.status === "submitted").length;
  const gradedCount = submissions.filter(
    (s) => s.status === "graded" || s.status === "returned"
  ).length;

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
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <Link href="/teacher/homework" className="hover:text-gray-700">
            ← Homework
          </Link>
          <span>/</span>
          <span>Submissions</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {assignment?.title_en || assignment?.title_ar}
        </h1>
        <p className="text-gray-500">
          {assignment?.total_points} points • {submissions.length} submissions
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            filter === "all"
              ? "bg-emerald-50 border-emerald-500"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{submissions.length}</p>
        </button>

        <button
          onClick={() => setFilter("pending")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            filter === "pending"
              ? "bg-amber-50 border-amber-500"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <p className="text-sm text-amber-600">Pending</p>
          <p className="text-2xl font-bold text-gray-900">{pendingCount}</p>
        </button>

        <button
          onClick={() => setFilter("graded")}
          className={`p-4 rounded-xl border text-left transition-colors ${
            filter === "graded"
              ? "bg-emerald-50 border-emerald-500"
              : "bg-white border-gray-200 hover:border-gray-300"
          }`}
        >
          <p className="text-sm text-emerald-600">Graded</p>
          <p className="text-2xl font-bold text-gray-900">{gradedCount}</p>
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Submission queue */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Submissions</h2>
            </div>
            <div className="max-h-[600px] overflow-y-auto p-2">
              <SubmissionQueue
                submissions={submissions}
                selectedId={selectedSubmission?.id}
                onSelect={handleSelectSubmission}
              />
            </div>
          </div>
        </div>

        {/* Grading panel */}
        <div className="lg:col-span-2 space-y-6">
          {selectedSubmission && submissionDetail ? (
           <>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {selectedSubmission.student_avatar ? (
                    <Image
                      src={selectedSubmission.student_avatar}
                      alt={selectedSubmission.student_name}
                      width={48}
                      height={48}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-medium text-lg">
                      {selectedSubmission.student_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold text-gray-900">{selectedSubmission.student_name}</h2>
                    <p className="text-sm text-gray-500">
                      {selectedSubmission.time_spent_seconds > 0
                        ? `${Math.round(selectedSubmission.time_spent_seconds / 60)} min spent`
                        : "No time tracked"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedSubmission(null);
                    setSubmissionDetail(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <GradingInterface
                questions={submissionDetail.responses}
                onGrade={handleGrade}
                onNavigate={handleNavigate}
                onSaveDraft={handleSaveDraft}
                isSaving={isSaving}
                overallFeedback={overallFeedback}
                onOverallFeedbackChange={setOverallFeedback}
              />
            </div>

            {/* Attempt history — every try the student made, with the answers
                they picked, so the teacher can see the full progression. */}
            {attempts.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="font-semibold text-gray-900 mb-1">
                  Attempts <span className="text-gray-400 font-normal">({attempts.length})</span>
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Each time {selectedSubmission.student_name.split(" ")[0]} submitted this homework.
                </p>
                <div className="space-y-2">
                  {attempts.map((a) => {
                    const isOpen = expandedAttempt === a.id;
                    const mastered =
                      a.score != null && a.max_score != null && a.max_score > 0 && a.score >= a.max_score;
                    return (
                      <div key={a.id} className="border border-gray-100 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedAttempt(isOpen ? null : a.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
                              {a.attempt_number}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                Attempt {a.attempt_number}
                                {mastered && <span className="ml-2 text-emerald-600">✓ 100%</span>}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(a.submitted_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-bold text-gray-900">
                              {a.score ?? "—"}/{a.max_score ?? "—"}
                            </span>
                            {a.correct_count != null && a.total_questions != null && (
                              <span className="text-xs text-gray-500">
                                {a.correct_count}/{a.total_questions} correct
                              </span>
                            )}
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-3 pt-1 space-y-2 bg-gray-50/60">
                            {a.answers.map((ans, i) => {
                              const q = submissionDetail.responses.find(
                                (r) => r.question_id === ans.question_id
                              );
                              const qText = q
                                ? q.question_text_en || q.question_text_ar
                                : `Question ${i + 1}`;
                              return (
                                <div key={ans.question_id} className="flex items-start gap-2 text-sm">
                                  {ans.is_correct === true ? (
                                    <span className="text-emerald-600 mt-0.5">✓</span>
                                  ) : ans.is_correct === false ? (
                                    <span className="text-red-500 mt-0.5">✗</span>
                                  ) : (
                                    <span className="text-gray-300 mt-0.5">•</span>
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-gray-700 truncate">{qText}</p>
                                    <p className="text-gray-500">
                                      {ans.response_text || <span className="italic">No answer</span>}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
           </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select a submission</h2>
              <p className="text-gray-500">Choose a student from the list to start grading</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
