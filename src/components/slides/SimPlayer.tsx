'use client';

/**
 * SimPlayer — plays an event-sourced lesson sim.
 *
 * A sim is an audio track + a timeline of `SimEvent`s recorded against a
 * frozen deck snapshot. This component:
 *   1. Loads `SimPayload` (deck + events + signed audio URL).
 *   2. Uses the `<audio>` element's `currentTime` as the master clock.
 *   3. On every animation frame, calls `rebuildSimState` to project the
 *      full surface state at the current timestamp.
 *   4. Renders the current slide via `SlideCard` with `revealedCount` from
 *      the projected state, and overlays a canvas with whiteboard strokes.
 *
 * This is a read-only player: no recording, no editing.
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import SlideCard from './SlideCard';
import {
  clipDurationMs,
  rebuildSimState,
  type SimClipSegment,
  type SimEvent,
  type SimPayload,
  type SimSlideSurface,
  type SimSurfaceState,
  type SimStroke,
} from '@/lib/sim.types';
import { renderStrokeToCtx, type Stroke } from '@/hooks/useWhiteboard';

interface SimPlayerProps {
  payload: SimPayload;
  language?: 'ar' | 'en';
  className?: string;
  /**
   * Optional non-destructive cut ranges in **seconds** against the original
   * timeline. When provided, the player:
   *   - seeks the audio past any range whose start <= t < end
   *   - filters events whose `t` (ms) falls inside a range before projecting
   *   - shows a "virtual" scrubber length = totalMs - sum(clip durations)
   * Pass `null` or an empty array for normal playback.
   */
  clipSegments?: SimClipSegment[] | null;
  /**
   * When true, the player hides its built-in play/seek toolbar so a parent
   * (e.g. the clip editor modal) can render an integrated timeline instead.
   * The parent drives playback via the `SimPlayerHandle` ref.
   */
  hideControls?: boolean;
  /**
   * Fires on every rAF tick (and on seek) with the current **real** audio
   * time in seconds — i.e. the position on the original, un-clipped
   * timeline. Editors use this to move a cursor across the full timeline.
   */
  onRealTimeChange?: (realSec: number) => void;
  /** Fires when the underlying `<audio>` element starts or stops playing. */
  onPlayStateChange?: (isPlaying: boolean) => void;
  /** Fires once when the audio metadata has loaded and `play()` is safe. */
  onReady?: () => void;
}

/**
 * Imperative handle exposed via `forwardRef`. Editors use this to drive
 * playback from an external toolbar so the play button, timeline cursor, and
 * preview stay in sync without re-implementing the clip-skipping logic.
 */
export interface SimPlayerHandle {
  play: () => void;
  pause: () => void;
  /** Seek to a position on the **real** (un-clipped) timeline, in seconds. */
  seekRealSec: (realSec: number) => void;
  isPlaying: () => boolean;
}

// ── Clip math helpers ──────────────────────────────────────────────────────

/** Normalize clip segments: drop empties, sort by start, merge overlaps. */
function normalizeClips(clips: SimClipSegment[] | null | undefined): SimClipSegment[] {
  if (!clips || clips.length === 0) return [];
  const valid = clips
    .filter((c) => c.end > c.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged: SimClipSegment[] = [];
  for (const c of valid) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end);
    } else {
      merged.push({ start: c.start, end: c.end });
    }
  }
  return merged;
}

/**
 * Convert a virtual (clipped) time in ms to the real underlying audio time
 * in ms. Virtual time skips over cut ranges; this adds them back.
 */
function virtualToRealMs(virtualMs: number, clipsSec: SimClipSegment[]): number {
  let real = virtualMs;
  for (const c of clipsSec) {
    const startMs = c.start * 1000;
    if (real >= startMs) {
      real += (c.end - c.start) * 1000;
    } else {
      break;
    }
  }
  return real;
}

