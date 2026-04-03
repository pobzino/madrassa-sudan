import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManageLesson, getTeacherRole } from '@/lib/server/teacher-lesson-access'

const QuestionSchema = z.object({
  question_text_ar: z.string().min(1),
  question_text_en: z.string().optional(),
  question_type: z.enum(['multiple_choice', 'true_false', 'fill_in_blank']),
  timestamp_seconds: z.number().min(0),
  correct_answer: z.string().min(1),
  options: z.any().optional(), // JSON for multiple choice options
  explanation_ar: z.string().optional(),
  explanation_en: z.string().optional(),
  display_order: z.number().optional(),
  is_required: z.boolean().default(false),
  allow_retry: z.boolean().default(true)
})

// GET - List all questions for a lesson
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all questions
  const { data: questions, error } = await supabase
    .from('lesson_questions')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('display_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ questions })
}

// POST - Create new question
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate request body
  const body = await request.json()
  const validation = QuestionSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const questionData = validation.data

  // Insert question
  const { data: newQuestion, error } = await supabase
    .from('lesson_questions')
    .insert({
      lesson_id: lessonId,
      ...questionData
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ question: newQuestion }, { status: 201 })
}

// PATCH - Update question
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params
  const url = new URL(request.url)
  const questionId = url.searchParams.get('questionId')

  if (!questionId) {
    return NextResponse.json({ error: 'questionId required' }, { status: 400 })
  }

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate request body (partial update)
  const body = await request.json()
  const validation = QuestionSchema.partial().safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const updates = validation.data

  // Update question
  const { data: updatedQuestion, error } = await supabase
    .from('lesson_questions')
    .update(updates)
    .eq('id', questionId)
    .eq('lesson_id', lessonId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ question: updatedQuestion })
}

// DELETE - Delete question
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params
  const url = new URL(request.url)
  const questionId = url.searchParams.get('questionId')

  if (!questionId) {
    return NextResponse.json({ error: 'questionId required' }, { status: 400 })
  }

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete question
  const { error } = await supabase
    .from('lesson_questions')
    .delete()
    .eq('id', questionId)
    .eq('lesson_id', lessonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}

// PUT - Reorder questions (batch update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse request body - expect array of {id, display_order}
  const body = await request.json()
  const { questions } = body

  if (!Array.isArray(questions)) {
    return NextResponse.json({ error: 'questions array required' }, { status: 400 })
  }

  // Update each question's display_order
  const updates = questions.map(async (q: { id: string; display_order: number }) => {
    return supabase
      .from('lesson_questions')
      .update({ display_order: q.display_order })
      .eq('id', q.id)
      .eq('lesson_id', lessonId)
  })

  try {
    await Promise.all(updates)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to reorder questions' }, { status: 500 })
  }
}
