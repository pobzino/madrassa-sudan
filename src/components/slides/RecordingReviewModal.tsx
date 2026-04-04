'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { BlobUploadState } from '@/hooks/useBunnyBlobUpload';
import { useVideoEditor } from '@/hooks/useVideoEditor';
import VideoTimeline from './VideoTimeline';

interface RecordingReviewModalProps {
  blob: Blob;
  uploadState: BlobUploadState;
  uploadProgress: number;
  uploadError: string | null;
  onUpload: (editedBlob?: Blob) => void;
  onRetake: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingReviewModal({
  blob,
  uploadState,
  uploadProgress,
  uploadError,
  onUpload,
  onRetake,
  onDiscard,
  onCancel,
}: RecordingReviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [editedBlob, setEditedBlob] = useState<Blob | null>(null);

  const activeBlob = editedBlob || blob;
  const blobUrl = useMemo(() => URL.createObjectURL(activeBlob), [activeBlob]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const editor = useVideoEditor({ blob, duration: videoDuration });

  const isUploading = uploadState === 'uploading' || uploadState === 'uploaded' || uploadState === 'transcoding';
  const isSuccess = uploadState === 'ready';
  // Timeline is interactive only before uploading/processing
  const showTimeline = videoDuration > 0 && !isUploading && !isSuccess && !editor.isProcessing;

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video && video.duration && isFinite(video.duration)) {
      setVideoDuration(video.duration);
    }
  }, []);

  // Preview-aware timeupdate: skip cut regions and clamp to trim bounds
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    setCurrentTime(t);

    // Only enforce bounds while playing
    if (video.paused) return;

    // Stop at trim end
    if (t >= editor.trimEnd - 0.05) {
      video.pause();
      video.currentTime = editor.trimEnd;
      return;
    }

    // Jump past trim start if somehow before it
    if (t < editor.trimStart) {
      video.currentTime = editor.trimStart;
      return;
    }

    // Skip over cut regions
    for (const cut of editor.cutRegions) {
      const cutStart = Math.max(cut.start, editor.trimStart);
      const cutEnd = Math.min(cut.end, editor.trimEnd);
      if (t >= cutStart - 0.05 && t < cutEnd) {
        video.currentTime = cutEnd;
        return;
      }
    }
  }, [editor.trimStart, editor.trimEnd, editor.cutRegions]);

  const handlePlay = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      // If at or past trimEnd, restart from trimStart
      if (video.currentTime >= editor.trimEnd - 0.1) {
        video.currentTime = editor.trimStart;
      }
      // If before trimStart, jump to it
      if (video.currentTime < editor.trimStart) {
        video.currentTime = editor.trimStart;
      }
    }
    setIsPlaying(true);
  }, [editor.trimStart, editor.trimEnd]);

  const handlePause = useCallback(() => setIsPlaying(false), []);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      // Clamp seek to trim bounds
      const clamped = Math.max(editor.trimStart, Math.min(time, editor.trimEnd));
      video.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, [editor.trimStart, editor.trimEnd]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  }, []);

  const handleApplyEdits = useCallback(async () => {
    videoRef.current?.pause();
    const result = await editor.process();
    if (result) {
      setEditedBlob(result);
      editor.reset();
    }
  }, [editor]);

  const handleAddCut = useCallback(() => {
    editor.addCutRegion(currentTime);
  }, [editor, currentTime]);

  const handleUpload = useCallback(() => {
    if (editedBlob) {
      onUpload(editedBlob);
    } else {
      onUpload();
    }
  }, [editedBlob, onUpload]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {editor.isProcessing
              ? 'Processing Edits...'
              : isSuccess
                ? 'Video Saved!'
                : isUploading
                  ? 'Uploading...'
                  : 'Review Recording'}
          </h3>
          {editedBlob && !isUploading && !isSuccess && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
              Edited
            </span>
          )}
        </div>

        {/* Video player */}
        <div className="px-6 pt-4">
          {blobUrl && (
            <video
              ref={videoRef}
              src={blobUrl}
              controls={!showTimeline}
              className="w-full rounded-xl bg-black aspect-video"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
            />
          )}
        </div>

        {/* Always-visible timeline + editing tools */}
        {showTimeline && (
          <div className="px-6 pt-3 pb-4 space-y-3">
            {/* Play controls + Cut + Duration */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={togglePlayPause}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-3.5 h-3.5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-gray-700 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={handleAddCut}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                title="Mark a section to remove"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                </svg>
                Cut
              </button>

              <div className="flex-1" />

              <div className="text-xs text-gray-500">
                <span className="font-mono">{formatDuration(videoDuration)}</span>
                {editor.hasEdits && (
                  <>
                    <span className="mx-1 text-gray-300">&rarr;</span>
                    <span className="font-mono font-medium text-emerald-600">
                      {formatDuration(editor.keptDuration)}
                    </span>
                  </>
                )}
              </div>

              {editor.hasEdits && (
                <button
                  onClick={handleApplyEdits}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Apply
                </button>
              )}
            </div>

            {/* Timeline */}
            <VideoTimeline
              duration={videoDuration}
              currentTime={currentTime}
              trimStart={editor.trimStart}
              trimEnd={editor.trimEnd}
              cutRegions={editor.cutRegions}
              onSeek={handleSeek}
              onTrimStartChange={editor.setTrimStart}
              onTrimEndChange={editor.setTrimEnd}
              onCutRegionUpdate={editor.updateCutRegion}
              onCutRegionRemove={editor.removeCutRegion}
            />

            {/* Contextual help */}
            <p className="text-[11px] text-gray-400 leading-tight">
              Drag amber handles to trim. Click &quot;Cut&quot; to mark a section to remove, then drag its red edges.
            </p>
          </div>
        )}

        {/* Processing progress */}
        {editor.isProcessing && (
          <div className="px-6 pb-4 space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${editor.processProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">
              {editor.processProgress < 15
                ? 'Loading video processor...'
                : `Processing video... ${editor.processProgress}%`}
            </p>
          </div>
        )}

        {/* Process error */}
        {editor.processError && (
          <div className="px-6 pb-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="h-5 w-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm font-medium text-red-800">{editor.processError}</span>
            </div>
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="px-6 pb-4 space-y-2">
            {uploadState === 'uploading' && (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 text-center">
                  Uploading... {uploadProgress}%
                </p>
              </>
            )}
            {(uploadState === 'uploaded' || uploadState === 'transcoding') && (
              <div className="flex items-center justify-center gap-3 py-2">
                <svg className="animate-spin h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-gray-600">Processing video... This usually takes 1–5 minutes.</span>
              </div>
            )}
          </div>
        )}

        {/* Success state */}
        {isSuccess && (
          <div className="px-6 pb-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-medium text-emerald-800">
                Video saved to lesson! Video URLs have been updated.
              </span>
            </div>
          </div>
        )}

        {/* Upload error state */}
        {uploadState === 'error' && uploadError && (
          <div className="px-6 pb-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="h-5 w-5 text-red-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-sm font-medium text-red-800">{uploadError}</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          {editor.isProcessing ? (
            <button
              onClick={() => editor.reset()}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          ) : isSuccess ? (
            <button
              onClick={onDiscard}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          ) : isUploading ? (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel Upload
            </button>
          ) : (
            <>
              <button
                onClick={onDiscard}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={onRetake}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Retake
              </button>
              <button
                onClick={handleUpload}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Upload to Lesson
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
