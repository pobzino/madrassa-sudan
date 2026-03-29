/**
 * ResultsDisplay Component
 * Shows placement results with encouraging messaging
 */

import React from 'react';

// Icons
const TrophyIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const TargetIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BookOpenIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
  </svg>
);

const RotateCcwIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface ResultsDisplayProps {
  placement: {
    grade: number;
    confidence: 'high' | 'medium' | 'low';
    questionsAnswered: number;
    questionsCorrect: number;
    accuracy: number;
  };
  subjectName: string;
  recommendedLessons: Array<{
    id: string;
    title: string;
    title_ar?: string;
    description?: string;
  }>;
  onStartLearning: () => void;
  onRetake: () => void;
}

export function ResultsDisplay({
  placement,
  subjectName,
  recommendedLessons,
  onStartLearning,
  onRetake,
}: ResultsDisplayProps) {
  const getConfidenceMessage = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return 'We are very confident this is the right level for you!';
      case 'medium':
        return 'This looks like a good starting point for you.';
      case 'low':
        return 'We recommend starting here and adjusting as you learn.';
      default:
        return '';
    }
  };

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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-yellow-100 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <div className="w-10 h-10 text-yellow-600 text-yellow-500">
            <TrophyIcon />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-2">Assessment Complete!</h1>
        <p className="text-gray-600 text-gray-500">
          Great job completing the {subjectName} assessment
        </p>
      </div>

      {/* Results Card */}
      <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
        <div className="text-center mb-6">
          <p className="text-sm text-gray-600 text-gray-500 mb-2">Recommended Grade Level</p>
          <div className="text-6xl font-bold text-[#007229] mb-2">
            {placement.grade}
          </div>
          <p className={`font-medium ${getConfidenceColor(placement.confidence)}`}>
            {placement.confidence.charAt(0).toUpperCase() + placement.confidence.slice(1)} Confidence
          </p>
          <p className="text-sm text-gray-600 text-gray-500 mt-2">
            {getConfidenceMessage(placement.confidence)}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 py-6 border-t border-b border-gray-200 border-gray-200">
          <div className="text-center">
            <p className="text-2xl font-bold">{placement.questionsAnswered}</p>
            <p className="text-sm text-gray-600 text-gray-500">Questions</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{placement.questionsCorrect}</p>
            <p className="text-sm text-gray-600 text-gray-500">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{placement.accuracy}%</p>
            <p className="text-sm text-gray-600 text-gray-500">Accuracy</p>
          </div>
        </div>
      </div>

      {/* Recommended Lessons */}
      {recommendedLessons.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-5 h-5 text-[#007229]">
              <TargetIcon />
            </div>
            <h2 className="font-semibold text-lg">Recommended Lessons</h2>
          </div>
          
          <div className="space-y-3">
            {recommendedLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl"
              >
                <div className="w-5 h-5 text-gray-400 mt-0.5">
                  <BookOpenIcon />
                </div>
                <div>
                  <p className="font-medium">{lesson.title}</p>
                  {lesson.title_ar && (
                    <p className="text-sm text-gray-600 text-gray-500" dir="rtl">
                      {lesson.title_ar}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={onRetake}
          className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200
                   text-gray-700 rounded-xl
                   transition-colors flex items-center justify-center gap-2"
        >
          <div className="w-4 h-4">
            <RotateCcwIcon />
          </div>
          Retake Assessment
        </button>
        <button
          onClick={onStartLearning}
          className="flex-1 py-3 px-4 bg-[#007229] hover:bg-[#005C22] text-white rounded-xl
                   transition-colors flex items-center justify-center gap-2 font-semibold shadow-lg shadow-[#007229]/20"
        >
          Start Learning
          <div className="w-4 h-4">
            <ArrowRightIcon />
          </div>
        </button>
      </div>
    </div>
  );
}
