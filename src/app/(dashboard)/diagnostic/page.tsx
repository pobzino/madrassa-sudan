/**
 * Diagnostic Overview Page
 * Shows available assessments and current placements
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DiagnosticCard } from '@/components/diagnostic/DiagnosticCard';

// Icons
const ClipboardListIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

interface Subject {
  id: string;
  name: string;
  name_ar?: string;
  description?: string;
}

interface Placement {
  id: string;
  subject_id: string;
  placed_grade: number;
  confidence: 'high' | 'medium' | 'low';
  placed_at: string;
  subject: Subject;
}

interface IncompleteAttempt {
  id: string;
  subject_id: string;
  questions_answered: number;
  subject: Subject;
}

export default function DiagnosticPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [incompleteAttempts, setIncompleteAttempts] = useState<IncompleteAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/diagnostic/results');
      if (response.ok) {
        const data = await response.json();
        setPlacements(data.placements || []);
        setIncompleteAttempts(data.incompleteAttempts || []);
        setSubjects(data.subjects || []);
      }
    } catch (error) {
      console.error('Error fetching diagnostic data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = (subjectId: string) => {
    router.push(`/diagnostic/${subjectId}`);
  };

  const handleContinue = (subjectId: string) => {
    router.push(`/diagnostic/${subjectId}`);
  };

  const handleRetake = (subjectId: string) => {
    router.push(`/diagnostic/${subjectId}?retake=true`);
  };

  const getPlacementForSubject = (subjectId: string) => {
    return placements.find(p => p.subject_id === subjectId) || null;
  };

  const hasIncompleteAttempt = (subjectId: string) => {
    return incompleteAttempts.some(a => a.subject_id === subjectId);
  };

  const completedCount = placements.length;
  const totalSubjects = subjects.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFCFC] p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-gray-600 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC] p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 text-[#007229]">
              <ClipboardListIcon />
            </div>
            <h1 className="text-3xl font-bold">Diagnostic Assessments</h1>
          </div>
          <p className="text-gray-600 text-gray-500">
            Take assessments to find the right starting level for each subject.
            This helps us recommend lessons that match your current knowledge.
          </p>
        </div>

        {/* Progress Overview */}
        {completedCount > 0 && (
          <div className="bg-[#007229]/5 border border-[#007229]/20 rounded-xl p-4 mb-8 flex items-center gap-3">
            <div className="w-5 h-5 text-[#007229]">
              <SparklesIcon />
            </div>
            <p className="text-[#007229]">
              You&apos;ve completed {completedCount} of {totalSubjects} assessments.
              {completedCount === totalSubjects && " Great job!"}
            </p>
          </div>
        )}

        {/* Subject Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {subjects.map((subject) => (
            <DiagnosticCard
              key={subject.id}
              subject={subject}
              placement={getPlacementForSubject(subject.id)}
              hasIncompleteAttempt={hasIncompleteAttempt(subject.id)}
              onStart={() => handleStart(subject.id)}
              onContinue={() => handleContinue(subject.id)}
              onRetake={() => handleRetake(subject.id)}
            />
          ))}
        </div>

        {subjects.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-gray-500">No subjects available for assessment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
