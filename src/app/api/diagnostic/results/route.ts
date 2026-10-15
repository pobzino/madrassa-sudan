/**
 * GET /api/diagnostic/results
 * Get student's placement results for all subjects
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLearnerContextResult } from '@/lib/server/learner-context';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const resolved = await getLearnerContextResult(request, supabase);
    if (resolved.response) return resolved.response;
    const learnerId = resolved.context.learnerId;

    // Get all placements with subject details
    const { data: placements } = await supabase
      .from('student_placements')
      .select(`
        *,
        subject:subjects(*)
      `)
      .eq('student_id', learnerId)
      .order('placed_at', { ascending: false });

    // Get incomplete attempts
    const { data: incompleteAttempts } = await supabase
      .from('diagnostic_attempts')
      .select(`
        *,
        subject:subjects(*)
      `)
      .eq('student_id', learnerId)
      .eq('is_complete', false);

    // Get all subjects for reference
    const { data: subjects } = await supabase
      .from('subjects')
      .select('*');

    return NextResponse.json({
      placements: placements || [],
      incompleteAttempts: incompleteAttempts || [],
      subjects: subjects || [],
    });
  } catch (error) {
    console.error('Error fetching diagnostic results:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
