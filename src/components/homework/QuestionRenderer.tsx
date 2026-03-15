"use client";

import { useState, useRef } from "react";
import type { HomeworkQuestion } from "@/lib/homework.types";

interface QuestionRendererProps {
  question: HomeworkQuestion;
  value: string | string[];
  fileUrls?: string[];
  onChange: (value: string) => void;
  onFileUpload?: (urls: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  isGraded?: boolean;
  pointsEarned?: number | null;
  maxPoints?: number;
  teacherComment?: string | null;
}

export function QuestionRenderer({
  question,
  value,
  fileUrls = [],
  onChange,
  onFileUpload,
  disabled = false,
  readOnly = false,
  isGraded = false,
  pointsEarned,
  maxPoints,
  teacherComment,
}: QuestionRendererProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // In a real implementation, this would upload files
    // For now, we just trigger the file input
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onFileUpload) {
      // In a real implementation, upload files to storage
      // For now, create placeholder URLs
      const urls = Array.from(files).map(
        (file) => URL.createObjectURL(file)
      );
      onFileUpload([...(fileUrls || []), ...urls]);
    }
  };

  const isCorrect =
    isGraded &&
    pointsEarned !== null &&
    pointsEarned !== undefined &&
    pointsEarned > 0 &&
    maxPoints !== undefined &&
    pointsEarned === maxPoints;

  const isPartial =
    isGraded &&
    pointsEarned !== null &&
    pointsEarned !== undefined &&
    pointsEarned > 0 &&
    maxPoints !== undefined &&
    pointsEarned < maxPoints;

  const isIncorrect =
    isGraded && (pointsEarned === null || pointsEarned === 0);

  const renderQuestionType = () => {
    switch (question.question_type) {
      case "multiple_choice":
        return (
          <div className="space-y-3">
            {(question.options as string[] || []).map((option, index) => {
              const isSelected = value === option;
              const isCorrectOption = option === question.correct_answer;

              let buttonClass =
                "w-full p-4 rounded-xl border text-left transition-all ";

              if (isGraded) {
                if (isCorrectOption) {
                  buttonClass +=
                    "bg-emerald-100 border-emerald-500 text-emerald-800 ";
                } else if (isSelected) {
                  buttonClass +=
                    "bg-red-100 border-red-500 text-red-800 ";
                } else {
                  buttonClass +=
                    "bg-gray-50 border-gray-200 text-gray-600 ";
                }
              } else {
                if (isSelected) {
                  buttonClass +=
                    "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 ";
                } else {
                  buttonClass +=
                    "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 ";
                }
              }

              return (
                <button
                  key={index}
                  type="button"
                  disabled={disabled || readOnly}
                  onClick={() => onChange(option)}
                  className={buttonClass}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isGraded
                          ? isCorrectOption
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : isSelected
                            ? "border-red-500 bg-red-500 text-white"
                            : "border-gray-300"
                          : isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {isGraded ? (
                        isCorrectOption ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : isSelected ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : null
                      ) : null}
                    </span>
                    <span className={isSelected ? "font-medium" : ""}>{option}</span>
                  </div>
                </button>
              );
            })}
          </div>
        );

      case "true_false":
        return (
          <div className="flex gap-4">
            {["true", "false"].map((option) => {
              const isSelected = value === option;
              const isCorrectOption = option === question.correct_answer;

              let buttonClass =
                "flex-1 px-6 py-4 rounded-xl border-2 font-medium transition-all ";

              if (isGraded) {
                if (isCorrectOption) {
                  buttonClass +=
                    "border-emerald-500 bg-emerald-50 text-emerald-700 ";
                } else if (isSelected) {
                  buttonClass +=
                    "border-red-500 bg-red-50 text-red-700 ";
                } else {
                  buttonClass +=
                    "border-gray-200 bg-white text-gray-600 ";
                }
              } else {
                if (isSelected) {
                  buttonClass +=
                    "border-emerald-500 bg-emerald-50 text-emerald-700 ";
                } else {
                  buttonClass +=
                    "border-gray-200 bg-white text-gray-600 hover:border-gray-300 ";
                }
              }

              return (
                <button
                  key={option}
                  type="button"
                  disabled={disabled || readOnly}
                  onClick={() => onChange(option)}
                  className={buttonClass}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isGraded && isCorrectOption && (
                      <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {isGraded && isSelected && !isCorrectOption && (
                      <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                    <span>{option === "true" ? "True / صح" : "False / خطأ"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        );

      case "short_answer":
        return (
          <div className="space-y-3">
            <input
              type="text"
              value={(value as string) || ""}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled || readOnly}
              placeholder="Type your answer here..."
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all ${
                isGraded
                  ? isCorrect
                    ? "border-emerald-500 bg-emerald-50 focus:ring-emerald-500"
                    : isPartial
                    ? "border-amber-500 bg-amber-50 focus:ring-amber-500"
                    : "border-red-500 bg-red-50 focus:ring-red-500"
                  : "border-gray-200 focus:ring-emerald-500 focus:border-emerald-500"
              } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
            />
            {isGraded && question.correct_answer && (
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-sm text-emerald-800">
                  <span className="font-medium">Correct answer:</span> {question.correct_answer}
                </p>
              </div>
            )}
          </div>
        );

      case "long_answer":
        return (
          <div className="space-y-3">
            <textarea
              value={(value as string) || ""}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled || readOnly}
              placeholder="Type your answer here..."
              rows={6}
              className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all resize-none ${
                isGraded
                  ? isCorrect
                    ? "border-emerald-500 bg-emerald-50 focus:ring-emerald-500"
                    : isPartial
                    ? "border-amber-500 bg-amber-50 focus:ring-amber-500"
                    : "border-red-500 bg-red-50 focus:ring-red-500"
                  : "border-gray-200 focus:ring-emerald-500 focus:border-emerald-500"
              } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
            />
            {!disabled && !readOnly && (
              <p className="text-xs text-gray-500 text-right">
                {(value as string)?.length || 0} characters
              </p>
            )}
          </div>
        );

      case "file_upload":
        return (
          <div className="space-y-3">
            {question.instructions && (
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                📎 {question.instructions}
              </p>
            )}

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                isDragging
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-gray-300 hover:border-gray-400"
              } ${disabled ? "bg-gray-50 cursor-not-allowed" : "cursor-pointer"}`}
              onClick={() => !disabled && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled}
                accept="image/*,.pdf,.doc,.docx"
              />
              <div className="flex flex-col items-center gap-2">
                <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-600 font-medium">
                  {isDragging ? "Drop files here" : "Click or drag files to upload"}
                </p>
                <p className="text-gray-400 text-sm">
                  Supports images, PDFs, and documents
                </p>
              </div>
            </div>

            {fileUrls.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700">Uploaded files:</h4>
                <div className="flex flex-wrap gap-2">
                  {fileUrls.map((url, index) => (
                    <div
                      key={index}
                      className="relative group bg-gray-100 rounded-lg overflow-hidden"
                    >
                      {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <img
                          src={url}
                          alt={`Uploaded file ${index + 1}`}
                          className="w-24 h-24 object-cover"
                        />
                      ) : (
                        <div className="w-24 h-24 flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onFileUpload?.(fileUrls.filter((_, i) => i !== index));
                          }}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-red-500">Unknown question type</p>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Question text */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-gray-900">
          {question.question_text_ar}
        </h3>
        {question.question_text_en && (
          <p className="text-gray-600">{question.question_text_en}</p>
        )}
      </div>

      {/* Points indicator */}
      {maxPoints !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{maxPoints} points</span>
          {isGraded && pointsEarned !== null && (
            <span
              className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                isCorrect
                  ? "bg-emerald-100 text-emerald-700"
                  : isPartial
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {pointsEarned}/{maxPoints} points
            </span>
          )}
        </div>
      )}

      {/* Answer input */}
      {renderQuestionType()}

      {/* Teacher comment */}
      {isGraded && teacherComment && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <div>
              <p className="font-medium text-amber-800">Teacher Feedback</p>
              <p className="text-amber-700 mt-1">{teacherComment}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
