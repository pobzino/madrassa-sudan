"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  getNextLessonVideoProcessingStatus,
  type LessonVideoProcessingStatus,
} from "@/lib/lessons/video-processing";
import { useBunnyBlobUpload, type BlobUploadState, type VideoUrls } from "@/hooks/useBunnyBlobUpload";

type UploadStage = "idle" | "uploading" | "processing" | "saving" | "ready" | "error";
type VideoReadyPayload = VideoUrls & {
  video_processing_status: LessonVideoProcessingStatus;
  video_processing_error?: string | null;
  video_processed_at?: string | null;
};

type UploadJob = {
  lessonId: string;
  lessonTitle: string;
  onVideoReady?: (payload: VideoReadyPayload) => void;
};

type StartUploadParams = UploadJob & {
  blob: Blob;
};

type StartUploadResult =
  | { ok: true }
  | { ok: false; error: string };

type BackgroundVideoUploadContextValue = {
  stage: UploadStage;
  progress: number;
  errorMessage: string | null;
  statusMessage: string | null;
  activeLessonId: string | null;
  activeLessonTitle: string | null;
  isBusy: boolean;
  startUpload: (params: StartUploadParams) => Promise<StartUploadResult>;
  cancelUpload: () => void;
  dismissStatus: () => void;
};

const BackgroundVideoUploadContext = createContext<BackgroundVideoUploadContextValue | null>(null);
const PERSISTED_UPLOAD_STORAGE_KEY = "madrassa:background-video-upload";

function getProcessingMessage(uploadState: BlobUploadState) {
  if (uploadState === "uploading") {
    return "Uploading recording in the background. You can keep working, but keep this tab open.";
  }

  if (uploadState === "uploaded" || uploadState === "transcoding") {
    return "Preparing the video in the background. You can keep working, but keep this tab open.";
  }

  return null;
}

function persistUploadJob(job: Pick<UploadJob, "lessonId" | "lessonTitle">) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PERSISTED_UPLOAD_STORAGE_KEY,
    JSON.stringify({
      lessonId: job.lessonId,
      lessonTitle: job.lessonTitle,
      startedAt: new Date().toISOString(),
    })
  );
}

function clearPersistedUploadJob() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PERSISTED_UPLOAD_STORAGE_KEY);
}

function readPersistedUploadJob():
  | { lessonId: string; lessonTitle: string }
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(PERSISTED_UPLOAD_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      lessonId?: string;
      lessonTitle?: string;
    };

    if (!parsed.lessonId || !parsed.lessonTitle) {
      clearPersistedUploadJob();
      return null;
    }

    return {
      lessonId: parsed.lessonId,
      lessonTitle: parsed.lessonTitle,
    };
  } catch {
    clearPersistedUploadJob();
    return null;
  }
}

