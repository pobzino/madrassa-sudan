/**
 * QuestionDisplay Component
 * Renders a diagnostic question with bilingual support
 */

import React, { useState } from 'react';

// Icons
const CheckCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

interface QuestionDisplayProps {
  question: {
    id: string;
    question_text_ar: string;
    question_text_en?: string;
    question_type: string;
    options: Array<{
      id: string;
      text_ar: string;
      text_en?: string;
    }>;
  };
  onSubmit: (answer: string) => void;
  showFeedback?: boolean;
  isCorrect?: boolean;
  progress?: {
    answered: number;
    correct: number;
  };
}

export function QuestionDisplay({
  question,
  onSubmit,
  showFeedback,
  isCorrect,
  progress,
}: QuestionDisplayProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(true);

  const handleSubmit = () => {
    if (selectedAnswer) {
      onSubmit(selectedAnswer);
      setSelectedAnswer(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
      {/* Progress and Language Toggle */}
      <div className="flex items-center justify-between mb-6">
        {progress && (
          <div className="text-sm text-gray-600 text-gray-500">
            Question {progress.answered + 1}
          </div>
        )}
        <button
          onClick={() => setShowEnglish(!showEnglish)}
          className="text-sm text-[#007229] hover:text-[#005C22] transition-colors"
        >
          {showEnglish ? 'العربية' : 'English'}
        </button>
      </div>

      {/* Question Text */}
      <div className="mb-8">
        <p className="text-xl md:text-2xl font-semibold mb-4" dir="rtl">
          {question.question_text_ar}
        </p>
        {showEnglish && question.question_text_en && (
          <p className="text-lg text-gray-600 text-gray-500">
            {question.question_text_en}
          </p>
        )}
      </div>

      {/* Answer Options */}
      <div className="space-y-3 mb-6">
        {question.options?.map((option) => (
          <button
            key={option.id}
            onClick={() => !showFeedback && setSelectedAnswer(option.id)}
            disabled={showFeedback}
            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
              selectedAnswer === option.id
                ? 'border-[#007229] bg-[#007229]/5'
                : 'border-gray-200 hover:border-[#007229]/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedAnswer === option.id
                    ? 'border-[#007229] bg-[#007229]'
                    : 'border-gray-300'
                }`}
              >
                {selectedAnswer === option.id && (
                  <div className="w-2 h-2 bg-white rounded-full" />
                )}
              </div>
              <div className="flex-1">
                <p dir="rtl">{option.text_ar}</p>
                {showEnglish && option.text_en && (
                  <p className="text-sm text-gray-600 text-gray-500">
                    {option.text_en}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Feedback */}
      {showFeedback && (
        <div
          className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${
            isCorrect
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {isCorrect ? (
            <>
              <div className="w-6 h-6">
                <CheckCircleIcon />
              </div>
              <span className="font-semibold">Correct! Great job!</span>
            </>
          ) : (
            <>
              <div className="w-6 h-6">
                <XCircleIcon />
              </div>
              <span className="font-semibold">Not quite. Keep trying!</span>
            </>
          )}
        </div>
      )}

      {/* Submit Button */}
      {!showFeedback && (
        <button
          onClick={handleSubmit}
          disabled={!selectedAnswer}
          className="w-full py-4 bg-[#007229] hover:bg-[#005C22] disabled:bg-gray-300
                   disabled:cursor-not-allowed text-white font-semibold rounded-xl
                   transition-colors"
        >
          Submit Answer
        </button>
      )}
    </div>
  );
}
