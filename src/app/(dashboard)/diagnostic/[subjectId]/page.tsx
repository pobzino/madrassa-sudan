/**
 * Diagnostic Assessment Page
 * Full-screen assessment experience for a subject
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { QuestionDisplay } from '@/components/diagnostic/QuestionDisplay';
import { createClient } from '@/lib/supabase/client';

// Icons
const ChevronLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const Loader2Icon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

interface Question {
  id: string;
  question_text_ar: string;
  question_text_en?: string;
  question_type: string;
  options: Array<{
    id: string;
    text_ar: string;
    text_en?: string;
  }>;
  grade_level: number;
  difficulty: number;
}

export default function DiagnosticAssessmentPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const subjectId = params.subjectId as string;
  const isRetake = searchParams.get('retake') === 'true';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<Question | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ answered: 0, correct: 0 });
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  const startAssessment = useCallback(async () => {
    try {
      const response = await fetch('/api/diagnostic/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          studentGrade: 3, // Default starting grade
          retake: isRetake,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAttemptId(data.attemptId);
        setQuestion(data.question);
        setProgress(data.progress);
      } else {
        console.error('Failed to start assessment');
      }
    } catch (error) {
      console.error('Error starting assessment:', error);
    } finally {
      setLoading(false);
    }
  }, [isRetake, subjectId]);

  useEffect(() => {
    async function loadSubjectName() {
      const { data } = await supabase
        .from('subjects')
        .select('name_ar, name_en')
        .eq('id', subjectId)
        .single();

      setSubjectName(data?.name_en || data?.name_ar || 'Subject');
    }

    void loadSubjectName();
    void startAssessment();
  }, [startAssessment, subjectId, supabase]);

  const handleSubmit = async (answer: string) => {
    if (!attemptId || !question) return;

    try {
      const response = await fetch('/api/diagnostic/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          questionId: question.id,
          selectedAnswer: answer,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsCorrect(data.correct);
        setShowFeedback(true);
        setProgress(data.progress);

        if (data.complete) {
          // Complete the assessment after showing feedback briefly
          setTimeout(() => {
            completeAssessment();
          }, 1500);
        } else if (data.nextQuestion) {
          // Show next question after feedback delay
          setTimeout(() => {
            setQuestion(data.nextQuestion);
            setShowFeedback(false);
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
    }
  };

  const completeAssessment = async () => {
    if (!attemptId) return;

    try {
      const response = await fetch('/api/diagnostic/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId }),
      });

      if (response.ok) {
        const data = await response.json();
        // Navigate to results page with placement data
        router.push(`/diagnostic/results?placement=${encodeURIComponent(JSON.stringify(data.placement))}&subject=${subjectId}&lessons=${encodeURIComponent(JSON.stringify(data.recommendedLessons))}`);
      }
    } catch (error) {
      console.error('Error completing assessment:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] flex items-center justify-center">
        <div className="w-8 h-8 text-[#007229]">
          <Loader2Icon />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC] p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/diagnostic')}
            className="p-2 hover:bg-[#007229]/5 rounded-xl transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <div>
            <h1 className="text-xl font-semibold">{subjectName} Assessment</h1>
            <p className="text-sm text-gray-600 text-gray-500">
              Answer questions to find your level
            </p>
          </div>
        </div>

        {/* Question */}
        {question ? (
          <QuestionDisplay
            question={question}
            onSubmit={handleSubmit}
            showFeedback={showFeedback}
            isCorrect={isCorrect}
            progress={progress}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600 text-gray-500">No questions available.</p>
          </div>
        )}
      </div>
    </div>
  );
}
