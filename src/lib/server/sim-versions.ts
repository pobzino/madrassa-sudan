/**
 * Server helpers for sim version history.
 *
 * History rows are written by the `trg_lesson_sims_snapshot_*` triggers, so
 * nothing here creates them. What lives here is the storage side of the
 * bargain: versions reference audio objects rather than copying them, so the
 * write paths must stop deleting audio, and something has to bound how many
 * old recordings we keep.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SIM_AUDIO_BUCKET } from '@/lib/server/sim-storage';

/**
 * How many distinct historical audio files to keep per lesson. Recordings are
 * the largest thing this platform stores and it serves children on donated
 * infrastructure, so history is bounded: older versions keep their row (the
 * audit trail and event timeline stay readable) but lose their audio and can no
 * longer be restored.
 */
export const SIM_AUDIO_VERSIONS_KEPT = 5;

interface VersionAudioRow {
  id: string;
  audio_path: string | null;
  version_number: number;
}

/**
 * Delete audio objects for versions beyond the keep-limit and mark those rows
 * `audio_retained = false`. Never touches an object the live sim still points
 * at, nor one another retained version shares.
 *
 * Best-effort: storage failures are logged, not thrown, so a successful save is
 * never rolled back because cleanup hiccuped.
 */
export async function pruneSimVersionAudio(
  service: SupabaseClient,
  lessonId: string,
  liveAudioPath: string | null,
  keep: number = SIM_AUDIO_VERSIONS_KEPT
): Promise<{ pruned: number }> {
  try {
    const { data, error } = await service
      .from('lesson_sim_versions')
      .select('id, audio_path, version_number')
      .eq('lesson_id', lessonId)
      .eq('audio_retained', true)
      .order('version_number', { ascending: false });

    if (error || !data) return { pruned: 0 };

    const rows = data as unknown as VersionAudioRow[];
    const keepRows = rows.slice(0, keep);
    const dropRows = rows.slice(keep);
    if (dropRows.length === 0) return { pruned: 0 };

    // Paths still in use: the live recording plus every version we are keeping.
    const protectedPaths = new Set<string>();
    if (liveAudioPath) protectedPaths.add(liveAudioPath);
    for (const row of keepRows) {
      if (row.audio_path) protectedPaths.add(row.audio_path);
    }

    const removable = Array.from(
      new Set(
        dropRows
          .map((row) => row.audio_path)
          .filter((path): path is string => !!path && !protectedPaths.has(path))
      )
    );

    if (removable.length > 0) {
      const { error: removeError } = await service.storage
        .from(SIM_AUDIO_BUCKET)
        .remove(removable);
      if (removeError) {
        console.error('Pruning sim version audio failed:', removeError);
        return { pruned: 0 };
      }
    }

    const { error: flagError } = await service
      .from('lesson_sim_versions')
      .update({ audio_retained: false })
      .in(
        'id',
        dropRows.map((row) => row.id)
      );
    if (flagError) console.error('Marking pruned sim versions failed:', flagError);

    return { pruned: dropRows.length };
  } catch (err) {
    console.error('pruneSimVersionAudio error:', err);
    return { pruned: 0 };
  }
}
