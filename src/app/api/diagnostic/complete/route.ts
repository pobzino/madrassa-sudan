/**
 * POST /api/diagnostic/complete
 * Complete the assessment and calculate placement
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type DiagnosticResponseRow = {
  is_correct: boolean;
  question: {
    grade_level: number;
  };
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { attemptId } = body;

    if (!attemptId) {
      return NextResponse.json({ error: 'Attempt ID is required' }, { status: 400 });
    }

    // Get attempt with responses
    const { data: attempt } = await supabase
      .from('diagnostic_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('student_id', user.id)
      .single();

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    // Get all responses with question details
    const { data: responses } = await supabase
      .from('diagnostic_responses')
      .select(`
        *,
        question:diagnostic_questions(*)
      `)
      .eq('attempt_id', attemptId);

    if (!responses || responses.length === 0) {
      return NextResponse.json({ error: 'No responses found' }, { status: 400 });
    }

    // Calculate performance by grade level
    const gradePerformance: Record<number, { correct: number; total: number }> = {};

    (responses as DiagnosticResponseRow[]).forEach((response) => {
      const grade = response.question.grade_level;
      if (!gradePerformance[grade]) {
        gradePerformance[grade] = { correct: 0, total: 0 };
      }
      gradePerformance[grade].total++;
      if (response.is_correct) {
        gradePerformance[grade].correct++;
      }
    });

    // Find highest grade with >= 60% correct
    let recommendedGrade = 1;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    const sortedGrades = Object.keys(gradePerformance)
      .map(Number)
      .sort((a, b) => b - a);

    for (const grade of sortedGrades) {
      const perf = gradePerformance[grade];
      const percentage = perf.correct / perf.total;

      if (percentage >= 0.6) {
        recommendedGrade = grade;
        if (percentage >= 0.8) {
          confidence = 'high';
        } else if (percentage >= 0.6) {
          confidence = 'medium';
        }
        break;
      }
    }

    // If no grade met 60% threshold, use the lowest grade attempted
    if (recommendedGrade === 1 && sortedGrades.length > 0) {
      recommendedGrade = Math.min(...sortedGrades);
      confidence = 'low';
    }

    // Mark attempt as complete
    await supabase
      .from('diagnostic_attempts')
      .update({
        is_complete: true,
        completed_at: new Date().toISOString(),
        recommended_grade: recommendedGrade,
      })
      .eq('id', attemptId);

    // Save placement result
    const { data: placement, error: placementError } = await supabase
      .from('student_placements')
      .upsert({
        student_id: user.id,
        subject_id: attempt.subject_id,
        placed_grade: recommendedGrade,
        confidence,
        attempt_id: attemptId,
        placed_at: new Date().toISOString(),
      }, {
        onConflict: 'student_id,subject_id',
      })
      .select()
      .single();

    if (placementError) {
      console.error('Error saving placement:', placementError);
    }

    // Get recommended lessons for the placed grade
    const { data: recommendedLessons } = await supabase
      .from('lessons')
      .select('*')
      .eq('subject_id', attempt.subject_id)
      .eq('grade_level', recommendedGrade)
      .order('order_index')
      .limit(3);

    return NextResponse.json({
      success: true,
      placement: {
        grade: recommendedGrade,
        confidence,
        questionsAnswered: attempt.questions_answered,
        questionsCorrect: attempt.questions_correct,
        accuracy: attempt.questions_answered > 0
          ? Math.round((attempt.questions_correct / attempt.questions_answered) * 100)
          : 0,
      },
      recommendedLessons: recommendedLessons || [],
    });
  } catch (error) {
    console.error('Error in diagnostic complete:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