export function BackgroundVideoUploadProvider({ children }: { children: ReactNode }) {
  const bunnyUpload = useBunnyBlobUpload();
  const [job, setJob] = useState<UploadJob | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const readyHandledRef = useRef(false);

  useEffect(() => {
    const persistedJob = readPersistedUploadJob();
    if (!persistedJob) {
      return;
    }

    setJob((current) => current ?? persistedJob);
    setStage((current) => (current === "idle" ? "error" : current));
    setStatusMessage((current) =>
      current ||
      "The previous background upload was interrupted before it finished. Please reopen the lesson and retry the video upload."
    );
  }, []);

  const dismissStatus = useCallback(() => {
    bunnyUpload.reset();
    readyHandledRef.current = false;
    clearPersistedUploadJob();
    setJob(null);
    setStage("idle");
    setStatusMessage(null);
  }, [bunnyUpload]);

  const cancelUpload = useCallback(() => {
    bunnyUpload.cancel();
    readyHandledRef.current = false;
    clearPersistedUploadJob();
    setJob(null);
    setStage("idle");
    setStatusMessage(null);
  }, [bunnyUpload]);

  const startUpload = useCallback(
    async ({ blob, lessonId, lessonTitle, onVideoReady }: StartUploadParams): Promise<StartUploadResult> => {
      if (stage === "uploading" || stage === "processing" || stage === "saving") {
        return { ok: false, error: "Another video is already uploading. Please wait for it to finish." };
      }

      if (!lessonId.trim()) {
        return { ok: false, error: "Lesson ID is required before uploading a recording." };
      }

      if (blob.size === 0) {
        return { ok: false, error: "Recording is empty. Please retake it before uploading." };
      }

      bunnyUpload.reset();
      readyHandledRef.current = false;
      persistUploadJob({ lessonId, lessonTitle });
      setJob({
        lessonId,
        lessonTitle,
        onVideoReady,
      });
      setStage("uploading");
      setStatusMessage("Uploading recording in the background. You can keep working, but keep this tab open.");

      await bunnyUpload.upload(blob, { lessonId, lessonTitle });
      return { ok: true };
    },
    [bunnyUpload, stage]
  );

  useEffect(() => {
    if (!job) {
      return;
    }

    if (bunnyUpload.state === "uploading") {
      setStage("uploading");
      setStatusMessage(getProcessingMessage("uploading"));
      return;
    }

    if (bunnyUpload.state === "uploaded" || bunnyUpload.state === "transcoding") {
      setStage("processing");
      setStatusMessage(getProcessingMessage(bunnyUpload.state));
      return;
    }

    if (bunnyUpload.state === "error") {
      setStage("error");
      setStatusMessage(bunnyUpload.errorMessage || "Video upload failed.");
    }
  }, [bunnyUpload.errorMessage, bunnyUpload.state, job]);

  useEffect(() => {
    if (
      !job ||
      bunnyUpload.state !== "ready" ||
      !bunnyUpload.videoUrls ||
      readyHandledRef.current
    ) {
      return;
    }

    readyHandledRef.current = true;
    setStage("saving");
    setStatusMessage("Saving video to the lesson and finishing background processing.");

    let cancelled = false;

    const finalizeUpload = async () => {
      const supabase = createClient();

      try {
        const urls = bunnyUpload.videoUrls!;

        const { data: lesson, error: lessonError } = await supabase
          .from("lessons")
          .select("is_published")
          .eq("id", job.lessonId)
          .single();

        if (lessonError) {
          throw new Error(lessonError.message);
        }

        const hasVideo = Boolean(
          urls.video_url_1080p ||
            urls.video_url_720p ||
            urls.video_url_480p ||
            urls.video_url_360p
        );
        const nextProcessingStatus = getNextLessonVideoProcessingStatus({
          isPublished: Boolean(lesson?.is_published),
          hasVideo,
        });

        const { error: updateError } = await supabase
          .from("lessons")
          .update({
            video_url_1080p: urls.video_url_1080p,
            video_url_360p: urls.video_url_360p,
            video_url_480p: urls.video_url_480p,
            video_url_720p: urls.video_url_720p,
            ...(urls.duration_seconds != null
              ? { video_duration_seconds: urls.duration_seconds }
              : {}),
            ai_transcript: null,
            video_processing_status: nextProcessingStatus,
            video_processing_error: null,
            video_processed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.lessonId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        let nextMessage = "Video ready. It has been added to the lesson.";

        if (lesson?.is_published) {
          job.onVideoReady?.({
            ...urls,
            video_processing_status: "processing",
            video_processing_error: null,
            video_processed_at: null,
          });
          const response = await fetch(`/api/teacher/lessons/${job.lessonId}/process-video`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ language_hint: "ar" }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            job.onVideoReady?.({
              ...urls,
              video_processing_status: "error",
              video_processing_error:
                data.error || "Video ready, but transcript processing failed.",
              video_processed_at: null,
            });
            nextMessage = data.error
              ? `Video ready. ${data.error}`
              : "Video ready, but transcript processing failed.";
          } else {
            job.onVideoReady?.({
              ...urls,
              video_processing_status: "ready",
              video_processing_error: null,
              video_processed_at: new Date().toISOString(),
            });
            nextMessage = "Video ready. Transcript and search index were updated.";
          }
        } else {
          job.onVideoReady?.({
            ...urls,
            video_processing_status: nextProcessingStatus,
            video_processing_error: null,
            video_processed_at: null,
          });
          nextMessage =
            "Video uploaded. Run transcript and search processing before publishing this lesson.";
        }

        if (cancelled) {
          return;
        }

        setStage("ready");
        setStatusMessage(nextMessage);
        clearPersistedUploadJob();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStage("error");
        setStatusMessage(
          error instanceof Error ? error.message : "Video upload finished, but saving to the lesson failed."
        );
      }
    };

    void finalizeUpload();

    return () => {
      cancelled = true;
    };
  }, [bunnyUpload.state, bunnyUpload.videoUrls, job]);

  useEffect(() => {
    if (stage !== "ready") {
      return;
    }

    const timeout = window.setTimeout(() => {
      dismissStatus();
    }, 6000);

    return () => window.clearTimeout(timeout);
  }, [dismissStatus, stage]);

  useEffect(() => {
    const shouldWarn =
      stage === "uploading" || stage === "processing" || stage === "saving";

    if (!shouldWarn) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [stage]);

  const value = useMemo<BackgroundVideoUploadContextValue>(
    () => ({
      stage,
      progress: bunnyUpload.progress,
      errorMessage: stage === "error" ? statusMessage || bunnyUpload.errorMessage : null,
      statusMessage,
      activeLessonId: job?.lessonId || null,
      activeLessonTitle: job?.lessonTitle || null,
      isBusy: stage === "uploading" || stage === "processing" || stage === "saving",
      startUpload,
      cancelUpload,
      dismissStatus,
    }),
    [
      bunnyUpload.errorMessage,
      bunnyUpload.progress,
      cancelUpload,
      dismissStatus,
      job?.lessonId,
      job?.lessonTitle,
      stage,
      startUpload,
      statusMessage,
    ]
  );

  return (
    <BackgroundVideoUploadContext.Provider value={value}>
      {children}
    </BackgroundVideoUploadContext.Provider>
  );
}

export function useBackgroundVideoUpload() {
  const context = useContext(BackgroundVideoUploadContext);
  if (!context) {
    throw new Error("useBackgroundVideoUpload must be used within BackgroundVideoUploadProvider");
  }
  return context;
}
