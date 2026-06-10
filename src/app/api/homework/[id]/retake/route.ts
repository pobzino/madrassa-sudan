// Track B: retake a failed gating "week test".
// POST /api/homework/[id]/retake — resets the student's submission so they can
// attempt the test again. Only valid for assignments flagged is_test whose
// current submission is graded/returned and below the passing threshold. This
// preserves the UNIQUE(assignment_id, student_id) constraint (one row, reset).

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
      .select("id, is_test, passing_score, total_points")
      .eq("id", assignmentId)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    if (!assignment.is_test) {
      return NextResponse.json(
        { error: "Only tests can be retaken" },
        { status: 400 }
      );
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
    const threshold = ((assignment.passing_score ?? 80) / 100) * (assignment.total_points ?? 0);
    const passed =
      submission.score != null &&
      (assignment.total_points ?? 0) > 0 &&
      submission.score >= threshold;

    if (!isGraded) {
      return NextResponse.json(
        { error: "This test has not been graded yet" },
        { status: 400 }
      );
    }
    if (passed) {
      return NextResponse.json(
        { error: "You have already passed this test" },
        { status: 400 }
      );
    }

    // Clear the prior answers and reset the submission to a fresh attempt.
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
        attempt_count: (submission.attempt_count ?? 0) + 1,
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
