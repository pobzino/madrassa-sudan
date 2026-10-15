// Retry a homework attempt.
// POST /api/homework/[id]/retake — resets the student's submission so they can
// attempt the assignment again, preserving the UNIQUE(assignment_id, student_id)
// constraint (one row, reset). The prior attempt is already snapshotted in
// homework_attempts at submit time, so resetting loses nothing.
//
// Eligible (see decideRetake) when the attempt has been graded AND:
//   • it is a gating "week test" (is_test) or a Practice (is_practice) that has
//     not been passed yet (< passing_score) — a passed one is never reset, since
//     its result is what unlocks the student's path, OR
//   • it is regular auto-gradable homework that has not been mastered (< 100%).
//     Students retry until they reach full marks.
//
// The reset clears the score / graded status, which a student's own session is
// not allowed to write, so it runs with the service role after the checks.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { decideRetake } from "@/lib/homework-grading";

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
      .select("id, is_test, is_practice, passing_score, total_points, homework_questions(question_type, correct_answer)")
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

    const decision = decideRetake(
      {
        is_test: assignment.is_test,
        is_practice: assignment.is_practice,
        passing_score: assignment.passing_score,
        total_points: assignment.total_points,
        questions: (assignment.homework_questions ?? []) as {
          question_type: string;
          correct_answer: string | null;
        }[],
      },
      { status: submission.status, score: submission.score }
    );

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.error }, { status: decision.status });
    }

    if (!hasServiceRoleConfig()) {
      console.error("Homework retake: service role is not configured; resets are server-only.");
      return NextResponse.json({ error: "Retake is temporarily unavailable" }, { status: 503 });
    }
    const admin = createServiceClient();

    // Reset the submission to a fresh attempt, then clear the prior answers.
    // The attempt itself is preserved in homework_attempts; attempt_count is
    // bumped by the submit route on the next submission. Matching on the
    // checked status makes the reset a no-op if the row changed since.
    const { data: resetRows, error: resetError } = await admin
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
      .eq("id", submission.id)
      .eq("student_id", user.id)
      .eq("status", submission.status)
      .select("id");

    if (resetError) {
      console.error("Error resetting test submission for retake:", resetError);
      return NextResponse.json({ error: "Failed to start retake" }, { status: 500 });
    }
    if (!resetRows || resetRows.length === 0) {
      return NextResponse.json({ error: "This attempt changed; reload and try again" }, { status: 409 });
    }

    const { error: responsesError } = await admin
      .from("homework_responses")
      .delete()
      .eq("submission_id", submission.id);

    if (responsesError) {
      console.error("Error clearing answers for retake:", responsesError);
      return NextResponse.json({ error: "Failed to start retake" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Homework retake API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
