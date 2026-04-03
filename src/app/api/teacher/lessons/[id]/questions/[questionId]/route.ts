import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { canManageLesson, getTeacherRole } from '@/lib/server/teacher-lesson-access';

const QuestionUpdateSchema = z.object({
  question_type: z.enum(['multiple_choice', 'true_false', 'fill_in_blank']).optional(),
  timestamp_seconds: z.number().min(0).optional(),
  question_text_ar: z.string().min(1).optional(),
  question_text_en: z.string().min(1).optional(),
  options: z.array(z.object({
    text_ar: z.string(),
    text_en: z.string(),
    is_correct: z.boolean(),
  })).optional(),
  correct_answer: z.string().optional(),
  explanation_ar: z.string().optional(),
  explanation_en: z.string().optional(),
  points: z.number().min(1).optional(),
});

interface RouteParams {
  params: Promise<{ id: string; questionId: string }>;
}

// PATCH /api/teacher/lessons/[id]/questions/[questionId] - Update question
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id, questionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getTeacherRole(supabase, user.id);
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const validation = QuestionUpdateSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: validation.error.issues },
      { status: 400 }
    );
  }

  const { data: question, error } = await supabase
    .from('lesson_questions')
    .update(validation.data)
    .eq('id', questionId)
    .eq('lesson_id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ question });
}

// DELETE /api/teacher/lessons/[id]/questions/[questionId] - Delete question
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id, questionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = await getTeacherRole(supabase, user.id);
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('lesson_questions')
    .delete()
    .eq('id', questionId)
    .eq('lesson_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
