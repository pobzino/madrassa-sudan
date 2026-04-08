import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Json } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import {
  ClipSegmentSchema,
  SIM_AUDIO_BUCKET,
  assertCanManageLesson,
  signAudioUrl,
} from '@/lib/server/sim-storage';
import type { SimPayload, SimRow } from '@/lib/sim.types';

/** Server-side max duration: 45 minutes. */
const SIM_MAX_DURATION_MS = 45 * 60 * 1000;

/** Max audio file size: 100 MB (base64 ≈ 133 MB string). */
const SIM_AUDIO_MAX_BYTES = 100 * 1024 * 1024;

const CreateSimSchema = z.object({
  deck_snapshot: z.array(z.unknown()),
  events: z.array(z.unknown()),
  duration_ms: z.number().int().nonnegative().max(SIM_MAX_DURATION_MS, 'Sim recording exceeds the 45-minute limit.'),
  audio_duration_ms: z.number().int().nonnegative().nullable().optional(),
  audio_mime: z.string().nullable().optional(),
  // Base64-encoded audio body (no data: prefix). Kept inline so we can write
  // the row + upload the audio in a single round-trip from the browser.
  audio_base64: z.string().nullable().optional(),
  clip_segments: z.array(ClipSegmentSchema).nullable().optional(),
});

type CreateSimBody = z.infer<typeof CreateSimSchema>;

function rowToPayload(row: SimRow, audioUrl: string | null): SimPayload {
  return { sim: row, audio_url: audioUrl };
}

// GET /api/teacher/lessons/[id]/sims — return the (single) sim for a lesson
// plus the lesson's publish state so the teacher UI can decide between edit
// and read-only modes without a second round trip.
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

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    const { data: row, error } = await supabase
      .from('lesson_sims')
      .select('*')
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const simRow = (row || null) as unknown as SimRow | null;
    const sim: SimPayload | null = simRow
      ? rowToPayload(simRow, await signAudioUrl(lessonId, simRow.audio_path))
      : null;

    return NextResponse.json({ sim, lesson_published: access.lessonPublished });
  } catch (error) {
    console.error('Get lesson sim error:', error);
    return NextResponse.json({ error: 'Failed to load sim' }, { status: 500 });
  }
}

// POST /api/teacher/lessons/[id]/sims — create or replace the lesson's sim.
//
// One sim per lesson: if a row already exists we delete it (and its audio
// object) before inserting the new one. Rejected once the lesson is published
// so teachers can't silently swap out a student-facing recording.
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

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    if (access.lessonPublished) {
      return NextResponse.json(
        { error: 'Cannot replace sim while the lesson is published. Unpublish first.' },
        { status: 409 }
      );
    }

    let body: CreateSimBody;
    try {
      const json = await request.json();
      const parsed = CreateSimSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.issues },
          { status: 400 }
        );
      }
      body = parsed.data;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Delete any existing sim for this lesson (row + audio file) so the new
    // one can take its slot under the UNIQUE(lesson_id) constraint.
    const { data: existing } = await supabase
      .from('lesson_sims')
      .select('id, audio_path')
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (existing) {
      if (existing.audio_path && hasServiceRoleConfig()) {
        try {
          const service = createServiceClient();
          await service.storage.from(SIM_AUDIO_BUCKET).remove([existing.audio_path]);
        } catch (err) {
          // Best-effort: if the file is already gone we still want the new row in.
          console.warn('Failed to remove previous sim audio file:', err);
        }
      }
      const { error: deleteError } = await supabase
        .from('lesson_sims')
        .delete()
        .eq('id', existing.id);
      if (deleteError) {
        return NextResponse.json(
          { error: `Failed to replace existing sim: ${deleteError.message}` },
          { status: 500 }
        );
      }
    }

    // Insert the new row first so we have the sim id for the audio path.
    const insertPayload = {
      lesson_id: lessonId,
      duration_ms: body.duration_ms,
      deck_snapshot: body.deck_snapshot as unknown as Json,
      events: body.events as unknown as Json,
      audio_duration_ms: body.audio_duration_ms ?? null,
      audio_mime: body.audio_mime ?? null,
      recorded_by: user.id,
      clip_segments: (body.clip_segments ?? null) as unknown as Json | null,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from('lesson_sims')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !insertedRow) {
      console.error('Insert sim error:', insertError);
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create sim' },
        { status: 500 }
      );
    }

    let row = insertedRow as unknown as SimRow;

    // If audio was included, upload it and patch the row with the path.
    if (body.audio_base64 && body.audio_base64.length > 0) {
      if (!hasServiceRoleConfig()) {
        return NextResponse.json(
          { error: 'Server is missing Supabase service role credentials for storage upload.' },
          { status: 500 }
        );
      }

      const mime = body.audio_mime || 'audio/webm';
      const extFromMime = mime.includes('mp4') ? 'mp4' : 'webm';
      const audioPath = `${lessonId}/${row.id}.${extFromMime}`;

      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(body.audio_base64, 'base64');
      } catch {
        return NextResponse.json({ error: 'Invalid base64 audio payload' }, { status: 400 });
      }

      if (audioBuffer.byteLength > SIM_AUDIO_MAX_BYTES) {
        // Clean up the just-inserted row since the audio is too large.
        await supabase.from('lesson_sims').delete().eq('id', row.id);
        return NextResponse.json(
          { error: `Audio file too large (${Math.round(audioBuffer.byteLength / 1024 / 1024)}MB). Maximum is 100MB.` },
          { status: 413 }
        );
      }

      const service = createServiceClient();
      const { error: uploadError } = await service.storage
        .from(SIM_AUDIO_BUCKET)
        .upload(audioPath, audioBuffer, {
          contentType: mime,
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload sim audio error:', uploadError);
        // Clean up the row so the caller can retry without violating the
        // lesson_id unique constraint.
        await supabase.from('lesson_sims').delete().eq('id', row.id);
        return NextResponse.json(
          { error: `Audio upload failed: ${uploadError.message}` },
          { status: 500 }
        );
      }

      const { data: updatedRow, error: patchError } = await supabase
        .from('lesson_sims')
        .update({ audio_path: audioPath, audio_mime: mime })
        .eq('id', row.id)
        .select('*')
        .single();

      if (patchError || !updatedRow) {
        console.error('Patch sim audio_path error:', patchError);
        // Roll back the just-uploaded audio object and the row so the caller
        // can retry without leaving an orphaned file or a partial record.
        try {
          await service.storage.from(SIM_AUDIO_BUCKET).remove([audioPath]);
        } catch (cleanupErr) {
          console.warn('Failed to remove orphan sim audio after patch failure:', cleanupErr);
        }
        await supabase.from('lesson_sims').delete().eq('id', row.id);
        return NextResponse.json(
          { error: patchError?.message || 'Failed to persist audio path' },
          { status: 500 }
        );
      }

      row = updatedRow as unknown as SimRow;
    }

    // Populate the lesson's video_duration_seconds from the sim duration so
    // progress bars on the student lessons list work correctly.
    const durationSeconds = Math.ceil(body.duration_ms / 1000);
    await supabase
      .from('lessons')
      .update({ video_duration_seconds: durationSeconds })
      .eq('id', lessonId);

    const audioUrl = await signAudioUrl(lessonId, row.audio_path);
    return NextResponse.json(rowToPayload(row, audioUrl), { status: 201 });
  } catch (error) {
    console.error('Create sim error:', error);
    return NextResponse.json({ error: 'Failed to create sim' }, { status: 500 });
  }
}
