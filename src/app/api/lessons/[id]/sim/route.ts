import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signAudioUrl } from '@/lib/server/sim-storage';
import type { SimPayload, SimRow } from '@/lib/sim.types';

/**
 * GET /api/lessons/[id]/sim — student-facing read of the lesson's single sim.
 *
 * Access control is entirely RLS-driven: the
 * "Students can view sims for published lessons" policy on `lesson_sims`
 * gates reads on `lessons.is_published` (or teacher/admin identity). We just
 * run the select under the caller's session and let Postgres decide — the
 * response is `{ sim: SimPayload | null }` so "not published" and "no sim
 * recorded" collapse to the same empty-state path on the client.
 */
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

    // No feature-flag check here — student access is gated by RLS
    // (only published lessons expose their sims).

    const { data: row, error } = await supabase
      .from('lesson_sims')
      .select('*')
      .eq('lesson_id', lessonId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ sim: null });
    }

    const simRow = row as unknown as SimRow;
    const audioUrl = await signAudioUrl(lessonId, simRow.audio_path);
    const sim: SimPayload = { sim: simRow, audio_url: audioUrl };
    return NextResponse.json({ sim });
  } catch (error) {
    console.error('Get student sim error:', error);
    return NextResponse.json({ error: 'Failed to load sim' }, { status: 500 });
  }
}
