// Sim version history.
//
// GET  — list the recording's previous states, newest first.
// POST — restore one of them ({ version_id }). Restoring is itself recorded, so
//        it can be undone by restoring the version the restore created.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import {
  assertCanManageLesson,
  assertSimFeatureAccess,
  signAudioUrl,
} from '@/lib/server/sim-storage';
import { pruneSimVersionAudio } from '@/lib/server/sim-versions';

const RestoreSchema = z.object({ version_id: z.string().uuid() });

interface VersionRow {
  id: string;
  audio_mime?: string | null;
  version_number: number;
  duration_ms: number;
  audio_path: string | null;
  audio_duration_ms: number | null;
  events: unknown;
  clip_segments: unknown;
  reason: string;
  audio_retained: boolean;
  created_at: string;
  created_by: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simAccess = await assertSimFeatureAccess(user.id, supabase);
    if (!simAccess.ok) return simAccess.response;

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    // ?version_id=<id> returns one version as a playable SimPayload, so the
    // teacher can WATCH it (slides + strokes + audio) before restoring.
    const versionId = new URL(_request.url).searchParams.get('version_id');
    if (versionId) {
      const { data: one, error: oneError } = await supabase
        .from('lesson_sim_versions')
        .select('*')
        .eq('lesson_id', lessonId)
        .eq('id', versionId)
        .maybeSingle();

      if (oneError || !one) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
      const v = one as unknown as VersionRow & {
        deck_snapshot: unknown;
        sim_id: string | null;
      };
      if (!v.audio_retained || !v.audio_path) {
        return NextResponse.json(
          { error: 'This version\'s audio has been cleared, so it cannot be played' },
          { status: 409 }
        );
      }

      const audioUrl = await signAudioUrl(lessonId, v.audio_path);
      // Shaped like a sim row so <SimPlayer> can render it unchanged.
      return NextResponse.json({
        sim: {
          id: v.sim_id ?? v.id,
          lesson_id: lessonId,
          duration_ms: v.duration_ms,
          deck_snapshot: v.deck_snapshot,
          events: v.events,
          audio_path: v.audio_path,
          audio_duration_ms: v.audio_duration_ms,
          audio_mime: v.audio_mime,
          clip_segments: v.clip_segments,
          recorded_by: v.created_by,
          recorded_at: v.created_at,
          created_at: v.created_at,
          updated_at: v.created_at,
        },
        audio_url: audioUrl,
        version_number: v.version_number,
      });
    }

    const { data, error } = await supabase
      .from('lesson_sim_versions')
      .select(
        'id, version_number, duration_ms, audio_path, audio_duration_ms, events, clip_segments, reason, audio_retained, created_at, created_by'
      )
      .eq('lesson_id', lessonId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('List sim versions error:', error);
      return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as VersionRow[];

    // Sign the audio of every version that still has a file, so a tutor can
    // hear a version before restoring it. Without this the history is just
    // metadata and restoring is guesswork.
    const audioUrls = await Promise.all(
      rows.map((row) =>
        row.audio_retained && row.audio_path
          ? signAudioUrl(lessonId, row.audio_path)
          : Promise.resolve(null)
      )
    );

    const versions = rows.map((row, i) => ({
      id: row.id,
      version_number: row.version_number,
      duration_ms: row.duration_ms,
      audio_duration_ms: row.audio_duration_ms,
      event_count: Array.isArray(row.events) ? row.events.length : 0,
      cut_count: Array.isArray(row.clip_segments) ? row.clip_segments.length : 0,
      reason: row.reason,
      restorable: row.audio_retained && !!row.audio_path,
      audio_url: audioUrls[i],
      created_at: row.created_at,
      created_by: row.created_by,
    }));

    return NextResponse.json({ versions });
  } catch (error) {
    console.error('Sim versions GET error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simAccess = await assertSimFeatureAccess(user.id, supabase);
    if (!simAccess.ok) return simAccess.response;

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    // Same rule as every other sim edit: drafts only.
    if (access.lessonPublished) {
      return NextResponse.json(
        { error: 'Cannot change the recording while the lesson is published. Unpublish first.' },
        { status: 409 }
      );
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials.' },
        { status: 500 }
      );
    }

    const parsed = RestoreSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    // One transaction: snapshot the current state as "restored", then overwrite
    // the live sim from the chosen version.
    const { data: restoredSimId, error: restoreError } = await service.rpc(
      'restore_lesson_sim_version',
      { p_lesson_id: lessonId, p_version_id: parsed.data.version_id }
    );

    if (restoreError) {
      const message = restoreError.message || 'Failed to restore this version';
      const status = /not found|no recording/i.test(message)
        ? 404
        : /pruned/i.test(message)
          ? 409
          : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const { data: row, error: readError } = await service
      .from('lesson_sims')
      .select('*')
      .eq('id', restoredSimId as string)
      .single();

    if (readError || !row) {
      return NextResponse.json({ error: 'Restored, but could not read the recording back' }, { status: 500 });
    }

    const sim = row as unknown as { audio_path: string | null };
    await pruneSimVersionAudio(service, lessonId, sim.audio_path);

    const audioUrl = await signAudioUrl(lessonId, sim.audio_path);
    return NextResponse.json({ sim: { sim: row, audio_url: audioUrl } });
  } catch (error) {
    console.error('Sim versions POST error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
