'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import {
  compactTraceStrokes,
  findTraceTemplate,
  loadTraceTemplate,
  MAX_TRACE_STROKES,
  type TraceLetterTemplate,
  type TraceStrokeTemplate,
} from '@/lib/interactions/trace-letter';
import type { TraceLetterConfig } from '@/lib/interactions/types';

// The finger-tracing pad shared by the lesson tracer and the battle's Rune
// Spell: pointer capture (touch, pen, mouse), no page scroll while tracing,
// coordinates on the square box in [0, 1] (the same in RTL and LTR).

export type TracePoint = [number, number];

function subscribeReducedMotion(callback: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
}

/** SVG path for points on a 0..1 box drawn at `size` units. */
export function tracePath(points: readonly number[][], size = 100): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  const head = `M${(first[0] * size).toFixed(2)} ${(first[1] * size).toFixed(2)}`;
  // A tap is a dot: a zero-length segment with round caps draws it.
  if (!rest.length) return `${head}l0.01 0`;
  return head + rest.map(([x, y]) => `L${(x * size).toFixed(2)} ${(y * size).toFixed(2)}`).join('');
}

/** A short arrowhead near the end of a stroke, pointing the way to go (as a path). */
export function arrowPath(stroke: TraceStrokeTemplate, size = 100, length = 3.4): string | null {
  const points = stroke.points;
  if (stroke.kind !== 'main' || points.length < 4) return null;
  const at = Math.max(2, Math.floor(points.length * 0.62));
  const [x, y] = points[at];
  const [px, py] = points[at - 2];
  const angle = Math.atan2(y - py, x - px);
  if (!Number.isFinite(angle) || (x === px && y === py)) return null;
  const tip = [x * size, y * size];
  const wing = (offset: number) => [tip[0] - length * Math.cos(angle - offset), tip[1] - length * Math.sin(angle - offset)];
  const [ax, ay] = wing(0.55);
  const [bx, by] = wing(-0.55);
  return `M${ax.toFixed(2)} ${ay.toFixed(2)}L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}`;
}

/**
 * Where each stroke's numbered start marker goes: its first point, or a little
 * way along it when an earlier stroke starts at the same spot (R, B, D: both
 * strokes start at the top of the stem), so no number hides another.
 */
export function startMarkers(template: TraceLetterTemplate, gap = 0.06): TracePoint[] {
  const placed: TracePoint[] = [];
  for (const stroke of template.strokes) {
    let at: TracePoint = [stroke.points[0][0], stroke.points[0][1]];
    const clashes = (p: TracePoint) => placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap);
    for (let t = 0.04; clashes(at) && t <= 0.5; t += 0.04) at = penAt(stroke, t);
    placed.push(at);
  }
  return placed;
}