/** Inverse of virtualToRealMs — real ms → virtual ms, clamped inside cuts. */
function realToVirtualMs(realMs: number, clipsSec: SimClipSegment[]): number {
  let virtual = realMs;
  for (const c of clipsSec) {
    const startMs = c.start * 1000;
    const endMs = c.end * 1000;
    if (realMs >= endMs) {
      virtual -= endMs - startMs;
    } else if (realMs >= startMs) {
      virtual -= realMs - startMs;
      break;
    } else {
      break;
    }
  }
  return Math.max(0, virtual);
}

/**
 * If `realMs` lies inside a cut range, return the range's end (in ms) so the
 * caller can seek past it. Otherwise return null.
 */
function cutEndIfInside(realMs: number, clipsSec: SimClipSegment[]): number | null {
  for (const c of clipsSec) {
    const startMs = c.start * 1000;
    const endMs = c.end * 1000;
    if (realMs >= startMs && realMs < endMs) return endMs;
    if (realMs < startMs) return null;
  }
  return null;
}

/** Drop events whose `t` falls inside any cut range. */
function filterClippedEvents(
  events: SimEvent[],
  clipsSec: SimClipSegment[]
): SimEvent[] {
  if (clipsSec.length === 0) return events;
  return events.filter((e) => cutEndIfInside(e.t, clipsSec) === null);
}

// Matches SlideCard's internal design space.
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

function simStrokeToStroke(stroke: SimStroke): Stroke {
  return {
    id: stroke.id,
    tool: stroke.tool,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points,
    start: stroke.start,
    end: stroke.end,
    text: stroke.text,
    position: stroke.position,
    fontSize: stroke.font_size,
    emoji: stroke.emoji,
  };
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function StrokesOverlay({ strokes }: { strokes: SimStroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Read strokes through a ref inside `redraw` so the callback stays stable
  // across renders — otherwise the ResizeObserver effect tears down and
  // rebuilds on every stroke change, and `redraw` runs twice per change.
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / DESIGN_WIDTH;
    const scaleY = canvas.height / DESIGN_HEIGHT;
    for (const s of strokesRef.current) {
      renderStrokeToCtx(ctx, simStrokeToStroke(s), scaleX, scaleY);
    }
  }, []);

  // Keep the canvas buffer matching its display box (DPR-aware). Runs once
  // per mount because `redraw` is stable.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      const targetW = Math.max(1, Math.floor(w * dpr));
      const targetH = Math.max(1, Math.floor(h * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      redraw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [redraw]);

  // Redraw whenever the stroke list changes (replay state advanced).
  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

function SpotlightOverlay({ spotlight }: { spotlight: { x: number; y: number } | null }) {
  if (!spotlight) return null;
  const leftPct = (spotlight.x / DESIGN_WIDTH) * 100;
  const topPct = (spotlight.y / DESIGN_HEIGHT) * 100;
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        background: `radial-gradient(circle at ${leftPct}% ${topPct}%, transparent 0, transparent 140px, rgba(0,0,0,0.55) 260px)`,
      }}
      aria-hidden
    />
  );
}

