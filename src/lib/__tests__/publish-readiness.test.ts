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

const noVideo = {
  video_url_1080p: null,
  video_url_360p: null,
  video_url_480p: null,
  video_url_720p: null,
  video_duration_seconds: null,
};

const withVideo = {
  video_url_1080p: 'https://cdn.example.com/v.mp4',
  video_url_360p: null,
  video_url_480p: null,
  video_url_720p: null,
  video_duration_seconds: 300,
};

describe('getLessonPublishReadiness', () => {
  it('blocks when no video and no sim', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: noVideo,
      hasSim: false,
    });
    expect(result.canPublish).toBe(false);
    expect(result.blockingReasons.map((r) => r.code)).toContain('missing_video');
  });

  it('allows publish with sim only (no video)', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: noVideo,
      hasSim: true,
    });
    const codes = result.blockingReasons.map((r) => r.code);
    expect(codes).not.toContain('missing_video');
  });

  it('allows publish with video only (no sim)', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: withVideo,
      videoProcessingStatus: 'ready',
      hasSim: false,
    });
    const codes = result.blockingReasons.map((r) => r.code);
    expect(codes).not.toContain('missing_video');
  });

  it('blocks when slides are empty', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [],
      lessonTasks: [],
      video: noVideo,
      hasSim: true,
    });
    expect(result.blockingReasons.map((r) => r.code)).toContain('missing_slides');
  });

  it('blocks when video processing is not ready', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: withVideo,
      videoProcessingStatus: 'processing',
      hasSim: false,
    });
    const codes = result.blockingReasons.map((r) => r.code);
    expect(codes).toContain('processing_incomplete');
  });

  it('does not block processing for sim-only lessons', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: noVideo,
      videoProcessingStatus: null,
      hasSim: true,
    });
    const codes = result.blockingReasons.map((r) => r.code);
    expect(codes).not.toContain('processing_incomplete');
  });

  it('can return multiple blocking reasons', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [],
      lessonTasks: [],
      video: noVideo,
      hasSim: false,
    });
    expect(result.canPublish).toBe(false);
    const codes = result.blockingReasons.map((r) => r.code) as PublishBlockingReasonCode[];
    expect(codes).toContain('missing_video');
    expect(codes).toContain('missing_slides');
  });

  it('returns canPublish true when all checks pass', () => {
    const result = getLessonPublishReadiness({
      subject: null,
      gradeLevel: null,
      curriculumTopic: null,
      slides: [makeSlide('s1')],
      lessonTasks: [],
      video: noVideo,
      hasSim: true,
    });
    expect(result.canPublish).toBe(true);
    expect(result.blockingReasons).toHaveLength(0);
  });
});
