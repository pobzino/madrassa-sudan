'use client';

/**
 * Play one stretch of a longer audio file — used so a tutor can hear the part
 * of a recording they are about to replace, and compare it against the new
 * take before applying the fix.
 *
 * Seeks to `startMs` and stops itself at `endMs`; the surrounding audio is
 * never heard. Several of these can be on screen at once, so starting one
 * stops any other (they share a module-level "currently playing" reference).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

let currentlyPlaying: HTMLAudioElement | null = null;

interface AudioSpanPlayerProps {
  src: string | null;
  startMs: number;
  endMs: number;
  label?: string;
  /** Compact icon-only button for dense lists. */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioSpanPlayer({
  src,
  startMs,
  endMs,
  label,
  compact = false,
  disabled = false,
  className = '',
}: AudioSpanPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      if (currentlyPlaying === audio) currentlyPlaying = null;
    }
    setPlaying(false);
    setLoading(false);
  }, []);

  // Never leave audio playing after the panel closes.
  useEffect(() => stop, [stop]);

  const play = useCallback(async () => {
    if (!src) return;
    if (currentlyPlaying && currentlyPlaying !== audioRef.current) {
      currentlyPlaying.pause();
    }

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(src);
      audio.preload = 'metadata';
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => {
        if (audio!.currentTime * 1000 >= endMs) {
          audio!.pause();
          setPlaying(false);
          if (currentlyPlaying === audio) currentlyPlaying = null;
        }
      });
      audio.addEventListener('ended', () => setPlaying(false));
      // Anything can pause us — the span-end handler, another player taking
      // over, or the browser. Track the element's own state rather than
      // assuming only our click stops playback, or the button lies.
      audio.addEventListener('pause', () => setPlaying(false));
      audio.addEventListener('play', () => setPlaying(true));
      audio.addEventListener('error', () => {
        setFailed(true);
        setPlaying(false);
        setLoading(false);
      });
    }

    try {
      setLoading(true);
      setFailed(false);
      // Seeking needs metadata; wait for it on the first play.
      if (audio.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const ok = () => resolve();
          audio!.addEventListener('loadedmetadata', ok, { once: true });
          audio!.addEventListener('error', () => reject(new Error('load failed')), { once: true });
        });
      }
      audio.currentTime = startMs / 1000;
      await audio.play();
      currentlyPlaying = audio;
      setPlaying(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [src, startMs, endMs]);

  const unavailable = !src || failed;
  const title = unavailable
    ? 'The original audio for this recording is unavailable'
    : `Play ${formatClock(startMs)}–${formatClock(endMs)}`;

  return (
    <button
      type="button"
      onClick={playing ? stop : play}
      disabled={disabled || unavailable}
      title={title}
      aria-label={label ?? title}
      className={
        className ||
        (compact
          ? 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-800 disabled:opacity-30'
          : 'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900 disabled:opacity-40')
      }
    >
      {playing ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
      {!compact && <span>{loading ? 'Loading…' : playing ? 'Stop' : (label ?? 'Listen')}</span>}
    </button>
  );
}
