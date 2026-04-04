'use client';

import { useMemo } from 'react';
import SlideInteractionOverlay from '@/components/lessons/SlideInteractionOverlay';
import { buildActivityInteractionSlide, normalizeTaskType } from '@/lib/lesson-activities';
import type { Slide } from '@/lib/slides.types';
import type { LessonTask } from '@/lib/tasks.types';
import type { SlideInteractionResult } from '@/lib/slide-interactions';

interface LessonActivityOverlayProps {
  task: LessonTask;
  sourceSlide?: Slide | null;
  language: 'ar' | 'en';
  initialFreeResponseAnswer?: string;
  reviewStatus?: 'pending_review' | 'accepted' | 'needs_retry' | null;
  reviewFeedback?: string | null;
  onComplete: (result: SlideInteractionResult) => void;
  onSkip?: () => void;
  onDismiss?: () => void;
}

const BADGE_LABELS: Record<string, { ar: string; en: string }> = {
  free_response: { ar: 'إجابة حرة', en: 'Free Response' },
  choose_correct: { ar: 'اختيار', en: 'Choose' },
  true_false: { ar: 'صح / خطأ', en: 'True / False' },
  fill_missing_word: { ar: 'أكمل', en: 'Fill Blank' },
  tap_to_count: { ar: 'عدّ', en: 'Count' },
  match_pairs: { ar: 'وصّل', en: 'Match' },
  sequence_order: { ar: 'رتّب', en: 'Order' },
  sort_groups: { ar: 'صنّف', en: 'Sort' },
};

export default function LessonActivityOverlay({
  task,
  sourceSlide,
  language,
  initialFreeResponseAnswer,
  reviewStatus,
  reviewFeedback,
  onComplete,
  onSkip,
  onDismiss,
}: LessonActivityOverlayProps) {
  const slide = useMemo(
    () => buildActivityInteractionSlide(task, sourceSlide ?? null),
    [sourceSlide, task]
  );

  const normalizedTaskType = normalizeTaskType(task.task_type);
  const badgeLabel = BADGE_LABELS[normalizedTaskType]?.[language] || (language === 'ar' ? 'نشاط' : 'Activity');
  const skipLabel = language === 'ar' ? 'تخطي النشاط' : 'Skip activity';
  const requiredLabel = task.required === false
    ? (language === 'ar' ? 'اختياري' : 'Optional')
    : (language === 'ar' ? 'مطلوب' : 'Required');

  if (!slide) {
    return null;
  }

  return (
    <SlideInteractionOverlay
      slide={slide}
      language={language}
      badgeLabel={badgeLabel}
      headerMeta={
        <div className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600">
          {requiredLabel}
        </div>
      }
      secondaryAction={
        onSkip && task.is_skippable ? (
          <button
            type="button"
            onClick={onSkip}
            className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            {skipLabel}
          </button>
        ) : onDismiss && (reviewStatus === 'accepted' || reviewStatus === 'pending_review') ? (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-3 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        ) : null
      }
      initialFreeResponseAnswer={initialFreeResponseAnswer}
      reviewStatus={reviewStatus}
      reviewFeedback={reviewFeedback}
      onComplete={onComplete}
    />
  );
}
