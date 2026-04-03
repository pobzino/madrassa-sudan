"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface StudentResult {
  student_id: string;
  student_name: string | null;
  status: "correct" | "incorrect" | "completed" | "skipped" | "timed_out";
  score: number;
  time_spent_seconds: number;
  attempts: number;
  completed_at: string;
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
  avg_score: number;
  avg_time_seconds: number;
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

type SectionKey = "activities" | "quizzes" | "legacySlides";

export default function InteractionResultsPanel({ lessonId }: Props) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quizzes, setQuizzes] = useState<QuizResult[]>([]);
  const [activities, setActivities] = useState<ActivityResult[]>([]);
  const [legacySlides, setLegacySlides] = useState<LegacySlideResult[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return `${item.avg_score.toFixed(2)} score`;
  }

  return `${Math.round(item.avg_score * 100)}%`;
}

function renderDetailChips(item: QuizResult | ActivityResult | LegacySlideResult, sectionKey: SectionKey) {
  if (sectionKey === "activities" && item.kind === "activity") {
    return [
      <DetailChip key="completed" label="Completed" value={item.completed_count} />,
      <DetailChip key="skipped" label="Skipped" value={item.skipped_count} />,
      <DetailChip key="timedOut" label="Timed Out" value={item.timed_out_count} />,
      <DetailChip key="avgTime" label="Avg Time" value={`${item.avg_time_seconds}s`} />,
    ];
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
