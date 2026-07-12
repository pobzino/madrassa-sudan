/**
 * LessonVideo — Remotion composition that renders a lesson sim as video.
 *
 * This is a deterministic port of SimPlayer's playback surface: where the
 * player samples `<audio>.currentTime` per animation frame, this component
 * derives the timeline position from Remotion's frame clock and projects the
 * exact same state through the shared clip math + `rebuildSimState`.
 *
 * Per frame:
 *   frame -> virtual ms -> (skip cut ranges) -> real ms
 *         -> rebuildSimState(deck, events, realMs)
 *         -> SlideCard + strokes canvas + laser/spotlight overlays
 *
 * Interactive-only player features (activity gates, exploration overlays,
 * confetti, teacher notes, controls) are intentionally omitted — an MP4
 * plays straight through, showing the teacher's recorded demo answers.
 */

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import SlideCard from '@/components/slides/SlideCard';
import { renderStrokeToCtx, type Stroke } from '@/hooks/useWhiteboard';
import {
  filterClippedEvents,
  normalizeClips,
  realToVirtualMs,
  rebuildSimState,
  virtualToRealMs,
  type SimClipSegment,
  type SimEvent,
  type SimStroke,
} from '@/lib/sim.types';
import type { Slide, SlideEntranceAnimation } from '@/lib/slides.types';
import { fontVariables } from './fonts';

// Matches SlideCard's internal design space (same constants as SimPlayer).
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const LASER_FADE_MS = 300;

// A `type` (not `interface`) so it gets the implicit index signature that
// Remotion's `Composition` props constraint (Record<string, unknown>) needs.
export type LessonVideoProps = {
  deck: Slide[];
  events: SimEvent[];
  /** Raw (un-clipped) sim duration in ms — `duration_ms || audio_duration_ms`. */
  durationMs: number;
  clipSegments: SimClipSegment[] | null;
  audioUrl: string | null;
  language: 'ar' | 'en';
};

// Same mapping SimPlayer uses to feed projected strokes into the shared
// canvas renderer.
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

/**
 * Preload every remote slide image before any frame is captured. The slide
 * templates use plain `<img>` tags with no load gating, so without this the
 * first frames of an image slide can capture before the image arrives.
 */
function useImagePreload(deck: Slide[]) {
  const urls = useMemo(() => {
    const set = new Set<string>();
    for (const slide of deck) {
      if (slide.image_url && /^https?:\/\//.test(slide.image_url)) {
        set.add(slide.image_url);
      }
    }
    return [...set];
  }, [deck]);

  const [handle] = useState(() => delayRender('Preloading slide images'));
  const continuedRef = useRef(false);

  useEffect(() => {
    if (continuedRef.current) return;
    Promise.all(
      urls.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            // Broken images hide themselves via onError in SlideImage —
            // don't block the render on them.
            img.onerror = () => resolve();
            img.src = src;
          })
      )
    ).then(() => {
      if (!continuedRef.current) {
        continuedRef.current = true;
        continueRender(handle);
      }
    });
  }, [urls, handle]);
}

// CSS `ease-out`, matching the globals.css entrance keyframes.
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

/**
 * Deterministic re-implementation of the slide entrance animations
 * (globals.css: slide-entrance-fade 0.35s / slide-up 0.4s / pop 0.35s).
 * Wall-clock CSS animations are disabled in style.css, so we drive the same
 * visual from the frame-derived age of the current slide.
 */
function getEntranceStyle(
  anim: SlideEntranceAnimation | null | undefined,
  ageMs: number
): CSSProperties {
  if (!anim || anim === 'none') return {};
  const durationMs = anim === 'slide_up' ? 400 : 350;
  const p = interpolate(ageMs, [0, durationMs], [0, 1], {
    easing: EASE_OUT,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  switch (anim) {
    case 'fade':
      return { opacity: p };
    case 'slide_up':
      return { opacity: p, transform: `translateY(${24 * (1 - p)}px)` };
    case 'pop':
      return { opacity: p, transform: `scale(${0.96 + 0.04 * p})` };
    default:
      return {};
  }
}

/** Whiteboard strokes drawn with the same pure canvas renderer as SimPlayer. */
function StrokesLayer({ strokes }: { strokes: SimStroke[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useVideoConfig();
  // Remotion's `scale` render option raises deviceScaleFactor; match it so
  // strokes stay sharp at higher output resolutions.
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const bufferWidth = Math.max(1, Math.round(width * dpr));
  const bufferHeight = Math.max(1, Math.round(height * dpr));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / DESIGN_WIDTH;
    const scaleY = canvas.height / DESIGN_HEIGHT;
    for (const s of strokes) {
      renderStrokeToCtx(ctx, simStrokeToStroke(s), scaleX, scaleY);
    }
  }, [strokes, bufferWidth, bufferHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={bufferWidth}
      height={bufferHeight}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  );
}

/** Laser dot, identical to SimPlayer's LaserOverlay (pure function of x/y/age). */
function LaserDot({ x, y, age }: { x: number; y: number; age: number }) {
  const leftPct = (x / DESIGN_WIDTH) * 100;
  const topPct = (y / DESIGN_HEIGHT) * 100;
  const opacity = Math.max(0, 1 - age / LASER_FADE_MS);
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: 'translate(-50%, -50%)',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(255,80,80,${opacity * 0.9}) 0%, rgba(255,40,40,${opacity * 0.5}) 40%, transparent 70%)`,
        boxShadow: `0 0 12px rgba(255,60,60,${opacity * 0.6})`,
        pointerEvents: 'none',
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

/** Spotlight mask, identical to SimPlayer's SpotlightOverlay. */
function SpotlightLayer({ x, y }: { x: number; y: number }) {
  const leftPct = (x / DESIGN_WIDTH) * 100;
  const topPct = (y / DESIGN_HEIGHT) * 100;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(circle at ${leftPct}% ${topPct}%, transparent 0, transparent 140px, rgba(0,0,0,0.55) 260px)`,
      }}
      aria-hidden
    />
  );
}

