'use client';

import { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
  type CurriculumSelection,
} from '@/lib/curriculum';
import { createClient } from '@/lib/supabase/client';
import { useTeacherGuard } from '@/lib/teacher/useTeacherGuard';
import SlideEditor from '@/components/slides/SlideEditor';
import SlideGenerateButton from '@/components/slides/SlideGenerateButton';
import type { Slide } from '@/lib/slides.types';
import {
  clampSlideCount,
  DEFAULT_SLIDE_LENGTH_PRESET,
  getSlideGenerationContextStorageKey,
  getSlideLengthPresetConfig,
  getSlideLengthPresetFromCount,
  MIN_GENERATED_SLIDE_COUNT,
  MAX_GENERATED_SLIDE_COUNT,
  parseSlideGenerationContext,
  SLIDE_LENGTH_PRESET_OPTIONS,
  type SlideGenerationContext,
  type SlideLengthPreset,
  type SlideLanguageMode,
} from '@/lib/slides-generation';

type VideoUrls = {
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  duration_seconds?: number;
};

type Subject = {
  name_ar?: string | null;
  name_en?: string | null;
};

export default function SlidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const { loading: authLoading } = useTeacherGuard();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [lessonTitle, setLessonTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [generationContext, setGenerationContext] = useState<SlideGenerationContext | null>(null);
  const [generationContextReady, setGenerationContextReady] = useState(false);
  const [slideCount, setSlideCount] = useState(
    getSlideLengthPresetConfig(DEFAULT_SLIDE_LENGTH_PRESET).slideCount
  );
  const [slideLengthPreset, setSlideLengthPreset] = useState<SlideLengthPreset>(
    DEFAULT_SLIDE_LENGTH_PRESET
  );
  const [lessonSubject, setLessonSubject] = useState<Subject | null>(null);
  const [lessonGradeLevel, setLessonGradeLevel] = useState<number>(1);
  const [curriculumTopic, setCurriculumTopic] = useState<CurriculumSelection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const requestedLanguageMode = searchParams.get('language');
  const autoGenerate = searchParams.get('autogenerate') === '1';
  const [languageMode, setLanguageMode] = useState<SlideLanguageMode>(
    requestedLanguageMode === 'en' ? 'en' : 'ar'
  );

  const handleVideoReady = useCallback(async (urls: VideoUrls) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('lessons')
      .update({
        video_url_1080p: urls.video_url_1080p,
        video_url_360p: urls.video_url_360p,
        video_url_480p: urls.video_url_480p,
        video_url_720p: urls.video_url_720p,
        ...(urls.duration_seconds != null ? { video_duration_seconds: urls.duration_seconds } : {}),
      })
      .eq('id', id);
    if (error) {
      console.error('Failed to save video URLs:', error);
    }
  }, [id]);

  const loadData = useCallback(async () => {
    const supabase = createClient();

    // Load lesson title + existing slides in parallel
    const [lessonResult, slidesRes] = await Promise.all([
      supabase
        .from('lessons')
        .select('title_ar, title_en, grade_level, curriculum_topic, subject:subjects(name_ar, name_en)')
        .eq('id', id)
        .single(),
      fetch(`/api/teacher/lessons/${id}/slides`).then((r) => r.json()).catch(() => null),
    ]);

    if (lessonResult.data) {
      setLessonTitle(lessonResult.data.title_ar || lessonResult.data.title_en || 'Untitled');
      const subject = (lessonResult.data.subject as Subject | null) || null;
      setLessonSubject(subject);
      setLessonGradeLevel(lessonResult.data.grade_level || 1);
      setCurriculumTopic(
        getCurriculumSelectionForLesson(subject, lessonResult.data.grade_level || 1, lessonResult.data.curriculum_topic)
      );
    }

    if (slidesRes?.slideDeck?.slides) {
      setSlides(slidesRes.slideDeck.slides);
    }

    if (slidesRes?.slideDeck?.language_mode === 'en') {
      setLanguageMode('en');
    } else if (slidesRes?.slideDeck?.language_mode === 'ar' || slidesRes?.slideDeck?.language_mode === 'both') {
      setLanguageMode('ar');
    }
    setLoading(false);
  }, [id]);

  const handleGeneratingChange = useCallback((generating: boolean, progress: string) => {
    setIsGenerating(generating);
    setGenerationProgress(progress);
  }, []);

  const slideGenerationBlockedReason = getCurriculumRequirementMessage(
    lessonSubject,
    lessonGradeLevel,
    curriculumTopic
  );

  useEffect(() => {
    if (!authLoading) {
      const timeout = setTimeout(() => {
        void loadData();
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [authLoading, loadData]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(getSlideGenerationContextStorageKey(id));
      if (!raw) {
        setGenerationContext(null);
        return;
      }

      const parsed = parseSlideGenerationContext(JSON.parse(raw));
      setGenerationContext(parsed);
      if (parsed?.requestedSlideCount) {
        const normalizedCount = clampSlideCount(parsed.requestedSlideCount);
        setSlideCount(normalizedCount);
        setSlideLengthPreset(getSlideLengthPresetFromCount(normalizedCount));
      }
    } catch {
      setGenerationContext(null);
    } finally {
      window.sessionStorage.removeItem(getSlideGenerationContextStorageKey(id));
      setGenerationContextReady(true);
    }
  }, [id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/teacher/lessons/${id}/slides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert('Save failed: ' + (data.error || 'Unknown error'));
      } else {
        setLastSaved(new Date().toLocaleTimeString());
      }
    } catch {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  }, [id, slides]);

  const handleSlideLengthPresetChange = useCallback((preset: SlideLengthPreset) => {
    const config = getSlideLengthPresetConfig(preset);
    setSlideLengthPreset(preset);
    setSlideCount(config.slideCount);
    setGenerationContext((prev) => ({
      learningObjective: prev?.learningObjective || '',
      keyIdeas: prev?.keyIdeas || [],
      sourceNotes: prev?.sourceNotes || '',
      lessonDurationMinutes: config.lessonDurationMinutes,
      slideGoalMix: prev?.slideGoalMix || 'balanced',
      requestedSlideCount: config.slideCount,
    }));
  }, []);

  if (authLoading || loading || !generationContextReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link
            href={`/teacher/lessons/${id}`}
            className="text-gray-500 hover:text-gray-700 text-sm mb-1 inline-block"
          >
            ← Back to Lesson Editor
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Presentation Slides</h1>
          {lessonTitle && <p className="text-sm text-gray-500">{lessonTitle}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!isGenerating && (
            <>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Lesson Length
                </label>
                <select
                  value={slideLengthPreset}
                  onChange={(e) =>
                    handleSlideLengthPresetChange(e.target.value as SlideLengthPreset)
                  }
                  className="border-0 bg-transparent p-0 pr-6 text-sm font-semibold text-gray-900 focus:ring-0"
                >
                  {SLIDE_LENGTH_PRESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Slides
                </label>
                <input
                  type="number"
                  min={MIN_GENERATED_SLIDE_COUNT}
                  max={MAX_GENERATED_SLIDE_COUNT}
                  value={slideCount}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const clamped = clampSlideCount(raw);
                    setSlideCount(clamped);
                    setSlideLengthPreset(getSlideLengthPresetFromCount(clamped));
                    setGenerationContext((prev) => ({
                      learningObjective: prev?.learningObjective || '',
                      keyIdeas: prev?.keyIdeas || [],
                      sourceNotes: prev?.sourceNotes || '',
                      lessonDurationMinutes: prev?.lessonDurationMinutes ?? null,
                      slideGoalMix: prev?.slideGoalMix || 'balanced',
                      requestedSlideCount: clamped,
                    }));
                  }}
                  className="w-16 border-0 bg-transparent p-0 text-sm font-semibold text-gray-900 focus:ring-0"
                />
              </div>
            </>
          )}
          <SlideGenerateButton
            lessonId={id}
            hasExistingSlides={slides.length > 0}
            languageMode={languageMode}
            generationContext={generationContext}
            slideCount={slideCount}
            autoGenerate={autoGenerate}
            disabledReason={slideGenerationBlockedReason}
            onGenerated={(newSlides) => setSlides(newSlides)}
            onGeneratingChange={handleGeneratingChange}
            compact
          />
          {lastSaved && (
            <p className="text-xs text-gray-400 sm:ml-2">Last saved: {lastSaved}</p>
          )}
        </div>
      </div>

      {/* Empty state, generation progress, or editor */}
      {slides.length === 0 ? (
        isGenerating ? (
          /* Generation in progress — show inline progress instead of empty state */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{generationProgress || 'Generating slides...'}</h3>
              <p className="text-sm text-gray-500 mt-1">This usually takes 15–30 seconds.</p>
            </div>
            {/* Skeleton slide placeholders */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
              {Array.from({ length: slideCount }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[16/10] rounded-lg bg-gray-100 animate-pulse"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* True empty state */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-emerald-50 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">No Slides Yet</h3>
              <p className="text-sm text-gray-500 mt-1">
                Generate slides with AI to get started, or they can be manually created.
              </p>
            </div>
            {!autoGenerate && (
              <div className="flex justify-center">
                <SlideGenerateButton
                  lessonId={id}
                  hasExistingSlides={false}
                  languageMode={languageMode}
                  generationContext={generationContext}
                  slideCount={slideCount}
                  disabledReason={slideGenerationBlockedReason}
                  onGenerated={(newSlides) => setSlides(newSlides)}
                  onGeneratingChange={handleGeneratingChange}
                />
              </div>
            )}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{slides.length} slides</span>
          </div>
          <SlideEditor
            slides={slides}
            onChange={setSlides}
            onSave={handleSave}
            saving={saving}
            preferredLanguage={languageMode === 'en' ? 'en' : 'ar'}
            lessonId={id}
            lessonTitle={lessonTitle}
            onVideoReady={handleVideoReady}
          />
        </div>
      )}
    </div>
  );
}
