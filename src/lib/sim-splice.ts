/**
 * Sim splice engine — replace a slice of a recorded sim with a freshly
 * recorded "patch take", so a tutor can fix one mistake instead of
 * re-recording the whole lesson.
 *
 * Pure and Supabase-free so it is trivially unit-testable. The browser-side
 * audio surgery that pairs with this lives in `@/lib/sim-audio-splice`.
 *
 * The model: a sim is one audio file plus `events[]`, each event carrying an
 * absolute `t` (ms from recording start) and a `slide_id`. Because
 * `slide_change` events bound each slide, any slide's span on the timeline is
 * derivable — that span is what a patch replaces.
 *
 * Splicing shifts everything after the replaced span by
 * `patchDurationMs - (replaceEndMs - replaceStartMs)`, which can be negative
 * (the retake was shorter). Existing `clip_segments` cuts are remapped through
 * the same transform, and cuts that fell inside the replaced span are dropped
 * because that audio no longer exists.
 */

import type { SimClipSegment, SimEvent } from '@/lib/sim.types';

export interface SlideSpan {
  slideId: string;
  /** Inclusive start on the sim timeline, ms. */
  startMs: number;
  /** Exclusive end on the sim timeline, ms. */
  endMs: number;
  /**
   * Occurrence index. A tutor who jumps back to an earlier slide produces more
   * than one span for that slide; each is separately replaceable.
   */
  occurrence: number;
}

export interface SplicePlan {
  /** Start of the range being replaced, ms. */
  replaceStartMs: number;
  /** End of the range being replaced, ms (exclusive). */
  replaceEndMs: number;
  /** Length of the newly recorded patch audio, ms. */
  patchDurationMs: number;
  /** Slide the patch belongs to — used to guarantee a slide_change at its start. */
  slideId: string;
}

export interface SpliceResult {
  events: SimEvent[];
  clipSegments: SimClipSegment[] | null;
  durationMs: number;
}

/** Time shift the splice applies to everything after the replaced range. */
export function spliceDeltaMs(plan: SplicePlan): number {
  return plan.patchDurationMs - (plan.replaceEndMs - plan.replaceStartMs);
}

/**
 * Contiguous per-slide spans of the timeline, derived from `slide_change`
 * events. `initialSlideId` is the slide showing before the first
 * `slide_change` (normally the deck's first slide).
 */
export function computeSlideSpans(
  events: SimEvent[],
  durationMs: number,
  initialSlideId?: string | null
): SlideSpan[] {
  const changes = events
    .filter((e): e is Extract<SimEvent, { type: 'slide_change' }> => e.type === 'slide_change')
    .slice()
    .sort((a, b) => a.t - b.t);

  const boundaries: Array<{ slideId: string; startMs: number }> = [];

  // A recording that doesn't open with a slide_change still shows a slide.
  if (initialSlideId && (changes.length === 0 || changes[0].t > 0)) {
    boundaries.push({ slideId: initialSlideId, startMs: 0 });
  }
  for (const change of changes) {
    const previous = boundaries[boundaries.length - 1];
    // Consecutive changes to the same slide describe one span, not two.
    if (previous && previous.slideId === change.slide_id) continue;
    boundaries.push({ slideId: change.slide_id, startMs: change.t });
  }

  const seen = new Map<string, number>();
  const spans: SlideSpan[] = [];
  boundaries.forEach((boundary, i) => {
    const endMs = i + 1 < boundaries.length ? boundaries[i + 1].startMs : Math.max(durationMs, boundary.startMs);
    if (endMs <= boundary.startMs) return; // zero-length span (instant skip-through)
    const occurrence = seen.get(boundary.slideId) ?? 0;
    seen.set(boundary.slideId, occurrence + 1);
    spans.push({ slideId: boundary.slideId, startMs: boundary.startMs, endMs, occurrence });
  });

  return spans;
}

/**
 * Build the new event timeline. `patchEvents` carry `t` relative to the start
 * of the patch recording (0-based); they are rebased onto the sim timeline.
 */
export function spliceEvents(
  events: SimEvent[],
  plan: SplicePlan,
  patchEvents: SimEvent[]
): SimEvent[] {
  const delta = spliceDeltaMs(plan);
  const { replaceStartMs, replaceEndMs } = plan;

  const before = events.filter((e) => e.t < replaceStartMs);
  const after = events
    .filter((e) => e.t >= replaceEndMs)
    .map((e) => ({ ...e, t: e.t + delta }) as SimEvent);

  const rebased = patchEvents
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((e) => ({ ...e, t: replaceStartMs + e.t }) as SimEvent);

  // Playback needs an explicit slide_change entering the patch, otherwise the
  // surface would still show whatever the previous slide was.
  const opensWithSlideChange =
    rebased.length > 0 && rebased[0].type === 'slide_change' && rebased[0].t === replaceStartMs;
  const patch: SimEvent[] = opensWithSlideChange
    ? rebased
    : [
        { t: replaceStartMs, type: 'slide_change', slide_id: plan.slideId } as SimEvent,
        ...rebased,
      ];

  return [...before, ...patch, ...after].sort((a, b) => a.t - b.t);
}

/**
 * Remap stored cut ranges (seconds) through the splice. Cuts inside the
 * replaced range are dropped; a cut straddling it keeps only the parts that
 * still refer to surviving audio.
 */
export function remapClipSegments(
  segments: SimClipSegment[] | null | undefined,
  plan: SplicePlan
): SimClipSegment[] | null {
  if (!segments || segments.length === 0) return null;

  const deltaSec = spliceDeltaMs(plan) / 1000;
  const startSec = plan.replaceStartMs / 1000;
  const endSec = plan.replaceEndMs / 1000;

  const out: SimClipSegment[] = [];
  for (const segment of segments) {
    if (segment.end <= segment.start) continue;

    // Head portion that ends before the replaced range.
    if (segment.start < startSec) {
      out.push({ start: segment.start, end: Math.min(segment.end, startSec) });
    }
    // Tail portion that begins after it.
    if (segment.end > endSec) {
      out.push({ start: Math.max(segment.start, endSec) + deltaSec, end: segment.end + deltaSec });
    }
  }

  const cleaned = out
    .filter((s) => s.end - s.start > 0.001)
    .sort((a, b) => a.start - b.start);
  return cleaned.length > 0 ? cleaned : null;
}

/** Apply a patch to a whole sim timeline: events, cuts and total duration. */
export function spliceSim(
  events: SimEvent[],
  clipSegments: SimClipSegment[] | null | undefined,
  durationMs: number,
  plan: SplicePlan,
  patchEvents: SimEvent[]
): SpliceResult {
  return {
    events: spliceEvents(events, plan, patchEvents),
    clipSegments: remapClipSegments(clipSegments, plan),
    durationMs: Math.max(durationMs + spliceDeltaMs(plan), plan.patchDurationMs),
  };
}
