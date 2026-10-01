import type { Slide } from './slides.types';
import { filterClippedEvents, normalizeClips, realToVirtualMs, type SimRow } from './sim.types';

/** Select slides that occupy retained playback time, in first-viewed order. */
export function recordedLessonSlides(
  sim: Pick<SimRow, 'deck_snapshot' | 'events' | 'duration_ms' | 'clip_segments'>
): Slide[] {
  if (!Number.isFinite(sim.duration_ms) || sim.duration_ms <= 0) return [];
  const clips = normalizeClips(sim.clip_segments);
  const changes = filterClippedEvents(sim.events, clips)
    .filter((event) => event.type === 'slide_change' && event.t >= 0 && event.t <= sim.duration_ms)
    .sort((a, b) => a.t - b.t);
  const shown = new Set<string>();
  let currentId = sim.deck_snapshot[0]?.id;
  let start = 0;
  const retain = (end: number) => {
    if (currentId && realToVirtualMs(end, clips) > realToVirtualMs(start, clips)) {
      shown.add(currentId);
    }
  };
  for (const event of changes) {
    retain(event.t);
    currentId = event.slide_id;
    start = event.t;
  }
  retain(sim.duration_ms);
  const byId = new Map(sim.deck_snapshot.map((slide) => [slide.id, slide]));
  return [...shown].map((id) => {
    const slide = byId.get(id);
    if (!slide) throw new Error('The recording references a missing slide. Review the lesson before generating Practice.');
    return slide;
  });
}
