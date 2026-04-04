'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as tus from 'tus-js-client';

export type BlobUploadState = 'idle' | 'uploading' | 'uploaded' | 'transcoding' | 'ready' | 'error';

export interface VideoUrls {
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  duration_seconds?: number;
}

interface BlobUploadRequest {
  lessonId: string;
  lessonTitle: string;
}

interface UseBunnyBlobUploadReturn {
  upload: (blob: Blob, request: BlobUploadRequest) => Promise<void>;
  state: BlobUploadState;
  progress: number;
  videoUrls: VideoUrls | null;
  errorMessage: string | null;
  cancel: () => void;
  reset: () => void;
}

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 15 * 60 * 1000;

export function useBunnyBlobUpload(): UseBunnyBlobUploadReturn {
  const [state, setState] = useState<BlobUploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<VideoUrls | null>(null);

  const uploadRef = useRef<tus.Upload | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (uploadRef.current) {
        try { uploadRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  const pollTranscodeStatus = useCallback((videoId: string) => {
    setState('transcoding');
    pollingStartRef.current = Date.now();
    let consecutiveStatusFailures = 0;

    pollingRef.current = setInterval(async () => {
      if (Date.now() - pollingStartRef.current > POLL_TIMEOUT) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setState('error');
        setErrorMessage('Transcoding is taking longer than expected.');
        return;
      }

      try {
        const res = await fetch(`/api/bunny/status?videoId=${videoId}`);
        if (!res.ok) {
          consecutiveStatusFailures += 1;

          let message = `Could not check video status (${res.status}).`;
          try {
            const data = await res.json();
            if (typeof data.error === 'string' && data.error.trim()) {
              message = data.error;
            }
          } catch {
            // Keep default message if response is not JSON.
          }

          if (consecutiveStatusFailures >= 3 || res.status < 500) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setState('error');
            setErrorMessage(message);
          }
          return;
        }

        const data = await res.json();
        consecutiveStatusFailures = 0;

        const hasPlayableUrl = Boolean(
          data.urls &&
          (data.urls.video_url_1080p ||
            data.urls.video_url_720p ||
            data.urls.video_url_480p ||
            data.urls.video_url_360p)
        );

        if (data.status === 'finished' && hasPlayableUrl) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('ready');
          setVideoUrls({
            video_url_1080p: data.urls.video_url_1080p || '',
            video_url_360p: data.urls.video_url_360p || '',
            video_url_480p: data.urls.video_url_480p || '',
            video_url_720p: data.urls.video_url_720p || '',
            duration_seconds: data.durationSeconds,
          });
        } else if (data.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('error');
          setErrorMessage('Video transcoding failed. Please try again.');
        }
      } catch {
        consecutiveStatusFailures += 1;
        if (consecutiveStatusFailures >= 3) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('error');
          setErrorMessage('Video status checks keep failing. Please try again.');
        }
      }
    }, POLL_INTERVAL);
  }, []);

  const upload = useCallback(async (blob: Blob, request: BlobUploadRequest) => {
    const lessonId = request.lessonId.trim();
    const lessonTitle = request.lessonTitle.trim() || 'Recording';

    if (!lessonId) {
      setState('error');
      setErrorMessage('Lesson ID is required for upload.');
      return;
    }

    if (blob.size === 0) {
      setState('error');
      setErrorMessage('Recorded video is empty. Please retake the recording.');
      return;
    }

    setState('uploading');
    setProgress(0);
    setErrorMessage(null);
    setVideoUrls(null);

    try {
      const file = new File([blob], 'recording.webm', { type: blob.type || 'video/webm' });

      const credRes = await fetch('/api/bunny/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `${lessonTitle} — Recording`, lessonId }),
      });

      if (!credRes.ok) {
        const text = await credRes.text();
        let message = 'Failed to create video';
        try {
          const err = JSON.parse(text) as { error?: string };
          if (err.error) message = err.error;
        } catch {
          if (text.trim()) message = text.trim();
        }
        throw new Error(message);
      }

      const { videoId, libraryId, tusEndpoint, authSignature, authExpire } =
        await credRes.json();

      const tusUpload = new tus.Upload(file, {
        endpoint: tusEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          AuthorizationSignature: authSignature,
          AuthorizationExpire: String(authExpire),
          VideoId: videoId,
          LibraryId: libraryId,
        },
        metadata: {
          filetype: file.type,
          title: `${lessonTitle} — Recording`,
        },
        onError: (error) => {
          setState('error');
          setErrorMessage(error.message || 'Upload failed');
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        },
        onSuccess: () => {
          setState('uploaded');
          pollTranscodeStatus(videoId);
        },
      });

      uploadRef.current = tusUpload;
      tusUpload.start();
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }, [pollTranscodeStatus]);

  const cancel = useCallback(() => {
    if (uploadRef.current) {
      try { uploadRef.current.abort(); } catch { /* ignore */ }
    }
    if (pollingRef.current) clearInterval(pollingRef.current);
    setState('idle');
    setProgress(0);
    setErrorMessage(null);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setVideoUrls(null);
  }, [cancel]);

  return { upload, state, progress, videoUrls, errorMessage, cancel, reset };
}
