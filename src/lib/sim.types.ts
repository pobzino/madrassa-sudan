/**
 * Event-sourced sim recording types.
 *
 * A sim is an audio track + a timeline of events that replay deterministically
 * against a frozen snapshot of the slide deck. See the /sim-lab POC and the
 * integration plan in the repo root for the full story.
 *
 * This file is the shared contract between:
 *   - `useSimRecorder` (records events + audio)
 *   - `SimPlayer` (consumes events + audio)
 *   - the `lesson_sims` API routes (stores + serves them)
 */

import type { Slide } from '@/lib/slides.types';
import type { WhiteboardTool, Point } from '@/hooks/useWhiteboard';
import type { InteractionAnswer } from '@/lib/interactions/types';
import type { ExplorationWidgetType, ExplorationWidgetConfig } from '@/lib/explorations/types';

// ── Timeline events ─────────────────────────────────────────────────────────

export type SimStrokeTool = Extract<
  WhiteboardTool,
  | 'pen'
  | 'highlighter'
  | 'rect'
  | 'rounded_rect'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'speech_bubble'
  | 'line'
  | 'arrow'
  | 'check'
  | 'cross'
>;

/**
 * Every event carries a logical timestamp `t` in milliseconds measured from
 * the start of the recording, excluding any paused ranges. Consumers can
 * assume events are sorted by `t`.
 */
export type SimEvent =
  // Navigation
  | { t: number; type: 'slide_change'; slide_id: string }
  | { t: number; type: 'chapter'; slide_id: string; label: string }

  // Bullet / answer reveals already supported by SlideCard
  | { t: number; type: 'reveal_bullet'; slide_id: string; index: number }
  | { t: number; type: 'reveal_answer'; slide_id: string }

  // Whiteboard strokes — freehand (pen / highlighter)
  | {
      t: number;
      type: 'stroke_start';
      slide_id: string;
      id: string;
      tool: SimStrokeTool;
      color: string;
      width: number;
      point: Point;
    }
  | { t: number; type: 'stroke_point'; slide_id: string; id: string; point: Point }
  | {
      t: number;
      type: 'stroke_end';
      slide_id: string;
      id: string;
      // Final shape for non-freehand tools so replay doesn't need to replay
      // individual point events for bounded shapes.
      start?: Point;
      end?: Point;
    }

  // Text and sticker strokes are placed atomically
  | {
      t: number;
      type: 'stroke_text';
      slide_id: string;
      id: string;
      color: string;
      text: string;
      position: Point;
      font_size: number;
    }
  | {
      t: number;
      type: 'stroke_sticker';
      slide_id: string;
      id: string;
      emoji: string;
      position: Point;
      font_size: number;
    }

  // Stroke lifecycle
  | { t: number; type: 'stroke_erase'; slide_id: string; id: string }
  | { t: number; type: 'clear_strokes'; slide_id: string }

  // Ephemeral visuals
  | { t: number; type: 'laser'; slide_id: string; x: number; y: number }
  | { t: number; type: 'spotlight_on' | 'spotlight_move'; slide_id: string; x: number; y: number }
  | { t: number; type: 'spotlight_off'; slide_id: string }

  // Pause-to-interact marker (set when the teacher lands on an activity slide)
  | { t: number; type: 'activity_gate'; slide_id: string; task_id: string | null }

  // Teacher's live answer state on an interactive activity slide. Emitted on
  // every draft answer change (e.g. each drop in a match_pairs widget) so
  // students see the demo play back during sim replay.
  | { t: number; type: 'activity_answer'; slide_id: string; answer: InteractionAnswer }

  // Teacher note — timestamped annotation visible only to teachers during playback
  | { t: number; type: 'teacher_note'; slide_id: string; text: string }

  // Exploration gate — pauses the sim and loads an interactive exploration
  // widget (number line, slider, image hotspots, letter trace). The student
  // explores until the widget signals completion, then the sim resumes.
  | {
      t: number;
      type: 'exploration_gate';
      slide_id: string;
      widget_type: ExplorationWidgetType;
      config: ExplorationWidgetConfig;
    };

/** Event shape accepted by `recordEvent`, before `t` is stamped by the recorder. */
export type SimEventInput = DistributiveOmit<SimEvent, 't'>;

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

// ── Persisted sim row ───────────────────────────────────────────────────────

/**
 * Non-destructive cut range on a sim's timeline, in **seconds** against the
 * original audio/events. The player skips these ranges during playback.
 */
export interface SimClipSegment {
  start: number;
  end: number;
}

