import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const ResponseSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string().min(1),
  is_correct: z.boolean()
})

// POST - Submit answer to a question (with retry support)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: lessonId } = await context.params

  // Check auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse and validate request body
  const body = await request.json()
  const validation = ResponseSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const { question_id, answer, is_correct } = validation.data

  // Fetch the question to check retry settings
  const { data: question, error: questionError } = await supabase
    .from('lesson_questions')
    .select('allow_retry, lesson_id')
    .eq('id', question_id)
    .single()

  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  if (question.lesson_id !== lessonId) {
    return NextResponse.json({ error: 'Question does not belong to this lesson' }, { status: 400 })
  }

  // Check if there's an existing response
  const { data: existingResponse, error: fetchError } = await supabase
    .from('lesson_question_responses')
    .select('*')
    .eq('student_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let responseData: any

  if (existingResponse) {
    // This is a retry
    if (!question.allow_retry && existingResponse.is_correct) {
      // Already answered correctly, no retry allowed
      return NextResponse.json(
        { error: 'Question already answered correctly' },
        { status: 400 }
      )
    }

    // Build attempts history
    const attemptsHistory = Array.isArray(existingResponse.attempts_history)
      ? existingResponse.attempts_history
      : []

    attemptsHistory.push({
      attempt_number: existingResponse.attempt_number,
      answer: existingResponse.answer,
      is_correct: existingResponse.is_correct,
      timestamp: new Date().toISOString()
    })

    // Increment attempt number
    const newAttemptNumber = existingResponse.attempt_number + 1

    // Update response
    const { data: updatedResponse, error: updateError } = await supabase
      .from('lesson_question_responses')
      .update({
        answer,
        is_correct,
        attempt_number: newAttemptNumber,
        attempts: newAttemptNumber,
        attempts_history: attemptsHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingResponse.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    responseData = updatedResponse
  } else {
    // First attempt - insert new response
    const { data: newResponse, error: insertError } = await supabase
      .from('lesson_question_responses')
      .insert({
        student_id: user.id,
        question_id,
        answer,
        is_correct,
        attempt_number: 1,
        attempts: 1,
        attempts_history: []
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    responseData = newResponse
  }

  // Update lesson progress
  await updateLessonProgress(supabase, user.id, lessonId)

  return NextResponse.json({
    response: responseData,
    can_retry: question.allow_retry && !is_correct
  })
}

// Helper function to update lesson progress based on quiz responses
async function updateLessonProgress(
  supabase: any,
  studentId: string,
  lessonId: string
) {
  // Fetch all questions for this lesson
  const { data: questions } = await supabase
    .from('lesson_questions')
    .select('id, is_required')
    .eq('lesson_id', lessonId)

  if (!questions || questions.length === 0) {
    return
  }

  // Fetch all responses for this student and lesson
  const questionIds = questions.map((q: any) => q.id)
  const { data: responses } = await supabase
    .from('lesson_question_responses')
    .select('question_id, is_correct, attempt_number')
    .eq('student_id', studentId)
    .in('question_id', questionIds)

  if (!responses) {
    return
  }

  const questionsAnswered = responses.length
  const questionsCorrect = responses.filter((r: any) => r.is_correct).length
  const totalAttempts = responses.reduce((sum: number, r: any) => sum + r.attempt_number, 0)

  // Fetch lesson quiz settings
  const { data: lesson } = await supabase
    .from('lessons')
    .select('quiz_settings')
    .eq('id', lessonId)
    .single()

  const quizSettings = lesson?.quiz_settings || {
    require_pass_to_continue: false,
    min_pass_questions: 1,
    allow_retries: true,
    max_attempts: null,
    show_explanation: true
  }

  // Determine if quiz is passed
  const quizPassed = questionsCorrect >= quizSettings.min_pass_questions

  // Update lesson progress
  const { data: existingProgress } = await supabase
    .from('lesson_progress')
    .select('id')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .maybeSingle()

  if (existingProgress) {
    await supabase
      .from('lesson_progress')
      .update({
        questions_answered: questionsAnswered,
        questions_correct: questionsCorrect,
        quiz_attempts: totalAttempts,
        quiz_passed: quizPassed
      })
      .eq('id', existingProgress.id)
  } else {
    await supabase
      .from('lesson_progress')
      .insert({
        student_id: studentId,
        lesson_id: lessonId,
        questions_answered: questionsAnswered,
        questions_correct: questionsCorrect,
        quiz_attempts: totalAttempts,
        quiz_passed: quizPassed
      })
  }
}
