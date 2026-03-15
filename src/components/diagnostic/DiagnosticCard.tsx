/**
 * DiagnosticCard Component
 * Card showing assessment status for a subject
 */

import React from 'react';

// Icons
const BookOpenIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlayCircleIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const RotateCcwIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface DiagnosticCardProps {
  subject: {
    id: string;
    name: string;
    name_ar?: string;
    description?: string;
  };
  placement?: {
    placed_grade: number;
    confidence: 'high' | 'medium' | 'low';
    placed_at: string;
  } | null;
  hasIncompleteAttempt?: boolean;
  onStart: () => void;
  onContinue?: () => void;
  onRetake?: () => void;
}

export function DiagnosticCard({
  subject,
  placement,
  hasIncompleteAttempt,
  onStart,
  onContinue,
  onRetake,
}: DiagnosticCardProps) {
  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'text-green-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-orange-500';
      default:
        return 'text-gray-500';
    }
  };

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'High Confidence';
      case 'medium':
        return 'Medium Confidence';
      case 'low':
        return 'Low Confidence';
      default:
        return '';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 text-blue-600 dark:text-blue-400">
              <BookOpenIcon />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-lg">{subject.name}</h3>
            {subject.name_ar && (
              <p className="text-sm text-gray-600 dark:text-gray-400" dir="rtl">
                {subject.name_ar}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {placement ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 text-green-500">
                  <CheckCircleIcon />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Completed</span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-lg">Grade {placement.placed_grade}</p>
                <p className={`text-sm ${getConfidenceColor(placement.confidence)}`}>
                  {getConfidenceLabel(placement.confidence)}
                </p>
              </div>
            </>
          ) : hasIncompleteAttempt ? (
            <div className="flex items-center gap-2 text-yellow-600">
              <div className="w-5 h-5">
                <PlayCircleIcon />
              </div>
              <span className="text-sm">In Progress</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <span className="text-sm">Not Started</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        {placement ? (
          <button
            onClick={onRetake}
            className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                     text-gray-700 dark:text-gray-300 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <div className="w-4 h-4">
              <RotateCcwIcon />
            </div>
            Retake Assessment
          </button>
        ) : hasIncompleteAttempt ? (
          <button
            onClick={onContinue}
            className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg
                     transition-colors flex items-center justify-center gap-2"
          >
            <div className="w-4 h-4">
              <PlayCircleIcon />
            </div>
            Continue Assessment
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white rounded-lg
                     transition-colors flex items-center justify-center gap-2"
          >
            <div className="w-4 h-4">
              <PlayCircleIcon />
            </div>
            Start Assessment
          </button>
        )}
      </div>
    </div>
  );
}
