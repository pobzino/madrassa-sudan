/**
 * POST /api/diagnostic/start
 * Start a new diagnostic assessment for a subject
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
    const { subjectId, studentGrade } = body;

    if (!subjectId) {
      return NextResponse.json({ error: 'Subject ID is required' }, { status: 400 });
    }

    // Check if there's an existing incomplete attempt
    const { data: existingAttempt } = await supabase
      .from('diagnostic_attempts')
      .select('*')
      .eq('student_id', user.id)
      .eq('subject_id', subjectId)
      .eq('is_complete', false)
      .single();

    if (existingAttempt) {
      // Return existing attempt with current progress
      const { data: responses } = await supabase
        .from('diagnostic_responses')
        .select('question_id')
        .eq('attempt_id', existingAttempt.id);

      const answeredQuestionIds = responses?.map(r => r.question_id) || [];

      // Get next question
      const { data: nextQuestion } = await supabase
        .from('diagnostic_questions')
        .select('*')
        .eq('subject_id', subjectId)
        .eq('grade_level', studentGrade || 1)
        .not('id', 'in', `(${answeredQuestionIds.join(',')})`)
        .order('difficulty')
        .limit(1)
        .single();

      return NextResponse.json({
        attemptId: existingAttempt.id,
        question: nextQuestion,
        progress: {
          answered: existingAttempt.questions_answered,
          correct: existingAttempt.questions_correct,
        },
      });
    }

    // Create new attempt
    const { data: attempt, error: attemptError } = await supabase
      .from('diagnostic_attempts')
      .insert({
        student_id: user.id,
        subject_id: subjectId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (attemptError) {
      console.error('Error creating attempt:', attemptError);
      return NextResponse.json({ error: 'Failed to start assessment' }, { status: 500 });
    }

    // Get first question at student's grade level (or grade 1 if not specified)
    const startGrade = studentGrade || 1;
    const { data: question, error: questionError } = await supabase
      .from('diagnostic_questions')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('grade_level', startGrade)
      .order('difficulty')
      .limit(1)
      .single();

    if (questionError || !question) {
      // Fallback: try any question for this subject
      const { data: fallbackQuestion } = await supabase
        .from('diagnostic_questions')
        .select('*')
        .eq('subject_id', subjectId)
        .order('grade_level')
        .limit(1)
        .single();

      if (!fallbackQuestion) {
        return NextResponse.json({ error: 'No questions available for this subject' }, { status: 404 });
      }

      return NextResponse.json({
        attemptId: attempt.id,
        question: fallbackQuestion,
        progress: { answered: 0, correct: 0 },
      });
    }

    return NextResponse.json({
      attemptId: attempt.id,
      question,
      progress: { answered: 0, correct: 0 },
    });
  } catch (error) {
    console.error('Error in diagnostic start:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
