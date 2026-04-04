import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  computeActivityScore,
  normalizeTaskType,
  normalizeLessonTaskForm,
  readAnswerFromTaskResponse,
  toStoredActivityResponse,
} from '@/lib/lesson-activities'
import type { Database } from '@/lib/database.types'
import { recalculateLessonTaskProgress } from '@/lib/server/lesson-task-progress'

const TaskResponseSchema = z.object({
  task_id: z.string().uuid(),
  answer: z.unknown().optional(),
  response_data: z.record(z.string(), z.unknown()).optional(),
  time_spent_seconds: z.number().min(0).default(0),
  status: z.enum(['completed', 'skipped', 'timed_out']).default('completed'),
})

function getAnswerFromPayload(payload: z.infer<typeof TaskResponseSchema>) {
  if (payload.answer !== undefined) {
    return payload.answer
  }

  if (payload.response_data) {
    return readAnswerFromTaskResponse({ response_data: payload.response_data })
  }

  return null
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await context.params

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = TaskResponseSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const { task_id, status, time_spent_seconds } = validation.data

  const { data: taskRow, error: taskError } = await supabase
    .from('lesson_tasks')
    .select('*')
    .eq('id', task_id)
    .single()

  if (taskError || !taskRow) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (taskRow.lesson_id !== lessonId) {
    return NextResponse.json({ error: 'Task does not belong to this lesson' }, { status: 400 })
  }

  const task = normalizeLessonTaskForm({
    ...taskRow,
    required: taskRow.required ?? true,
    linked_slide_id: taskRow.linked_slide_id ?? null,
  })
  const answer = getAnswerFromPayload(validation.data)
  const responseData = toStoredActivityResponse(answer)
  const normalizedTaskType = normalizeTaskType(task.task_type)
  let completionScore = 0
  if (status === 'completed' && normalizedTaskType !== 'free_response') {
    try {
      completionScore = computeActivityScore(task.task_type, task.task_data, answer)
    } catch (scoreError) {
      console.error('computeActivityScore error:', scoreError, { taskType: task.task_type, answer })
    }
  }

  const { data: existing } = await supabase
    .from('lesson_task_responses')
    .select('id, attempts')
    .eq('task_id', task_id)
    .eq('student_id', user.id)
    .maybeSingle()

  let responseRow: Database['public']['Tables']['lesson_task_responses']['Row'] | null = null

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('lesson_task_responses')
      .update({
        response_data: responseData,
        completion_score: completionScore,
        is_completed: status === 'completed',
        status,
        time_spent_seconds,
        attempts: existing.attempts + 1,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    responseRow = updated
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('lesson_task_responses')
      .insert({
        task_id,
        student_id: user.id,
        response_data: responseData,
        completion_score: completionScore,
        is_completed: status === 'completed',
        status,
        time_spent_seconds,
        attempts: 1,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    responseRow = inserted
  }

  // Recalculate progress in the background — don't fail the response if this errors
  try {
    await recalculateLessonTaskProgress(supabase, lessonId, user.id)
  } catch (progressError) {
    console.error('Update task progress error:', progressError)
  }

  return NextResponse.json({
    response: responseRow,
    score: responseRow?.completion_score ?? 0,
    status: responseRow?.status ?? status,
  })
}
