import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Database, Json } from '@/lib/database.types'
import type { TaskType, MatchPairsData, SortingOrderData } from '@/lib/tasks.types'

const TaskResponseSchema = z.object({
  task_id: z.string().uuid(),
  response_data: z.record(z.string(), z.unknown()),
  time_spent_seconds: z.number().min(0),
})

function computeScore(
  taskType: TaskType,
  taskData: Record<string, unknown>,
  responseData: Record<string, unknown>
): number {
  switch (taskType) {
    case 'matching_pairs': {
      const data = taskData as unknown as MatchPairsData
      const matches = (responseData.matches || []) as Array<{ left_id: string; right_id: string }>
      if (!data.pairs || data.pairs.length === 0) return 0
      // Build correct mapping: left_id -> right text (we use pair id matching)
      let correct = 0
      for (const match of matches) {
        const pair = data.pairs.find(p => p.id === match.left_id)
        // The right_id should also be the pair id for a correct match
        if (pair && match.right_id === pair.id) {
          correct++
        }
      }
      return correct / data.pairs.length
    }
    case 'sorting_order': {
      const data = taskData as unknown as SortingOrderData
      const orderedIds = (responseData.ordered_item_ids || []) as string[]
      if (!data.items || data.items.length === 0) return 0
      let correct = 0
      for (const item of data.items) {
        if (orderedIds[item.correct_position] === item.id) {
          correct++
        }
      }
      return correct / data.items.length
    }
    case 'drawing_tracing':
    case 'audio_recording':
      // Completion-based: if they submitted, they get full score
      return 1.0
    default:
      return 0
  }
}

// POST - Submit a task response
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await context.params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
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

  const { task_id, response_data, time_spent_seconds } = validation.data

  // Fetch the task to verify it belongs to this lesson
  const { data: task, error: taskError } = await supabase
    .from('lesson_tasks')
    .select('*')
    .eq('id', task_id)
    .single()

  if (taskError || !task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.lesson_id !== lessonId) {
    return NextResponse.json({ error: 'Task does not belong to this lesson' }, { status: 400 })
  }

  // Compute score server-side
  const completion_score = computeScore(
    task.task_type as TaskType,
    task.task_data as Record<string, unknown>,
    response_data
  )

  // Check for existing response
  const { data: existing } = await supabase
    .from('lesson_task_responses')
    .select('id, attempts')
    .eq('task_id', task_id)
    .eq('student_id', user.id)
    .maybeSingle()

  const responseJson = response_data as Json
  let responseRow: Database['public']['Tables']['lesson_task_responses']['Row'] | null = null

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from('lesson_task_responses')
      .update({
        response_data: responseJson,
        completion_score,
        is_completed: true,
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
        response_data: responseJson,
        completion_score,
        is_completed: true,
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

  // Update lesson_progress task counts
  const { data: allTasks } = await supabase
    .from('lesson_tasks')
    .select('id')
    .eq('lesson_id', lessonId)

  const taskIds = (allTasks || []).map((t: { id: string }) => t.id)

  if (taskIds.length > 0) {
    const { data: allResponses } = await supabase
      .from('lesson_task_responses')
      .select('completion_score, is_completed')
      .eq('student_id', user.id)
      .in('task_id', taskIds)

    const tasksCompleted = (allResponses || []).filter((r: { is_completed: boolean }) => r.is_completed).length
    const totalScore = (allResponses || []).reduce(
      (sum: number, r: { completion_score: number }) => sum + r.completion_score, 0
    )

    await supabase
      .from('lesson_progress')
      .upsert({
        student_id: user.id,
        lesson_id: lessonId,
        tasks_completed: tasksCompleted,
        tasks_total_score: totalScore,
      }, { onConflict: 'student_id,lesson_id' })
  }

  return NextResponse.json({
    response: responseRow,
    score: completion_score,
  })
}
