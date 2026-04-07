import { describe, it, expect } from 'vitest';
import {
  clipDurationMs,
  rebuildSimState,
  applySimEvent,
  createInitialSimSurface,
  compactSimEvents,
  type SimEvent,
  type SimClipSegment,
  type SimSurfaceState,
} from '@/lib/sim.types';
import type { Slide } from '@/lib/slides.types';

// Minimal slide factory for tests.
function makeSlide(id: string, overrides?: Partial<Slide>): Slide {
  return {
    id,
    type: 'content',
    sequence: 0,
    is_required: false,
    layout: 'default',
    title_ar: '',
    title_en: '',
    body_ar: '',
    body_en: '',
    speaker_notes_ar: '',
    speaker_notes_en: '',
    visual_hint: '',
    bullets_ar: null,
    bullets_en: null,
    reveal_items_ar: null,
    reveal_items_en: null,
    title_size: 'md',
    body_size: 'md',
    timestamp_seconds: null,
    ...overrides,
  } as Slide;
}

// ── clipDurationMs ───────────────────────────────────────────────────────────

describe('clipDurationMs', () => {
  it('returns 0 for null/undefined/empty clips', () => {
    expect(clipDurationMs(null)).toBe(0);
    expect(clipDurationMs(undefined)).toBe(0);
    expect(clipDurationMs([])).toBe(0);
  });

  it('computes total cut duration in ms from segments in seconds', () => {
    const clips: SimClipSegment[] = [
      { start: 10, end: 15 }, // 5s = 5000ms
      { start: 30, end: 35 }, // 5s = 5000ms
    ];
    expect(clipDurationMs(clips)).toBe(10000);
  });

  it('ignores segments where end <= start', () => {
    const clips: SimClipSegment[] = [
      { start: 10, end: 10 },  // 0
      { start: 20, end: 15 },  // negative → ignored
      { start: 5, end: 8 },    // 3s = 3000ms
    ];
    expect(clipDurationMs(clips)).toBe(3000);
  });

  it('handles a single clip', () => {
    expect(clipDurationMs([{ start: 0, end: 1.5 }])).toBe(1500);
  });
});

// ── createInitialSimSurface ──────────────────────────────────────────────────

describe('createInitialSimSurface', () => {
  it('creates a surface for an empty deck', () => {
    const surface = createInitialSimSurface([]);
    expect(surface.current_slide_id).toBe('');
    expect(surface.slides).toEqual({});
  });

  it('sets current_slide_id to the first slide', () => {
    const deck = [makeSlide('s1'), makeSlide('s2')];
    const surface = createInitialSimSurface(deck);
    expect(surface.current_slide_id).toBe('s1');
    expect(Object.keys(surface.slides)).toEqual(['s1', 's2']);
  });

  it('initializes each slide surface with default values', () => {
    const deck = [makeSlide('s1')];
    const surface = createInitialSimSurface(deck);
    expect(surface.slides['s1']).toEqual({
      strokes: [],
      revealed_bullets: 0,
      answer_revealed: false,
      spotlight: null,
      active_activity_task_id: null,
      activity_answer: null,
      active_exploration: null,
    });
  });
});

// ── applySimEvent ────────────────────────────────────────────────────────────

