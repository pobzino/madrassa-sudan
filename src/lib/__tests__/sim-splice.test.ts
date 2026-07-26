import { describe, it, expect } from 'vitest';
import {
  computeSlideSpans,
  remapClipSegments,
  spliceDeltaMs,
  spliceEvents,
  spliceSim,
  type SplicePlan,
} from '@/lib/sim-splice';
import type { SimEvent } from '@/lib/sim.types';

// A three-slide recording: s1 0–10s, s2 10–25s, s3 25–40s, with a stroke on
// each slide and a bullet reveal on the middle one.
const EVENTS: SimEvent[] = [
  { t: 0, type: 'slide_change', slide_id: 's1' },
  { t: 4000, type: 'laser', slide_id: 's1', x: 0.5, y: 0.5 },
  { t: 10000, type: 'slide_change', slide_id: 's2' },
  { t: 12000, type: 'reveal_bullet', slide_id: 's2', index: 0 },
  { t: 20000, type: 'laser', slide_id: 's2', x: 0.2, y: 0.3 },
  { t: 25000, type: 'slide_change', slide_id: 's3' },
  { t: 30000, type: 'laser', slide_id: 's3', x: 0.9, y: 0.1 },
];
const DURATION = 40000;

// Replace the middle slide (10s–25s) with a 20s retake: +5s of new material.
const PLAN: SplicePlan = {
  replaceStartMs: 10000,
  replaceEndMs: 25000,
  patchDurationMs: 20000,
  slideId: 's2',
};

const PATCH: SimEvent[] = [
  { t: 0, type: 'slide_change', slide_id: 's2' },
  { t: 3000, type: 'reveal_bullet', slide_id: 's2', index: 0 },
  { t: 15000, type: 'laser', slide_id: 's2', x: 0.4, y: 0.4 },
];

describe('computeSlideSpans', () => {
  it('derives one contiguous span per slide, ending at the next change', () => {
    const spans = computeSlideSpans(EVENTS, DURATION);
    expect(spans).toEqual([
      { slideId: 's1', startMs: 0, endMs: 10000, occurrence: 0 },
      { slideId: 's2', startMs: 10000, endMs: 25000, occurrence: 0 },
      { slideId: 's3', startMs: 25000, endMs: 40000, occurrence: 0 },
    ]);
  });

  it('covers the opening gap when the recording has no slide_change at 0', () => {
    const late: SimEvent[] = [{ t: 6000, type: 'slide_change', slide_id: 's2' }];
    const spans = computeSlideSpans(late, 20000, 's1');
    expect(spans[0]).toEqual({ slideId: 's1', startMs: 0, endMs: 6000, occurrence: 0 });
    expect(spans[1].slideId).toBe('s2');
  });

  it('numbers repeat visits so each can be replaced separately', () => {
    const revisit: SimEvent[] = [
      { t: 0, type: 'slide_change', slide_id: 's1' },
      { t: 5000, type: 'slide_change', slide_id: 's2' },
      { t: 9000, type: 'slide_change', slide_id: 's1' },
    ];
    const spans = computeSlideSpans(revisit, 15000);
    expect(spans.map((s) => [s.slideId, s.occurrence])).toEqual([
      ['s1', 0],
      ['s2', 0],
      ['s1', 1],
    ]);
  });
});

describe('spliceEvents', () => {
  it('drops the replaced slide events and rebases the patch onto the timeline', () => {
    const result = spliceEvents(EVENTS, PLAN, PATCH);

    // Nothing from the old middle slide survives.
    expect(result.filter((e) => e.t >= 10000 && e.t < 30000 && e.slide_id === 's2')).toHaveLength(3);
    expect(result.find((e) => e.t === 12000)).toBeUndefined();
    expect(result.find((e) => e.t === 20000 && e.type === 'laser')).toBeUndefined();

    // Patch events land at replaceStart + their relative time.
    expect(result.find((e) => e.type === 'reveal_bullet')?.t).toBe(13000);
    expect(result.find((e) => e.type === 'laser' && e.slide_id === 's2')?.t).toBe(25000);
  });

  it('leaves earlier events untouched and shifts later ones by the delta', () => {
    const result = spliceEvents(EVENTS, PLAN, PATCH);
    expect(result.find((e) => e.slide_id === 's1' && e.type === 'laser')?.t).toBe(4000);
    expect(result.find((e) => e.type === 'slide_change' && e.slide_id === 's3')?.t).toBe(30000);
    expect(result.find((e) => e.slide_id === 's3' && e.type === 'laser')?.t).toBe(35000);
  });

  it('shifts later events backwards when the retake is shorter', () => {
    const shorter: SplicePlan = { ...PLAN, patchDurationMs: 5000 };
    const result = spliceEvents(EVENTS, shorter, [{ t: 0, type: 'slide_change', slide_id: 's2' }]);
    expect(spliceDeltaMs(shorter)).toBe(-10000);
    expect(result.find((e) => e.type === 'slide_change' && e.slide_id === 's3')?.t).toBe(15000);
  });

  it('synthesizes the entering slide_change when the patch omits one', () => {
    const result = spliceEvents(EVENTS, PLAN, [
      { t: 2000, type: 'reveal_bullet', slide_id: 's2', index: 1 },
    ]);
    const atStart = result.filter((e) => e.t === 10000);
    expect(atStart).toHaveLength(1);
    expect(atStart[0].type).toBe('slide_change');
    expect(atStart[0].slide_id).toBe('s2');
  });

  it('keeps the timeline sorted', () => {
    const result = spliceEvents(EVENTS, PLAN, PATCH);
    const times = result.map((e) => e.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('remapClipSegments', () => {
  it('keeps cuts before the splice and shifts cuts after it', () => {
    const cuts = [
      { start: 2, end: 3 },
      { start: 30, end: 32 },
    ];
    expect(remapClipSegments(cuts, PLAN)).toEqual([
      { start: 2, end: 3 },
      { start: 35, end: 37 },
    ]);
  });

  it('drops cuts that referred to audio the retake replaced', () => {
    expect(remapClipSegments([{ start: 12, end: 14 }], PLAN)).toBeNull();
  });

  it('trims a cut that straddles the replaced range down to surviving audio', () => {
    expect(remapClipSegments([{ start: 8, end: 27 }], PLAN)).toEqual([
      { start: 8, end: 10 },
      { start: 30, end: 32 },
    ]);
  });
});

describe('spliceSim', () => {
  it('reports the new total duration', () => {
    expect(spliceSim(EVENTS, null, DURATION, PLAN, PATCH).durationMs).toBe(45000);
    expect(
      spliceSim(EVENTS, null, DURATION, { ...PLAN, patchDurationMs: 5000 }, PATCH).durationMs
    ).toBe(30000);
  });

  it('never reports a duration shorter than the patch itself', () => {
    const wholeThing: SplicePlan = {
      replaceStartMs: 0,
      replaceEndMs: 40000,
      patchDurationMs: 50000,
      slideId: 's1',
    };
    expect(spliceSim(EVENTS, null, DURATION, wholeThing, PATCH).durationMs).toBe(50000);
  });
});
