import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import type { Database, Json } from '@/lib/database.types';
import type { Slide } from '@/lib/slides.types';
import { computeSlideInteractionCorrectness, hasStudentInteraction } from '@/lib/slide-interactions';

const SlideResponseSchema = z.object({
  slide_id: z.string().min(1),
  answer: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    // draw_answer submissions are { type: 'draw_answer', image_data_url: string }
    z.object({ type: z.literal('draw_answer'), image_data_url: z.string() }),
    z.null(),
  ]),
  time_spent_seconds: z.number().int().min(0).optional(),
});

async function loadLessonAndDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string
) {
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, is_published, created_by')
    .eq('id', lessonId)
    .single();

  if (lessonError || !lesson) {
    return { lesson: null, slides: null, error: 'Lesson not found', status: 404 as const };
  }

  const deckClient = hasServiceRoleConfig() ? createServiceClient() : supabase;

  const { data: deck, error: deckError } = await deckClient
    .from('lesson_slides')
    .select('slides')
    .eq('lesson_id', lessonId)
    .single();

  if (deckError && deckError.code !== 'PGRST116') {
    return { lesson, slides: null, error: deckError.message, status: 500 as const };
  }

  const slides = Array.isArray(deck?.slides) ? (deck.slides as unknown as Slide[]) : [];

  return { lesson, slides, error: null, status: 200 as const };
}

async function updateSlideInteractionProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  lessonId: string
) {
  const { data: responses } = await supabase
    .from('lesson_slide_responses')
    .select('is_correct')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId);

  const completedCount = responses?.length || 0;
  const correctCount = (responses || []).filter((response) => response.is_correct).length;

  const { data: existingProgress } = await supabase
    .from('lesson_progress')
    .select('id')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  if (existingProgress) {
    await supabase
      .from('lesson_progress')
      .update({
        interactive_slides_completed: completedCount,
        interactive_slides_correct: correctCount,
      })
      .eq('id', existingProgress.id);
  } else {
    await supabase
      .from('lesson_progress')
      .insert({
        student_id: studentId,
        lesson_id: lessonId,
        interactive_slides_completed: completedCount,
        interactive_slides_correct: correctCount,
      });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lesson, error, status } = await loadLessonAndDeck(supabase, lessonId);

  if (!lesson) {
    return NextResponse.json({ error }, { status });
  }

  if (!lesson.is_published && lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: responses, error: responsesError } = await supabase
    .from('lesson_slide_responses')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', user.id)
    .order('updated_at', { ascending: false });

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 });
  }

  return NextResponse.json({ responses: responses || [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = SlideResponseSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    );
  }

  const { slide_id, answer, time_spent_seconds } = validation.data;
  const { lesson, slides, error, status } = await loadLessonAndDeck(supabase, lessonId);

  if (!lesson || !slides) {
    return NextResponse.json({ error }, { status });
  }

  if (!lesson.is_published && lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const slide = slides.find((candidate) => candidate.id === slide_id);

  if (!slide) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 });
  }

  if (!hasStudentInteraction(slide)) {
    return NextResponse.json({ error: 'Slide is not interactive' }, { status: 400 });
  }

  const interactionType = slide.interaction_type;

  if (!interactionType) {
    return NextResponse.json({ error: 'Slide interaction type is missing' }, { status: 400 });
  }

  const isCorrect = computeSlideInteractionCorrectness(slide, answer);
  const responseData = {
    answer,
  } as Json;

  const { data: existing } = await supabase
    .from('lesson_slide_responses')
    .select('id, attempts')
    .eq('lesson_id', lessonId)
    .eq('slide_id', slide_id)
    .eq('student_id', user.id)
    .maybeSingle();

  let responseRow: Database['public']['Tables']['lesson_slide_responses']['Row'] | null = null;

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('lesson_slide_responses')
      .update({
        interaction_type: interactionType,
        response_data: responseData,
        completion_score: isCorrect ? 1 : 0,
        is_correct: isCorrect,
        time_spent_seconds: time_spent_seconds ?? 0,
        attempts: existing.attempts + 1,
        completed_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    responseRow = updated;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('lesson_slide_responses')
      .insert({
        lesson_id: lessonId,
        slide_id,
        student_id: user.id,
        interaction_type: interactionType,
        response_data: responseData,
        completion_score: isCorrect ? 1 : 0,
        is_correct: isCorrect,
        time_spent_seconds: time_spent_seconds ?? 0,
        attempts: 1,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    responseRow = inserted;
  }

  await updateSlideInteractionProgress(supabase, user.id, lessonId);

  return NextResponse.json({
    response: responseRow,
    is_correct: isCorrect,
  });
}
