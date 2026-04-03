'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as tus from 'tus-js-client';

type UploadState = 'idle' | 'uploading' | 'uploaded' | 'transcoding' | 'ready' | 'error';
type InputTab = 'file' | 'url';

interface BunnyVideoUploaderProps {
  lessonId: string;
  lessonTitle: string;
  onVideosReady: (urls: {
    video_url_1080p: string;
    video_url_360p: string;
    video_url_480p: string;
    video_url_720p: string;
    duration_seconds?: number;
  }) => void;
  currentVideoUrl?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const POLL_INTERVAL = 5000; // 5 seconds
const POLL_TIMEOUT = 15 * 60 * 1000; // 15 minutes

export default function BunnyVideoUploader({
  lessonId,
  lessonTitle,
  onVideosReady,
  currentVideoUrl,
}: BunnyVideoUploaderProps) {
  const [state, setState] = useState<UploadState>(currentVideoUrl ? 'ready' : 'idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [inputTab, setInputTab] = useState<InputTab>('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  const uploadRef = useRef<tus.Upload | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
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
        setErrorMessage('Transcoding is taking longer than expected. Try checking again later.');
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
            // Fall back to the status code message above.
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

        if (data.status === 'finished' && data.urls) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('ready');
          onVideosReady({
            video_url_1080p: data.urls.video_url_1080p,
            video_url_360p: data.urls.video_url_360p,
            video_url_480p: data.urls.video_url_480p,
            video_url_720p: data.urls.video_url_720p,
            duration_seconds: data.durationSeconds,
          });
        } else if (data.status === 'error') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setState('error');
          setErrorMessage(data.error || 'Video transcoding failed. Please try again.');
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
  }, [onVideosReady]);

  const startUpload = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setState('error');
      setErrorMessage('File is too large. Maximum size is 5 GB.');
      return;
    }

    setFileName(file.name);
    setState('uploading');
    setProgress(0);
    setErrorMessage('');

    try {
      const credRes = await fetch('/api/bunny/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: lessonTitle || file.name, lessonId }),
      });

      if (!credRes.ok) {
        const err = await credRes.json();
        throw new Error(err.error || 'Failed to create video');
      }

      const { videoId, libraryId, tusEndpoint, authSignature, authExpire } =
        await credRes.json();

      const upload = new tus.Upload(file, {
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
          title: lessonTitle || file.name,
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

      uploadRef.current = upload;
      upload.start();
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Upload failed'
      );
    }
  }, [lessonId, lessonTitle, pollTranscodeStatus]);

  const startUrlImport = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;

    setUrlLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/bunny/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title: lessonTitle || 'Video', lessonId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import video');
      }

      setUrlLoading(false);
      setUrlInput('');
      pollTranscodeStatus(data.videoId);
    } catch (error) {
      setUrlLoading(false);
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Import failed'
      );
    }
  }, [urlInput, lessonId, lessonTitle, pollTranscodeStatus]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) startUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      startUpload(file);
    }
  };

  const handleCancel = () => {
    if (uploadRef.current) {
      try { uploadRef.current.abort(); } catch { /* ignore */ }
    }
    if (pollingRef.current) clearInterval(pollingRef.current);
    setState('idle');
    setProgress(0);
    setFileName('');
    setErrorMessage('');
    setUrlLoading(false);
  };

  const handleRetry = () => {
    setState('idle');
    setProgress(0);
    setErrorMessage('');
    setUrlLoading(false);
  };

  // Idle state
  if (state === 'idle') {
    return (
      <div className="space-y-3">
        {/* Tab switcher */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setInputTab('file')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              inputTab === 'file'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            File Upload
          </button>
          <button
            type="button"
            onClick={() => setInputTab('url')}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
              inputTab === 'url'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Import from URL
          </button>
        </div>

        {inputTab === 'file' ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${isDragging
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <svg className="mx-auto h-10 w-10 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-700">
              Drop a video file here or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              MP4, MOV, WebM — up to 5 GB
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste Google Drive or direct video URL"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && urlInput.trim()) {
                    e.preventDefault();
                    startUrlImport();
                  }
                }}
                disabled={urlLoading}
              />
              <button
                type="button"
                onClick={startUrlImport}
                disabled={!urlInput.trim() || urlLoading}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {urlLoading ? 'Importing...' : 'Import'}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Google Drive: share the file with &quot;Anyone with the link&quot; and paste the share URL. Also supports direct .mp4/.mov/.webm links and Dropbox.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Uploading state — progress bar
  if (state === 'uploading') {
    return (
      <div className="border border-gray-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700 truncate">{fileName}</p>
          <button
            onClick={handleCancel}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Cancel
          </button>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 text-center">
          Uploading... {progress}%
        </p>
      </div>
    );
  }

  // Uploaded / Transcoding state — spinner
  if (state === 'uploaded' || state === 'transcoding') {
    return (
      <div className="border border-gray-200 rounded-xl p-6 text-center space-y-3">
        <div className="flex justify-center">
          <svg className="animate-spin h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-700">
          Processing video...
        </p>
        <p className="text-xs text-gray-500">
          Bunny Stream is transcoding your video into multiple qualities. This usually takes 1–5 minutes.
        </p>
        <button
          onClick={handleCancel}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Ready state — success
  if (state === 'ready') {
    return (
      <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-emerald-800">
            Video ready — URLs have been populated below
          </p>
        </div>
        <button
          onClick={handleRetry}
          className="text-xs text-emerald-700 hover:text-emerald-800 underline"
        >
          Upload a different video
        </button>
      </div>
    );
  }

  // Error state
  return (
    <div className="border border-red-200 bg-red-50 rounded-xl p-6 space-y-3">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm font-medium text-red-800">{errorMessage}</p>
      </div>
      <button
        onClick={handleRetry}
        className="text-xs text-red-700 hover:text-red-800 underline"
      >
        Try again
      </button>
    </div>
  );
}
