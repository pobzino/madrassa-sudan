import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST - Submit homework
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { assignment_id, responses } = body;

    if (!assignment_id) {
      return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
    }

    if (!responses || !Array.isArray(responses)) {
      return NextResponse.json({ error: "responses array is required" }, { status: 400 });
    }

    // Verify assignment exists and get questions
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

    // Check if already submitted
    const { data: existingSubmission } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("assignment_id", assignment_id)
      .eq("student_id", user.id)
      .single();

    if (existingSubmission?.status === "submitted" || existingSubmission?.status === "graded") {
      return NextResponse.json({ error: "Homework already submitted" }, { status: 400 });
    }

    // Check due date (allow late if configured)
    const now = new Date();
    const dueDate = assignment.due_at ? new Date(assignment.due_at) : null;
    const isLate = dueDate && now > dueDate;

    if (isLate && !assignment.allow_late_submission) {
      return NextResponse.json({ error: "Assignment is past due date" }, { status: 400 });
    }

    // Create or update submission
    let submissionId: string;

    if (existingSubmission) {
      // Update existing submission
      const { error: updateError } = await supabase
        .from("homework_submissions")
        .update({
          status: "submitted",
          submitted_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", existingSubmission.id);

      if (updateError) {
        console.error("Error updating submission:", updateError);
        return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
      }

      submissionId = existingSubmission.id;

      // Delete existing responses to replace with new ones
      await supabase
        .from("homework_responses")
        .delete()
        .eq("submission_id", submissionId);
    } else {
      // Create new submission
      const { data: newSubmission, error: insertError } = await supabase
        .from("homework_submissions")
        .insert({
          assignment_id,
          student_id: user.id,
          status: "submitted",
          submitted_at: now.toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating submission:", insertError);
        return NextResponse.json({ error: "Failed to create submission" }, { status: 500 });
      }

      submissionId = newSubmission.id;
    }

    // Save responses
    const responsesToInsert = responses.map((r: { question_id: string; response_text?: string; response_file_url?: string }) => ({
      submission_id: submissionId,
      question_id: r.question_id,
      response_text: r.response_text || null,
      response_file_url: r.response_file_url || null,
    }));

    const { error: responsesError } = await supabase
      .from("homework_responses")
      .insert(responsesToInsert);

    if (responsesError) {
      console.error("Error saving responses:", responsesError);
      return NextResponse.json({ error: "Failed to save responses" }, { status: 500 });
    }

    // Auto-grade multiple choice questions
    const questions = assignment.homework_questions || [];
    let autoGradedScore = 0;
    let autoGradablePoints = 0;

    for (const response of responses) {
      const question = questions.find((q: { id: string }) => q.id === response.question_id);
      if (question && question.question_type === "multiple_choice" && question.correct_answer) {
        autoGradablePoints += question.points || 10;
        if (response.response_text === question.correct_answer) {
          autoGradedScore += question.points || 10;

          // Update response with points
          await supabase
            .from("homework_responses")
            .update({ points_earned: question.points || 10 })
            .eq("submission_id", submissionId)
            .eq("question_id", response.question_id);
        } else {
          await supabase
            .from("homework_responses")
            .update({ points_earned: 0 })
            .eq("submission_id", submissionId)
            .eq("question_id", response.question_id);
        }
      }
    }

    // Update student streak
    await updateStudentStreak(supabase, user.id);

    return NextResponse.json({
      success: true,
      submission_id: submissionId,
      is_late: isLate,
      auto_graded_score: autoGradedScore,
      auto_gradable_points: autoGradablePoints,
    });
  } catch (error) {
    console.error("Homework submit API error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// Helper function to update student streak
async function updateStudentStreak(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const today = new Date().toISOString().split("T")[0];

  const { data: existingStreak } = await supabase
    .from("student_streaks")
    .select("*")
    .eq("student_id", userId)
    .single();

  if (existingStreak) {
    const lastActivity = existingStreak.last_activity_date;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let newStreak = existingStreak.current_streak_days;

    if (lastActivity === today) {
      // Already active today
    } else if (lastActivity === yesterdayStr) {
      newStreak += 1;
    } else {
      newStreak = 1;
    }

    await supabase
      .from("student_streaks")
      .update({
        current_streak_days: newStreak,
        longest_streak_days: Math.max(newStreak, existingStreak.longest_streak_days),
        last_activity_date: today,
        total_homework_completed: existingStreak.total_homework_completed + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingStreak.id);
  } else {
    await supabase.from("student_streaks").insert({
      student_id: userId,
      current_streak_days: 1,
      longest_streak_days: 1,
      last_activity_date: today,
      total_homework_completed: 1,
    });
  }
}

// GET - Get submission status
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get("assignment_id");

    if (!assignmentId) {
      return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
    }

    const { data: submission, error } = await supabase
      .from("homework_submissions")
      .select(`
        *,
        homework_responses (
          id,
          question_id,
          response_text,
          response_file_url,
          points_earned,
          teacher_comment
        )
      `)
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: "Failed to fetch submission" }, { status: 500 });
    }

    return NextResponse.json({ submission: submission || null });
  } catch (error) {
    console.error("Homework submission GET error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