describe('applySimEvent', () => {
  const deck = [makeSlide('s1'), makeSlide('s2')];

  it('handles slide_change', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, { t: 100, type: 'slide_change', slide_id: 's2' });
    expect(next.current_slide_id).toBe('s2');
  });

  it('handles reveal_bullet', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, { t: 100, type: 'reveal_bullet', slide_id: 's1', index: 2 });
    expect(next.slides['s1'].revealed_bullets).toBe(3); // index + 1
  });

  it('reveal_bullet only increases (never decreases)', () => {
    let state = createInitialSimSurface(deck);
    state = applySimEvent(state, { t: 100, type: 'reveal_bullet', slide_id: 's1', index: 3 });
    state = applySimEvent(state, { t: 200, type: 'reveal_bullet', slide_id: 's1', index: 1 });
    expect(state.slides['s1'].revealed_bullets).toBe(4); // max(4, 2)
  });

  it('handles reveal_answer', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, { t: 100, type: 'reveal_answer', slide_id: 's1' });
    expect(next.slides['s1'].answer_revealed).toBe(true);
  });

  it('handles spotlight_on and spotlight_off', () => {
    let state = createInitialSimSurface(deck);
    state = applySimEvent(state, { t: 100, type: 'spotlight_on', slide_id: 's1', x: 0.5, y: 0.3 });
    expect(state.slides['s1'].spotlight).toEqual({ x: 0.5, y: 0.3 });
    state = applySimEvent(state, { t: 200, type: 'spotlight_off', slide_id: 's1' });
    expect(state.slides['s1'].spotlight).toBeNull();
  });

  it('handles clear_strokes', () => {
    let state = createInitialSimSurface(deck);
    state = applySimEvent(state, {
      t: 100, type: 'stroke_start', slide_id: 's1', id: 'st1',
      tool: 'pen', color: '#000', width: 2, point: { x: 0, y: 0, pressure: 0 },
    });
    expect(state.slides['s1'].strokes).toHaveLength(1);
    state = applySimEvent(state, { t: 200, type: 'clear_strokes', slide_id: 's1' });
    expect(state.slides['s1'].strokes).toHaveLength(0);
  });

  it('handles stroke_erase', () => {
    let state = createInitialSimSurface(deck);
    state = applySimEvent(state, {
      t: 100, type: 'stroke_start', slide_id: 's1', id: 'st1',
      tool: 'pen', color: '#000', width: 2, point: { x: 0, y: 0, pressure: 0 },
    });
    state = applySimEvent(state, {
      t: 200, type: 'stroke_start', slide_id: 's1', id: 'st2',
      tool: 'pen', color: '#f00', width: 3, point: { x: 1, y: 1, pressure: 0 },
    });
    expect(state.slides['s1'].strokes).toHaveLength(2);
    state = applySimEvent(state, { t: 300, type: 'stroke_erase', slide_id: 's1', id: 'st1' });
    expect(state.slides['s1'].strokes).toHaveLength(1);
    expect(state.slides['s1'].strokes[0].id).toBe('st2');
  });

  it('ignores events for unknown slide IDs', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, { t: 100, type: 'reveal_bullet', slide_id: 'unknown', index: 0 });
    expect(next).toEqual(state);
  });

  it('chapter and laser events do not mutate state', () => {
    const state = createInitialSimSurface(deck);
    const afterChapter = applySimEvent(state, { t: 100, type: 'chapter', slide_id: 's1', label: 'Intro' });
    expect(afterChapter).toEqual(state);
    const afterLaser = applySimEvent(state, { t: 200, type: 'laser', slide_id: 's1', x: 0.5, y: 0.5 });
    expect(afterLaser).toEqual(state);
  });

  it('handles stroke_text', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, {
      t: 100, type: 'stroke_text', slide_id: 's1', id: 'txt1',
      color: '#000', text: 'Hello', position: { x: 50, y: 50, pressure: 0 }, font_size: 16,
    });
    expect(next.slides['s1'].strokes).toHaveLength(1);
    expect(next.slides['s1'].strokes[0].tool).toBe('text');
    expect(next.slides['s1'].strokes[0].text).toBe('Hello');
  });

  it('handles stroke_sticker', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, {
      t: 100, type: 'stroke_sticker', slide_id: 's1', id: 'stk1',
      emoji: '🌟', position: { x: 50, y: 50, pressure: 0 }, font_size: 32,
    });
    expect(next.slides['s1'].strokes).toHaveLength(1);
    expect(next.slides['s1'].strokes[0].tool).toBe('sticker');
    expect(next.slides['s1'].strokes[0].emoji).toBe('🌟');
  });

  it('handles activity_gate', () => {
    const state = createInitialSimSurface(deck);
    const next = applySimEvent(state, {
      t: 100, type: 'activity_gate', slide_id: 's1', task_id: 'task-1',
    });
    expect(next.slides['s1'].active_activity_task_id).toBe('task-1');
  });
});

// ── rebuildSimState ──────────────────────────────────────────────────────────

