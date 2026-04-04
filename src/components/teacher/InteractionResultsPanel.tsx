"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type TeacherReviewStatus = "pending_review" | "accepted" | "needs_retry";

interface StudentResult {
  student_id: string;
  student_name: string | null;
  status: "correct" | "incorrect" | "completed" | "skipped" | "timed_out";
  score: number;
  time_spent_seconds: number;
  attempts: number;
  completed_at: string;
  response_id?: string;
  answer_text?: string | null;
  review_status?: TeacherReviewStatus | null;
  review_feedback?: string | null;
  reviewed_at?: string | null;
}

interface QuizResult {
  question_id: string;
  label: string;
  kind: "quiz_question";
  prompt_ar: string;
  prompt_en: string;
  total_responses: number;
  correct_count: number;
  avg_score: number;
  avg_time_seconds: number;
  students: StudentResult[];
}

interface ActivityResult {
  task_id: string;
  label: string;
  kind: "activity";
  task_type: string;
  title_ar: string;
  title_en: string;
  required: boolean;
  total_responses: number;
  completed_count: number;
  skipped_count: number;
  timed_out_count: number;
  review_pending_count: number;
  accepted_count: number;
  needs_retry_count: number;
  avg_score: number;
  avg_time_seconds: number;
  model_answer_ar: string;
  model_answer_en: string;
  students: StudentResult[];
}

interface LegacySlideResult {
  slide_id: string;
  label: string;
  kind: "legacy_slide";
  interaction_type: string;
  title_ar: string;
  title_en: string;
  total_responses: number;
  correct_count: number;
  avg_score: number;
  avg_time_seconds: number;
  students: StudentResult[];
}

interface Summary {
  unique_students: number;
  quiz_responses: number;
  quiz_accuracy_percent: number;
  activity_responses: number;
  activity_completion_percent: number;
  activity_skip_percent: number;
  avg_activity_score: number;
  avg_activity_time_seconds: number;
  legacy_slide_responses: number;
}

interface Props {
  lessonId: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  free_response: "Free Response",
  choose_correct: "Choose Correct",
  true_false: "True / False",
  fill_missing_word: "Fill Missing Word",
  tap_to_count: "Tap to Count",
  match_pairs: "Match Pairs",
  sequence_order: "Sequence Order",
  sort_groups: "Sort Groups",
};

const STATUS_STYLES: Record<StudentResult["status"], string> = {
  correct: "bg-emerald-100 text-emerald-700",
  incorrect: "bg-red-100 text-red-700",
  completed: "bg-emerald-100 text-emerald-700",
  skipped: "bg-amber-100 text-amber-700",
  timed_out: "bg-gray-100 text-gray-700",
};

const REVIEW_STATUS_STYLES: Record<TeacherReviewStatus, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  accepted: "bg-emerald-100 text-emerald-700",
  needs_retry: "bg-rose-100 text-rose-700",
};

type SectionKey = "activities" | "quizzes" | "legacySlides";

