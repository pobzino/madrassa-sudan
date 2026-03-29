"use client";

import { useCallback, useEffect, useState } from "react";

interface StudentResult {
  student_id: string;
  student_name: string | null;
  is_correct: boolean;
  time_spent_seconds: number;
  attempts: number;
  completed_at: string;
}

interface SlideResult {
  slide_id: string;
  interaction_type: string;
  total_attempts: number;
  correct_count: number;
  total_time_seconds: number;
  students: StudentResult[];
}

interface Summary {
  total_interactions: number;
  total_correct: number;
  accuracy_percent: number;
  avg_time_seconds: number;
  unique_students: number;
}

interface Props {
  lessonId: string;
}

const TYPE_LABELS: Record<string, string> = {
  choose_correct: "Multiple Choice",
  true_false: "True / False",
  tap_to_count: "Tap to Count",
};

export default function InteractionResultsPanel({ lessonId }: Props) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [slides, setSlides] = useState<SlideResult[]>([]);
  const [expandedSlide, setExpandedSlide] = useState<string | null>(null);
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
      setSlides(data.slides || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchResults}
          className="mt-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!summary || summary.total_interactions === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500">No interaction responses yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Responses"
          value={summary.total_interactions}
        />
        <SummaryCard
          label="Accuracy"
          value={`${summary.accuracy_percent}%`}
          color={summary.accuracy_percent >= 70 ? "emerald" : summary.accuracy_percent >= 40 ? "amber" : "red"}
        />
        <SummaryCard
          label="Avg Time"
          value={`${summary.avg_time_seconds}s`}
        />
        <SummaryCard
          label="Students"
          value={summary.unique_students}
        />
      </div>

      {/* Per-slide breakdown */}
      <div className="space-y-2">
        {slides.map((slide, index) => {
          const accuracy = slide.total_attempts > 0
            ? Math.round((slide.correct_count / slide.total_attempts) * 100)
            : 0;
          const isExpanded = expandedSlide === slide.slide_id;

          return (
            <div key={slide.slide_id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedSlide(isExpanded ? null : slide.slide_id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-400 w-6">#{index + 1}</span>
                  <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-600">
                    {TYPE_LABELS[slide.interaction_type] || slide.interaction_type}
                  </span>
                  <span className="text-sm text-gray-700">
                    {slide.total_attempts} response{slide.total_attempts !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${
                    accuracy >= 70 ? "text-emerald-600" : accuracy >= 40 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {accuracy}%
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && slide.students.length > 0 && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-wider">
                        <th className="text-left pb-2 font-medium">Student</th>
                        <th className="text-center pb-2 font-medium">Result</th>
                        <th className="text-center pb-2 font-medium">Time</th>
                        <th className="text-center pb-2 font-medium">Attempts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slide.students.map((student) => (
                        <tr key={student.student_id} className="border-t border-gray-100">
                          <td className="py-2 text-gray-700">
                            {student.student_name || "Unknown"}
                          </td>
                          <td className="py-2 text-center">
                            {student.is_correct ? (
                              <span className="inline-block w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 text-xs leading-5 text-center font-bold">
                                ✓
                              </span>
                            ) : (
                              <span className="inline-block w-5 h-5 rounded-full bg-red-100 text-red-600 text-xs leading-5 text-center font-bold">
                                ✗
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-center text-gray-500">
                            {student.time_spent_seconds}s
                          </td>
                          <td className="py-2 text-center text-gray-500">
                            {student.attempts}
                          </td>
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
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
