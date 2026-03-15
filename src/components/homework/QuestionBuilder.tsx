"use client";

import { useState } from "react";
import type { CreateQuestionInput, RubricCriterion } from "@/lib/homework.types";

type QuestionType = CreateQuestionInput["question_type"];

interface QuestionBuilderProps {
  question: CreateQuestionInput;
  index: number;
  onUpdate: (updates: Partial<CreateQuestionInput>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}

const questionTypeLabels: Record<QuestionType, { ar: string; en: string; icon: string }> = {
  multiple_choice: { ar: "اختيار من متعدد", en: "Multiple Choice", icon: "🔘" },
  short_answer: { ar: "إجابة قصيرة", en: "Short Answer", icon: "📝" },
  long_answer: { ar: "إجابة طويلة", en: "Long Answer", icon: "📄" },
  file_upload: { ar: "رفع ملف", en: "File Upload", icon: "📎" },
  true_false: { ar: "صح/خطأ", en: "True/False", icon: "✓/✗" },
};

export function QuestionBuilder({
  question,
  index,
  onUpdate,
  onRemove,
  onDuplicate,
}: QuestionBuilderProps) {
  const [showRubric, setShowRubric] = useState(false);
  const [newOption, setNewOption] = useState("");

  const handleAddOption = () => {
    if (newOption.trim()) {
      const newOptions = [...(question.options || []), newOption.trim()];
      onUpdate({ options: newOptions });
      setNewOption("");
    }
  };

  const handleRemoveOption = (optionIndex: number) => {
    const newOptions = (question.options || []).filter((_, i) => i !== optionIndex);
    onUpdate({ options: newOptions });
  };

  const handleAddRubricCriterion = () => {
    const newCriterion: RubricCriterion = {
      criterion: "",
      description: "",
      points: 0,
    };
    onUpdate({
      rubric: [...(question.rubric || []), newCriterion],
    });
  };

  const handleUpdateRubricCriterion = (
    criterionIndex: number,
    field: keyof RubricCriterion,
    value: string | number
  ) => {
    const newRubric = (question.rubric || []).map((c, i) =>
      i === criterionIndex ? { ...c, [field]: value } : c
    );
    onUpdate({ rubric: newRubric });
  };

  const handleRemoveRubricCriterion = (criterionIndex: number) => {
    const newRubric = (question.rubric || []).filter((_, i) => i !== criterionIndex);
    onUpdate({ rubric: newRubric });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-semibold text-sm">
            {index + 1}
          </span>
          <select
            value={question.question_type}
            onChange={(e) => onUpdate({ question_type: e.target.value as QuestionType })}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {Object.entries(questionTypeLabels).map(([type, labels]) => (
              <option key={type} value={type}>
                {labels.icon} {labels.en}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Duplicate question"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Remove question"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Question Text */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Question (Arabic) *
          </label>
          <textarea
            value={question.question_text_ar}
            onChange={(e) => onUpdate({ question_text_ar: e.target.value })}
            placeholder="أدخل السؤال بالعربية"
            dir="rtl"
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Question (English)
          </label>
          <textarea
            value={question.question_text_en || ""}
            onChange={(e) => onUpdate({ question_text_en: e.target.value })}
            placeholder="Enter question in English"
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Question-specific fields */}
      {question.question_type === "multiple_choice" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Options
          </label>
          <div className="space-y-2">
            {(question.options || []).map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${index}`}
                  checked={question.correct_answer === option}
                  onChange={() => onUpdate({ correct_answer: option })}
                  className="text-emerald-600"
                />
                <input
                  type="text"
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...(question.options || [])];
                    newOptions[i] = e.target.value;
                    onUpdate({ options: newOptions });
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  onClick={() => handleRemoveOption(i)}
                  className="p-1 text-gray-400 hover:text-red-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddOption();
                  }
                }}
                placeholder="Add new option..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <button
                onClick={handleAddOption}
                className="px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-200"
              >
                Add
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Select the radio button next to the correct answer
          </p>
        </div>
      )}

      {question.question_type === "true_false" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Correct Answer
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onUpdate({ correct_answer: "true" })}
              className={`px-4 py-2 rounded-lg border-2 font-medium ${
                question.correct_answer === "true"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              True / صح
            </button>
            <button
              type="button"
              onClick={() => onUpdate({ correct_answer: "false" })}
              className={`px-4 py-2 rounded-lg border-2 font-medium ${
                question.correct_answer === "false"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              False / خطأ
            </button>
          </div>
        </div>
      )}

      {(question.question_type === "short_answer" || question.question_type === "long_answer") && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Correct Answer (for reference - not shown to students)
          </label>
          <input
            type="text"
            value={question.correct_answer || ""}
            onChange={(e) => onUpdate({ correct_answer: e.target.value })}
            placeholder="Enter correct answer for auto-grading"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Optional. Leave blank for manual grading.
          </p>
        </div>
      )}

      {question.question_type === "file_upload" && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Instructions for Students
          </label>
          <input
            type="text"
            value={question.instructions || ""}
            onChange={(e) => onUpdate({ instructions: e.target.value })}
            placeholder="e.g., Upload a photo of your handwritten work"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
      )}

      {/* Points */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Points
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={question.points}
              onChange={(e) => onUpdate({ points: parseInt(e.target.value) || 0 })}
              min="1"
              max="100"
              className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
            />
            <button
              onClick={() => setShowRubric(!showRubric)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showRubric || question.rubric?.length
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {showRubric || question.rubric?.length ? "Hide Rubric" : "Add Rubric"}
            </button>
          </div>
        </div>
      </div>

      {/* Rubric */}
      {(showRubric || question.rubric?.length) && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Grading Rubric</h4>
          <div className="space-y-3">
            {(question.rubric || []).map((criterion, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <div className="grid md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={criterion.criterion}
                    onChange={(e) =>
                      handleUpdateRubricCriterion(i, "criterion", e.target.value)
                    }
                    placeholder="Criterion (e.g., Accuracy)"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    value={criterion.description}
                    onChange={(e) =>
                      handleUpdateRubricCriterion(i, "description", e.target.value)
                    }
                    placeholder="Description"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={criterion.points}
                      onChange={(e) =>
                        handleUpdateRubricCriterion(
                          i,
                          "points",
                          parseInt(e.target.value) || 0
                        )
                      }
                      placeholder="Points"
                      className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center"
                    />
                    <button
                      onClick={() => handleRemoveRubricCriterion(i)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            <button
              onClick={handleAddRubricCriterion}
              className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 text-sm font-medium hover:border-emerald-300 hover:text-emerald-600"
            >
              + Add Criterion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
