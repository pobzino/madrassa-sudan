'use client';

/**
 * ExportVideoButton — teacher-side "lesson to MP4" control.
 *
 * Self-contained: reads the current export state from
 * GET /api/teacher/lessons/[id]/export-video on mount (so an export started
 * in another tab/session is picked up), triggers a render with POST, and
 * polls while the worker runs. Terminal states surface as toasts; a finished
 * export renders as a direct download link.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type ExportStatus = 'unknown' | 'idle' | 'pending' | 'processing' | 'ready' | 'error';

interface ExportState {
  status: ExportStatus;
  videoUrl: string | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
// ~15 minutes; long lessons render for a while. After this we surface a
// retry rather than polling forever.
const MAX_POLL_ATTEMPTS = 300;

const SECONDARY_BUTTON_CLASS =
  'px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 disabled:opacity-50';

interface ExportVideoButtonProps {
  lessonId: string;
  language: 'ar' | 'en';
}

export default function ExportVideoButton({ lessonId, language }: ExportVideoButtonProps) {
  const [state, setState] = useState<ExportState>({
    status: 'unknown',
    videoUrl: null,
    error: null,
  });
  const [triggering, setTriggering] = useState(false);
  // Bumping the generation cancels any in-flight poll loop (unmount/retrigger).
  const pollGenRef = useRef(0);

  const fetchStatus = useCallback(async (): Promise<ExportState | null> => {
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/export-video`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        status: (data.status as ExportStatus) ?? 'unknown',
        videoUrl: typeof data.video_url_720p === 'string' ? data.video_url_720p : null,
        error: typeof data.error === 'string' ? data.error : null,
      };
    } catch {
      return null;
    }
  }, [lessonId]);

  const startPolling = useCallback(async () => {
    const gen = ++pollGenRef.current;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (pollGenRef.current !== gen) return;
      const next = await fetchStatus();
      if (pollGenRef.current !== gen) return;
      if (!next) continue;
      setState(next);
      if (next.status === 'ready') {
        toast.success('Lesson video is ready to download.');
        return;
      }
      if (next.status === 'error') {
        toast.error(`Video export failed: ${next.error ?? 'Unknown error'}`);
        return;
      }
      if (next.status === 'idle') return;
    }
    setState((prev) => ({
      ...prev,
      status: 'error',
      error: 'Export timed out — check the render worker log and retry.',
    }));
  }, [fetchStatus]);

  useEffect(() => {
    let mounted = true;
    const pollGen = pollGenRef;
    fetchStatus().then((initial) => {
      if (!mounted) return;
      // A failed status fetch must not strand the button in the disabled
      // 'unknown' state — fall back to 'idle' so the teacher can still export.
      if (!initial) {
        setState((prev) =>
          prev.status === 'unknown' ? { ...prev, status: 'idle' } : prev
        );
        return;
      }
      setState(initial);
      if (initial.status === 'pending' || initial.status === 'processing') {
        void startPolling();
      }
    });
    return () => {
      mounted = false;
      pollGen.current++;
    };
  }, [fetchStatus, startPolling]);

  const handleExport = useCallback(
    async (force: boolean) => {
      setTriggering(true);
      try {
        const res = await fetch(`/api/teacher/lessons/${lessonId}/export-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language, force }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(data?.error ?? 'Failed to start video export.');
          // 409 = an export is already running (e.g. started in another tab).
          // Reflect that by polling it to completion instead of sitting idle.
          if (res.status === 409) {
            setState((prev) => ({ ...prev, status: 'processing' }));
            void startPolling();
          }
          return;
        }
        toast.message('Export started — this can take several minutes.');
        setState((prev) => ({ ...prev, status: 'pending', error: null }));
        void startPolling();
      } catch {
        toast.error('Failed to start video export.');
      } finally {
        setTriggering(false);
      }
    },
    [lessonId, language, startPolling]
  );

  const exporting = state.status === 'pending' || state.status === 'processing';

  if (exporting) {
    return (
      <button
        type="button"
        disabled
        className={SECONDARY_BUTTON_CLASS}
        title="Rendering the lesson video — this can take several minutes"
      >
        <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
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
        Exporting…
      </button>
    );
  }

  if (state.status === 'ready' && state.videoUrl) {
    const downloadHref = `${state.videoUrl}${state.videoUrl.includes('?') ? '&' : '?'}download=`;
    return (
      <div className="flex items-center gap-1">
        <a
          href={downloadHref}
          className={SECONDARY_BUTTON_CLASS}
          title="Download the exported lesson video"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
          Download MP4
        </a>
        <button
          type="button"
          onClick={() => handleExport(false)}
          disabled={triggering}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
          title="Re-export the video (e.g. after re-recording the sim)"
          aria-label="Re-export video"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => handleExport(state.status === 'error')}
      disabled={triggering || state.status === 'unknown'}
      className={SECONDARY_BUTTON_CLASS}
      title={
        state.status === 'error'
          ? `Last export failed: ${state.error ?? 'unknown error'} — click to retry`
          : 'Render this lesson (slides + recording) as a downloadable MP4'
      }
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
        />
      </svg>
      {state.status === 'error' ? 'Retry export' : 'Export MP4'}
    </button>
  );
}
