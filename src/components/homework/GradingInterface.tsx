"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { RubricCriterion } from "@/lib/homework.types";

interface GradingQuestion {
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
}

interface GradingInterfaceProps {
  questions: GradingQuestion[];
  onGrade: (grades: { response_id: string; points: number; comment: string }[]) => void;
  onNavigate?: (direction: "prev" | "next") => void;
  onSaveDraft?: (questionId: string, points: number, comment: string) => void;
  isSaving?: boolean;
  overallFeedback?: string | null;
  onOverallFeedbackChange?: (feedback: string) => void;
}

export function GradingInterface({
  questions,
  onGrade,
  onNavigate,
  onSaveDraft,
  isSaving,
  overallFeedback = "",
  onOverallFeedbackChange,
}: GradingInterfaceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [grades, setGrades] = useState<
    Record<
      string,
      {
        points: number;
        comment: string;
      }
    >
  >({});

  const initialGrades = useMemo(() => {
    const initialGrades: Record<string, { points: number; comment: string }> = {};
    questions.forEach((q) => {
      if (q.response_id) {
        initialGrades[q.response_id] = {
          points: q.points_earned ?? 0,
          comment: q.teacher_comment ?? "",
        };
      }
    });
    return initialGrades;
  }, [questions]);

  // Reset local grading state when a different submission/question set loads.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setGrades(initialGrades);
    }, 0);

    return () => clearTimeout(timeout);
  }, [initialGrades]);

  const currentQuestion = questions[currentIndex];
  const currentGrade = currentQuestion?.response_id
    ? grades[currentQuestion.response_id]
    : { points: 0, comment: "" };

  const updateGrade = useCallback(
    (responseId: string, updates: { points?: number; comment?: string }) => {
      setGrades((prev) => {
        const nextGrade = {
          ...prev[responseId],
          ...updates,
        };
        const nextGrades = {
          ...prev,
          [responseId]: nextGrade,
        };

        if (onSaveDraft) {
          onSaveDraft(responseId, nextGrade.points ?? 0, nextGrade.comment ?? "");
        }

        return nextGrades;
      });
    },
    [onSaveDraft]
  );

  const handleSubmitGrades = () => {
    const gradesToSubmit = Object.entries(grades).map(([responseId, grade]) => ({
      response_id: responseId,
      points: grade.points,
      comment: grade.comment,
    }));
    onGrade(gradesToSubmit);
  };

  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
  const earnedPoints = Object.values(grades).reduce((sum, g) => sum + (g?.points || 0), 0);
  const progress = ((currentIndex + 1) / questions.length) * 100;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        // Allow Enter to move to next question from comment field
        if (e.key === "Enter" && e.metaKey) {
          e.preventDefault();
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((prev) => prev + 1);
          }
        }
        return;
      }

      switch (e.key) {
        case "n":
        case "ArrowRight":
          e.preventDefault();
          if (currentIndex < questions.length - 1) {
            setCurrentIndex((prev) => prev + 1);
          } else {
            onNavigate?.("next");
          }
          break;
        case "p":
        case "ArrowLeft":
          e.preventDefault();
          if (currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
          } else {
            onNavigate?.("prev");
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          if (currentQuestion?.response_id) {
            const num = parseInt(e.key);
            const points = Math.min(num, currentQuestion.points);
            updateGrade(currentQuestion.response_id, { points });
          }
          break;
        case "0":
          if (currentQuestion?.response_id) {
            updateGrade(currentQuestion.response_id, { points: 0 });
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, questions.length, currentQuestion, onNavigate, updateGrade]);

  if (!currentQuestion) {
    return <div className="text-center py-8 text-gray-500">No questions to grade</div>;
  }

  const isCorrect =
    currentQuestion.correct_answer &&
    currentQuestion.response_text === currentQuestion.correct_answer;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-600">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="text-sm font-medium text-emerald-600">
            Total: {earnedPoints}/{totalPoints} points
          </span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Quick navigation dots */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-2">
          {questions.map((q, i) => {
            const grade = q.response_id ? grades[q.response_id] : null;
            const isGraded = grade && grade.points > 0;
            const isFullyGraded = grade && grade.points === q.points;

            return (
              <button
                key={q.question_id}
                onClick={() => setCurrentIndex(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all flex-shrink-0 ${
                  i === currentIndex
                    ? "bg-emerald-500 text-white"
                    : isFullyGraded
                    ? "bg-emerald-100 text-emerald-700"
                    : isGraded
                    ? "bg-amber-100 text-amber-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Question card */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Question and expected answer */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">Question</span>
            <span className="text-sm font-medium text-emerald-600">
              {currentQuestion.points} points
            </span>
          </div>

          <p className="text-lg font-medium text-gray-900 mb-2">
            {currentQuestion.question_text_ar}
          </p>
          {currentQuestion.question_text_en && (
            <p className="text-gray-600 mb-4">{currentQuestion.question_text_en}</p>
          )}

          {currentQuestion.correct_answer && (
            <div className="mt-4 p-4 bg-emerald-50 rounded-lg">
              <p className="text-sm font-medium text-emerald-800 mb-1">Correct Answer:</p>
              <p className="text-emerald-700">{currentQuestion.correct_answer}</p>
            </div>
          )}

          {currentQuestion.rubric && currentQuestion.rubric.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Rubric:</h4>
              <div className="space-y-2">
                {currentQuestion.rubric.map((criterion, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                  >
                    <span>{criterion.criterion}: {criterion.description}</span>
                    <span className="font-medium text-gray-600">{criterion.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Student answer and grading */}
        <div className="space-y-4">
          {/* Student response */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-gray-500">Student Answer</span>
              {isCorrect && (
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
                  ✓ Correct
                </span>
              )}
              {!isCorrect && currentQuestion.correct_answer && currentQuestion.response_text && (
                <span className="px-2 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                  ✗ Incorrect
                </span>
              )}
            </div>

            {currentQuestion.response_text ? (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-900 whitespace-pre-wrap">{currentQuestion.response_text}</p>
              </div>
            ) : currentQuestion.response_file_urls && currentQuestion.response_file_urls.length > 0 ? (
              <div className="space-y-2">
                {currentQuestion.response_file_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="text-sm text-gray-600">File {i + 1}</span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 italic">No answer provided</p>
            )}
          </div>

          {/* Grading controls */}
          {currentQuestion.response_id && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Points (0-{currentQuestion.points})
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={currentGrade?.points ?? 0}
                      onChange={(e) =>
                        updateGrade(currentQuestion.response_id!, {
                          points: Math.min(
                            Math.max(parseInt(e.target.value) || 0, 0),
                            currentQuestion.points
                          ),
                        })
                      }
                      min={0}
                      max={currentQuestion.points}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-center text-lg font-medium"
                    />
                    <div className="flex-1">
                      <input
                        type="range"
                        value={currentGrade?.points ?? 0}
                        onChange={(e) =>
                          updateGrade(currentQuestion.response_id!, {
                            points: parseInt(e.target.value),
                          })
                        }
                        min={0}
                        max={currentQuestion.points}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comment (optional)
                  </label>
                  <textarea
                    value={currentGrade?.comment ?? ""}
                    onChange={(e) =>
                      updateGrade(currentQuestion.response_id!, {
                        comment: e.target.value,
                      })
                    }
                    placeholder="Add feedback for this question..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />

                  {/* Quick feedback buttons */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      "Great work!",
                      "Good effort",
                      "Check your work",
                      "Needs improvement",
                      "Excellent!",
                    ].map((feedback) => (
                      <button
                        key={feedback}
                        type="button"
                        onClick={() =>
                          updateGrade(currentQuestion.response_id!, {
                            comment: feedback,
                          })
                        }
                        className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm hover:bg-gray-200 transition-colors"
                      >
                        {feedback}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Overall feedback */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Overall Feedback
        </label>
        <textarea
          value={overallFeedback || ""}
          onChange={(e) => onOverallFeedbackChange?.(e.target.value)}
          placeholder="Add overall feedback for the student..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {/* Navigation and submit */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (currentIndex > 0) {
              setCurrentIndex((prev) => prev - 1);
            } else {
              onNavigate?.("prev");
            }
          }}
          disabled={isSaving}
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          ← Previous (P)
        </button>

        <div className="text-center">
          <p className="text-sm text-gray-500">Use 0-9 for quick scoring, N/P to navigate</p>
        </div>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((prev) => prev + 1)}
            className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Next (N) →
          </button>
        ) : (
          <button
            onClick={handleSubmitGrades}
            disabled={isSaving}
            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : "Submit Grades"}
          </button>
        )}
      </div>
    </div>
  );
}