const SimPlayer = memo(forwardRef<SimPlayerHandle, SimPlayerProps>(function SimPlayer(
  {
    payload,
    language = 'en',
    className = '',
    clipSegments,
    hideControls = false,
    onRealTimeChange,
    onPlayStateChange,
    onReady,
  },
  ref
) {
  const { sim, audio_url } = payload;
  const deck = sim.deck_snapshot;

  // Fall back to the row's own clip_segments if the caller didn't override.
  const effectiveClips = useMemo(
    () => normalizeClips(clipSegments ?? sim.clip_segments),
    [clipSegments, sim.clip_segments]
  );

  // Events with cut ranges filtered out, so projected state never contains
  // strokes/reveals that happened inside a clip.
  const projectedEvents = useMemo(
    () => filterClippedEvents(sim.events, effectiveClips),
    [sim.events, effectiveClips]
  );

  // Extract `activity_gate` events — these become pause-to-interact stops
  // during playback, the sim equivalent of the video-lesson task gates in
  // `lessons/[id]/page.tsx:maybeActivateDueInteraction`.
  type ActivityGate = Extract<SimEvent, { type: 'activity_gate' }>;
  const gates = useMemo<ActivityGate[]>(
    () =>
      projectedEvents.filter(
        (e): e is ActivityGate => e.type === 'activity_gate'
      ),
    [projectedEvents]
  );

  const [surface, setSurface] = useState<SimSurfaceState>(() =>
    rebuildSimState(deck, projectedEvents, 0)
  );
  const [playbackMs, setPlaybackMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGate, setActiveGate] = useState<ActivityGate | null>(null);
  // Gate indices already surfaced to the viewer (cleared on seek so going
  // backwards re-arms them). A Set keyed by index into `gates` lets us do
  // O(1) membership checks inside the rAF loop.
  const triggeredGatesRef = useRef<Set<number>>(new Set());

  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number>(0);
  // Number of events already reflected in `surface`. Lets the rAF loop skip
  // `rebuildSimState` + `setSurface` when no new event has crossed the time
  // cursor since the previous frame — the common case for long sims with
  // sparse events.
  const appliedEventCountRef = useRef(0);
  // Last wall-clock time we emitted a playback tick, for throttling high-
  // frequency `setPlaybackMs` + `onRealTimeChange` calls during rAF playback
  // to ~30Hz. The surface projection still runs every frame so stroke replay
  // stays smooth; only the scrubber/timer updates are throttled.
  const lastEmitWallMsRef = useRef(0);

  const rawTotalMs = sim.duration_ms || sim.audio_duration_ms || 0;
  // Visible length after cuts. The scrubber/timer use virtual ms so the
  // displayed duration matches what the viewer actually hears.
  const virtualTotalMs = useMemo(
    () => Math.max(0, rawTotalMs - clipDurationMs(effectiveClips)),
    [rawTotalMs, effectiveClips]
  );

  // Count of events with t <= realMs (binary search on sorted events).
  const eventsAtMs = useCallback(
    (realMs: number): number => {
      let lo = 0;
      let hi = projectedEvents.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (projectedEvents[mid].t <= realMs) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    },
    [projectedEvents]
  );

  // Project a new surface state at a **real** (audio) time in ms. Skips the
  // expensive rebuild when the event cutoff hasn't changed since last call.
  // `force=true` bypasses the ~30Hz emit throttle — used on seek, pause, and
  // end-of-track so the scrubber always settles on the final position.
  const applyAt = useCallback(
    (realMs: number, force: boolean = false) => {
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (force || now - lastEmitWallMsRef.current >= 33) {
        lastEmitWallMsRef.current = now;
        setPlaybackMs(realToVirtualMs(realMs, effectiveClips));
        onRealTimeChange?.(realMs / 1000);
      }
      const count = eventsAtMs(realMs);
      if (count === appliedEventCountRef.current) return;
      appliedEventCountRef.current = count;
      setSurface(rebuildSimState(deck, projectedEvents, realMs));
    },
    [deck, projectedEvents, effectiveClips, eventsAtMs, onRealTimeChange]
  );

  // Rebuild the triggered-gates set so every gate strictly before `realMs`
  // is marked triggered. Called on seeks and whenever the gate list changes
  // so that scrubbing backwards re-arms previously-cleared gates while
  // scrubbing forward past one doesn't cause it to fire retroactively.
  const resetGatesForTime = useCallback(
    (realMs: number) => {
      const set = new Set<number>();
      for (let i = 0; i < gates.length; i++) {
        if (gates[i].t < realMs) set.add(i);
      }
      triggeredGatesRef.current = set;
    },
    [gates]
  );

  // Find the first gate whose time has been crossed since the last check
  // and hasn't been shown yet. Returns `null` when nothing is due.
  const findDueGate = useCallback(
    (realMs: number): { idx: number; gate: ActivityGate } | null => {
      for (let i = 0; i < gates.length; i++) {
        if (triggeredGatesRef.current.has(i)) continue;
        if (gates[i].t > realMs) break;
        return { idx: i, gate: gates[i] };
      }
      return null;
    },
    [gates]
  );

  // Re-project whenever the event list or clip set changes (e.g. live edit).
  // Only fires when the audio is paused — during playback the rAF tick loop
  // already rebuilds on every frame, so this would be duplicate work.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) return;
    const realMs = audio ? audio.currentTime * 1000 : 0;
    appliedEventCountRef.current = eventsAtMs(realMs);
    setSurface(rebuildSimState(deck, projectedEvents, realMs));
    setPlaybackMs(realToVirtualMs(realMs, effectiveClips));
    lastEmitWallMsRef.current = 0;
    resetGatesForTime(realMs);
  }, [deck, projectedEvents, effectiveClips, eventsAtMs, resetGatesForTime]);

  // rAF loop: while the audio is playing, sample its currentTime, skip cuts,
  // rebuild surface, schedule next frame.
  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const realMs = audio.currentTime * 1000;

    // If we landed inside a cut range, jump to its end and re-enter the loop
    // next frame (the browser will fire seeked automatically).
    const jumpTo = cutEndIfInside(realMs, effectiveClips);
    if (jumpTo !== null) {
      if (jumpTo >= rawTotalMs - 5) {
        audio.pause();
        setIsPlaying(false);
        onPlayStateChange?.(false);
        applyAt(rawTotalMs, true);
        rafRef.current = 0;
        return;
      }
      audio.currentTime = jumpTo / 1000;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    applyAt(realMs);

    // Activity gate — pause the audio and surface the gate so the viewer
    // can read the activity before continuing. Park the timeline exactly at
    // the gate so scrubber + projected state match the pause point.
    const due = findDueGate(realMs);
    if (due) {
      triggeredGatesRef.current.add(due.idx);
      audio.pause();
      audio.currentTime = due.gate.t / 1000;
      applyAt(due.gate.t, true);
      setActiveGate(due.gate);
      setIsPlaying(false);
      onPlayStateChange?.(false);
      rafRef.current = 0;
      return;
    }

    if (!audio.paused && !audio.ended) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = 0;
      if (audio.ended) {
        setIsPlaying(false);
        onPlayStateChange?.(false);
        applyAt(rawTotalMs, true);
      }
    }
  }, [applyAt, effectiveClips, rawTotalMs, onPlayStateChange, findDueGate]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      // No audio track — step straight to the end of the timeline.
      applyAt(rawTotalMs, true);
      return;
    }
    // If audio is parked inside a cut (e.g. from a previous seek), nudge it
    // to the range end before starting playback.
    const realMs = audio.currentTime * 1000;
    const jumpTo = cutEndIfInside(realMs, effectiveClips);
    if (jumpTo !== null) {
      audio.currentTime = jumpTo / 1000;
    }
    audio.play().then(
      () => {
        setIsPlaying(true);
        setActiveGate(null);
        onPlayStateChange?.(true);
        if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Playback failed');
      }
    );
  }, [applyAt, effectiveClips, rawTotalMs, tick, onPlayStateChange]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    setIsPlaying(false);
    onPlayStateChange?.(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, [onPlayStateChange]);

  // Scrubber hands us virtual ms; translate to real audio ms before seeking.
  const handleSeek = useCallback(
    (virtualMs: number) => {
      const realMs = virtualToRealMs(virtualMs, effectiveClips);
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = realMs / 1000;
      }
      applyAt(realMs, true);
      setActiveGate(null);
      resetGatesForTime(realMs);
    },
    [applyAt, effectiveClips, resetGatesForTime]
  );

  const seekRealSec = useCallback(
    (realSec: number) => {
      const audio = audioRef.current;
      const clamped = Math.max(0, Math.min(realSec, rawTotalMs / 1000));
      if (audio) audio.currentTime = clamped;
      applyAt(clamped * 1000, true);
      setActiveGate(null);
      resetGatesForTime(clamped * 1000);
    },
    [applyAt, rawTotalMs, resetGatesForTime]
  );

  // Dismiss the current gate and resume playback. The gate's index is
  // already in `triggeredGatesRef` from the rAF tick that surfaced it, so
  // the next frame won't re-trigger it.
  const handleContinueGate = useCallback(() => {
    setActiveGate(null);
    handlePlay();
  }, [handlePlay]);

  // Keep `handlePlay`/`handlePause` stable across renders inside the imperative
  // handle so the parent's ref doesn't churn.
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useImperativeHandle(
    ref,
    () => ({
      play: handlePlay,
      pause: handlePause,
      seekRealSec,
      isPlaying: () => isPlayingRef.current,
    }),
    [handlePlay, handlePause, seekRealSec]
  );

  const currentSlide = useMemo(
    () => deck.find((s) => s.id === surface.current_slide_id) ?? deck[0] ?? null,
    [deck, surface.current_slide_id]
  );

  const currentSurface: SimSlideSurface | null = currentSlide
    ? surface.slides[currentSlide.id] ?? null
    : null;

  if (!currentSlide) {
    return (
      <div className={`flex items-center justify-center text-slate-500 ${className}`}>
        This sim has no slides.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="relative">
        <SlideCard
          slide={currentSlide}
          language={language}
          revealedCount={currentSurface?.revealed_bullets}
          showActivityAnswer={currentSurface?.answer_revealed ?? false}
          // Replay the teacher's drag-and-drop placements inside the slide
          // canvas for interactive activity slides. `disabled` so students
          // watch but can't touch; the projected `activity_answer`
          // advances automatically as the audio plays.
          activityInteractive
          activityInteractiveDisabled
          activityAnswer={currentSurface?.activity_answer ?? null}
        />
        {currentSurface && currentSurface.strokes.length > 0 && (
          <StrokesOverlay strokes={currentSurface.strokes} />
        )}
        {currentSurface?.spotlight && (
          <SpotlightOverlay spotlight={currentSurface.spotlight} />
        )}
        {activeGate && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px]"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
          >
            <button
              type="button"
              onClick={handleContinueGate}
              className="group flex items-center gap-4 rounded-full bg-white/95 py-3 ps-3 pe-5 shadow-2xl ring-1 ring-black/5 transition-transform hover:scale-[1.02]"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#007229] text-white shadow-md transition-colors group-hover:bg-[#005a20]">
                <svg className="h-5 w-5 ms-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="text-base font-semibold text-slate-900">
                {language === 'ar' ? 'متابعة النشاط' : 'Continue activity'}
              </span>
            </button>
          </div>
        )}
      </div>

      {audio_url && (
        <audio
          ref={audioRef}
          src={audio_url}
          preload="auto"
          onLoadedMetadata={() => {
            setReady(true);
            onReady?.();
          }}
          onEnded={() => {
            setIsPlaying(false);
            onPlayStateChange?.(false);
            applyAt(rawTotalMs, true);
          }}
          onPause={() => {
            // Catches external pauses (tab visibility, OS media controls) so
            // the UI state stays in sync with the element.
            setIsPlaying(false);
            onPlayStateChange?.(false);
          }}
          onError={() => {
            setError('Audio failed to load');
            setIsPlaying(false);
            onPlayStateChange?.(false);
          }}
        />
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!hideControls && (
      <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-3">
        {isPlaying ? (
          <button
            type="button"
            onClick={handlePause}
            className="w-10 h-10 rounded-full bg-slate-900 text-white grid place-items-center hover:bg-slate-700"
            aria-label="Pause"
          >
            ⏸
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            disabled={!!audio_url && !ready}
            className="w-10 h-10 rounded-full bg-emerald-600 text-white grid place-items-center hover:bg-emerald-500 disabled:bg-slate-400"
            aria-label="Play"
          >
            ▶
          </button>
        )}

        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs tabular-nums text-slate-600 w-12 text-right">
            {formatMs(playbackMs)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, virtualTotalMs)}
            step={50}
            value={Math.min(playbackMs, virtualTotalMs)}
            onChange={(e) => handleSeek(Number(e.target.value))}
            className="flex-1"
            aria-label="Seek"
          />
          <span className="text-xs tabular-nums text-slate-600 w-12">
            {formatMs(virtualTotalMs)}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          {sim.events.length} events
        </div>
      </div>
      )}
    </div>
  );
}));

export default SimPlayer;
