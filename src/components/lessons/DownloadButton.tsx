"use client";

import { useCallback, useState } from "react";
import { useOffline } from "@/contexts/OfflineContext";
import type { DownloadState } from "@/lib/offline/db";

interface DownloadButtonProps {
  lessonId: string;
  size?: "sm" | "md";
  className?: string;
}

export default function DownloadButton({
  lessonId,
  size = "md",
  className = "",
}: DownloadButtonProps) {
  const {
    downloads,
    downloadedLessonIds,
    downloadLesson,
    deleteLesson,
    isOnline,
  } = useOffline();
  const [showConfirm, setShowConfirm] = useState(false);

  const download = downloads.get(lessonId);
  const isDownloaded = downloadedLessonIds.has(lessonId);
  const isDownloading = download?.status === "downloading";
  const hasError = download?.status === "error";
  const progress = download?.progress ?? 0;

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const btnSize = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const ringSize = size === "sm" ? 14 : 18;
  const ringStroke = size === "sm" ? 2.5 : 3;
  const circumference = 2 * Math.PI * ringSize;
  const dashOffset = circumference - (progress / 100) * circumference;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isDownloading) return;

      if (isDownloaded) {
        if (!showConfirm) {
          setShowConfirm(true);
          setTimeout(() => setShowConfirm(false), 3000);
          return;
        }
        setShowConfirm(false);
        await deleteLesson(lessonId);
        return;
      }

      if (!isOnline) return;

      try {
        await downloadLesson(lessonId);
      } catch {
        // Error handled by context
      }
    },
    [
      isDownloading,
      isDownloaded,
      isOnline,
      showConfirm,
      lessonId,
      downloadLesson,
      deleteLesson,
    ]
  );

  // Don't show download button when offline and not downloaded
  if (!isOnline && !isDownloaded && !isDownloading) return null;

  return (
    <button
      onClick={handleClick}
      disabled={isDownloading || (!isOnline && !isDownloaded)}
      title={
        showConfirm
          ? "Tap again to remove"
          : isDownloaded
            ? "Downloaded — tap to remove"
            : isDownloading
              ? `Downloading ${progress}%`
              : hasError
                ? "Retry download"
                : "Download for offline"
      }
      className={`relative flex-shrink-0 ${btnSize} rounded-full flex items-center justify-center transition-all ${
        showConfirm
          ? "bg-red-100 text-red-600 hover:bg-red-200"
          : isDownloaded
            ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
            : isDownloading
              ? "bg-blue-50 text-blue-600"
              : hasError
                ? "bg-red-100 text-red-600 hover:bg-red-200"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      } ${className}`}
    >
      {isDownloading ? (
        <>
          {/* Progress ring */}
          <svg
            className="absolute inset-0 -rotate-90"
            viewBox={`0 0 ${(ringSize + ringStroke) * 2} ${(ringSize + ringStroke) * 2}`}
          >
            <circle
              cx={ringSize + ringStroke}
              cy={ringSize + ringStroke}
              r={ringSize}
              fill="none"
              stroke="currentColor"
              strokeWidth={ringStroke}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="text-blue-500 transition-all duration-300"
            />
          </svg>
          <span className="text-[10px] font-bold">{progress}%</span>
        </>
      ) : showConfirm ? (
        /* Delete confirm icon */
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      ) : isDownloaded ? (
        /* Checkmark */
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : hasError ? (
        /* Retry icon */
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      ) : (
        /* Download icon */
        <svg className={iconSize} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      )}
    </button>
  );
}
