/**
 * One definition of "how much of a lesson has been watched", shared by the
 * student learning path and the teacher progress views so the two never
 * disagree.
 *
 * `lessons.video_duration_seconds` is nullable (it is only written when a sim
 * is recorded), so callers must cope with an unknown duration: a finished
 * lesson still reads 100, an unfinished one with no duration reads 0 rather
 * than a made-up number.
 */
export function watchedPercent(
  positionSeconds: number | null | undefined,
  durationSeconds: number | null | undefined,
  completed = false
): number {
  if (completed) return 100;
  if (!durationSeconds || durationSeconds <= 0) return 0;
  const position = positionSeconds ?? 0;
  if (position <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((position / durationSeconds) * 100)));
}
