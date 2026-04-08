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
import type { InteractionAnswer } from '@/lib/interactions/types';
import ExplorationOverlay from '@/components/explorations/ExplorationOverlay';
import { slideToInteraction } from '@/lib/interactions/adapters';
import { gradeInteraction } from '@/lib/interactions/grader';
import { OwlCorrect, OwlWrong, OwlPointing } from '@/components/illustrations';

interface SimPlayerProps {
  payload: SimPayload;
  language?: 'ar' | 'en';
  className?: string;
  /** Lesson ID — when provided, student answers are persisted to the DB. */
  lessonId?: string;
  /** Previously saved slide responses (keyed by slide_id). Pre-populates gate answers on load. */
  savedResponses?: Record<string, { answer: unknown; isCorrect: boolean }> | null;
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
  /** Show timestamped teacher notes as an overlay (teacher preview only). */
  showTeacherNotes?: boolean;
  /** Fires periodically with playback progress (0–100). */
  onProgress?: (pct: number) => void;
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

/** Ephemeral laser dot rendered during playback. Fades after 300ms. */
function LaserOverlay({ x, y, age }: { x: number; y: number; age: number }) {
  const leftPct = (x / DESIGN_WIDTH) * 100;
  const topPct = (y / DESIGN_HEIGHT) * 100;
  const opacity = Math.max(0, 1 - age / 300);
  if (opacity <= 0) return null;
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,80,80,${opacity * 0.9}) 0%, rgba(255,40,40,${opacity * 0.5}) 40%, transparent 70%)`,
        boxShadow: `0 0 12px rgba(255,60,60,${opacity * 0.6})`,
      }}
      aria-hidden
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: `rgba(255,255,255,${opacity * 0.95})`,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
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

/** Lightweight confetti scoped to the slide area (absolute, not fixed). */
function SlideConfetti({ id }: { id: number }) {
  const colors = ['#D21034', '#007229', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'];
  // Generate pieces once per mount (id in key forces remount on each trigger)
  const [pieces] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      color: colors[i % colors.length],
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      drift: (Math.random() - 0.5) * 80,
      size: 6 + Math.random() * 6,
      shape: i % 3,
      duration: 1.8 + Math.random() * 1,
    }))
  );
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <div
          key={`${id}-${p.id}`}
          style={{
            position: 'absolute',
            top: '-4%',
            left: `${p.left}%`,
            width: p.shape === 2 ? p.size * 0.5 : p.size,
            height: p.shape === 2 ? p.size * 1.5 : p.size,
            backgroundColor: p.color,
            borderRadius: p.shape === 0 ? '50%' : 2,
            opacity: 0,
            animation: `sim-confetti-fall ${p.duration}s ease-out ${p.delay}s forwards`,
            // @ts-expect-error -- CSS custom props for per-piece drift
            '--drift': `${p.drift}px`,
          }}
        />
      ))}
      <style>{`
        @keyframes sim-confetti-fall {
          0%   { opacity: 1; transform: translateY(0) translateX(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(calc(100vh)) translateX(var(--drift)) rotate(${360 + Math.random() * 360}deg); }
        }
      `}</style>
    </div>
  );
}

const SimPlayer = memo(forwardRef<SimPlayerHandle, SimPlayerProps>(function SimPlayer(
  {
    payload,
    language = 'en',
    className = '',
    lessonId,
    savedResponses,
    clipSegments,
    hideControls = false,
    onRealTimeChange,
    onPlayStateChange,
    onReady,
    showTeacherNotes = false,
    onProgress,
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

  // Extract gate events — both activity_gate and exploration_gate pause
  // the sim and show an interactive overlay.
  type ActivityGate = Extract<SimEvent, { type: 'activity_gate' }>;
  type ExplorationGate = Extract<SimEvent, { type: 'exploration_gate' }>;
  type AnyGate = ActivityGate | ExplorationGate;
  const gates = useMemo<AnyGate[]>(
    () =>
      projectedEvents.filter(
        (e): e is AnyGate =>
          e.type === 'activity_gate' || e.type === 'exploration_gate'
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
  const [activeGate, setActiveGate] = useState<AnyGate | null>(null);
  // Student's own answer during an active gate. Reset when the gate clears.
  const [studentAnswer, setStudentAnswer] = useState<InteractionAnswer | null>(null);
  // Feedback after the student answers during a gate.
  const [answerFeedback, setAnswerFeedback] = useState<'correct' | 'incorrect' | 'submitted' | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  // Track result per gate index for timeline marker icons.
  const [gateResults, setGateResults] = useState<Record<number, 'correct' | 'incorrect' | 'skipped' | 'submitted'>>({});
  const activeGateIdxRef = useRef<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Gate indices already surfaced to the viewer (cleared on seek so going
  // backwards re-arms them). A Set keyed by index into `gates` lets us do
  // O(1) membership checks inside the rAF loop.
  const triggeredGatesRef = useRef<Set<number>>(new Set());
  // Exploration slide IDs already auto-paused on (cleared on seek backwards).
  const triggeredExplorationSlidesRef = useRef<Set<string>>(new Set());
  // Whether an auto-pause exploration slide overlay is active.
  const [activeExplorationSlide, setActiveExplorationSlide] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioSrc, setAudioSrc] = useState(audio_url);
  const rafRef = useRef<number>(0);
  // Timer-driven playback for audio-less sims
  const timerStartRef = useRef<number>(0);
  const timerOffsetRef = useRef<number>(0);
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

  // Audio-less sims: mark ready immediately so the play button is enabled.
  useEffect(() => {
    if (!audio_url) {
      setReady(true);
      onReady?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio_url]);

  // ── Resume position persistence ─────────────────────────────────────────
  const resumeKey = lessonId ? `sim-resume:${lessonId}` : null;
  const resumeAppliedRef = useRef(false);

  // Restore saved position once audio is ready
  useEffect(() => {
    if (!resumeKey || resumeAppliedRef.current || !ready) return;
    resumeAppliedRef.current = true;
    try {
      const saved = localStorage.getItem(resumeKey);
      if (!saved) return;
      const savedMs = Number(saved);
      if (!savedMs || savedMs <= 0 || savedMs >= virtualTotalMs - 1000) return;
      // Seek to the saved position
      const realMs = virtualToRealMs(savedMs, effectiveClips);
      const audio = audioRef.current;
      if (audio) audio.currentTime = realMs / 1000;
      applyAt(realMs, true);
    } catch { /* ignore */ }
  }, [resumeKey, ready, virtualTotalMs, effectiveClips, applyAt]);

  // Periodically save the playback position (every 5 seconds)
  useEffect(() => {
    if (!resumeKey || !isPlaying) return;
    const timer = setInterval(() => {
      try { localStorage.setItem(resumeKey, String(playbackMs)); } catch { /* quota */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [resumeKey, isPlaying, playbackMs]);

  // Keep audioSrc in sync when the prop changes (e.g. parent re-fetches).
  useEffect(() => { setAudioSrc(audio_url); }, [audio_url]);

  // Proactively refresh the signed audio URL before it expires (every 5h).
  // Also retries on audio error to handle already-expired URLs.
  const refreshAudioUrl = useCallback(async () => {
    if (!lessonId) return;
    try {
      const res = await fetch(`/api/lessons/${lessonId}/sim`);
      if (!res.ok) return;
      const data = await res.json();
      const freshUrl: string | null = data?.sim?.audio_url ?? null;
      if (freshUrl) {
        const audio = audioRef.current;
        const currentTime = audio?.currentTime ?? 0;
        setAudioSrc(freshUrl);
        // Restore playback position after src swap
        requestAnimationFrame(() => {
          const a = audioRef.current;
          if (a && currentTime > 0) a.currentTime = currentTime;
        });
      }
    } catch { /* best-effort */ }
  }, [lessonId]);

  useEffect(() => {
    if (!audio_url || !lessonId) return;
    // Refresh every 5 hours (signed URLs last 6h)
    const REFRESH_MS = 5 * 60 * 60 * 1000;
    const timer = setInterval(refreshAudioUrl, REFRESH_MS);
    return () => clearInterval(timer);
  }, [audio_url, lessonId, refreshAudioUrl]);

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
        const vMs = realToVirtualMs(realMs, effectiveClips);
        setPlaybackMs(vMs);
        onRealTimeChange?.(realMs / 1000);
        if (virtualTotalMs > 0) onProgress?.(Math.min(100, (vMs / virtualTotalMs) * 100));
      }
      const count = eventsAtMs(realMs);
      if (count === appliedEventCountRef.current) return;
      appliedEventCountRef.current = count;
      setSurface(rebuildSimState(deck, projectedEvents, realMs));
    },
    [deck, projectedEvents, effectiveClips, eventsAtMs, onRealTimeChange, virtualTotalMs, onProgress]
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

      // Also rebuild the exploration slide set — mark all exploration slides
      // that were passed before realMs as triggered.
      const explSet = new Set<string>();
      let currentSlideId = deck[0]?.id;
      for (const e of projectedEvents) {
        if (e.t >= realMs) break;
        if (e.type === 'slide_change') currentSlideId = e.slide_id;
      }
      // Mark all exploration slides whose slide_change event is before realMs
      for (const e of projectedEvents) {
        if (e.t >= realMs) break;
        if (e.type === 'slide_change') {
          const slide = deck.find((s) => s.id === e.slide_id);
          if (slide?.type === 'exploration') explSet.add(e.slide_id);
        }
      }
      // If we're currently ON an exploration slide, don't mark it as triggered
      // so it re-triggers on seek
      if (currentSlideId) explSet.delete(currentSlideId);
      triggeredExplorationSlidesRef.current = explSet;
    },
    [gates, deck, projectedEvents]
  );

  // Find the first gate whose time has been crossed since the last check
  // and hasn't been shown yet. Returns `null` when nothing is due.
  const findDueGate = useCallback(
    (realMs: number): { idx: number; gate: AnyGate } | null => {
      for (let i = 0; i < gates.length; i++) {
        if (triggeredGatesRef.current.has(i)) continue;
        if (gates[i].t > realMs) break;
        return { idx: i, gate: gates[i] };
      }
      return null;
    },
    [gates]
  );

  // Find the current slide ID at a given time by scanning slide_change events.
  const slideIdAtMs = useCallback(
    (realMs: number): string | null => {
      let slideId: string | null = deck[0]?.id ?? null;
      for (const e of projectedEvents) {
        if (e.t > realMs) break;
        if (e.type === 'slide_change') slideId = e.slide_id;
      }
      return slideId;
    },
    [deck, projectedEvents]
  );

  // Check if the current slide at `realMs` is an exploration slide that
  // hasn't been auto-paused on yet.
  const findDueExplorationSlide = useCallback(
    (realMs: number): string | null => {
      const slideId = slideIdAtMs(realMs);
      if (!slideId) return null;
      if (triggeredExplorationSlidesRef.current.has(slideId)) return null;
      const slide = deck.find((s) => s.id === slideId);
      if (slide?.type === 'exploration' && slide.exploration_widget_type && slide.exploration_config) {
        return slideId;
      }
      return null;
    },
    [deck, slideIdAtMs]
  );

  // Auto-generate chapters from slide_change events. Each slide transition
  // becomes a chapter using the slide's title.
  const chapters = useMemo(() => {
    const result: { label: string; realMs: number; virtualMs: number; slideId: string }[] = [];
    // First slide is always a chapter at t=0
    if (deck.length > 0) {
      const first = deck[0];
      const title = (language === 'ar' ? first.title_ar : first.title_en) || first.title_en || first.title_ar;
      result.push({ label: title || `Slide 1`, realMs: 0, virtualMs: 0, slideId: first.id });
    }
    for (const e of projectedEvents) {
      if (e.type !== 'slide_change') continue;
      const slide = deck.find((s) => s.id === e.slide_id);
      if (!slide) continue;
      const title = (language === 'ar' ? slide.title_ar : slide.title_en) || slide.title_en || slide.title_ar;
      result.push({
        label: title || `Slide ${slide.sequence + 1}`,
        realMs: e.t,
        virtualMs: realToVirtualMs(e.t, effectiveClips),
        slideId: slide.id,
      });
    }
    return result;
  }, [deck, projectedEvents, effectiveClips, language]);

  // Current chapter index based on playback position
  const currentChapterIdx = useMemo(() => {
    let idx = 0;
    for (let i = 1; i < chapters.length; i++) {
      if (chapters[i].virtualMs <= playbackMs) idx = i;
      else break;
    }
    return idx;
  }, [chapters, playbackMs]);

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

  // Get current real-time ms from audio element or timer fallback.
  const getCurrentRealMs = useCallback((): number => {
    const audio = audioRef.current;
    if (audio) return audio.currentTime * 1000;
    // Timer-driven: elapsed since play started + offset from previous play/seek
    const elapsed = (performance.now() - timerStartRef.current) * playbackRate;
    return Math.min(timerOffsetRef.current + elapsed, rawTotalMs);
  }, [playbackRate, rawTotalMs]);

  // Pause helper for both audio and timer modes
  const pausePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    // Save timer position
    if (!audio) timerOffsetRef.current = getCurrentRealMs();
    setIsPlaying(false);
    onPlayStateChange?.(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, [getCurrentRealMs, onPlayStateChange]);

  // rAF loop: sample currentTime (audio or timer), skip cuts,
  // rebuild surface, schedule next frame.
  const tick = useCallback(() => {
    const audio = audioRef.current;
    const realMs = getCurrentRealMs();

    // If we landed inside a cut range, jump to its end
    const jumpTo = cutEndIfInside(realMs, effectiveClips);
    if (jumpTo !== null) {
      if (jumpTo >= rawTotalMs - 5) {
        pausePlayback();
        applyAt(rawTotalMs, true);
        return;
      }
      if (audio) {
        audio.currentTime = jumpTo / 1000;
      } else {
        timerOffsetRef.current = jumpTo;
        timerStartRef.current = performance.now();
      }
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    applyAt(realMs);

    // Activity gate — pause and surface the gate
    const due = findDueGate(realMs);
    if (due) {
      triggeredGatesRef.current.add(due.idx);
      if (audio) {
        audio.pause();
        audio.currentTime = due.gate.t / 1000;
      } else {
        timerOffsetRef.current = due.gate.t;
      }
      applyAt(due.gate.t, true);
      activeGateIdxRef.current = due.idx;
      setActiveGate(due.gate);
      setIsPlaying(false);
      onPlayStateChange?.(false);
      rafRef.current = 0;
      return;
    }

    // Auto-pause on exploration slides
    const dueExplSlide = findDueExplorationSlide(realMs);
    if (dueExplSlide) {
      triggeredExplorationSlidesRef.current.add(dueExplSlide);
      if (audio) audio.pause();
      else timerOffsetRef.current = realMs;
      applyAt(realMs, true);
      setActiveExplorationSlide(dueExplSlide);
      setIsPlaying(false);
      onPlayStateChange?.(false);
      rafRef.current = 0;
      return;
    }

    // Check if playback ended
    if (realMs >= rawTotalMs - 5) {
      pausePlayback();
      applyAt(rawTotalMs, true);
      return;
    }

    const isStillPlaying = audio ? (!audio.paused && !audio.ended) : true;
    if (isStillPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      rafRef.current = 0;
      if (audio?.ended) {
        setIsPlaying(false);
        onPlayStateChange?.(false);
        applyAt(rawTotalMs, true);
      }
    }
  }, [applyAt, effectiveClips, rawTotalMs, onPlayStateChange, findDueGate, findDueExplorationSlide, getCurrentRealMs, pausePlayback]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      // No audio track — timer-driven playback
      const realMs = timerOffsetRef.current;
      const jumpTo = cutEndIfInside(realMs, effectiveClips);
      if (jumpTo !== null) {
        timerOffsetRef.current = jumpTo;
      }
      timerStartRef.current = performance.now();
      setIsPlaying(true);
      setActiveGate(null);
      onPlayStateChange?.(true);
      setAnswerFeedback(null);
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
      return;
    }
    // If audio is parked inside a cut (e.g. from a previous seek), nudge it
    // to the range end before starting playback.
    const realMs = audio.currentTime * 1000;
    const jumpTo = cutEndIfInside(realMs, effectiveClips);
    if (jumpTo !== null) {
      audio.currentTime = jumpTo / 1000;
    }
    audio.playbackRate = playbackRate;
    audio.play().then(
      () => {
        setIsPlaying(true);
        setActiveGate(null);
        onPlayStateChange?.(true);
        setAnswerFeedback(null);
        if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
      },
      (err: unknown) => {
        setError(err instanceof Error ? err.message : 'Playback failed');
      }
    );
  }, [effectiveClips, tick, onPlayStateChange, playbackRate]);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) audio.pause();
    // Save timer position for audio-less mode
    if (!audio) timerOffsetRef.current = getCurrentRealMs();
    setIsPlaying(false);
    onPlayStateChange?.(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, [getCurrentRealMs, onPlayStateChange]);

  // Scrubber hands us virtual ms; translate to real audio ms before seeking.
  const handleSeek = useCallback(
    (virtualMs: number) => {
      const realMs = virtualToRealMs(virtualMs, effectiveClips);
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = realMs / 1000;
      } else {
        timerOffsetRef.current = realMs;
        timerStartRef.current = performance.now();
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
      if (audio) {
        audio.currentTime = clamped;
      } else {
        timerOffsetRef.current = clamped * 1000;
        timerStartRef.current = performance.now();
      }
      applyAt(clamped * 1000, true);
      setActiveGate(null);
      resetGatesForTime(clamped * 1000);
    },
    [applyAt, rawTotalMs, resetGatesForTime]
  );

  // Dismiss the current gate and resume playback. The gate's index is
  // already in `triggeredGatesRef` from the rAF tick that surfaced it, so
  // the next frame won't re-trigger it.
  // Grade the student's answer against the current slide's interaction.
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

  const handleStudentAnswer = useCallback(
    (answer: InteractionAnswer) => {
      setStudentAnswer(answer);
      // Don't grade yet — wait for explicit submit.
    },
    []
  );

  const handleSubmitAnswer = useCallback(() => {
    if (!studentAnswer || !currentSlide) return;
    const interaction = slideToInteraction(currentSlide);
    if (!interaction) return;

    // Teacher-reviewed types: show "submitted" instead of grading
    const isTeacherReviewed = interaction.type === 'free_response' || interaction.type === 'draw_answer';
    if (isTeacherReviewed) {
      setAnswerFeedback('submitted');
    } else {
      const result = gradeInteraction(interaction, studentAnswer);
      const feedback = result.is_correct ? 'correct' : 'incorrect';
      setAnswerFeedback(feedback);
      if (feedback === 'correct') {
        setConfettiKey((k) => k + 1);
      }
    }

    // Persist to DB when lessonId is available
    if (lessonId) {
      fetch(`/api/lessons/${lessonId}/slide-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_id: currentSlide.id,
          answer: studentAnswer,
        }),
      }).catch(() => { /* best-effort — don't block UX */ });
    }
  }, [studentAnswer, currentSlide, lessonId]);

  const handleRetry = useCallback(() => {
    setStudentAnswer(null);
    setAnswerFeedback(null);
  }, []);

  // Restore saved answer when a gate activates on a slide with a prior response
  useEffect(() => {
    if (!activeGate || !currentSlide || !savedResponses) return;
    const saved = savedResponses[currentSlide.id];
    if (!saved || saved.answer == null) return;
    setStudentAnswer(saved.answer as InteractionAnswer);
    // Detect teacher-reviewed types
    const interaction = slideToInteraction(currentSlide);
    const isTeacherReviewed = interaction && (interaction.type === 'free_response' || interaction.type === 'draw_answer');
    const feedback = isTeacherReviewed ? 'submitted' : (saved.isCorrect ? 'correct' : 'incorrect');
    setAnswerFeedback(feedback);
    // Also mark the timeline marker
    if (activeGateIdxRef.current !== null) {
      setGateResults((prev) => ({
        ...prev,
        [activeGateIdxRef.current!]: feedback,
      }));
    }
  }, [activeGate, currentSlide, savedResponses]);

  const handleContinueGate = useCallback(() => {
    // If this is an exploration slide auto-pause, dismiss it and resume.
    if (activeExplorationSlide) {
      setActiveExplorationSlide(null);
      handlePlay();
      return;
    }
    // Record outcome for the timeline marker
    if (activeGateIdxRef.current !== null) {
      const idx = activeGateIdxRef.current;
      const result = answerFeedback ?? 'skipped';
      setGateResults((prev) => ({ ...prev, [idx]: result }));
    }
    // Persist skipped gate to server so teachers see it
    if (!answerFeedback && lessonId && currentSlide) {
      fetch(`/api/lessons/${lessonId}/slide-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_id: currentSlide.id,
          answer: null,
        }),
      }).catch(() => { /* best-effort */ });
    }
    activeGateIdxRef.current = null;
    setActiveGate(null);
    setStudentAnswer(null);
    setAnswerFeedback(null);
    handlePlay();
  }, [handlePlay, answerFeedback, activeExplorationSlide, lessonId, currentSlide]);

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

  // Teacher notes overlay — find the latest note at current playback time
  const activeTeacherNote = useMemo(() => {
    if (!showTeacherNotes) return null;
    const NOTE_DISPLAY_MS = 5000;
    let latest: { text: string; virtualMs: number } | null = null;
    for (const e of projectedEvents) {
      if (e.type !== 'teacher_note') continue;
      const vMs = realToVirtualMs(e.t, effectiveClips);
      if (vMs > playbackMs) break;
      latest = { text: e.text, virtualMs: vMs };
    }
    if (!latest) return null;
    // Hide after 5 seconds
    if (playbackMs - latest.virtualMs > NOTE_DISPLAY_MS) return null;
    return latest.text;
  }, [showTeacherNotes, projectedEvents, effectiveClips, playbackMs]);

  // Speaker notes for the current slide (student-facing).
  const currentSpeakerNotes = useMemo(() => {
    if (!currentSlide) return '';
    const primary = language === 'ar'
      ? currentSlide.speaker_notes_ar
      : currentSlide.speaker_notes_en;
    const fallback = language === 'ar'
      ? currentSlide.speaker_notes_en
      : currentSlide.speaker_notes_ar;
    return (primary?.trim() || fallback?.trim()) ?? '';
  }, [currentSlide, language]);

  // Find the most recent laser event within 300ms of current playback time
  const LASER_FADE_MS = 300;
  const activeLaser = useMemo(() => {
    const realMs = virtualToRealMs(playbackMs, effectiveClips);
    for (let i = projectedEvents.length - 1; i >= 0; i--) {
      const e = projectedEvents[i];
      if (e.t > realMs) continue;
      if (e.type === 'laser') {
        const age = realMs - e.t;
        if (age <= LASER_FADE_MS) return { x: e.x, y: e.y, age };
        return null;
      }
      if (e.t < realMs - LASER_FADE_MS) break;
    }
    return null;
  }, [playbackMs, effectiveClips, projectedEvents]);

  const progressPct = virtualTotalMs > 0
    ? Math.min(100, (playbackMs / virtualTotalMs) * 100)
    : 0;

  // Gate positions on the progress bar (converted from real → virtual time).
  const gateMarkers = useMemo(() => {
    if (virtualTotalMs <= 0) return [];
    return gates.map((g, i) => ({
      pct: Math.min(100, (realToVirtualMs(g.t, effectiveClips) / virtualTotalMs) * 100),
      realSec: g.t / 1000,
      gateType: g.type as 'activity_gate' | 'exploration_gate',
      idx: i,
    }));
  }, [gates, effectiveClips, virtualTotalMs]);

  // Initialize gate marker states from saved responses.
  const savedResponsesRef = useRef(savedResponses);
  savedResponsesRef.current = savedResponses;
  const initialGateResultsApplied = useRef(false);
  useEffect(() => {
    if (initialGateResultsApplied.current) return;
    const saved = savedResponsesRef.current;
    if (!saved || gates.length === 0) return;
    const initial: Record<number, 'correct' | 'incorrect' | 'skipped'> = {};
    for (let i = 0; i < gates.length; i++) {
      const slideId = slideIdAtMs(gates[i].t);
      const resp = slideId ? saved[slideId] : null;
      if (resp) {
        initial[i] = resp.isCorrect ? 'correct' : 'incorrect';
      }
    }
    if (Object.keys(initial).length > 0) {
      initialGateResultsApplied.current = true;
      setGateResults(initial);
    }
  }, [gates, slideIdAtMs]);

  /** Seek to a gate marker AND immediately activate it. */
  const handleGateMarkerClick = useCallback(
    (marker: { realSec: number; idx: number }) => {
      const audio = audioRef.current;
      const realMs = marker.realSec * 1000;
      if (audio) {
        audio.pause();
        audio.currentTime = marker.realSec;
      }
      applyAt(realMs, true);
      // Mark all gates up to (but not including) this one as triggered,
      // so only this gate fires.
      const set = new Set<number>();
      for (let i = 0; i < marker.idx; i++) set.add(i);
      triggeredGatesRef.current = set;
      // Activate the gate directly.
      triggeredGatesRef.current.add(marker.idx);
      setIsPlaying(false);
      onPlayStateChange?.(false);
      activeGateIdxRef.current = marker.idx;
      setStudentAnswer(null);
      setAnswerFeedback(null);
      setActiveGate(gates[marker.idx]);
    },
    [applyAt, gates, onPlayStateChange]
  );

  // Spacebar toggles play/pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Don't hijack space if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (isPlaying) handlePause();
      else handlePlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying, handlePlay, handlePause]);

  const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev as typeof PLAYBACK_RATES[number]);
      const next = PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length];
      const audio = audioRef.current;
      if (audio) audio.playbackRate = next;
      return next;
    });
  }, []);

  const handleChapterClick = useCallback(
    (realMs: number) => {
      const audio = audioRef.current;
      if (audio) audio.currentTime = realMs / 1000;
      applyAt(realMs, true);
      setActiveGate(null);
      resetGatesForTime(realMs);
      setShowChapters(false);
    },
    [applyAt, resetGatesForTime]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Close chapters dropdown on outside click
  useEffect(() => {
    if (!showChapters) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-chapters-menu]')) {
        setShowChapters(false);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [showChapters]);

  const handleProgressBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      handleSeek(pct * virtualTotalMs);
    },
    [handleSeek, virtualTotalMs]
  );

  return (
    <div ref={containerRef} className={`overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm ${isFullscreen ? 'flex flex-col h-screen !border-0 !rounded-none !shadow-none' : ''} ${className}`}>
      {/* Slide area */}
      <div className={`relative ${isFullscreen ? 'flex-1 min-h-0 overflow-hidden' : ''}`}>
          <SlideCard
            slide={currentSlide}
            language={language}
            chromeless
            revealedCount={currentSurface?.revealed_bullets}
            showActivityAnswer={currentSurface?.answer_revealed ?? false}
            activityInteractive
            activityInteractiveDisabled={!activeGate}
            activityAnswer={activeGate ? studentAnswer : (currentSurface?.activity_answer ?? null)}
            onActivityAnswerChange={activeGate ? handleStudentAnswer : undefined}
          />
          {currentSurface && currentSurface.strokes.length > 0 && (
            <StrokesOverlay strokes={currentSurface.strokes} />
          )}
          {activeLaser && (
            <LaserOverlay x={activeLaser.x} y={activeLaser.y} age={activeLaser.age} />
          )}
          {currentSurface?.spotlight && (
            <SpotlightOverlay spotlight={currentSurface.spotlight} />
          )}
          {/* Confetti on correct answer */}
          {confettiKey > 0 && <SlideConfetti key={confettiKey} id={confettiKey} />}
          {/* Teacher note overlay */}
          {activeTeacherNote && (
            <div className="absolute top-3 left-3 right-3 pointer-events-none z-10">
              <div className="inline-block bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 shadow-sm">
                <span className="text-xs font-medium text-amber-800">{activeTeacherNote}</span>
              </div>
            </div>
          )}

          {/* Exploration gate — interactive exploration widget (covers slide) */}
          {activeGate && activeGate.type === 'exploration_gate' && (
            <ExplorationOverlay
              widgetType={activeGate.widget_type}
              config={activeGate.config}
              language={language}
              onContinue={handleContinueGate}
            />
          )}

          {/* Exploration slide auto-pause — shows the widget from the slide config */}
          {activeExplorationSlide && currentSlide?.type === 'exploration' && currentSlide.exploration_widget_type && currentSlide.exploration_config && (
            <ExplorationOverlay
              widgetType={currentSlide.exploration_widget_type}
              config={currentSlide.exploration_config}
              language={language}
              onContinue={handleContinueGate}
            />
          )}
      </div>

      {/* Activity gate — prompt bar between slide and control bar */}
      {activeGate && activeGate.type === 'activity_gate' && (
        <div className={`flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0 transition-colors ${
          answerFeedback === 'correct'
            ? 'bg-emerald-600'
            : answerFeedback === 'incorrect'
              ? 'bg-rose-600'
              : answerFeedback === 'submitted'
                ? 'bg-blue-600'
                : 'bg-[#007229]'
        }`}>
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            {answerFeedback === 'correct' ? (
              <>
                <OwlCorrect className="w-7 h-7 -my-1" />
                {language === 'ar' ? 'أحسنت!' : 'Great job!'}
              </>
            ) : answerFeedback === 'submitted' ? (
              <>
                <OwlCorrect className="w-7 h-7 -my-1" />
                {language === 'ar' ? 'تم الإرسال! سيراجعها المعلم' : 'Submitted! Your teacher will review it'}
              </>
            ) : answerFeedback === 'incorrect' ? (
              <>
                <OwlWrong className="w-7 h-7 -my-1" />
                {language === 'ar' ? 'حاول مرة أخرى' : 'Try again!'}
              </>
            ) : (
              <>
                <OwlPointing className="w-7 h-7 -my-1" />
                {language === 'ar' ? 'دورك! أجب ثم أرسل' : 'Your turn! Answer then submit'}
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            {/* Submit button — when answer selected but not yet graded */}
            {!answerFeedback && studentAnswer && (
              <button
                type="button"
                onClick={handleSubmitAnswer}
                className="flex items-center gap-1.5 rounded-full bg-amber-400 px-4 py-1.5 text-sm font-bold text-slate-900 shadow transition-transform hover:scale-105 active:scale-100"
              >
                {language === 'ar' ? 'إرسال' : 'Submit'}
              </button>
            )}
            {/* Try Again button — when incorrect */}
            {answerFeedback === 'incorrect' && (
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-bold text-rose-700 shadow transition-transform hover:scale-105 active:scale-100"
              >
                {language === 'ar' ? 'حاول مرة أخرى' : 'Try Again'}
              </button>
            )}
            {/* Continue button — always available */}
            <button
              type="button"
              onClick={handleContinueGate}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-slate-900 shadow transition-transform hover:scale-105 active:scale-100"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              {language === 'ar' ? 'متابعة' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
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
            setIsPlaying(false);
            onPlayStateChange?.(false);
          }}
          onError={(e) => {
            const audio = e.currentTarget;
            const code = audio.error?.code;
            const msg = audio.error?.message;
            console.warn(`SimPlayer: audio failed to load (code=${code}, msg=${msg}, src=${audio.src?.substring(0, 80)})`);
            // Try refreshing the signed URL — it may have expired.
            if (lessonId) {
              refreshAudioUrl();
            } else {
              setReady(true);
              onReady?.();
            }
          }}
        />
      )}

      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs font-medium">
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          {language === 'ar' ? 'أنت غير متصل بالإنترنت. قد يتوقف التشغيل.' : 'You are offline. Playback may stop.'}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 px-4 py-2">
          {error}
        </div>
      )}

      {/* Control bar */}
      {!hideControls && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-200">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={!!audio_url && !ready}
            className="w-9 h-9 rounded-full bg-[#007229] text-white grid place-items-center hover:bg-[#005a20] disabled:bg-slate-300 transition-colors flex-shrink-0 shadow-sm"
            aria-label={!ready && audio_url ? (language === 'ar' ? 'جارٍ التحميل...' : 'Loading...') : isPlaying ? 'Pause' : 'Play'}
          >
            {!ready && audio_url ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : isPlaying ? (
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Progress bar */}
          <div
            className="flex-1 relative h-1.5 bg-slate-200 rounded-full cursor-pointer group py-2 -my-2"
            onClick={handleProgressBarClick}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={virtualTotalMs}
            aria-valuenow={playbackMs}
          >
            <div className="absolute inset-y-2 left-0 right-0 bg-slate-200 rounded-full" />
            <div
              className="absolute inset-y-2 left-0 bg-[#007229] rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            {/* Gate markers — colored stars on the timeline */}
            {gateMarkers.map((m, i) => {
              const result = gateResults[m.idx];
              const isActive = activeGateIdxRef.current === m.idx && !!activeGate;
              const color = result === 'correct'
                ? 'text-emerald-500'
                : result === 'submitted'
                  ? 'text-blue-500'
                  : result === 'incorrect'
                    ? 'text-rose-500'
                    : result === 'skipped'
                      ? 'text-slate-400'
                      : isActive
                        ? 'text-amber-500 animate-pulse'
                        : 'text-amber-500';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleGateMarkerClick(m); }}
                  className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 hover:scale-150 active:scale-100 transition-transform cursor-pointer drop-shadow ${color}`}
                  style={{ left: `${m.pct}%`, marginLeft: -12 }}
                  title={
                    m.gateType === 'exploration_gate'
                      ? (language === 'ar' ? 'استكشاف' : 'Explore')
                      : (language === 'ar' ? 'نشاط' : 'Activity')
                  }
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </button>
              );
            })}
            {/* Playhead thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#007229] border-2 border-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progressPct}%`, marginLeft: -7 }}
            />
          </div>

          {/* Time */}
          <span className="text-xs tabular-nums text-slate-500 flex-shrink-0">
            {formatMs(playbackMs)} / {formatMs(virtualTotalMs)}
          </span>

          {/* Speed */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="h-7 px-1.5 rounded-md text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors flex-shrink-0 tabular-nums"
            aria-label="Playback speed"
            title="Playback speed"
          >
            {playbackRate === 1 ? '1x' : `${playbackRate}x`}
          </button>

          {/* Chapters */}
          {chapters.length > 1 && (
            <div className="relative flex-shrink-0" data-chapters-menu>
              <button
                type="button"
                onClick={() => setShowChapters((v) => !v)}
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200 grid place-items-center transition-colors"
                aria-label="Chapters"
                title="Chapters"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              {showChapters && (
                <div className="absolute bottom-full right-0 mb-2 w-64 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg z-50">
                  <div className="p-2">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {language === 'ar' ? 'الفصول' : 'Chapters'}
                    </p>
                    {chapters.map((ch, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleChapterClick(ch.realMs)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
                          i === currentChapterIdx
                            ? 'bg-[#007229]/10 text-[#007229] font-medium'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-[10px] tabular-nums text-slate-400 flex-shrink-0 w-8">
                          {formatMs(ch.virtualMs)}
                        </span>
                        <span className="truncate">{ch.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200 grid place-items-center transition-colors flex-shrink-0"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Speaker notes panel — collapsible section below controls */}
      {!hideControls && currentSpeakerNotes && (
        <div className="border-t border-slate-200">
          <button
            type="button"
            onClick={() => setNotesExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
              </svg>
              {language === 'ar' ? 'ملاحظات الدرس' : 'Lesson Notes'}
            </span>
            <svg className={`w-3.5 h-3.5 transition-transform ${notesExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {notesExpanded && (
            <div className="px-4 pb-3 max-h-32 overflow-y-auto">
              <p className="text-sm text-slate-600 leading-relaxed" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                {currentSpeakerNotes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}));

export default SimPlayer;