/** One letter's template, loaded on demand (the battle passes its guide instead). */
export function useTraceTemplate(config: TraceLetterConfig | null, given?: TraceLetterTemplate | null) {
  const key = config ? `${config.script}:${config.letter}:${config.case ?? ''}:${config.form ?? ''}` : '';
  const [state, setState] = useState<{ key: string; template: TraceLetterTemplate | null; done: boolean }>({ key: '', template: null, done: false });
  useEffect(() => {
    if (given || !config) return;
    let live = true;
    void loadTraceTemplate(config).then((template) => {
      if (live) setState({ key, template, done: true });
    });
    return () => {
      live = false;
    };
    // `key` stands for config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, given]);
  if (given) return { template: given, loading: false };
  const known = findTraceTemplate(config);
  if (known) return { template: known, loading: false };
  const current = state.key === key ? state : { template: null, done: false };
  return { template: current.template, loading: !current.done };
}

interface PadOptions {
  strokes: number[][][];
  onStrokes: (strokes: number[][][]) => void;
  disabled?: boolean;
  /** Called on the first touch of each stroke (to stop a demo, play a sound). */
  onStrokeStart?: () => void;
}

/** Pointer handlers for an element whose box is the 0..1 tracing square. */
export function useTracePad({ strokes, onStrokes, disabled = false, onStrokeStart }: PadOptions) {
  const [current, setCurrent] = useState<TracePoint[] | null>(null);
  const live = useRef<{ id: number; points: TracePoint[] } | null>(null);
  const full = strokes.length >= MAX_TRACE_STROKES;

  const pointOf = (event: ReactPointerEvent<Element>): TracePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    ];
  };

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<Element>) => {
      if (disabled || full || live.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const points = [pointOf(event)];
      live.current = { id: event.pointerId, points };
      setCurrent(points);
      onStrokeStart?.();
    },
    [disabled, full, onStrokeStart]
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<Element>) => {
    const stroke = live.current;
    if (!stroke || stroke.id !== event.pointerId) return;
    event.preventDefault();
    const point = pointOf(event);
    const last = stroke.points[stroke.points.length - 1];
    // Skip jitter: a point every ~0.5% of the box is plenty.
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.005) return;
    stroke.points = [...stroke.points, point];
    setCurrent(stroke.points);
  }, []);

  const finish = useCallback(
    (event: ReactPointerEvent<Element>) => {
      const stroke = live.current;
      if (!stroke || stroke.id !== event.pointerId) return;
      live.current = null;
      setCurrent(null);
      if (!disabled) onStrokes(compactTraceStrokes([...strokes, stroke.points]));
    },
    [disabled, onStrokes, strokes]
  );

  return {
    // A stroke in progress when the pad is disabled (answer sent) is dropped.
    current: disabled ? null : current,
    full,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish },
    undo: () => onStrokes(strokes.slice(0, -1)),
    clear: () => onStrokes([]),
  };
}

/**
 * The "Watch me" demo: each stroke drawn in turn, with the pen's position.
 * Reduced motion shows the whole letter at once with its numbered starts.
 */
export function useTraceDemo(template: TraceLetterTemplate | null, reducedMotion: boolean) {
  const [demo, setDemo] = useState<{ stroke: number; t: number } | null>(null);
  const frame = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (timer.current !== null) clearTimeout(timer.current);
    frame.current = null;
    timer.current = null;
  }, []);
  const stop = useCallback(() => {
    cancel();
    setDemo(null);
  }, [cancel]);
  const play = useCallback(() => {
    if (!template) return;
    cancel();
    if (reducedMotion) {
      // The whole letter with its numbered starts, for a moment.
      setDemo({ stroke: template.strokes.length - 1, t: 1 });
      timer.current = setTimeout(() => setDemo(null), 1800);
      return;
    }
    // Long strokes take longer; dots are a quick tap. A short pause between strokes.
    const durations = template.strokes.map((stroke) => (stroke.kind === 'main' ? 650 + 900 * strokeLength(stroke.points) : 260));
    const pause = 220;
    const total = durations.reduce((sum, d) => sum + d + pause, 0) + 500;
    const start = performance.now();
    const tick = (now: number) => {
      let elapsed = now - start;
      if (elapsed >= total) {
        frame.current = null;
        setDemo(null);
        return;
      }
      let stroke = 0;
      while (stroke < durations.length - 1 && elapsed > durations[stroke] + pause) {
        elapsed -= durations[stroke] + pause;
        stroke += 1;
      }
      setDemo({ stroke, t: Math.min(1, elapsed / durations[stroke]) });
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [template, reducedMotion, cancel]);
  useEffect(() => cancel, [cancel]);
  return { demo, play, stop, playing: demo !== null };
}

function strokeLength(points: readonly number[][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return total;
}

/** Where the demo pen is: the point a fraction `t` along a stroke. */
export function penAt(stroke: TraceStrokeTemplate, t: number): TracePoint {
  const points = stroke.points;
  if (points.length === 1 || t <= 0) return [points[0][0], points[0][1]];
  const total = strokeLength(points);
  let target = total * Math.min(1, t);
  for (let i = 1; i < points.length; i += 1) {
    const segment = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= segment || i === points.length - 1) {
      const k = segment ? Math.min(1, target / segment) : 0;
      return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * k, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * k];
    }
    target -= segment;
  }
  const last = points[points.length - 1];
  return [last[0], last[1]];
}