/** Total cut duration (ms) across a set of clip segments. */
export function clipDurationMs(
  clips: SimClipSegment[] | null | undefined
): number {
  if (!clips || clips.length === 0) return 0;
  let sum = 0;
  for (const c of clips) {
    if (c.end > c.start) sum += (c.end - c.start) * 1000;
  }
  return sum;
}

/** Row shape returned by the API (mirrors `public.lesson_sims`). */
export interface SimRow {
  id: string;
  lesson_id: string;
  duration_ms: number;
  deck_snapshot: Slide[];
  events: SimEvent[];
  audio_path: string | null;
  audio_duration_ms: number | null;
  audio_mime: string | null;
  recorded_by: string | null;
  recorded_at: string;
  clip_segments: SimClipSegment[] | null;
  created_at: string;
  updated_at: string;
}

/** Shape the student player consumes — row + signed audio URL. */
export interface SimPayload {
  sim: SimRow;
  audio_url: string | null;
}

// ── Reconstructed surface state ─────────────────────────────────────────────

export interface SimStroke {
  id: string;
  tool: WhiteboardTool;
  color: string;
  width: number;
  points: Point[];
  start?: Point;
  end?: Point;
  text?: string;
  position?: Point;
  font_size?: number;
  emoji?: string;
}

export interface ActiveExploration {
  widget_type: ExplorationWidgetType;
  config: ExplorationWidgetConfig;
}

export interface SimSlideSurface {
  strokes: SimStroke[];
  revealed_bullets: number;
  answer_revealed: boolean;
  spotlight: { x: number; y: number } | null;
  active_activity_task_id: string | null;
  /** Last projected teacher answer on an interactive activity slide. */
  activity_answer: InteractionAnswer | null;
  /** Active exploration widget, if an exploration_gate was the last gate event. */
  active_exploration: ActiveExploration | null;
}

export interface SimSurfaceState {
  current_slide_id: string;
  slides: Record<string, SimSlideSurface>;
}

function initialSlideSurface(): SimSlideSurface {
  return {
    strokes: [],
    revealed_bullets: 0,
    answer_revealed: false,
    spotlight: null,
    active_activity_task_id: null,
    activity_answer: null,
    active_exploration: null,
  };
}

function initialSurface(deck: Slide[]): SimSurfaceState {
  const slides: Record<string, SimSlideSurface> = {};
  for (const slide of deck) {
    slides[slide.id] = initialSlideSurface();
  }
  return {
    current_slide_id: deck[0]?.id ?? '',
    slides,
  };
}

function applyToSlide(surface: SimSlideSurface, event: SimEvent): SimSlideSurface {
  switch (event.type) {
    case 'stroke_start': {
      const stroke: SimStroke = {
        id: event.id,
        tool: event.tool,
        color: event.color,
        width: event.width,
        points:
          event.tool === 'pen' || event.tool === 'highlighter' ? [event.point] : [],
        start:
          event.tool === 'pen' || event.tool === 'highlighter' ? undefined : event.point,
        end:
          event.tool === 'pen' || event.tool === 'highlighter' ? undefined : event.point,
      };
      return { ...surface, strokes: [...surface.strokes, stroke] };
    }
    case 'stroke_point': {
      const idx = surface.strokes.findIndex((s) => s.id === event.id);
      if (idx === -1) return surface;
      const next = surface.strokes.slice();
      next[idx] = { ...next[idx], points: [...next[idx].points, event.point] };
      return { ...surface, strokes: next };
    }
    case 'stroke_end': {
      if (event.start === undefined && event.end === undefined) {
        return surface;
      }
      const idx = surface.strokes.findIndex((s) => s.id === event.id);
      if (idx === -1) return surface;
      const next = surface.strokes.slice();
      next[idx] = {
        ...next[idx],
        start: event.start ?? next[idx].start,
        end: event.end ?? next[idx].end,
      };
      return { ...surface, strokes: next };
    }
    case 'stroke_text':
      return {
        ...surface,
        strokes: [
          ...surface.strokes,
          {
            id: event.id,
            tool: 'text',
            color: event.color,
            width: 0,
            points: [],
            text: event.text,
            position: event.position,
            font_size: event.font_size,
          },
        ],
      };
    case 'stroke_sticker':
      return {
        ...surface,
        strokes: [
          ...surface.strokes,
          {
            id: event.id,
            tool: 'sticker',
            color: '',
            width: 0,
            points: [],
            emoji: event.emoji,
            position: event.position,
            font_size: event.font_size,
          },
        ],
      };
    case 'stroke_erase':
      return {
        ...surface,
        strokes: surface.strokes.filter((s) => s.id !== event.id),
      };
    case 'clear_strokes':
      return { ...surface, strokes: [] };
    case 'reveal_bullet':
      return {
        ...surface,
        revealed_bullets: Math.max(surface.revealed_bullets, event.index + 1),
      };
    case 'reveal_answer':
      return { ...surface, answer_revealed: true };
    case 'spotlight_on':
    case 'spotlight_move':
      return { ...surface, spotlight: { x: event.x, y: event.y } };
    case 'spotlight_off':
      return { ...surface, spotlight: null };
    case 'activity_gate':
      return { ...surface, active_activity_task_id: event.task_id };
    case 'activity_answer':
      return { ...surface, activity_answer: event.answer };
    case 'exploration_gate':
      return {
        ...surface,
        active_exploration: { widget_type: event.widget_type, config: event.config },
      };
    default:
      return surface;
  }
}

