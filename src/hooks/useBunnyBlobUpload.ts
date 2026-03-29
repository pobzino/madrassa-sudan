'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import * as tus from 'tus-js-client';

export type BlobUploadState = 'idle' | 'uploading' | 'uploaded' | 'transcoding' | 'ready' | 'error';

interface VideoUrls {
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
  duration_seconds?: number;
}

interface UseBunnyBlobUploadOptions {
  lessonId: string;
  lessonTitle: string;
}

interface UseBunnyBlobUploadReturn {
  upload: (blob: Blob) => Promise<void>;
  state: BlobUploadState;
  progress: number;
  videoUrls: VideoUrls | null;
  errorMessage: string | null;
  cancel: () => void;
  reset: () => void;
}

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 15 * 60 * 1000;

export function useBunnyBlobUpload({
  lessonId,
  lessonTitle,
}: UseBunnyBlobUploadOptions): UseBunnyBlobUploadReturn {
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

    pollingRef.current = setInterval(async () => {
      if (Date.now() - pollingStartRef.current > POLL_TIMEOUT) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setState('error');
        setErrorMessage('Transcoding is taking longer than expected.');
        return;
      }

      try {
        const res = await fetch(`/api/bunny/status?videoId=${videoId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'finished' && data.urls) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('ready');
          setVideoUrls({
            video_url_360p: data.urls.video_url_360p,
            video_url_480p: data.urls.video_url_480p,
            video_url_720p: data.urls.video_url_720p,
            duration_seconds: data.durationSeconds,
          });
        } else if (data.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('error');
          setErrorMessage('Video transcoding failed. Please try again.');
        }
      } catch {
        // Network error — will retry next tick
      }
    }, POLL_INTERVAL);
  }, []);

  const upload = useCallback(async (blob: Blob) => {
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
        const err = await credRes.json();
        throw new Error(err.error || 'Failed to create video');
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
  }, [lessonId, lessonTitle, pollTranscodeStatus]);

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
