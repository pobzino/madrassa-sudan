export type LessonVideoProcessingStatus =
  | "idle"
  | "pending"
  | "processing"
  | "ready"
  | "error";

type LessonVideoFields = {
  video_url_1080p?: string | null;
  video_url_360p?: string | null;
  video_url_480p?: string | null;
  video_url_720p?: string | null;
  video_duration_seconds?: number | string | null;
};

const VALID_VIDEO_PROCESSING_STATUSES: LessonVideoProcessingStatus[] = [
  "idle",
  "pending",
  "processing",
  "ready",
  "error",
];

export function normalizeLessonVideoProcessingStatus(
  value: string | null | undefined
): LessonVideoProcessingStatus {
  if (
    value &&
    VALID_VIDEO_PROCESSING_STATUSES.includes(
      value as LessonVideoProcessingStatus
    )
  ) {
    return value as LessonVideoProcessingStatus;
  }

  return "idle";
}

export function getLessonVideoKey(video: LessonVideoFields) {
  return [
    video.video_url_360p,
    video.video_url_480p,
    video.video_url_720p,
    video.video_url_1080p,
    video.video_duration_seconds == null
      ? ""
      : String(video.video_duration_seconds),
  ]
    .map((value) => value?.trim() || "")
    .filter(Boolean)
    .join("|");
}

export function hasAttachedLessonVideo(video: LessonVideoFields) {
  return Boolean(getLessonVideoKey(video));
}

export function getNextLessonVideoProcessingStatus(params: {
  isPublished: boolean;
  hasVideo: boolean;
}): LessonVideoProcessingStatus {
  if (!params.hasVideo) {
    return "idle";
  }

  return params.isPublished ? "processing" : "pending";
}
