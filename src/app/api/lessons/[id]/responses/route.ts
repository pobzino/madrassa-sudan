import { createClient } from '@/lib/supabase/server'
import type { QuizSettings } from '@/lib/database.types'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const ResponseSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string().min(1),
  is_correct: z.boolean()
})

const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  require_pass_to_continue: false,
  min_pass_questions: 1,
  allow_retries: true,
  max_attempts: null,
  show_explanation: true
}

function parseQuizSettings(value: unknown): QuizSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_QUIZ_SETTINGS
  }

  const settings = value as Partial<QuizSettings>

  return {
    require_pass_to_continue: settings.require_pass_to_continue ?? DEFAULT_QUIZ_SETTINGS.require_pass_to_continue,
    min_pass_questions: settings.min_pass_questions ?? DEFAULT_QUIZ_SETTINGS.min_pass_questions,
    allow_retries: settings.allow_retries ?? DEFAULT_QUIZ_SETTINGS.allow_retries,
    max_attempts: settings.max_attempts ?? DEFAULT_QUIZ_SETTINGS.max_attempts,
    show_explanation: settings.show_explanation ?? DEFAULT_QUIZ_SETTINGS.show_explanation
  }
}

// POST - Submit answer to a question (with retry support)
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
  const validation = ResponseSchema.safeParse(body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.issues },
      { status: 400 }
    )
  }

  const { question_id, answer, is_correct } = validation.data

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

  const { data: lesson } = await supabase
    .from('lessons')
    .select('quiz_settings')
    .eq('id', lessonId)
    .single()

  const quizSettings = parseQuizSettings(lesson?.quiz_settings)

  const { data: existingResponse, error: fetchError } = await supabase
    .from('lesson_question_responses')
    .select('*')
    .eq('student_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const retryAllowed =
    question.allow_retry &&
    quizSettings.allow_retries &&
    (quizSettings.max_attempts == null || !existingResponse || existingResponse.attempt_number < quizSettings.max_attempts)

  if (existingResponse && !retryAllowed) {
    return NextResponse.json(
      { error: 'No more attempts allowed for this question', can_retry: false },
      { status: 400 }
    )
  }

  let responseData

  if (existingResponse) {
    const attemptsHistory = Array.isArray(existingResponse.attempts_history)
      ? existingResponse.attempts_history
      : []

    attemptsHistory.push({
      attempt_number: existingResponse.attempt_number,
      answer: existingResponse.answer,
      is_correct: existingResponse.is_correct,
      timestamp: new Date().toISOString()
    })

    const newAttemptNumber = existingResponse.attempt_number + 1

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

  const progressSummary = await updateLessonProgress(supabase, user.id, lessonId)
  const canRetry =
    question.allow_retry &&
    quizSettings.allow_retries &&
    !is_correct &&
    (quizSettings.max_attempts == null || responseData.attempt_number < quizSettings.max_attempts)

  return NextResponse.json({
    response: responseData,
    can_retry: canRetry,
    quiz_passed: progressSummary?.quizPassed ?? false
  })
}

async function updateLessonProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  lessonId: string
) {
  const { data: questions } = await supabase
    .from('lesson_questions')
    .select('id')
    .eq('lesson_id', lessonId)

  if (!questions || questions.length === 0) {
    return null
  }

  const questionIds = questions.map((question) => question.id)
  const { data: responses } = await supabase
    .from('lesson_question_responses')
    .select('question_id, is_correct, attempt_number')
    .eq('student_id', studentId)
    .in('question_id', questionIds)

  if (!responses) {
    return null
  }

  const questionsAnswered = responses.length
  const questionsCorrect = responses.filter((response) => response.is_correct).length
  const totalAttempts = responses.reduce((sum, response) => sum + response.attempt_number, 0)

  const { data: lesson } = await supabase
    .from('lessons')
    .select('quiz_settings')
    .eq('id', lessonId)
    .single()

  const quizSettings = parseQuizSettings(lesson?.quiz_settings)
  const quizPassed = questionsCorrect >= quizSettings.min_pass_questions

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

  return {
    quizPassed,
    questionsAnswered,
    questionsCorrect,
    totalAttempts
  }
}