function applyEvent(state: SimSurfaceState, event: SimEvent): SimSurfaceState {
  if (event.type === 'slide_change') {
    return { ...state, current_slide_id: event.slide_id };
  }
  if (event.type === 'chapter' || event.type === 'laser') {
    // Chapters are metadata; laser fires are ephemeral and don't mutate state.
    return state;
  }
  const slideId = event.slide_id;
  const prev = state.slides[slideId];
  if (!prev) return state;
  const next = applyToSlide(prev, event);
  if (next === prev) return state;
  return { ...state, slides: { ...state.slides, [slideId]: next } };
}

/**
 * Rebuild the complete surface state at time `upToMs` by replaying every
 * event with `t <= upToMs` against a fresh initial state. Pure — safe to
 * call on every animation frame during seek.
 */
export function rebuildSimState(
  deck: Slide[],
  events: SimEvent[],
  upToMs: number
): SimSurfaceState {
  let state = initialSurface(deck);
  for (const event of events) {
    if (event.t > upToMs) break;
    state = applyEvent(state, event);
  }
  return state;
}

/** Apply a single event — exposed for recorders that want live preview. */
export function applySimEvent(
  state: SimSurfaceState,
  event: SimEvent
): SimSurfaceState {
  return applyEvent(state, event);
}

/** Build a fresh empty surface for the given deck. */
export function createInitialSimSurface(deck: Slide[]): SimSurfaceState {
  return initialSurface(deck);
}

// ── Payload optimization ─────────────────────────────────────────────────────

/** Round a number to 1 decimal place to save JSON bytes. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function compactPoint(p: Point): Point {
  return { x: round1(p.x), y: round1(p.y), pressure: round1(p.pressure) };
}

/**
 * Compact a sim event array to reduce JSON payload size:
 * 1. Round all point coordinates to 1 decimal place.
 * 2. Drop consecutive stroke_point events that are within 1px of each other.
 *
 * This is a lossy but visually imperceptible optimization that can shrink
 * stroke-heavy sims by 30–60%.
 */
export function compactSimEvents(events: SimEvent[]): SimEvent[] {
  const out: SimEvent[] = [];
  const lastPointForStroke = new Map<string, Point>();

  for (const e of events) {
    switch (e.type) {
      case 'stroke_start': {
        const p = compactPoint(e.point);
        lastPointForStroke.set(e.id, p);
        out.push({ ...e, point: p });
        break;
      }
      case 'stroke_point': {
        const p = compactPoint(e.point);
        const prev = lastPointForStroke.get(e.id);
        // Drop if within 1px of previous point (saves ~40 bytes per dropped event)
        if (prev && Math.abs(p.x - prev.x) < 1 && Math.abs(p.y - prev.y) < 1) {
          continue;
        }
        lastPointForStroke.set(e.id, p);
        out.push({ ...e, point: p });
        break;
      }
      case 'stroke_end': {
        lastPointForStroke.delete(e.id);
        const patched = { ...e } as typeof e;
        if (patched.start) patched.start = compactPoint(patched.start);
        if (patched.end) patched.end = compactPoint(patched.end);
        out.push(patched);
        break;
      }
      case 'stroke_text':
        out.push({ ...e, position: compactPoint(e.position) });
        break;
      case 'stroke_sticker':
        out.push({ ...e, position: compactPoint(e.position) });
        break;
      case 'laser':
        out.push({ ...e, x: round1(e.x), y: round1(e.y) });
        break;
      case 'spotlight_on':
      case 'spotlight_move':
        out.push({ ...e, x: round1(e.x), y: round1(e.y) });
        break;
      default:
        out.push(e);
    }
  }

  return out;
}
