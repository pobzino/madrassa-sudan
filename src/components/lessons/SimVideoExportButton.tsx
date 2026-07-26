'use client';

/**
 * SimVideoExportButton — "render this lesson as MP4, in your browser".
 *
 * Runs the client-side WebCodecs exporter (src/lib/video-export) on a sim
 * payload and saves the result straight to the user's downloads. Nothing is
 * uploaded or stored — the video exists only on the clicking device.
 *
 * Used by both the teacher slides toolbar (which fetches the payload on
 * click) and the student lesson page (which already holds the payload).
 * Clicking again while an export runs cancels it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SimPayload } from '@/lib/sim.types';
import {
  downloadBlob,
  exportSimVideo,
  isVideoExportSupported,
  type ExportProgress,
} from '@/lib/video-export/export-sim-video';

interface SimVideoExportButtonProps {
  /** Payload source — may fetch (teacher) or return cached state (student). */
  getPayload: () => Promise<SimPayload | null> | SimPayload | null;
  language: 'ar' | 'en';
  /** Idle button label (parent supplies the translated string). */
  label: string;
  ariaLabel?: string;
  showLabel?: boolean;
  /** Download filename; '.mp4' appended if missing. */
  filename?: string;
  className?: string;
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'lesson';
  return cleaned.endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
}

export default function SimVideoExportButton({
  getPayload,
  language,
  label,
  ariaLabel,
  showLabel = true,
  filename = 'lesson-video',
  className = '',
}: SimVideoExportButtonProps) {
  // Determined post-mount to avoid a hydration mismatch (SSR has no window).
  const [supported, setSupported] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSupported(isVideoExportSupported());
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  const running = progress !== null;

  const handleClick = useCallback(async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (abortRef.current) {
      abortRef.current.abort();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ phase: 'preparing', percent: 0 });
    try {
      const payload = await getPayload();
      if (!payload) {
        toast.error(
          language === 'ar'
            ? 'تعذر تحميل تسجيل الدرس.'
            : 'Could not load the lesson recording.'
        );
        return;
      }
      const result = await exportSimVideo(payload, {
        language,
        signal: controller.signal,
        onProgress: setProgress,
      });
      downloadBlob(result.blob, sanitizeFilename(filename));
      toast.success(
        language === 'ar'
          ? 'الفيديو جاهز — تحقق من التنزيلات.'
          : 'Video ready — check your downloads.'
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.message(language === 'ar' ? 'تم إلغاء التصدير.' : 'Export cancelled.');
      } else {
        const message =
          error instanceof Error ? error.message : 'Video export failed.';
        toast.error(
          language === 'ar' ? `فشل تصدير الفيديو: ${message}` : `Video export failed: ${message}`
        );
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  }, [filename, getPayload, language]);

  if (supported === false) {
    return (
      <button
        type="button"
        disabled
        aria-label={ariaLabel ?? label}
        className={`${className} opacity-50 cursor-not-allowed`}
        title={
          language === 'ar'
            ? 'متصفحك لا يدعم تصدير الفيديو — جرّب Chrome أو Edge حديثًا.'
            : 'Your browser cannot export video — try a recent Chrome or Edge.'
        }
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.75A1.75 1.75 0 015.75 4h12.5A1.75 1.75 0 0120 5.75v8.5A1.75 1.75 0 0118.25 16H5.75A1.75 1.75 0 014 14.25v-8.5zM8 20h8M12 16v4M12 7.5v5m0 0l-2-2m2 2l2-2" />
        </svg>
        {showLabel && label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={supported === null}
      aria-label={ariaLabel ?? label}
      className={className}
      title={
        running
          ? language === 'ar'
            ? 'انقر للإلغاء'
            : 'Click to cancel'
          : language === 'ar'
            ? 'يُنشئ الفيديو على جهازك — لا يُرفع أي شيء'
            : 'Renders the video on your device — nothing is uploaded'
      }
    >
      {running ? (
        <>
          <svg className="animate-spin w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="tabular-nums">{progress.percent}%</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.75A1.75 1.75 0 015.75 4h12.5A1.75 1.75 0 0120 5.75v8.5A1.75 1.75 0 0118.25 16H5.75A1.75 1.75 0 014 14.25v-8.5zM8 20h8M12 16v4M12 7.5v5m0 0l-2-2m2 2l2-2" />
          </svg>
          {showLabel && label}
        </>
      )}
    </button>
  );
}
