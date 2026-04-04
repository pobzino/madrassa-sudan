"use client";

import { useBackgroundVideoUpload } from "@/contexts/BackgroundVideoUploadContext";

export default function BackgroundVideoUploadViewport() {
  const {
    activeLessonTitle,
    cancelUpload,
    dismissStatus,
    errorMessage,
    isBusy,
    progress,
    stage,
    statusMessage,
  } = useBackgroundVideoUpload();

  if (stage === "idle") {
    return null;
  }

  const isUploading = stage === "uploading";
  const isReady = stage === "ready";
  const isError = stage === "error";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] w-[min(92vw,420px)]">
      <div
        className={`pointer-events-auto rounded-2xl border bg-white shadow-2xl ring-1 ring-black/5 ${
          isError
            ? "border-red-200"
            : isReady
              ? "border-emerald-200"
              : "border-gray-200"
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isError
                ? "bg-red-100 text-red-600"
                : isReady
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-emerald-100 text-emerald-600"
            }`}
          >
            {isError ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16h.01" />
              </svg>
            ) : isReady ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              {isError
                ? "Video upload failed"
                : isReady
                  ? "Video ready"
                  : "Video upload in background"}
            </p>
            {activeLessonTitle && (
              <p className="mt-0.5 truncate text-xs font-medium text-gray-500">
                {activeLessonTitle}
              </p>
            )}
            <p className="mt-2 text-sm text-gray-600">
              {errorMessage || statusMessage}
            </p>

            {isUploading && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">{progress}% uploaded</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={isBusy ? cancelUpload : dismissStatus}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={isBusy ? "Cancel upload" : "Dismiss status"}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