describe('rebuildSimState', () => {
  const deck = [makeSlide('s1'), makeSlide('s2'), makeSlide('s3')];

  it('returns initial state for empty events', () => {
    const state = rebuildSimState(deck, [], 1000);
    expect(state.current_slide_id).toBe('s1');
    expect(state.slides['s1'].strokes).toHaveLength(0);
  });

  it('returns initial state for empty deck', () => {
    const state = rebuildSimState([], [], 0);
    expect(state.current_slide_id).toBe('');
  });

  it('applies events up to the given timestamp', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'slide_change', slide_id: 's1' },
      { t: 500, type: 'reveal_bullet', slide_id: 's1', index: 0 },
      { t: 1000, type: 'slide_change', slide_id: 's2' },
      { t: 1500, type: 'reveal_bullet', slide_id: 's2', index: 0 },
      { t: 2000, type: 'slide_change', slide_id: 's3' },
    ];

    // At t=750, only first two events applied
    const at750 = rebuildSimState(deck, events, 750);
    expect(at750.current_slide_id).toBe('s1');
    expect(at750.slides['s1'].revealed_bullets).toBe(1);
    expect(at750.slides['s2'].revealed_bullets).toBe(0);

    // At t=1500, first four events applied
    const at1500 = rebuildSimState(deck, events, 1500);
    expect(at1500.current_slide_id).toBe('s2');
    expect(at1500.slides['s2'].revealed_bullets).toBe(1);

    // At t=3000, all events applied
    const at3000 = rebuildSimState(deck, events, 3000);
    expect(at3000.current_slide_id).toBe('s3');
  });

  it('handles strokes across slides independently', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'stroke_start', slide_id: 's1', id: 'a', tool: 'pen', color: '#000', width: 2, point: { x: 0, y: 0, pressure: 0 } },
      { t: 50, type: 'stroke_point', slide_id: 's1', id: 'a', point: { x: 10, y: 10, pressure: 0 } },
      { t: 100, type: 'stroke_end', slide_id: 's1', id: 'a' },
      { t: 200, type: 'slide_change', slide_id: 's2' },
      { t: 300, type: 'stroke_start', slide_id: 's2', id: 'b', tool: 'pen', color: '#f00', width: 3, point: { x: 5, y: 5, pressure: 0 } },
    ];

    const state = rebuildSimState(deck, events, 400);
    expect(state.slides['s1'].strokes).toHaveLength(1);
    expect(state.slides['s1'].strokes[0].points).toHaveLength(2);
    expect(state.slides['s2'].strokes).toHaveLength(1);
    expect(state.slides['s2'].strokes[0].points).toHaveLength(1);
  });

  it('events at exact upToMs are included', () => {
    const events: SimEvent[] = [
      { t: 100, type: 'reveal_bullet', slide_id: 's1', index: 0 },
    ];
    const state = rebuildSimState(deck, events, 100);
    expect(state.slides['s1'].revealed_bullets).toBe(1);
  });

  it('teacher_note events do not change surface state', () => {
    const events: SimEvent[] = [
      { t: 100, type: 'teacher_note', slide_id: 's1', text: 'Remember to explain this' },
    ];
    const state = rebuildSimState(deck, events, 200);
    // Surface should be unchanged — teacher_note falls to default case
    expect(state.slides['s1']).toEqual(createInitialSimSurface(deck).slides['s1']);
  });
});

// ── compactSimEvents ─────────────────────────────────────────────────────────

describe('compactSimEvents', () => {
  it('rounds point coordinates to 1 decimal place', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'stroke_start', slide_id: 's1', id: 'a', tool: 'pen', color: '#000', width: 2, point: { x: 10.1234, y: 20.5678, pressure: 0.512 } },
    ];
    const compacted = compactSimEvents(events);
    expect(compacted).toHaveLength(1);
    const e = compacted[0] as Extract<SimEvent, { type: 'stroke_start' }>;
    expect(e.point.x).toBe(10.1);
    expect(e.point.y).toBe(20.6);
    expect(e.point.pressure).toBe(0.5);
  });

  it('drops stroke_point events within 1px of previous', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'stroke_start', slide_id: 's1', id: 'a', tool: 'pen', color: '#000', width: 2, point: { x: 10, y: 10, pressure: 0 } },
      { t: 10, type: 'stroke_point', slide_id: 's1', id: 'a', point: { x: 10.3, y: 10.4, pressure: 0 } },  // within 1px → dropped
      { t: 20, type: 'stroke_point', slide_id: 's1', id: 'a', point: { x: 12, y: 10, pressure: 0 } },       // > 1px → kept
      { t: 30, type: 'stroke_point', slide_id: 's1', id: 'a', point: { x: 12.5, y: 10.3, pressure: 0 } },   // within 1px of 12,10 → dropped
      { t: 40, type: 'stroke_end', slide_id: 's1', id: 'a' },
    ];
    const compacted = compactSimEvents(events);
    // start + 1 kept point + end = 3 events
    expect(compacted).toHaveLength(3);
    expect(compacted[0].type).toBe('stroke_start');
    expect(compacted[1].type).toBe('stroke_point');
    expect(compacted[2].type).toBe('stroke_end');
  });

  it('preserves non-stroke events unchanged', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'slide_change', slide_id: 's1' },
      { t: 100, type: 'reveal_bullet', slide_id: 's1', index: 0 },
      { t: 200, type: 'teacher_note', slide_id: 's1', text: 'Note' },
    ];
    const compacted = compactSimEvents(events);
    expect(compacted).toHaveLength(3);
    expect(compacted).toEqual(events);
  });

  it('rounds laser and spotlight coordinates', () => {
    const events: SimEvent[] = [
      { t: 0, type: 'laser', slide_id: 's1', x: 50.123, y: 75.789 },
      { t: 100, type: 'spotlight_on', slide_id: 's1', x: 33.456, y: 66.789 },
    ];
    const compacted = compactSimEvents(events);
    const laser = compacted[0] as SimEvent & { x: number; y: number };
    expect(laser.x).toBe(50.1);
    expect(laser.y).toBe(75.8);
    const spot = compacted[1] as SimEvent & { x: number; y: number };
    expect(spot.x).toBe(33.5);
    expect(spot.y).toBe(66.8);
  });

  it('handles empty events array', () => {
    expect(compactSimEvents([])).toEqual([]);
  });
});
