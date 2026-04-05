/**
 * Sim clip editor — view-state hook + pack/unpack helpers for non-destructive
 * trim + multi-cut editing of recorded sims.
 *
 * Stored shape on `lesson_sims.clip_segments` is a single canonical array of
 * `{start, end}` ranges (seconds) that playback must **skip**. Trim at the
 * boundaries is encoded as two cut ranges `0..trimStart` and `trimEnd..duration`.
 *
 * The editor UI however wants to show amber trim handles at the boundaries
 * and red middle cuts separately, so this module also provides round-trip
 * pack/unpack helpers that distinguish trim from middle cuts on load/save.
 *
 * Consumers: `SimReviewModal` (record-review / edit / view modes). Drives a
 * `<VideoTimeline>` + a preview `<SimPlayer>` off the same state.
 */

import { useCallback, useMemo, useState } from 'react';
import type { SimClipSegment } from '@/lib/sim.types';

/** Tolerance (seconds) for treating a boundary cut range as trim rather than
 *  a middle cut. Centralized so pack/unpack/hasEdits can never drift apart. */
export const TRIM_EPSILON_SEC = 0.05;

export interface ClipEditorState {
  trimStart: number;
  trimEnd: number;
  cutRegions: SimClipSegment[];
}

/**
 * Decode a stored `clip_segments` array back into trim + middle cuts so the
 * UI can show the amber trim handles at the boundaries rather than two extra
 * red cut regions.
 */
export function unpackClipSegments(
  segments: SimClipSegment[] | null | undefined,
  durationSec: number
): ClipEditorState {
  if (!segments || segments.length === 0) {
    return { trimStart: 0, trimEnd: durationSec, cutRegions: [] };
  }
  const rest = segments
    .filter((s) => s.end > s.start)
    .slice()
    .sort((a, b) => a.start - b.start);

  let trimStart = 0;
  let trimEnd = durationSec;

  if (rest[0] && rest[0].start <= TRIM_EPSILON_SEC) {
    trimStart = rest[0].end;
    rest.shift();
  }
  const last = rest[rest.length - 1];
  if (last && last.end >= durationSec - TRIM_EPSILON_SEC) {
    trimEnd = last.start;
    rest.pop();
  }

  return { trimStart, trimEnd, cutRegions: rest };
}

/**
 * Pack trim + middle cuts into the canonical `clip_segments` storage shape:
 * a sorted array of `{start, end}` ranges in seconds, with trim encoded as
 * explicit cut ranges at the boundaries.
 */
export function packClipSegments(
  state: ClipEditorState,
  durationSec: number
): SimClipSegment[] {
  const out: SimClipSegment[] = [];
  if (state.trimStart > TRIM_EPSILON_SEC) {
    out.push({ start: 0, end: state.trimStart });
  }
  for (const c of state.cutRegions) {
    if (c.end > c.start) out.push({ start: c.start, end: c.end });
  }
  if (state.trimEnd < durationSec - TRIM_EPSILON_SEC) {
    out.push({ start: state.trimEnd, end: durationSec });
  }
  return out;
}

export interface UseSimClipEditorResult {
  trimStart: number;
  trimEnd: number;
  cutRegions: SimClipSegment[];
  hasEdits: boolean;
  keptDurationSec: number;
  setTrimStart: (v: number) => void;
  setTrimEnd: (v: number) => void;
  addCutRegion: (atSec: number) => void;
  updateCutRegion: (index: number, region: SimClipSegment) => void;
  removeCutRegion: (index: number) => void;
  reset: () => void;
}

export function useSimClipEditor(
  durationSec: number,
  initial: SimClipSegment[] | null | undefined
): UseSimClipEditorResult {
  const initialState = useMemo(
    () => unpackClipSegments(initial, durationSec),
    [initial, durationSec]
  );

  const [trimStart, setTrimStart] = useState(initialState.trimStart);
  const [trimEnd, setTrimEnd] = useState(initialState.trimEnd);
  const [cutRegions, setCutRegions] = useState<SimClipSegment[]>(
    initialState.cutRegions
  );

  const addCutRegion = useCallback(
    (atSec: number) => {
      const halfWidth = 1;
      const start = Math.max(trimStart, atSec - halfWidth);
      const end = Math.min(trimEnd, atSec + halfWidth);
      if (end - start < 0.2) return;
      setCutRegions((prev) => [...prev, { start, end }]);
    },
    [trimStart, trimEnd]
  );

  const updateCutRegion = useCallback((index: number, region: SimClipSegment) => {
    setCutRegions((prev) => prev.map((r, i) => (i === index ? region : r)));
  }, []);

  const removeCutRegion = useCallback((index: number) => {
    setCutRegions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setTrimStart(initialState.trimStart);
    setTrimEnd(initialState.trimEnd);
    setCutRegions(initialState.cutRegions);
  }, [initialState]);

  const hasEdits =
    trimStart > TRIM_EPSILON_SEC ||
    trimEnd < durationSec - TRIM_EPSILON_SEC ||
    cutRegions.length > 0;

  // Surrounding modal re-renders on every rAF tick (it reflects the
  // SimPlayer cursor), so memoize this so the loop only runs when the trim
  // or cut state actually changes.
  const keptDurationSec = useMemo(() => {
    let kept = trimEnd - trimStart;
    for (const cut of cutRegions) {
      const overlapStart = Math.max(cut.start, trimStart);
      const overlapEnd = Math.min(cut.end, trimEnd);
      if (overlapEnd > overlapStart) kept -= overlapEnd - overlapStart;
    }
    return Math.max(0, kept);
  }, [trimStart, trimEnd, cutRegions]);

  return {
    trimStart,
    trimEnd,
    cutRegions,
    hasEdits,
    keptDurationSec,
    setTrimStart,
    setTrimEnd,
    addCutRegion,
    updateCutRegion,
    removeCutRegion,
    reset,
  };
}
