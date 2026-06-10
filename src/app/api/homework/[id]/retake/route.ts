// Retry a homework attempt.
// POST /api/homework/[id]/retake — resets the student's submission so they can
// attempt the assignment again, preserving the UNIQUE(assignment_id, student_id)
// constraint (one row, reset). The prior attempt is already snapshotted in
// homework_attempts at submit time, so resetting loses nothing.
//
// Eligible when EITHER:
//   • the assignment is a gating "week test" (is_test) that has been graded and
//     not yet passed (≥ passing_score), OR
//   • the assignment is regular auto-gradable homework that has been graded and
//     not yet mastered (< 100%). Students retry until they reach full marks.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: assignmentId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: assignment } = await supabase
      .from("homework_assignments")
      .select("id, is_test, passing_score, total_points, homework_questions(question_type, correct_answer)")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const { data: submission } = await supabase
      .from("homework_submissions")
      .select("id, status, score, attempt_count")
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "No submission to retake" }, { status: 404 });
    }

    const isGraded = submission.status === "graded" || submission.status === "returned";
    if (!isGraded) {
      return NextResponse.json(
        { error: "This attempt has not been graded yet" },
        { status: 400 }
      );
    }

    const totalPoints = assignment.total_points ?? 0;
    const questions = (assignment.homework_questions ?? []) as {
      question_type: string;
      correct_answer: string | null;
    }[];
    const allAutoGradable =
      questions.length > 0 &&
      questions.every(
        (q) =>
          (q.question_type === "multiple_choice" || q.question_type === "true_false") &&
          q.correct_answer
      );

    if (assignment.is_test) {
      // Gating test: retry only if not yet passed.
      const threshold = ((assignment.passing_score ?? 80) / 100) * totalPoints;
      const passed = submission.score != null && totalPoints > 0 && submission.score >= threshold;
      if (passed) {
        return NextResponse.json(
          { error: "You have already passed this test" },
          { status: 400 }
        );
      }
    } else {
      // Regular homework: retry only auto-gradable assignments that aren't mastered.
      if (!allAutoGradable) {
        return NextResponse.json(
          { error: "This homework cannot be retried" },
          { status: 400 }
        );
      }
      const mastered = submission.score != null && totalPoints > 0 && submission.score >= totalPoints;
      if (mastered) {
        return NextResponse.json(
          { error: "You have already completed this homework" },
          { status: 400 }
        );
      }
    }

    // Clear the prior answers and reset the submission to a fresh attempt. The
    // attempt itself is preserved in homework_attempts; attempt_count is bumped
    // by the submit route on the next submission.
    await supabase.from("homework_responses").delete().eq("submission_id", submission.id);

    const { error: resetError } = await supabase
      .from("homework_submissions")
      .update({
        status: "in_progress",
        score: null,
        submitted_at: null,
        graded_at: null,
        feedback: null,
        overall_feedback: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submission.id);

    if (resetError) {
      console.error("Error resetting test submission for retake:", resetError);
      return NextResponse.json({ error: "Failed to start retake" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Homework retake API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
