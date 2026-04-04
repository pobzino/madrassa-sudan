"use client";

import Link from "next/link";
import type { AssignmentWithStats, SubmissionQueueItem } from "@/lib/homework.types";

// Teacher Homework List Component
interface TeacherHomeworkListProps {
  assignments: AssignmentWithStats[];
  onTogglePublish?: (id: string, published: boolean) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

export function TeacherHomeworkList({
  assignments,
  onTogglePublish,
  onDelete,
  isLoading,
}: TeacherHomeworkListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
        <span className="text-6xl mb-4 block">📝</span>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No assignments yet</h3>
        <p className="text-gray-500 mb-6">Create your first assignment to get started</p>
        <Link
          href="/teacher/homework/create"
          className="inline-block px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
        >
          Create Assignment
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => {
        const isOverdue = assignment.due_at && new Date(assignment.due_at) < new Date();

        return (
          <div
            key={assignment.id}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:shadow-md transition-shadow"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {assignment.title_en || assignment.title_ar}
                </h3>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                    assignment.is_published
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {assignment.is_published ? "Published" : "Draft"}
                </span>
                {isOverdue && assignment.is_published && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
                    Overdue
                  </span>
                )}
              </div>

              <div className="text-sm text-gray-500 flex flex-wrap gap-x-4 gap-y-1 mt-2">
                <span>{assignment.cohort_name}</span>
                {assignment.subject_name && <span>{assignment.subject_name}</span>}
                <span>{assignment.total_points} points</span>
                {assignment.due_at && (
                  <span className={isOverdue ? "text-red-600" : ""}>
                    Due {new Date(assignment.due_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-3 text-sm">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-900">{assignment.submissions_count}</span>
                  <span className="text-gray-500">submissions</span>
                </div>
                {assignment.pending_count > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-amber-600">{assignment.pending_count}</span>
                    <span className="text-amber-600">pending</span>
                  </div>
                )}
                {assignment.graded_count > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-emerald-600">{assignment.graded_count}</span>
                    <span className="text-gray-500">graded</span>
                  </div>
                )}
                {assignment.average_score !== null && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">Avg:</span>
                    <span className="font-medium text-gray-900">
                      {assignment.average_score.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {assignment.is_published && (
                <>
                  <Link
                    href={`/teacher/homework/${assignment.id}/submissions`}
                    className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-200 transition-colors"
                  >
                    Grade ({assignment.pending_count})
                  </Link>
                </>
              )}
              <button
                onClick={() => onTogglePublish?.(assignment.id, !assignment.is_published)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  assignment.is_published
                    ? "border-gray-200 text-gray-600 hover:bg-gray-50"
                    : "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {assignment.is_published ? "Unpublish" : "Publish"}
              </button>
              <Link
                href={`/teacher/homework/create?assignment=${assignment.id}`}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Edit
              </Link>
              {onDelete && (
                <button
                  onClick={() => onDelete?.(assignment.id)}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Student Homework List Component
interface StudentHomeworkListProps {
  homework: {
    id: string;
    title_ar: string;
    title_en: string | null;
    due_at: string | null;
    total_points: number;
    status: "not_started" | "in_progress" | "submitted" | "graded" | "returned";
    score: number | null;
    subject_name?: string | null;
  }[];
  isLoading?: boolean;
}

export function StudentHomeworkList({ homework, isLoading }: StudentHomeworkListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (homework.length === 0) {
    return (
      <div className="text-center py-16">
        <span className="text-6xl mb-4 block">📚</span>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No homework assigned</h3>
        <p className="text-gray-500">When your teacher assigns homework, it will appear here</p>
      </div>
    );
  }

  const getStatusBadge = (status: string, score: number | null, totalPoints: number) => {
    switch (status) {
      case "graded":
      case "returned":
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 text-base font-semibold font-fredoka rounded-full">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {score}/{totalPoints}
          </span>
        );
      case "submitted":
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 text-base font-semibold font-fredoka rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Submitted
          </span>
        );
      case "in_progress":
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 text-base font-semibold font-fredoka rounded-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            In Progress
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-base font-semibold font-fredoka rounded-full">
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {homework.map((item) => {
        const isOverdue = item.due_at && new Date(item.due_at) < new Date();
        const isCompleted = item.status === "submitted" || item.status === "graded" || item.status === "returned";

        return (
          <Link
            key={item.id}
            href={`/homework/${item.id}`}
            className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <h3 className="font-semibold font-fredoka text-gray-900 text-lg">
                    {item.title_en || item.title_ar}
                  </h3>
                  {getStatusBadge(item.status, item.score, item.total_points)}
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                  {item.subject_name && (
                    <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                      {item.subject_name}
                    </span>
                  )}

                  {item.due_at && !isCompleted && (
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium ${
                      isOverdue
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {isOverdue ? "Overdue" : "Due"} {new Date(item.due_at).toLocaleDateString()}
                    </span>
                  )}

                  <span className="text-gray-500">{item.total_points} points</span>
                </div>
              </div>

              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// Submission Queue Component
interface SubmissionQueueProps {
  submissions: SubmissionQueueItem[];
  onSelect: (submission: SubmissionQueueItem) => void;
  selectedId?: string;
  isLoading?: boolean;
}

export function SubmissionQueue({
  submissions,
  onSelect,
  selectedId,
  isLoading,
}: SubmissionQueueProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 bg-white rounded-xl animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {submissions.map((submission) => (
        <button
          key={submission.id}
          onClick={() => onSelect(submission)}
          className={`w-full p-4 text-left rounded-xl transition-colors ${
            selectedId === submission.id
              ? "bg-emerald-50 border-2 border-emerald-500"
              : "bg-white border border-gray-100 hover:bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {submission.student_avatar ? (
                <img
                  src={submission.student_avatar}
                  alt={submission.student_name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-medium">
                  {submission.student_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium text-gray-900">{submission.student_name}</p>
                <p className="text-sm text-gray-500">
                  {submission.answered_count}/{submission.question_count} answered
                </p>
              </div>
            </div>

            <div className="text-right">
              {submission.status === "graded" ? (
                <span className="inline-block px-2 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
                  {submission.score} pts
                </span>
              ) : (
                <span className="inline-block px-2 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                  Pending
                </span>
              )}
              {submission.submitted_at && (
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(submission.submitted_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
