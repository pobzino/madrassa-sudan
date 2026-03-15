/**
 * Diagnostic Results Page
 * Shows placement results after completing assessment
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResultsDisplay } from '@/components/diagnostic/ResultsDisplay';

// Icons
const Loader2Icon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
  </svg>
);

interface Placement {
  grade: number;
  confidence: 'high' | 'medium' | 'low';
  questionsAnswered: number;
  questionsCorrect: number;
  accuracy: number;
}

interface Lesson {
  id: string;
  title: string;
  title_ar?: string;
  description?: string;
}

export default function DiagnosticResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [recommendedLessons, setRecommendedLessons] = useState<Lesson[]>([]);
  const [subjectId, setSubjectId] = useState<string>('');

  useEffect(() => {
    const placementParam = searchParams.get('placement');
    const subjectParam = searchParams.get('subject');
    const lessonsParam = searchParams.get('lessons');

    if (placementParam && subjectParam) {
      try {
        setPlacement(JSON.parse(placementParam));
        setSubjectId(subjectParam);
        if (lessonsParam) {
          setRecommendedLessons(JSON.parse(lessonsParam));
        }

        // Fetch subject name
        fetch(`/api/subjects/${subjectParam}`)
          .then(res => res.json())
          .then(data => setSubjectName(data.name || 'Subject'))
          .catch(() => setSubjectName('Subject'));
      } catch (error) {
        console.error('Error parsing results:', error);
      }
    }

    setLoading(false);
  }, [searchParams]);

  const handleStartLearning = () => {
    if (recommendedLessons.length > 0) {
      router.push(`/lessons/${recommendedLessons[0].id}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleRetake = () => {
    router.push(`/diagnostic/${subjectId}?retake=true`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 text-blue-500">
          <Loader2Icon />
        </div>
      </div>
    );
  }

  if (!placement) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-2xl mx-auto text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">No results found.</p>
          <button
            onClick={() => router.push('/diagnostic')}
            className="mt-4 text-blue-500 hover:text-blue-600"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <ResultsDisplay
        placement={placement}
        subjectName={subjectName}
        recommendedLessons={recommendedLessons}
        onStartLearning={handleStartLearning}
        onRetake={handleRetake}
      />
    </div>
  );
}
