'use client';

/**
 * Watch a recording — or one slide of it — before changing anything.
 *
 * Hearing the audio is not enough to judge a lesson: the slides, reveals and
 * whiteboard strokes are half of what a child sees. This renders the same
 * <SimPlayer> students use, so "preview" means the real thing.
 *
 * Two uses:
 *  - a whole version from history, before restoring it
 *  - one slide's stretch of the current recording, before re-recording it
 *    (isolated by feeding SimPlayer cut ranges either side of the span)
 */

import { useEffect, useMemo, useRef } from 'react';
// Imported directly rather than via next/dynamic: a dynamic() wrapper does not
// forward refs, so the SimPlayerHandle would be null and the span boundary
// below could never pause playback. (SimReviewModal imports it directly too.)
import SimPlayer, { type SimPlayerHandle } from './SimPlayer';
import type { SimClipSegment, SimPayload } from '@/lib/sim.types';

interface SimPreviewModalProps {
  payload: SimPayload;
  language: 'ar' | 'en';
  title: string;
  subtitle?: string;
  /** Play only this stretch (ms). Omit to play the whole recording. */
  spanStartMs?: number;
  spanEndMs?: number;
  onClose: () => void;
  /** Optional action offered under the player, e.g. Restore / Re-record. */
  action?: { label: string; onClick: () => void; tone?: 'primary' | 'amber' };
}

export default function SimPreviewModal({
  payload,
  language,
  title,
  subtitle,
  spanStartMs,
  spanEndMs,
  onClose,
  action,
}: SimPreviewModalProps) {
  const playerRef = useRef<SimPlayerHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Isolate a span by cutting everything outside it, so the scrubber shows the
  // slide's own length and events project correctly.
  const clipSegments = useMemo<SimClipSegment[] | null>(() => {
    if (spanStartMs == null || spanEndMs == null) return payload.sim.clip_segments ?? null;
    const totalSec = payload.sim.duration_ms / 1000;
    const startSec = spanStartMs / 1000;
    const endSec = spanEndMs / 1000;
    const cuts: SimClipSegment[] = [];
    if (startSec > 0.05) cuts.push({ start: 0, end: startSec });
    if (endSec < totalSec - 0.05) cuts.push({ start: endSec, end: totalSec });
    return cuts.length > 0 ? cuts : null;
  }, [payload.sim.clip_segments, payload.sim.duration_ms, spanStartMs, spanEndMs]);

  // Bound playback to the span at the <audio> element itself.
  //
  // Two earlier attempts failed and are worth not repeating: cut ranges alone
  // do not stop a span that ends before the recording does (measured running
  // 5s into the next slide), and a SimPlayerHandle ref could not be relied on
  // to pause it. Listening to the element is independent of both.
  useEffect(() => {
    if (spanEndMs == null) return;
    const root = containerRef.current;
    if (!root) return;

    let audio: HTMLAudioElement | null = null;
    const onTime = () => {
      if (audio && audio.currentTime * 1000 >= spanEndMs - 40) {
        audio.pause();
        playerRef.current?.pause();
      }
    };

    // The player mounts its <audio> asynchronously.
    const attach = () => {
      const found = root.querySelector('audio');
      if (found && found !== audio) {
        audio?.removeEventListener('timeupdate', onTime);
        audio = found;
        audio.addEventListener('timeupdate', onTime);
      }
    };
    attach();
    const poll = setInterval(attach, 500);
    return () => {
      clearInterval(poll);
      audio?.removeEventListener('timeupdate', onTime);
    };
  }, [spanEndMs]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div ref={containerRef}>
          <SimPlayer
            ref={playerRef}
            payload={payload}
            language={language}
            clipSegments={clipSegments}
            className="w-full"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Close
          </button>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
                action.tone === 'amber' ? 'bg-amber-500' : 'bg-[var(--primary,#007229)]'
              }`}
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
