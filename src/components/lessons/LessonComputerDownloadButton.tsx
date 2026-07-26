"use client";

import { useCallback } from "react";
import SimVideoExportButton from "@/components/lessons/SimVideoExportButton";
import type { SimPayload } from "@/lib/sim.types";

interface LessonComputerDownloadButtonProps {
  lessonId: string;
  title: string;
  videoUrl?: string | null;
  language: "ar" | "en";
  className?: string;
  iconOnly?: boolean;
  getPayload?: () => Promise<SimPayload | null> | SimPayload | null;
}

function withDownloadParam(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=`;
}

function sanitizeFilename(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "lesson";
  return cleaned.endsWith(".mp4") ? cleaned : `${cleaned}.mp4`;
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.75A1.75 1.75 0 015.75 4h12.5A1.75 1.75 0 0120 5.75v8.5A1.75 1.75 0 0118.25 16H5.75A1.75 1.75 0 014 14.25v-8.5zM8 20h8M12 16v4M12 7.5v5m0 0l-2-2m2 2l2-2" />
    </svg>
  );
}

export default function LessonComputerDownloadButton({
  lessonId,
  title,
  videoUrl,
  language,
  className = "",
  iconOnly = false,
  getPayload,
}: LessonComputerDownloadButtonProps) {
  const label = language === "ar" ? "تحميل MP4" : "Download MP4";
  const ariaLabel = language === "ar" ? "تحميل الفيديو إلى الكمبيوتر" : "Download video to computer";

  const fetchPayload = useCallback(async () => {
    if (getPayload) return getPayload();

    const response = await fetch(`/api/lessons/${lessonId}/sim`);
    if (!response.ok) return null;
    const data = await response.json();
    return (data?.sim as SimPayload | null) ?? null;
  }, [getPayload, lessonId]);

  if (videoUrl) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const anchor = document.createElement("a");
          anchor.href = withDownloadParam(videoUrl);
          anchor.download = sanitizeFilename(title);
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }}
        className={className}
      >
        <DownloadIcon />
        {!iconOnly && <span>{label}</span>}
      </button>
    );
  }

  return (
    <SimVideoExportButton
      getPayload={fetchPayload}
      language={language}
      label={label}
      ariaLabel={ariaLabel}
      showLabel={!iconOnly}
      filename={title}
      className={className}
    />
  );
}
