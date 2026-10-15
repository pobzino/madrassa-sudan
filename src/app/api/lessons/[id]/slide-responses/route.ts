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
  // When the student answered, by the phone's clock (the lesson players send
  // it with every answer, including ones saved offline and sent later), and
  // an id for the answer. Together they stop a late or repeated send from
  // replacing a newer answer or counting an attempt twice. Loosely checked:
  // a bad value is ignored rather than losing the answer.
  answered_at: z.string().max(64).optional(),
  client_answer_id: z.string().min(1).max(128).optional(),
});

// Phones may report an answer at most this far back (as for lesson completion).
const MAX_ANSWER_BACKDATE_MS = 14 * 24 * 60 * 60 * 1000;

// Postgres errors about the data itself (check constraint, not null, foreign
// key, bad value). Sending the same answer again can never succeed, so these
// are 422 and the phone stops resending; anything else stays a 500 (retried).
const PERMANENT_WRITE_ERRORS = new Set(['23514', '23502', '23503', '22P02']);

function writeErrorStatus(error: { code?: string } | null): number {
  return error?.code && PERMANENT_WRITE_ERRORS.has(error.code) ? 422 : 500;
}

/** The phone's answer time, clamped to [now − 14 days, now]; null when absent or unreadable. */
function clampAnsweredAt(value: string | undefined, now: Date): string | null {
  const parsed = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const nowMs = now.getTime();
  return new Date(Math.min(nowMs, Math.max(nowMs - MAX_ANSWER_BACKDATE_MS, parsed))).toISOString();
}

function readStoredResponse(data: Json | null | undefined) {
  const record = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const answeredAt = typeof record.answered_at === 'string' ? Date.parse(record.answered_at) : NaN;
  return {
    hasAnswer: record.answer !== null && record.answer !== undefined,
    answeredAt: Number.isFinite(answeredAt) ? answeredAt : null,
    clientAnswerId: typeof record.client_answer_id === 'string' ? record.client_answer_id : null,
  };
}

type LessonLookup =
  | { lesson: { id: string; is_published: boolean; created_by: string | null }; slides: Slide[] | null; error: string | null; code?: undefined; status: number }
  | { lesson: null; slides: null; error: string; code?: 'no_access'; status: number };

async function loadLessonAndDeck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonId: string
): Promise<LessonLookup> {
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('id, is_published, created_by')
    .eq('id', lessonId)
    .maybeSingle();

  // A failed lookup isn't "not found": the phone must keep the answer and retry.
  if (lessonError && lessonError.code !== '22P02') {
    return { lesson: null, slides: null, error: 'Lesson could not be loaded', status: 503 };
  }

  if (!lesson) {
    // Hidden from this account (unpublished, moved to another class, class
    // membership waiting for approval) or deleted? Only the service role can
    // tell. A hidden lesson is 403 no_access, so answers saved offline wait
    // for access to return instead of being thrown away.
    if (!lessonError && hasServiceRoleConfig()) {
      const { data: hidden, error: hiddenError } = await createServiceClient()
        .from('lessons')
        .select('id')
        .eq('id', lessonId)
        .maybeSingle();
      if (hiddenError) {
        return { lesson: null, slides: null, error: 'Lesson could not be loaded', status: 503 };
      }
      if (hidden) {
        return { lesson: null, slides: null, error: 'No access', code: 'no_access', status: 403 };
      }
    }
    return { lesson: null, slides: null, error: 'Lesson not found', status: 404 };
  }

  const deckClient = hasServiceRoleConfig() ? createServiceClient() : supabase;

  const { data: deck, error: deckError } = await deckClient
    .from('lesson_slides')
    .select('slides')
    .eq('lesson_id', lessonId)
    .single();

  if (deckError && deckError.code !== 'PGRST116') {
    return { lesson, slides: null, error: deckError.message, status: 500 };
  }

  const slides = Array.isArray(deck?.slides) ? (deck.slides as unknown as Slide[]) : [];

  return { lesson, slides, error: null, status: 200 };
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

  const { lesson, error, code, status } = await loadLessonAndDeck(supabase, lessonId);

  if (!lesson) {
    return NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
  }

  if (!lesson.is_published && lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden', code: 'no_access' }, { status: 403 });
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

  const { slide_id, answer, time_spent_seconds, client_answer_id } = validation.data;
  const answeredAt = clampAnsweredAt(validation.data.answered_at, new Date());
  const { lesson, slides, error, code, status } = await loadLessonAndDeck(supabase, lessonId);

  if (!lesson || !slides) {
    return NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
  }

  if (!lesson.is_published && lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden', code: 'no_access' }, { status: 403 });
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

  // draw_answer submissions are an object; computeSlideInteractionCorrectness
  // only needs a truthy string for presence check, so pass the data URL when
  // available, otherwise pass the primitive answer through.
  const normalizedAnswer =
    typeof answer === 'object' && answer !== null && !Array.isArray(answer) && 'image_data_url' in answer
      ? (answer.image_data_url as string)
      : (answer as boolean | number | string | string[] | null);
  const isCorrect = computeSlideInteractionCorrectness(slide, normalizedAnswer);
  const responseData = {
    answer,
    ...(answeredAt ? { answered_at: answeredAt } : {}),
    ...(client_answer_id ? { client_answer_id } : {}),
  } as Json;

  const { data: existing, error: existingError } = await supabase
    .from('lesson_slide_responses')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('slide_id', slide_id)
    .eq('student_id', user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let responseRow: Database['public']['Tables']['lesson_slide_responses']['Row'] | null = null;

  if (existing) {
    const stored = readStoredResponse(existing.response_data);
    // The same answer sent again (the reply to the first send was lost):
    // nothing changes and no attempt is added.
    if (client_answer_id && stored.clientAnswerId === client_answer_id) {
      return NextResponse.json({ response: existing, is_correct: existing.is_correct, duplicate: true });
    }
    // An answer that arrives after a newer one (sent late from a phone that
    // was offline or retrying), or a skip after a real answer, is kept out:
    // the stored answer and its grade stay. Times are both the phones' own,
    // so a phone whose clock is off still orders its own answers correctly.
    const incomingHasAnswer = answer !== null;
    const stale =
      (stored.hasAnswer && !incomingHasAnswer) ||
      (stored.hasAnswer === incomingHasAnswer &&
        stored.answeredAt !== null &&
        answeredAt !== null &&
        Date.parse(answeredAt) < stored.answeredAt);
    if (stale) {
      return NextResponse.json({ response: existing, is_correct: existing.is_correct, stale: true });
    }

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
      return NextResponse.json({ error: updateError.message }, { status: writeErrorStatus(updateError) });
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
      return NextResponse.json({ error: insertError.message }, { status: writeErrorStatus(insertError) });
    }

    responseRow = inserted;
  }

  await updateSlideInteractionProgress(supabase, user.id, lessonId);

  return NextResponse.json({
    response: responseRow,
    is_correct: isCorrect,
  });
}
