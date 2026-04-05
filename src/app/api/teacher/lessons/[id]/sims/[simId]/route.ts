import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import {
  ClipSegmentSchema,
  SIM_AUDIO_BUCKET,
  assertCanManageLesson,
  signAudioUrl,
} from '@/lib/server/sim-storage';
import type { Json } from '@/lib/database.types';
import type { SimPayload, SimRow } from '@/lib/sim.types';

const PatchSimSchema = z.object({
  clip_segments: z.array(ClipSegmentSchema).nullable().optional(),
});

// GET /api/teacher/lessons/[id]/sims/[simId] — fetch a single sim with a
// signed audio URL so the player can stream it.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; simId: string }> }
) {
  try {
    const { id: lessonId, simId } = await params;
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
      .eq('id', simId)
      .eq('lesson_id', lessonId)
      .single();

    if (error || !row) {
      return NextResponse.json({ error: 'Sim not found' }, { status: 404 });
    }

    const simRow = row as unknown as SimRow;
    const audioUrl = await signAudioUrl(lessonId, simRow.audio_path);
    const payload: SimPayload = { sim: simRow, audio_url: audioUrl };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Get sim error:', error);
    return NextResponse.json({ error: 'Failed to load sim' }, { status: 500 });
  }
}

// PATCH /api/teacher/lessons/[id]/sims/[simId]
// Non-destructive `clip_segments` edits (the teacher's cut/trim ranges from
// the review modal). Clip segments are stored verbatim and applied at
// playback time by `SimPlayer`; the original audio and events are never
// modified so every edit is fully reversible. Gated on draft lessons only —
// once the parent lesson is published, the sim is read-only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; simId: string }> }
) {
  try {
    const { id: lessonId, simId } = await params;
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
        { error: 'Cannot edit sim while the lesson is published. Unpublish first.' },
        { status: 409 }
      );
    }

    let body: z.infer<typeof PatchSimSchema>;
    try {
      const json = await request.json();
      const parsed = PatchSimSchema.safeParse(json);
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

    const updates: { clip_segments?: Json | null } = {};
    if (body.clip_segments !== undefined) {
      updates.clip_segments = body.clip_segments as unknown as Json | null;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from('lesson_sims')
      .update(updates)
      .eq('id', simId)
      .eq('lesson_id', lessonId)
      .select('*')
      .single();

    if (updateError || !updatedRow) {
      return NextResponse.json(
        { error: updateError?.message || 'Sim not found' },
        { status: 404 }
      );
    }

    const row = updatedRow as unknown as SimRow;
    const audioUrl = await signAudioUrl(lessonId, row.audio_path);
    const payload: SimPayload = { sim: row, audio_url: audioUrl };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Update sim error:', error);
    return NextResponse.json({ error: 'Failed to update sim' }, { status: 500 });
  }
}

// DELETE /api/teacher/lessons/[id]/sims/[simId] — row + audio file.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; simId: string }> }
) {
  try {
    const { id: lessonId, simId } = await params;
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
        { error: 'Cannot delete sim while the lesson is published. Unpublish first.' },
        { status: 409 }
      );
    }

    const { data: row } = await supabase
      .from('lesson_sims')
      .select('id, audio_path, lesson_id')
      .eq('id', simId)
      .eq('lesson_id', lessonId)
      .single();

    if (!row) {
      return NextResponse.json({ error: 'Sim not found' }, { status: 404 });
    }

    if (row.audio_path && hasServiceRoleConfig()) {
      try {
        const service = createServiceClient();
        await service.storage.from(SIM_AUDIO_BUCKET).remove([row.audio_path]);
      } catch (err) {
        // Best-effort: if the file is already gone we still want the row deleted.
        console.warn('Failed to remove sim audio file:', err);
      }
    }

    const { error: deleteError } = await supabase
      .from('lesson_sims')
      .delete()
      .eq('id', simId)
      .eq('lesson_id', lessonId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete sim error:', error);
    return NextResponse.json({ error: 'Failed to delete sim' }, { status: 500 });
  }
}
