import {
  getCurriculumRequirementMessage,
  type CurriculumSelection,
} from "@/lib/curriculum";
import type { Slide } from "@/lib/slides.types";

type SubjectIdentity = {
  name_ar?: string | null;
  name_en?: string | null;
};

export type PublishBlockingReasonCode =
  | "missing_sim"
  | "missing_slides"
  | "missing_curriculum_topic";

export interface PublishBlockingReason {
  code: PublishBlockingReasonCode;
  message: string;
}

interface LessonPublishReadinessInput {
  subject: SubjectIdentity | null;
  gradeLevel: number | null | undefined;
  curriculumTopic: CurriculumSelection | null;
  slides: Slide[];
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
  const curriculumMessage = getCurriculumRequirementMessage(
    input.subject,
    input.gradeLevel,
    input.curriculumTopic
  );

  if (!input.hasSim) {
    blockingReasons.push({
      code: "missing_sim",
      message: "Record a sim before publishing.",
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

  return {
    canPublish: blockingReasons.length === 0,
    blockingReasons,
  };
}
