'use client';

import { useState } from 'react';

interface GeneratedQuestion {
  question_type: 'multiple_choice' | 'true_false' | 'fill_in_blank';
  question_text_ar: string;
  question_text_en: string;
  options: string[] | null;
  correct_answer: string;
  explanation_ar: string;
  explanation_en: string;
  timestamp_seconds: number;
  display_order: number;
  is_required: boolean;
  allow_retry: boolean;
}

interface GeneratedContentBlock {
  language: 'ar' | 'en';
  content: string;
  source_type: string;
  sequence: number;
}

interface GeneratedTask {
  task_type: string;
  title_ar: string;
  title_en: string;
  instruction_ar: string;
  instruction_en: string;
  timestamp_seconds: number;
  task_data: Record<string, unknown>;
  is_skippable: boolean;
  points: number;
}

interface AIContentGeneratorProps {
  lessonId: string;
  hasVideo: boolean;
  hasExistingContent: boolean;
  disabledReason?: string | null;
  onGenerated: (data: {
    questions: GeneratedQuestion[];
    contentBlocks: GeneratedContentBlock[];
    tasks?: GeneratedTask[];
    transcript: string;
  }) => void;
}

export default function AIContentGenerator({
  lessonId,
  hasVideo,
  hasExistingContent,
  disabledReason = null,
  onGenerated,
}: AIContentGeneratorProps) {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  async function handleGenerate() {
    if (!hasVideo || disabledReason) return;

    if (hasExistingContent) {
      const confirmed = window.confirm(
        'This will replace existing questions and content blocks. Continue?'
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    setError('');
    setProgress('Transcribing video...');

    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language_hint: 'ar' }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          res.status === 504 || res.status === 502
            ? 'Request timed out. The video may be too long — try a shorter video.'
            : `Server returned an unexpected response (${res.status}). Please try again.`
        );
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      setProgress('Processing results...');

      setTranscript(data.transcript?.text || null);

      onGenerated({
        questions: data.questions || [],
        contentBlocks: data.contentBlocks || [],
        tasks: data.tasks || [],
        transcript: data.transcript?.text || '',
      });

      if (data.warning) {
        setError(data.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  }

  return (
    <div className="space-y-3">
      {/* Generate button + status */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !hasVideo || Boolean(disabledReason)}
          className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium
                     hover:bg-purple-700 transition-colors disabled:opacity-50
                     disabled:cursor-not-allowed flex items-center gap-2"
        >
          {generating ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {progress || 'Generating...'}
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Generate with AI
            </>
          )}
        </button>

        {!hasVideo && (
          <span className="text-xs text-gray-500">Upload a video first</span>
        )}
        {disabledReason && (
          <span className="text-xs text-amber-700">{disabledReason}</span>
        )}
      </div>

      {/* Progress banner */}
      {generating && (
        <div className="border border-purple-200 bg-purple-50 rounded-xl p-4 flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-purple-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-purple-800">{progress}</p>
            <p className="text-xs text-purple-600">
              This may take 30–60 seconds depending on video length.
            </p>
          </div>
        </div>
      )}

      {/* Error/warning */}
      {error && !generating && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-3">
          <p className="text-sm text-amber-800">{error}</p>
        </div>
      )}

      {/* Transcript viewer */}
      {transcript && !generating && (
        <details
          open={showTranscript}
          onToggle={(e) => setShowTranscript((e.target as HTMLDetailsElement).open)}
          className="border border-gray-100 rounded-xl"
        >
          <summary className="px-4 py-2 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">
            View AI Transcript
          </summary>
          <pre className="px-4 pb-4 text-xs text-gray-600 whitespace-pre-wrap max-h-48 overflow-y-auto" dir="auto">
            {transcript}
          </pre>
        </details>
      )}
    </div>
  );
}