export const LessonVideo: React.FC<LessonVideoProps> = ({
  deck,
  events,
  durationMs,
  clipSegments,
  audioUrl,
  language,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clips = useMemo(() => normalizeClips(clipSegments), [clipSegments]);
  const projectedEvents = useMemo(
    () => filterClippedEvents(events, clips),
    [events, clips]
  );

  // Frame clock -> position on the original (un-clipped) sim timeline.
  const virtualMs = (frame / fps) * 1000;
  const realMs = virtualToRealMs(virtualMs, clips);

  const surface = useMemo(
    () => rebuildSimState(deck, projectedEvents, realMs),
    [deck, projectedEvents, realMs]
  );

  useImagePreload(deck);

  const currentSlide = useMemo(
    () => deck.find((s) => s.id === surface.current_slide_id) ?? deck[0] ?? null,
    [deck, surface.current_slide_id]
  );
  const currentSurface = currentSlide
    ? surface.slides[currentSlide.id] ?? null
    : null;

  // When did the current slide appear? Drives the entrance animation.
  const slideEnteredAtMs = useMemo(() => {
    let entered = 0;
    for (const e of projectedEvents) {
      if (e.t > realMs) break;
      if (e.type === 'slide_change') entered = e.t;
    }
    return entered;
  }, [projectedEvents, realMs]);

  // Most recent laser event within its fade window (same scan as SimPlayer).
  const activeLaser = useMemo(() => {
    for (let i = projectedEvents.length - 1; i >= 0; i--) {
      const e = projectedEvents[i];
      if (e.t > realMs) continue;
      if (e.type === 'laser') {
        const age = realMs - e.t;
        return age <= LASER_FADE_MS ? { x: e.x, y: e.y, age } : null;
      }
      if (e.t < realMs - LASER_FADE_MS) break;
    }
    return null;
  }, [projectedEvents, realMs]);

  // Un-cut portions of the audio track, placed on the virtual timeline so
  // the narration stays in sync after cuts are skipped.
  const keptSegments = useMemo(() => {
    const out: { startMs: number; endMs: number }[] = [];
    let cursor = 0;
    for (const c of clips) {
      const startMs = c.start * 1000;
      const endMs = c.end * 1000;
      if (startMs > cursor) {
        out.push({ startMs: cursor, endMs: Math.min(startMs, durationMs) });
      }
      cursor = Math.max(cursor, endMs);
      if (cursor >= durationMs) break;
    }
    if (cursor < durationMs) out.push({ startMs: cursor, endMs: durationMs });
    return out.filter((k) => k.endMs - k.startMs > 10);
  }, [clips, durationMs]);

  if (!currentSlide) {
    return <AbsoluteFill style={{ backgroundColor: '#ffffff' }} />;
  }

  const entranceStyle = getEntranceStyle(
    currentSlide.entrance_animation,
    realMs - slideEnteredAtMs
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#ffffff', ...fontVariables }}>
      {audioUrl &&
        keptSegments.map((seg, i) => {
          const fromFrame = Math.round(
            (realToVirtualMs(seg.startMs, clips) / 1000) * fps
          );
          const trimBefore = Math.round((seg.startMs / 1000) * fps);
          const trimAfter = Math.round((seg.endMs / 1000) * fps);
          if (trimAfter <= trimBefore) return null;
          return (
            <Sequence
              key={i}
              from={fromFrame}
              durationInFrames={trimAfter - trimBefore}
              layout="none"
            >
              <Audio src={audioUrl} trimBefore={trimBefore} trimAfter={trimAfter} />
            </Sequence>
          );
        })}

      <div style={{ position: 'absolute', inset: 0, ...entranceStyle }}>
        <SlideCard
          key={`${currentSlide.id}:${language}`}
          slide={currentSlide}
          language={language}
          chromeless
          revealedCount={currentSurface?.revealed_bullets}
          showActivityAnswer={currentSurface?.answer_revealed ?? false}
          // Interactive mode shows the teacher's recorded demo answer on
          // activity slides. Exploration slides stay static: interactive
          // mode would mount React.lazy widgets whose async chunk load can
          // capture a Suspense spinner into frames.
          activityInteractive={currentSlide.type !== 'exploration'}
          activityInteractiveDisabled
          activityAnswer={currentSurface?.activity_answer ?? null}
        />
      </div>

      {currentSurface && currentSurface.strokes.length > 0 && (
        <StrokesLayer strokes={currentSurface.strokes} />
      )}
      {activeLaser && (
        <LaserDot x={activeLaser.x} y={activeLaser.y} age={activeLaser.age} />
      )}
      {currentSurface?.spotlight && (
        <SpotlightLayer
          x={currentSurface.spotlight.x}
          y={currentSurface.spotlight.y}
        />
      )}
    </AbsoluteFill>
  );
};