export default function InteractionResultsPanel({ lessonId }: Props) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quizzes, setQuizzes] = useState<QuizResult[]>([]);
  const [activities, setActivities] = useState<ActivityResult[]>([]);
  const [legacySlides, setLegacySlides] = useState<LegacySlideResult[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewSubmittingId, setReviewSubmittingId] = useState<string | null>(null);
  const [reviewFeedbackDrafts, setReviewFeedbackDrafts] = useState<Record<string, string>>({});
  const [reviewScoreDrafts, setReviewScoreDrafts] = useState<Record<string, string>>({});
  const [aiGradingId, setAiGradingId] = useState<string | null>(null);
  const [aiGradingAll, setAiGradingAll] = useState(false);
  const [aiSuggestedIds, setAiSuggestedIds] = useState<Set<string>>(new Set());

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/teacher/lessons/${lessonId}/interaction-results`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Failed to load results");
        return;
      }

      const data = await response.json();
      setSummary(data.summary);
      setQuizzes(data.quizzes || []);
      setActivities(data.activities || []);
      setLegacySlides(data.legacySlides || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  const submitFreeResponseReview = useCallback(
    async (student: StudentResult, reviewStatus: TeacherReviewStatus) => {
      if (!student.response_id) {
        return;
      }

      setReviewSubmittingId(student.response_id);
      setError(null);

      const feedback =
        (reviewFeedbackDrafts[student.response_id] ?? student.review_feedback ?? "").trim() || null;
      const defaultScore = student.review_status === "accepted" && student.score > 0 ? student.score * 100 : 100;
      const scoreInput = reviewScoreDrafts[student.response_id] ?? String(Math.round(defaultScore));
      const parsedScore = Number.isFinite(Number(scoreInput))
        ? Math.max(0, Math.min(100, Number(scoreInput))) / 100
        : 1;

      try {
        const response = await fetch(
          `/api/teacher/lessons/${lessonId}/task-responses/${student.response_id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              review_status: reviewStatus,
              feedback,
              ...(reviewStatus === "accepted" ? { score: parsedScore } : {}),
            }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.error || "Failed to save review");
          return;
        }

        await fetchResults();
      } catch {
        setError("Failed to save review");
      } finally {
        setReviewSubmittingId(null);
      }
    },
    [fetchResults, lessonId, reviewFeedbackDrafts, reviewScoreDrafts]
  );

  const handleAiGrade = useCallback(
    async (responseIds: string[]) => {
      if (responseIds.length === 0) return;

      const isBatch = responseIds.length > 1;
      if (isBatch) setAiGradingAll(true);
      else setAiGradingId(responseIds[0]);

      setError(null);

      try {
        const response = await fetch(
          `/api/teacher/lessons/${lessonId}/task-responses/ai-grade`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ response_ids: responseIds }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError(data.error || "AI grading failed");
          return;
        }

        const data = await response.json();
        const suggestions = data.suggestions as Array<{
          response_id: string;
          review_status: string;
          feedback: string;
          score: number;
        }>;

        const nextFeedback = { ...reviewFeedbackDrafts };
        const nextScores = { ...reviewScoreDrafts };
        const nextSuggested = new Set(aiSuggestedIds);

        for (const s of suggestions) {
          nextFeedback[s.response_id] = s.feedback;
          nextScores[s.response_id] = String(Math.round(s.score * 100));
          nextSuggested.add(s.response_id);
        }

        setReviewFeedbackDrafts(nextFeedback);
        setReviewScoreDrafts(nextScores);
        setAiSuggestedIds(nextSuggested);
      } catch {
        setError("AI grading failed");
      } finally {
        setAiGradingId(null);
        setAiGradingAll(false);
      }
    },
    [lessonId, reviewFeedbackDrafts, reviewScoreDrafts, aiSuggestedIds]
  );

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const sections = useMemo(
    () =>
      [
        { key: "activities" as const, title: "Activities", items: activities },
        { key: "quizzes" as const, title: "Quiz Questions", items: quizzes },
        { key: "legacySlides" as const, title: "Legacy Slide Interactions", items: legacySlides },
      ].filter((section) => section.items.length > 0),
    [activities, legacySlides, quizzes]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchResults}
          className="mt-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary || sections.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500">No quiz or activity responses yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <SummaryCard label="Students" value={summary.unique_students} />
        <SummaryCard
          label="Quiz Accuracy"
          value={`${summary.quiz_accuracy_percent}%`}
          color={summary.quiz_accuracy_percent >= 70 ? "emerald" : summary.quiz_accuracy_percent >= 40 ? "amber" : "red"}
        />
        <SummaryCard
          label="Activity Completion"
          value={`${summary.activity_completion_percent}%`}
          color={summary.activity_completion_percent >= 70 ? "emerald" : summary.activity_completion_percent >= 40 ? "amber" : "red"}
        />
        <SummaryCard label="Avg Activity Score" value={summary.avg_activity_score.toFixed(2)} />
        <SummaryCard label="Avg Activity Time" value={`${summary.avg_activity_time_seconds}s`} />
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                {section.title}
              </h3>
              <span className="text-xs text-gray-400">{section.items.length} items</span>
            </div>

            {section.items.map((item, index) => {
              const itemKey = `${section.key}:${getItemId(item)}`;
              const isExpanded = expandedKey === itemKey;

              return (
                <div key={itemKey} className="overflow-hidden rounded-xl border border-gray-100">
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : itemKey)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-xs font-medium text-gray-400">#{index + 1}</span>
                      <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                        {getItemBadge(item)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{getPrimaryTitle(item)}</p>
                        <p className="text-xs text-gray-500">{getSecondaryMeta(item)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">{getHeadlineMetric(item)}</span>
                      <svg
                        className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                      <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        {renderDetailChips(item, section.key)}
                      </div>
                      {item.kind === "activity" && item.task_type === "free_response" ? (
                        <FreeResponseReviewList
                          activity={item}
                          reviewSubmittingId={reviewSubmittingId}
                          reviewFeedbackDrafts={reviewFeedbackDrafts}
                          reviewScoreDrafts={reviewScoreDrafts}
                          onFeedbackChange={(responseId, value) => {
                            setReviewFeedbackDrafts((current) => ({
                              ...current,
                              [responseId]: value,
                            }));
                            setAiSuggestedIds((current) => {
                              const next = new Set(current);
                              next.delete(responseId);
                              return next;
                            });
                          }}
                          onScoreChange={(responseId, value) => {
                            setReviewScoreDrafts((current) => ({
                              ...current,
                              [responseId]: value,
                            }));
                            setAiSuggestedIds((current) => {
                              const next = new Set(current);
                              next.delete(responseId);
                              return next;
                            });
                          }}
                          onSubmitReview={submitFreeResponseReview}
                          onAiGrade={(responseId) => void handleAiGrade([responseId])}
                          onAiGradeAll={(responseIds) => void handleAiGrade(responseIds)}
                          aiGradingId={aiGradingId}
                          aiGradingAll={aiGradingAll}
                          aiSuggestedIds={aiSuggestedIds}
                        />
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs uppercase tracking-wider text-gray-500">
                              <th className="pb-2 text-left font-medium">Student</th>
                              <th className="pb-2 text-center font-medium">Status</th>
                              <th className="pb-2 text-center font-medium">Score</th>
                              <th className="pb-2 text-center font-medium">Time</th>
                              <th className="pb-2 text-center font-medium">Attempts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.students.map((student) => (
                              <tr key={`${itemKey}:${student.student_id}`} className="border-t border-gray-100">
                                <td className="py-2 text-gray-700">{student.student_name || "Unknown"}</td>
                                <td className="py-2 text-center">
                                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[student.status]}`}>
                                    {student.status.replace("_", " ")}
                                  </span>
                                </td>
                                <td className="py-2 text-center text-gray-600">{student.score.toFixed(2)}</td>
                                <td className="py-2 text-center text-gray-500">{student.time_spent_seconds}s</td>
                                <td className="py-2 text-center text-gray-500">{student.attempts}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function getItemId(item: QuizResult | ActivityResult | LegacySlideResult) {
  if ("question_id" in item) return item.question_id;
  if ("task_id" in item) return item.task_id;
  return item.slide_id;
}

function getItemBadge(item: QuizResult | ActivityResult | LegacySlideResult) {
  if (item.kind === "quiz_question") {
    return "Quiz";
  }

  if (item.kind === "activity") {
    return ACTIVITY_LABELS[item.task_type] || item.task_type;
  }

  return item.interaction_type;
}

function getPrimaryTitle(item: QuizResult | ActivityResult | LegacySlideResult) {
  if (item.kind === "quiz_question") {
    return item.prompt_en || item.prompt_ar || item.label;
  }

  if (item.kind === "activity") {
    return item.title_en || item.title_ar || item.label;
  }

  return item.title_en || item.title_ar || item.label;
}

function getSecondaryMeta(item: QuizResult | ActivityResult | LegacySlideResult) {
  if (item.kind === "quiz_question") {
    return `${item.total_responses} responses`;
  }

  if (item.kind === "activity") {
    return `${item.required ? "Required" : "Optional"} • ${item.total_responses} responses`;
  }

  return `${item.total_responses} responses`;
}

function getHeadlineMetric(item: QuizResult | ActivityResult | LegacySlideResult) {
  if (item.kind === "quiz_question") {
    return `${Math.round(item.avg_score * 100)}%`;
  }

  if (item.kind === "activity") {
    if (item.task_type === "free_response") {
      return `${item.review_pending_count} pending`;
    }
    return `${item.avg_score.toFixed(2)} score`;
  }

  return `${Math.round(item.avg_score * 100)}%`;
}

function renderDetailChips(item: QuizResult | ActivityResult | LegacySlideResult, sectionKey: SectionKey) {
  if (sectionKey === "activities" && item.kind === "activity") {
    const chips = [
      <DetailChip key="completed" label="Completed" value={item.completed_count} />,
      <DetailChip key="skipped" label="Skipped" value={item.skipped_count} />,
      <DetailChip key="timedOut" label="Timed Out" value={item.timed_out_count} />,
      <DetailChip key="avgTime" label="Avg Time" value={`${item.avg_time_seconds}s`} />,
    ];

    if (item.task_type === "free_response") {
      chips.push(<DetailChip key="pendingReview" label="Pending Review" value={item.review_pending_count} />);
      chips.push(<DetailChip key="accepted" label="Accepted" value={item.accepted_count} />);
      chips.push(<DetailChip key="needsRetry" label="Needs Retry" value={item.needs_retry_count} />);
    }

    return chips;
  }

  if (sectionKey === "quizzes" && item.kind === "quiz_question") {
    return [
      <DetailChip key="correct" label="Correct" value={item.correct_count} />,
      <DetailChip key="responses" label="Responses" value={item.total_responses} />,
    ];
  }

  if (item.kind === "legacy_slide") {
    return [
      <DetailChip key="correct" label="Correct" value={item.correct_count} />,
      <DetailChip key="avgTime" label="Avg Time" value={`${item.avg_time_seconds}s`} />,
    ];
  }

  return [];
}

function DetailChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 font-medium text-gray-600 ring-1 ring-gray-200">
      {label}: {value}
    </span>
  );
}

function FreeResponseReviewList({
  activity,
  reviewSubmittingId,
  reviewFeedbackDrafts,
  reviewScoreDrafts,
  onFeedbackChange,
  onScoreChange,
  onSubmitReview,
  onAiGrade,
  onAiGradeAll,
  aiGradingId,
  aiGradingAll,
  aiSuggestedIds,
}: {
  activity: ActivityResult;
  reviewSubmittingId: string | null;
  reviewFeedbackDrafts: Record<string, string>;
  reviewScoreDrafts: Record<string, string>;
  onFeedbackChange: (responseId: string, value: string) => void;
  onScoreChange: (responseId: string, value: string) => void;
  onSubmitReview: (student: StudentResult, reviewStatus: TeacherReviewStatus) => Promise<void>;
  onAiGrade: (responseId: string) => void;
  onAiGradeAll: (responseIds: string[]) => void;
  aiGradingId: string | null;
  aiGradingAll: boolean;
  aiSuggestedIds: Set<string>;
}) {
  const pendingStudents = activity.students.filter(
    (s) => s.response_id && (!s.review_status || s.review_status === "pending_review")
  );

  return (
    <div className="space-y-4">
      {/* AI Grade All + Model Answer */}
      <div className="flex flex-wrap items-center gap-3">
        {(activity.model_answer_en || activity.model_answer_ar) && (
          <div className="flex-1 min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Model Answer
            </p>
            {activity.model_answer_en && (
              <p className="mt-2 text-sm font-medium text-gray-900">{activity.model_answer_en}</p>
            )}
            {activity.model_answer_ar && (
              <p className="mt-2 text-sm text-gray-700" dir="rtl">
                {activity.model_answer_ar}
              </p>
            )}
          </div>
        )}
        {pendingStudents.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onAiGradeAll(
                pendingStudents
                  .map((s) => s.response_id)
                  .filter((id): id is string => !!id)
              )
            }
            disabled={aiGradingAll}
            className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiGradingAll
              ? `Grading ${pendingStudents.length}...`
              : `AI Grade All (${pendingStudents.length} pending)`}
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {activity.students.map((student) => {
          const responseId = student.response_id || `${activity.task_id}:${student.student_id}`;
          const feedbackValue = reviewFeedbackDrafts[responseId] ?? student.review_feedback ?? "";
          const scoreValue =
            reviewScoreDrafts[responseId] ??
            String(
              Math.round(
                (student.review_status === "accepted" && student.score > 0 ? student.score : 1) * 100
              )
            );
          const isBusy = reviewSubmittingId === student.response_id;

          return (
            <div key={responseId} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">
                      {student.student_name || "Unknown student"}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[student.status]}`}
                    >
                      {student.status.replace("_", " ")}
                    </span>
                    {student.review_status && (
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${REVIEW_STATUS_STYLES[student.review_status]}`}
                      >
                        {student.review_status.replace("_", " ")}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Attempts: {student.attempts} • Time: {student.time_spent_seconds}s
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2 text-right text-xs text-gray-500">
                  <p>Current score</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {Math.round(student.score * 100)}%
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Student Answer
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
                      {student.answer_text || "No written answer was saved for this response."}
                    </p>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Teacher Feedback
                      </label>
                      {aiSuggestedIds.has(responseId) && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">
                          AI suggested
                        </span>
                      )}
                    </div>
                    <textarea
                      value={feedbackValue}
                      onChange={(event) => onFeedbackChange(responseId, event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      placeholder="Add feedback for the student"
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                      Score (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      value={scoreValue}
                      onChange={(event) => onScoreChange(responseId, event.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>

                  <div className="grid gap-2">
                    <button
                      type="button"
                      disabled={!student.response_id || isBusy || aiGradingId === student.response_id}
                      onClick={() => student.response_id && onAiGrade(student.response_id)}
                      className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {aiGradingId === student.response_id ? "Grading..." : "AI Grade"}
                    </button>
                    <button
                      type="button"
                      disabled={!student.response_id || isBusy}
                      onClick={() => void onSubmitReview(student, "accepted")}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBusy ? "Saving..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={!student.response_id || isBusy}
                      onClick={() => void onSubmitReview(student, "needs_retry")}
                      className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Needs Retry
                    </button>
                    <button
                      type="button"
                      disabled={!student.response_id || isBusy}
                      onClick={() => void onSubmitReview(student, "pending_review")}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Mark Pending
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: string | number;
  color?: "gray" | "emerald" | "amber" | "red";
}) {
  const colorClasses = {
    gray: "bg-gray-50 text-gray-900",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${colorClasses[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold">{value}</p>
    </div>
  );
}
