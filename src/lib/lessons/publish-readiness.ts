import {
  getCurriculumRequirementMessage,
  type CurriculumSelection,
} from "@/lib/curriculum";
import {
  getEffectiveActivityTimings,
  isCanonicalActivityTask,
} from "@/lib/lesson-activities";
import type { Slide } from "@/lib/slides.types";
import type { LessonTaskForm } from "@/lib/tasks.types";

import {
  hasAttachedLessonVideo,
  normalizeLessonVideoProcessingStatus,
} from "./video-processing";

type SubjectIdentity = {
  name_ar?: string | null;
  name_en?: string | null;
};

export type PublishBlockingReasonCode =
  | "missing_video"
  | "missing_slides"
  | "missing_curriculum_topic"
  | "processing_incomplete"
  | "activity_timing_missing";

export interface PublishBlockingReason {
  code: PublishBlockingReasonCode;
  message: string;
}

interface LessonPublishReadinessInput {
  subject: SubjectIdentity | null;
  gradeLevel: number | null | undefined;
  curriculumTopic: CurriculumSelection | null;
  slides: Slide[];
  lessonTasks: LessonTaskForm[];
  video: {
    video_url_1080p?: string | null;
    video_url_360p?: string | null;
    video_url_480p?: string | null;
    video_url_720p?: string | null;
    video_duration_seconds?: number | string | null;
  };
  videoProcessingStatus?: string | null;
  videoProcessingError?: string | null;
  hasSim?: boolean;
}

export interface LessonPublishReadiness {
  canPublish: boolean;
  blockingReasons: PublishBlockingReason[];
}

export function getLessonPublishReadiness(
  input: LessonPublishReadinessInput
): LessonPublishReadiness {
  const blockingReasons: PublishBlockingReason[] = [];
  const hasVideo = hasAttachedLessonVideo(input.video);
  const normalizedProcessingStatus = normalizeLessonVideoProcessingStatus(
    input.videoProcessingStatus
  );
  const curriculumMessage = getCurriculumRequirementMessage(
    input.subject,
    input.gradeLevel,
    input.curriculumTopic
  );

  if (!hasVideo && !input.hasSim) {
    blockingReasons.push({
      code: "missing_video",
      message: "Attach a lesson video or record a sim before publishing.",
    });
  }

  if (input.slides.length === 0) {
    blockingReasons.push({
      code: "missing_slides",
      message: "Generate or create slides before publishing.",
    });
  }

  if (curriculumMessage) {
    blockingReasons.push({
      code: "missing_curriculum_topic",
      message: "Select a curriculum topic before publishing.",
    });
  }

  // Activity timing checks only apply to video-based lessons. Sim-only
  // lessons trigger activities via `activity_gate` events, not timestamps.
  if (!input.hasSim || hasVideo) {
    const requiredActivities = input.lessonTasks.filter(
      (task) =>
        task.required &&
        isCanonicalActivityTask(task.task_type) &&
        task.linked_slide_id
    );
    const timedActivities = getEffectiveActivityTimings(
      input.slides,
      requiredActivities,
      null
    );
    const missingTimingCount = timedActivities.filter(
      (timing) =>
        timing.effectiveTimestampSeconds <= 0 &&
        timing.task.timestamp_seconds <= 0 &&
        !timing.sourceSlide
    ).length;

    if (missingTimingCount > 0) {
      blockingReasons.push({
        code: "activity_timing_missing",
        message:
          missingTimingCount === 1
            ? "A required activity still needs a timestamp or linked slide position."
            : `${missingTimingCount} required activities still need a timestamp or linked slide position.`,
      });
    }
  }

  if (hasVideo && normalizedProcessingStatus !== "ready") {
    const processingMessage =
      normalizedProcessingStatus === "processing"
        ? "Lesson video transcript and search processing are still running."
        : normalizedProcessingStatus === "error"
          ? input.videoProcessingError?.trim() ||
            "Lesson video processing failed. Retry transcript and search processing before publishing."
          : "Run lesson video transcript and search processing before publishing.";

    blockingReasons.push({
      code: "processing_incomplete",
      message: processingMessage,
    });
  }

  return {
    canPublish: blockingReasons.length === 0,
    blockingReasons,
  };
}
