import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';

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

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, is_published, created_by')
      .eq('id', lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    if (!lesson.is_published && lesson.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deckClient = hasServiceRoleConfig() ? createServiceClient() : supabase;

    const { data: deck, error: deckError } = await deckClient
      .from('lesson_slides')
      .select('*')
      .eq('lesson_id', lessonId)
      .single();

    if (deckError && deckError.code !== 'PGRST116') {
      return NextResponse.json({ error: deckError.message }, { status: 500 });
    }

    return NextResponse.json({ slideDeck: deck || null });
  } catch (error) {
    console.error('Load public lesson slides error:', error);
    return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 });
  }
}
