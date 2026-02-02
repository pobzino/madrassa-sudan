import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST - Auto-grade all MCQ submissions for an assignment (teacher only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is a teacher
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "teacher" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Only teachers can auto-grade" }, { status: 403 });
    }

    const body = await request.json();
    const { assignment_id } = body;

    if (!assignment_id) {
      return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
    }

    // Get assignment with questions
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .select(`
        *,
        homework_questions (*)
      `)
      .eq("id", assignment_id)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Get all submissions that are submitted but not graded
    const { data: submissions, error: submissionsError } = await supabase
      .from("homework_submissions")
      .select(`
        *,
        homework_responses (*)
      `)
      .eq("assignment_id", assignment_id)
      .eq("status", "submitted");

    if (submissionsError) {
      return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
    }

    const questions = assignment.homework_questions || [];
    const mcqQuestions = questions.filter(
      (q: { question_type: string; correct_answer: string | null }) =>
        q.question_type === "multiple_choice" && q.correct_answer
    );

    if (mcqQuestions.length === 0) {
      return NextResponse.json({ error: "No auto-gradable questions found" }, { status: 400 });
    }

    let gradedCount = 0;
    const results: { submission_id: string; student_id: string; score: number; total: number }[] = [];

    for (const submission of submissions || []) {
      let totalScore = 0;
      let totalPoints = 0;
      let allMcqGraded = true;

      for (const question of mcqQuestions) {
        const response = submission.homework_responses?.find(
          (r: { question_id: string }) => r.question_id === question.id
        );

        const questionPoints = question.points || 10;
        totalPoints += questionPoints;

        if (response) {
          const isCorrect = response.response_text === question.correct_answer;
          const pointsEarned = isCorrect ? questionPoints : 0;
          totalScore += pointsEarned;

          // Update response with points
          await supabase
            .from("homework_responses")
            .update({ points_earned: pointsEarned })
            .eq("id", response.id);
        } else {
          allMcqGraded = false;
        }
      }

      // Check if there are non-MCQ questions that need manual grading
      const nonMcqQuestions = questions.filter(
        (q: { question_type: string }) => q.question_type !== "multiple_choice"
      );

      const hasNonMcqQuestions = nonMcqQuestions.length > 0;

      // If all questions are MCQs, mark as graded
      if (!hasNonMcqQuestions && allMcqGraded) {
        await supabase
          .from("homework_submissions")
          .update({
            score: totalScore,
            status: "graded",
            graded_by: user.id,
            graded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", submission.id);

        gradedCount++;
      } else {
        // Just update partial score, keep as submitted for manual grading
        await supabase
          .from("homework_submissions")
          .update({
            score: totalScore,
            updated_at: new Date().toISOString(),
          })
          .eq("id", submission.id);
      }

      results.push({
        submission_id: submission.id,
        student_id: submission.student_id,
        score: totalScore,
        total: totalPoints,
      });
    }

    return NextResponse.json({
      success: true,
      graded_count: gradedCount,
      total_submissions: submissions?.length || 0,
      results,
    });
  } catch (error) {
    console.error("Auto-grade API error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
