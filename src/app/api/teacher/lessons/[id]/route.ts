import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/database.types'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canManageLesson, getTeacherRole } from '@/lib/server/teacher-lesson-access'
import { getLessonPublishReadiness } from '@/lib/lessons/publish-readiness'
import { normalizeLessonTaskForm } from '@/lib/lesson-activities'
import type { Slide } from '@/lib/slides.types'

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
  curriculum_topic: z.unknown().optional(),
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

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
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
    .select(`
      created_by,
      is_published,
      subject_id,
      grade_level,
      curriculum_topic,
      video_url_1080p,
      video_url_720p,
      video_url_480p,
      video_url_360p,
      video_duration_seconds,
      video_processing_status,
      video_processing_error,
      subjects (
        name_ar,
        name_en
      )
    `)
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
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
  const isPublishingChange =
    updates.is_published !== undefined && updates.is_published !== lesson.is_published

  if (isPublishingChange && role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can change lesson publish status.' },
      { status: 403 }
    )
  }

  if (updates.is_published === true) {
    const [{ data: lessonSlides }, { data: lessonTasks }, { data: simRow }] = await Promise.all([
      supabase
        .from('lesson_slides')
        .select('slides')
        .eq('lesson_id', lessonId)
        .maybeSingle(),
      supabase
        .from('lesson_tasks')
        .select('*')
        .eq('lesson_id', lessonId)
        .order('display_order'),
      supabase
        .from('lesson_sims')
        .select('id')
        .eq('lesson_id', lessonId)
        .maybeSingle(),
    ])

    const publishReadiness = getLessonPublishReadiness({
      subject: Array.isArray(lesson.subjects) ? lesson.subjects[0] ?? null : lesson.subjects,
      gradeLevel: lesson.grade_level,
      curriculumTopic: (updates.curriculum_topic ?? lesson.curriculum_topic ?? null) as never,
      slides: Array.isArray(lessonSlides?.slides)
        ? (lessonSlides?.slides as unknown as Slide[])
        : [],
      lessonTasks: (lessonTasks || []).map((task) =>
        normalizeLessonTaskForm({
          ...(task as Record<string, unknown>),
          id: task.id,
          task_type: String(task.task_type),
        })
      ),
      video: lesson,
      videoProcessingStatus: lesson.video_processing_status,
      videoProcessingError: lesson.video_processing_error,
      hasSim: !!simRow,
    })

    if (!publishReadiness.canPublish) {
      return NextResponse.json(
        {
          error:
            publishReadiness.blockingReasons[0]?.message ||
            'Resolve the publish blockers before publishing this lesson.',
          details: publishReadiness.blockingReasons,
        },
        { status: 400 }
      )
    }
  }

  const { curriculum_topic, ...restUpdates } = updates
  const lessonUpdates: Database['public']['Tables']['lessons']['Update'] = {
    ...restUpdates,
    ...(curriculum_topic !== undefined
      ? { curriculum_topic: curriculum_topic as Json | null }
      : {}),
  }

  // Update lesson
  const { data: updatedLesson, error: updateError } = await supabase
    .from('lessons')
    .update(lessonUpdates)
    .eq('id', lessonId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ lesson: updatedLesson })
}

// DELETE - Delete lesson (cascades to all child rows)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = await getTeacherRole(supabase, user.id)
  if (!role) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('created_by, is_published')
    .eq('id', lessonId)
    .single()

  if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Published lessons can only be deleted by admins
  if (lesson.is_published && role !== 'admin') {
    return NextResponse.json(
      { error: 'Published lessons can only be deleted by an admin.' },
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
