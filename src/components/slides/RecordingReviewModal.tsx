'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { BlobUploadState } from '@/hooks/useBunnyBlobUpload';

interface RecordingReviewModalProps {
  blob: Blob;
  uploadState: BlobUploadState;
  uploadProgress: number;
  uploadError: string | null;
  onUpload: () => void;
  onRetake: () => void;
  onDiscard: () => void;
  onCancel: () => void;
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
  const blobUrl = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  const isUploading = uploadState === 'uploading' || uploadState === 'uploaded' || uploadState === 'transcoding';
  const isSuccess = uploadState === 'ready';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            {isSuccess ? 'Video Saved!' : isUploading ? 'Uploading...' : 'Review Recording'}
          </h3>
        </div>

        {/* Video player */}
        <div className="px-6 py-4">
          {blobUrl && (
            <video
              ref={videoRef}
              src={blobUrl}
              controls
              className="w-full rounded-xl bg-white aspect-video object-contain"
            />
          )}
        </div>

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

        {/* Error state */}
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
          {isSuccess ? (
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
                onClick={onUpload}
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
