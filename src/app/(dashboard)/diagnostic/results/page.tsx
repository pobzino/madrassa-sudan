/**
 * Diagnostic Results Page
 * Shows placement results after completing assessment
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResultsDisplay } from '@/components/diagnostic/ResultsDisplay';
import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();
  const [subjectName, setSubjectName] = useState('Subject');

  const parsedResults = useMemo(() => {
    const placementParam = searchParams.get('placement');
    const subjectParam = searchParams.get('subject');
    const lessonsParam = searchParams.get('lessons');

    if (!placementParam || !subjectParam) {
      return null;
    }

    try {
      return {
        placement: JSON.parse(placementParam) as Placement,
        subjectId: subjectParam,
        recommendedLessons: lessonsParam ? (JSON.parse(lessonsParam) as Lesson[]) : [],
      };
    } catch (error) {
      console.error('Error parsing results:', error);
      return null;
    }
  }, [searchParams]);

  useEffect(() => {
    const subjectId = parsedResults?.subjectId;
    if (!subjectId) {
      return;
    }
    const resolvedSubjectId: string = subjectId;

    async function loadSubjectName() {
      const { data } = await supabase
        .from('subjects')
        .select('name_ar, name_en')
        .eq('id', resolvedSubjectId)
        .single();

      setSubjectName(data?.name_en || data?.name_ar || 'Subject');
    }

    void loadSubjectName();
  }, [parsedResults?.subjectId, supabase]);

  const displaySubjectName = parsedResults?.subjectId ? subjectName : 'Subject';

  const handleStartLearning = () => {
    if (parsedResults && parsedResults.recommendedLessons.length > 0) {
      router.push(`/lessons/${parsedResults.recommendedLessons[0].id}`);
    } else {
      router.push('/dashboard');
    }
  };

  const handleRetake = () => {
    if (!parsedResults) {
      router.push('/diagnostic');
      return;
    }

    router.push(`/diagnostic/${parsedResults.subjectId}?retake=true`);
  };

  if (!parsedResults) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] p-6">
        <div className="max-w-2xl mx-auto text-center py-12">
          <p className="text-gray-600 text-gray-500">No results found.</p>
          <button
            onClick={() => router.push('/diagnostic')}
            className="mt-4 text-[#007229] hover:text-[#005C22]"
          >
            Back to Assessments
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC] p-4 md:p-6">
      <ResultsDisplay
        placement={parsedResults.placement}
        subjectName={displaySubjectName}
        recommendedLessons={parsedResults.recommendedLessons}
        onStartLearning={handleStartLearning}
        onRetake={handleRetake}
      />
    </div>
  );
}
