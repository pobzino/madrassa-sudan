/**
 * POST /api/diagnostic/submit
 * Submit an answer and get the next question with adaptive logic
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { attemptId, questionId, selectedAnswer } = body;

    if (!attemptId || !questionId || !selectedAnswer) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify attempt ownership
    const { data: attempt } = await supabase
      .from('diagnostic_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('student_id', user.id)
      .single();

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    // Get the question to check answer
    const { data: question } = await supabase
      .from('diagnostic_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const isCorrect = selectedAnswer === question.correct_answer;

    // Save the response
    await supabase.from('diagnostic_responses').insert({
      attempt_id: attemptId,
      question_id: questionId,
      selected_answer: selectedAnswer,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    });

    // Update attempt stats
    const { data: updatedAttempt } = await supabase
      .from('diagnostic_attempts')
      .update({
        questions_answered: attempt.questions_answered + 1,
        questions_correct: attempt.questions_correct + (isCorrect ? 1 : 0),
      })
      .eq('id', attemptId)
      .select()
      .single();

    // Get already answered question IDs
    const { data: responses } = await supabase
      .from('diagnostic_responses')
      .select('question_id')
      .eq('attempt_id', attemptId);

    const answeredQuestionIds = responses?.map(r => r.question_id) || [];

    // Adaptive logic: determine next question
    let nextQuestion;

    if (isCorrect) {
      // Try harder question (higher difficulty or higher grade)
      const { data: harderQuestion } = await supabase
        .from('diagnostic_questions')
        .select('*')
        .eq('subject_id', attempt.subject_id)
        .or(`difficulty.gt.${question.difficulty},and(grade_level.gt.${question.grade_level},difficulty.gte.1)`)
        .not('id', 'in', `(${answeredQuestionIds.join(',')})`)
        .order('grade_level')
        .order('difficulty')
        .limit(1)
        .single();

      nextQuestion = harderQuestion;
    } else {
      // Try easier question (lower difficulty or lower grade)
      const { data: easierQuestion } = await supabase
        .from('diagnostic_questions')
        .select('*')
        .eq('subject_id', attempt.subject_id)
        .or(`difficulty.lt.${question.difficulty},and(grade_level.lt.${question.grade_level},difficulty.lte.3)`)
        .not('id', 'in', `(${answeredQuestionIds.join(',')})`)
        .order('grade_level', { ascending: false })
        .order('difficulty', { ascending: false })
        .limit(1)
        .single();

      nextQuestion = easierQuestion;
    }

    // If no adaptive question found, try any remaining question at current grade
    if (!nextQuestion) {
      const { data: remainingQuestion } = await supabase
        .from('diagnostic_questions')
        .select('*')
        .eq('subject_id', attempt.subject_id)
        .eq('grade_level', question.grade_level)
        .not('id', 'in', `(${answeredQuestionIds.join(',')})`)
        .limit(1)
        .single();

      nextQuestion = remainingQuestion;
    }

    // Check if we should end the assessment (10 questions or no more questions)
    const shouldComplete = !nextQuestion || updatedAttempt!.questions_answered >= 10;

    return NextResponse.json({
      correct: isCorrect,
      progress: {
        answered: updatedAttempt!.questions_answered,
        correct: updatedAttempt!.questions_correct,
      },
      nextQuestion: shouldComplete ? null : nextQuestion,
      complete: shouldComplete,
    });
  } catch (error) {
    console.error('Error in diagnostic submit:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
