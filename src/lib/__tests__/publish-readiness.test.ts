import { describe, it, expect } from 'vitest';
import {
  getLessonPublishReadiness,
  type PublishBlockingReasonCode,
} from '@/lib/lessons/publish-readiness';
import type { Slide } from '@/lib/slides.types';

function makeSlide(id: string): Slide {
  return {
    id,
    type: 'content',
    sequence: 0,
    is_required: false,
    layout: 'default',
    title_ar: 'test',
    title_en: 'test',
    body_ar: '',
    body_en: '',
    speaker_notes_ar: '',
    speaker_notes_en: '',
    visual_hint: '',
    bullets_ar: null,
    bullets_en: null,
    reveal_items_ar: null,
    reveal_items_en: null,
    title_size: 'md',
    body_size: 'md',
    timestamp_seconds: null,
  } as Slide;
}

describe('getLessonPublishReadiness', () => {
  it('blocks when no sim', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      hasSim: false,
    });
    expect(result.canPublish).toBe(false);
    expect(result.blockingReasons.map((r) => r.code)).toContain('missing_sim');
  });

  it('allows publish with sim and slides', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      hasSim: true,
    });
    expect(result.canPublish).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });

  it('blocks when slides are empty', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [],
      hasSim: true,
    });
    expect(result.blockingReasons.map((r) => r.code)).toContain('missing_slides');
  });

  it('can return multiple blocking reasons', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [],
      hasSim: false,
    });
    expect(result.canPublish).toBe(false);
    const codes = result.blockingReasons.map((r) => r.code) as PublishBlockingReasonCode[];
    expect(codes).toContain('missing_sim');
    expect(codes).toContain('missing_slides');
  });
});
