'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Slide, SlideType } from '@/lib/slides.types';
import SlideCard from './SlideCard';
import SlideThumbnail from './SlideThumbnail';
import SlideEditPanel from './SlideEditPanel';
import SlideToolbar from './SlideToolbar';
import RecordingOverlay from './RecordingOverlay';
import RecordingReviewModal from './RecordingReviewModal';
import { useSlideRecorder } from '@/hooks/useSlideRecorder';
import { useBunnyBlobUpload } from '@/hooks/useBunnyBlobUpload';

interface SlideEditorProps {
  slides: Slide[];
  onChange: (slides: Slide[]) => void;
  onSave: () => void;
  saving: boolean;
  lessonId?: string;
  lessonTitle?: string;
  onVideoReady?: (urls: {
    video_url_1080p: string;
    video_url_360p: string;
    video_url_480p: string;
    video_url_720p: string;
    duration_seconds?: number;
  }) => void;
}

export default function SlideEditor({
  slides,
  onChange,
  onSave,
  saving,
  lessonId,
  lessonTitle,
  onVideoReady,
}: SlideEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const slideContainerRef = useRef<HTMLDivElement>(null);

  const {
    recorderState,
    recordingDuration,
    recordedBlob,
    errorMessage: recorderError,
    countdownValue,
    startRecording: recorderStart,
    stopRecording: recorderStop,
    pauseRecording,
    resumeRecording,
    canvasRef,
    snapshotSlide,
  } = useSlideRecorder({ slideContainerRef });

  const bunnyUpload = useBunnyBlobUpload({
    lessonId: lessonId || '',
    lessonTitle: lessonTitle || 'Recording',
  });

  const selectedSlide = slides[selectedIndex] || null;

  // Get reveal item count for current presentation slide
  const presentSlide = slides[presentIndex];
  const presentRevealItems = presentSlide?.type === 'question_answer'
    ? (language === 'ar' ? presentSlide.reveal_items_ar : presentSlide.reveal_items_en) || []
    : [];
  const totalRevealItems = presentRevealItems.length;

  // Reset reveal count when slide changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      setRevealedCount(0);
    }, 0);

    return () => clearTimeout(timeout);
  }, [presentIndex]);

  // Snapshot slide when presentIndex or revealedCount changes during recording
  useEffect(() => {
    if (recording && (recorderState === 'recording' || recorderState === 'paused')) {
      snapshotSlide();
    }
  }, [presentIndex, revealedCount, recording, recorderState, snapshotSlide]);

  // When recording stops, show review modal
  useEffect(() => {
    if (recorderState === 'stopped' && recordedBlob) {
      const timeout = setTimeout(() => {
        setRecording(false);
        setPresenting(false);
        setShowReviewModal(true);
      }, 0);

      return () => clearTimeout(timeout);
    }
  }, [recorderState, recordedBlob]);

  // When upload completes, notify parent
  useEffect(() => {
    if (bunnyUpload.state === 'ready' && bunnyUpload.videoUrls && onVideoReady) {
      onVideoReady(bunnyUpload.videoUrls);
    }
  }, [bunnyUpload.state, bunnyUpload.videoUrls, onVideoReady]);

  // Keyboard navigation for present mode
  useEffect(() => {
    if (!presenting) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        if (totalRevealItems > 0 && revealedCount < totalRevealItems) {
          setRevealedCount((c) => c + 1);
        } else {
          setPresentIndex((i) => Math.min(i + 1, slides.length - 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPresentIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') {
        if (recording) {
          // During recording, Escape stops recording instead of exiting
          recorderStop();
        } else {
          setPresenting(false);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [presenting, slides.length, totalRevealItems, revealedCount, recording, recorderStop]);

  const updateSlide = useCallback(
    (updates: Partial<Slide>) => {
      const next = slides.map((s, i) => (i === selectedIndex ? { ...s, ...updates } : s));
      onChange(next);
    },
    [slides, selectedIndex, onChange]
  );

  const deleteSlide = useCallback(() => {
    if (slides.length <= 1) return;
    const next = slides.filter((_, i) => i !== selectedIndex).map((s, i) => ({ ...s, sequence: i }));
    onChange(next);
    setSelectedIndex(Math.min(selectedIndex, next.length - 1));
  }, [slides, selectedIndex, onChange]);

  const addSlide = useCallback(
    (type: SlideType) => {
      const newSlide: Slide = {
        id: crypto.randomUUID(),
        type,
        sequence: slides.length,
        timestamp_seconds: null,
        title_ar: '',
        title_en: '',
        body_ar: '',
        body_en: '',
        speaker_notes_ar: '',
        speaker_notes_en: '',
        visual_hint: '',
        bullets_ar: type === 'key_points' || type === 'summary' ? [''] : null,
        bullets_en: type === 'key_points' || type === 'summary' ? [''] : null,
        reveal_items_ar: type === 'question_answer' ? [''] : null,
        reveal_items_en: type === 'question_answer' ? [''] : null,
        image_url: null,
        layout: null,
        title_size: 'md',
        body_size: 'md',
        lesson_phase: type === 'title' ? 'title' : type === 'summary' ? 'summary_goodbye' : 'core_teaching',
        idea_focus_en: '',
        idea_focus_ar: '',
        vocabulary_word_en: null,
        vocabulary_word_ar: null,
        say_it_twice_prompt: null,
        practice_question_count: type === 'quiz_preview' || type === 'question_answer' ? 1 : null,
        representation_stage: 'not_applicable',
        interaction_type: null,
        interaction_prompt_ar: null,
        interaction_prompt_en: null,
        interaction_options_ar: null,
        interaction_options_en: null,
        interaction_correct_index: null,
        interaction_true_false_answer: null,
        interaction_count_target: null,
        interaction_visual_emoji: null,
      };
      onChange([...slides, newSlide]);
      setSelectedIndex(slides.length);
    },
    [slides, onChange]
  );

  // Drag and drop reorder
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...slides];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next.map((s, i) => ({ ...s, sequence: i })));
    setDragIndex(index);
    if (selectedIndex === dragIndex) setSelectedIndex(index);
  }, [dragIndex, slides, selectedIndex, onChange]);

  const handleDrop = useCallback(() => {
    setDragIndex(null);
  }, []);

  function startPresent() {
    setPresentIndex(selectedIndex);
    setPresenting(true);
  }

  async function startRecord() {
    setPresentIndex(selectedIndex);
    setPresenting(true);
    setRecording(true);
    // Small delay so the presentation DOM renders before we start recording
    await new Promise((r) => setTimeout(r, 100));
    recorderStart();
  }

  function handleRetake() {
    setShowReviewModal(false);
    bunnyUpload.reset();
    startRecord();
  }

  function handleDiscard() {
    setShowReviewModal(false);
    bunnyUpload.reset();
  }

  function handleUpload() {
    if (recordedBlob) {
      bunnyUpload.upload(recordedBlob);
    }
  }

  function handleCancelUpload() {
    bunnyUpload.cancel();
  }

  // Fullscreen present mode
  if (presenting) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div ref={slideContainerRef} className="w-full max-w-6xl mx-auto px-4">
          <SlideCard
            slide={slides[presentIndex]}
            language={language}
            className="!rounded-none !shadow-2xl"
            revealedCount={slides[presentIndex]?.type === 'question_answer' ? revealedCount : undefined}
            onReveal={() => setRevealedCount((c) => c + 1)}
          />
        </div>

        {/* Recording overlay (countdown, REC indicator, controls) */}
        {recording && (
          <RecordingOverlay
            recorderState={recorderState}
            countdownValue={countdownValue}
            recordingDuration={recordingDuration}
            canvasRef={canvasRef}
            onPause={pauseRecording}
            onResume={resumeRecording}
            onStop={recorderStop}
          />
        )}

        {/* Recording error */}
        {recorderError && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white text-sm px-4 py-2 rounded-full">
            {recorderError}
          </div>
        )}

        {/* Controls overlay — hide during active recording */}
        {!recording && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-sm rounded-full px-6 py-3">
            <button
              onClick={() => setPresentIndex((i) => Math.max(i - 1, 0))}
              disabled={presentIndex === 0}
              className="text-white/80 hover:text-white disabled:text-white/30 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-white/80 text-sm font-medium min-w-[60px] text-center">
              {presentIndex + 1} / {slides.length}
            </span>
            <button
              onClick={() => {
                if (totalRevealItems > 0 && revealedCount < totalRevealItems) {
                  setRevealedCount((c) => c + 1);
                } else {
                  setPresentIndex((i) => Math.min(i + 1, slides.length - 1));
                }
              }}
              disabled={presentIndex === slides.length - 1 && revealedCount >= totalRevealItems}
              className="text-white/80 hover:text-white disabled:text-white/30 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <div className="w-px h-5 bg-white/30" />
            <button
              onClick={() => setPresenting(false)}
              className="text-white/80 hover:text-white text-sm font-medium transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {/* Slide counter during recording */}
        {recording && (recorderState === 'recording' || recorderState === 'paused') && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[55] bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
            <span className="text-white/80 text-sm font-medium">
              {presentIndex + 1} / {slides.length}
            </span>
          </div>
        )}

        {/* Language toggle in present mode */}
        {!recording && (
          <div className="absolute top-4 right-4">
            <button
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              className="px-3 py-1.5 bg-white/10 backdrop-blur-sm text-white rounded-lg text-xs font-medium hover:bg-white/20 transition-colors"
            >
              {language === 'ar' ? 'EN' : 'عربي'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-120px)] bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
        {/* Toolbar */}
        <SlideToolbar
          language={language}
          onLanguageChange={setLanguage}
          onAddSlide={addSlide}
          onSave={onSave}
          onPresent={startPresent}
          onRecord={lessonId ? startRecord : undefined}
          saving={saving}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Thumbnail sidebar */}
          <div className="w-48 bg-gray-50 border-r border-gray-200 overflow-y-auto p-3 space-y-2 flex-shrink-0">
            {slides.map((slide, index) => (
              <SlideThumbnail
                key={slide.id}
                slide={slide}
                language={language}
                index={index}
                isSelected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(index); }}
                onDrop={handleDrop}
              />
            ))}
          </div>

          {/* Main preview */}
          <div className="flex-1 flex items-center justify-center p-8 bg-gray-100 overflow-auto">
            {selectedSlide ? (
              <div className="w-full max-w-4xl">
                <SlideCard slide={selectedSlide} language={language} />
                {/* Speaker notes below */}
                {(selectedSlide.speaker_notes_ar || selectedSlide.speaker_notes_en) && (
                  <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-medium text-gray-500 mb-1">Speaker Notes</p>
                    <p className="text-sm text-gray-700" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      {language === 'ar' ? selectedSlide.speaker_notes_ar : selectedSlide.speaker_notes_en}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No slides yet.</p>
            )}
          </div>

          {/* Edit panel */}
          {selectedSlide && (
            <div className="w-72 border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
              <SlideEditPanel
                slide={selectedSlide}
                onUpdate={updateSlide}
                onDelete={deleteSlide}
              />
            </div>
          )}
        </div>
      </div>

      {/* Recording review modal */}
      {showReviewModal && recordedBlob && (
        <RecordingReviewModal
          blob={recordedBlob}
          uploadState={bunnyUpload.state}
          uploadProgress={bunnyUpload.progress}
          uploadError={bunnyUpload.errorMessage}
          onUpload={handleUpload}
          onRetake={handleRetake}
          onDiscard={handleDiscard}
          onCancel={handleCancelUpload}
        />
      )}
    </>
  );
}
