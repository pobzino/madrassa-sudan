import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Database, Json } from '@/lib/database.types'
import { normalizeTaskType } from '@/lib/lesson-activities'

const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  task_type: z.enum([
    'free_response', 'choose_correct', 'true_false', 'fill_missing_word', 'tap_to_count',
    'match_pairs', 'sequence_order', 'sort_groups',
    'matching_pairs', 'sorting_order', 'fill_in_blank_enhanced',
    'drag_drop_label', 'drawing_tracing', 'audio_recording'
  ]),
  title_ar: z.string().min(1),
  title_en: z.string().optional(),
  instruction_ar: z.string().min(1),
  instruction_en: z.string().optional(),
  timestamp_seconds: z.number().min(0),
  task_data: z.record(z.string(), z.unknown()),
  timeout_seconds: z.number().min(5).optional().nullable(),
  is_skippable: z.boolean().default(true),
  required: z.boolean().default(true),
  points: z.number().min(0).default(10),
  display_order: z.number().optional(),
  linked_slide_id: z.string().min(1).optional().nullable(),
})

type LessonTaskInsert = Database['public']['Tables']['lesson_tasks']['Insert']
type LessonTaskUpdate = Database['public']['Tables']['lesson_tasks']['Update']

function toLessonTaskInsert(lessonId: string, task: z.infer<typeof TaskSchema>): LessonTaskInsert {
  return {
    id: task.id,
    lesson_id: lessonId,
    task_type: normalizeTaskType(task.task_type),
    title_ar: task.title_ar,
    title_en: task.title_en ?? null,
    instruction_ar: task.instruction_ar,
    instruction_en: task.instruction_en ?? null,
    timestamp_seconds: task.timestamp_seconds,
    task_data: task.task_data as Json,
    timeout_seconds: task.timeout_seconds ?? null,
    is_skippable: task.is_skippable,
    required: task.required,
    points: task.points,
    display_order: task.display_order,
    linked_slide_id: task.linked_slide_id ?? null,
  }
}

function toLessonTaskUpdate(task: Partial<z.infer<typeof TaskSchema>>): LessonTaskUpdate {
  const update: LessonTaskUpdate = {}

  if (task.task_type !== undefined) update.task_type = normalizeTaskType(task.task_type)
  if (task.title_ar !== undefined) update.title_ar = task.title_ar
  if (task.title_en !== undefined) update.title_en = task.title_en ?? null
  if (task.instruction_ar !== undefined) update.instruction_ar = task.instruction_ar
  if (task.instruction_en !== undefined) update.instruction_en = task.instruction_en ?? null
  if (task.timestamp_seconds !== undefined) update.timestamp_seconds = task.timestamp_seconds
  if (task.task_data !== undefined) update.task_data = task.task_data as Json
  if (task.timeout_seconds !== undefined) update.timeout_seconds = task.timeout_seconds ?? null
  if (task.is_skippable !== undefined) update.is_skippable = task.is_skippable
  if (task.required !== undefined) update.required = task.required
  if (task.points !== undefined) update.points = task.points
  if (task.display_order !== undefined) update.display_order = task.display_order
  if (task.linked_slide_id !== undefined) update.linked_slide_id = task.linked_slide_id ?? null

  return update
}

async function verifyTeacherOwnership(supabase: Awaited<ReturnType<typeof createClient>>, lessonId: string) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized', status: 401 }

  const { data: lesson, error: lessonError } = await supabase
    .from('lessons')
    .select('created_by')
    .eq('id', lessonId)
    .single()

  if (lessonError || !lesson) return { error: 'Lesson not found', status: 404 }
  if (lesson.created_by !== user.id) {
    // Check admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || profile.role !== 'admin') {
      return { error: 'Forbidden', status: 403 }
    }
  }
  return { user }
}

// GET - List all tasks for a lesson
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  const auth = await verifyTeacherOwnership(supabase, lessonId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { data: tasks, error } = await supabase
    .from('lesson_tasks')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('timestamp_seconds', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks })
}

// POST - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  const auth = await verifyTeacherOwnership(supabase, lessonId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json()
  const validation = TaskSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const { data: newTask, error } = await supabase
    .from('lesson_tasks')
    .insert(toLessonTaskInsert(lessonId, validation.data))
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: newTask }, { status: 201 })
}

// PATCH - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params
  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  const auth = await verifyTeacherOwnership(supabase, lessonId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json()
  const validation = TaskSchema.partial().safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const { data: updatedTask, error } = await supabase
    .from('lesson_tasks')
    .update(toLessonTaskUpdate(validation.data))
    .eq('id', taskId)
    .eq('lesson_id', lessonId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: updatedTask })
}

// DELETE - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params
  const url = new URL(request.url)
  const taskId = url.searchParams.get('taskId')

  if (!taskId) {
    return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  }

  const auth = await verifyTeacherOwnership(supabase, lessonId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { error } = await supabase
    .from('lesson_tasks')
    .delete()
    .eq('id', taskId)
    .eq('lesson_id', lessonId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// PUT - Reorder tasks (batch update)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await params

  const auth = await verifyTeacherOwnership(supabase, lessonId)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json()
  const { tasks } = body

  if (!Array.isArray(tasks)) {
    return NextResponse.json({ error: 'tasks array required' }, { status: 400 })
  }

  const updates = tasks.map((t: { id: string; display_order: number }) =>
    supabase
      .from('lesson_tasks')
      .update({ display_order: t.display_order })
      .eq('id', t.id)
      .eq('lesson_id', lessonId)
  )

  try {
    await Promise.all(updates)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to reorder tasks' }, { status: 500 })
  }
}
