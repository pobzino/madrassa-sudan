import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const QuizSettingsSchema = z.object({
  require_pass_to_continue: z.boolean(),
  min_pass_questions: z.number().min(1),
  allow_retries: z.boolean(),
  max_attempts: z.number().nullable(),
  show_explanation: z.boolean()
})

const UpdateLessonSchema = z.object({
  quiz_settings: QuizSettingsSchema.optional(),
  title_ar: z.string().optional(),
  title_en: z.string().optional(),
  description_ar: z.string().optional(),
  description_en: z.string().optional(),
  is_published: z.boolean().optional()
})

// GET - Fetch lesson details
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

  // Fetch lesson
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .single()

  if (error || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  // Verify teacher owns the lesson
  if (lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ lesson })
}

// PATCH - Update lesson (including quiz_settings)
export async function PATCH(
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

  // Verify teacher owns the lesson
  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  if (lesson.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate request body
  const body = await request.json()
  const validation = UpdateLessonSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const updates = validation.data

  // Update lesson
  const { data: updatedLesson, error: updateError } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ lesson: updatedLesson })
}
