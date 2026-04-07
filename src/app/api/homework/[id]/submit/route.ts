// MS-003: Student Homework Submission API
// POST /api/homework/[id]/submit - Submit homework answers
// PUT /api/homework/[id]/submit - Save draft answers

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitHomeworkSchema, saveDraftSchema } from "@/lib/homework.validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Submit completed homework
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: assignmentId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = submitHomeworkSchema.safeParse({
      ...body,
      assignment_id: assignmentId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify assignment exists and is published
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .select(`
        *,
        homework_questions(*),
        cohorts(id)
      `)
      .eq("id", assignmentId)
      .eq("is_published", true)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found or not published" }, { status: 404 });
    }

    // Check if student is in the cohort
    const { data: cohortMembership } = await supabase
      .from("cohort_students")
      .select("id")
      .eq("cohort_id", assignment.cohort_id)
      .eq("student_id", user.id)
      .eq("is_active", true)
      .single();

    if (!cohortMembership) {
      return NextResponse.json(
        { error: "You are not enrolled in this class" },
        { status: 403 }
      );
    }

    // Check if already submitted
    const { data: existingSubmission } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .single();

    if (existingSubmission?.status === "submitted" || existingSubmission?.status === "graded" || existingSubmission?.status === "returned") {
      return NextResponse.json(
        { error: "You have already submitted this homework" },
        { status: 400 }
      );
    }

    // Check due date
    const now = new Date();
    const dueDate = assignment.due_at ? new Date(assignment.due_at) : null;
    const isLate = dueDate && now > dueDate;

    if (isLate && !assignment.allow_late_submission) {
      return NextResponse.json(
        { error: "This assignment is past due and does not allow late submissions" },
        { status: 400 }
      );
    }

    // Get or create submission
    let submissionId: string;
    const timeSpent = data.time_spent_seconds || existingSubmission?.time_spent_seconds || 0;

    if (existingSubmission) {
      submissionId = existingSubmission.id;

      // Update submission status
      const { error: updateError } = await supabase
        .from("homework_submissions")
        .update({
          status: "submitted",
          submitted_at: now.toISOString(),
          time_spent_seconds: timeSpent,
          updated_at: now.toISOString(),
        })
        .eq("id", submissionId);

      if (updateError) {
        console.error("Error updating submission:", updateError);
        return NextResponse.json(
          { error: "Failed to submit homework" },
          { status: 500 }
        );
      }
    } else {
      // Create new submission
      const { data: newSubmission, error: insertError } = await supabase
        .from("homework_submissions")
        .insert({
          assignment_id: assignmentId,
          student_id: user.id,
          status: "submitted",
          submitted_at: now.toISOString(),
          started_at: now.toISOString(),
          time_spent_seconds: timeSpent,
        })
        .select()
        .single();

      if (insertError || !newSubmission) {
        console.error("Error creating submission:", insertError);
        return NextResponse.json(
          { error: "Failed to submit homework" },
          { status: 500 }
        );
      }

      submissionId = newSubmission.id;
    }

    // Save responses
    const responsesToInsert = data.answers.map((answer) => ({
      submission_id: submissionId,
      question_id: answer.question_id,
      response_text: answer.response_text || null,
      response_file_url: answer.response_file_url || null,
      response_file_urls: answer.response_file_urls || null,
    }));

    // Delete existing responses first (in case of resubmit)
    await supabase
      .from("homework_responses")
      .delete()
      .eq("submission_id", submissionId);

    // Insert new responses
    const { data: savedResponses, error: responsesError } = await supabase
      .from("homework_responses")
      .insert(responsesToInsert)
      .select();

    if (responsesError) {
      console.error("Error saving responses:", responsesError);
      return NextResponse.json(
        { error: "Failed to save answers" },
        { status: 500 }
      );
    }

    // Auto-grade multiple choice and true/false questions
    const questions = assignment.homework_questions || [];
    let autoGradedScore = 0;
    let autoGradablePoints = 0;

    for (const answer of data.answers) {
      const question = questions.find((q: { id: string }) => q.id === answer.question_id);
      const savedResponse = savedResponses?.find((r) => r.question_id === answer.question_id);

      if (
        question &&
        savedResponse &&
        (question.question_type === "multiple_choice" || question.question_type === "true_false") &&
        question.correct_answer
      ) {
        autoGradablePoints += question.points || 0;

        const isCorrect = answer.response_text === question.correct_answer;
        const pointsEarned = isCorrect ? (question.points || 0) : 0;
        autoGradedScore += pointsEarned;

        // Update response with auto-graded points
        await supabase
          .from("homework_responses")
          .update({ points_earned: pointsEarned })
          .eq("id", savedResponse.id);
      }
    }

    // Update submission with auto-graded score
    const allQuestionsAutoGradable = questions.every(
      (q: { question_type: string; correct_answer: string | null }) =>
        (q.question_type === "multiple_choice" || q.question_type === "true_false") && q.correct_answer
    );

    if (allQuestionsAutoGradable && autoGradablePoints > 0) {
      await supabase
        .from("homework_submissions")
        .update({
          score: autoGradedScore,
          status: "graded",
          graded_at: now.toISOString(),
        })
        .eq("id", submissionId);
    } else if (autoGradablePoints > 0) {
      // Partial auto-grade, save score but keep as submitted for manual grading
      await supabase
        .from("homework_submissions")
        .update({
          score: autoGradedScore,
        })
        .eq("id", submissionId);
    }

    // Update student streak
    const streakDays = await updateStudentStreak(supabase, user.id);

    return NextResponse.json({
      success: true,
      streakDays,
      data: {
        submission_id: submissionId,
        status: allQuestionsAutoGradable ? "graded" : "submitted",
        is_late: isLate,
        auto_graded_score: autoGradedScore,
        auto_gradable_points: autoGradablePoints,
        submitted_at: now.toISOString(),
      },
      message: "Homework submitted successfully",
    });
  } catch (error) {
    console.error("Homework submission API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT - Save draft answers (autosave)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: assignmentId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = saveDraftSchema.safeParse({
      ...body,
      assignment_id: assignmentId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify assignment exists and is published
    const { data: assignment } = await supabase
      .from("homework_assignments")
      .select("cohort_id, is_published")
      .eq("id", assignmentId)
      .eq("is_published", true)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check if student is in the cohort
    const { data: cohortMembership } = await supabase
      .from("cohort_students")
      .select("id")
      .eq("cohort_id", assignment.cohort_id)
      .eq("student_id", user.id)
      .eq("is_active", true)
      .single();

    if (!cohortMembership) {
      return NextResponse.json(
        { error: "You are not enrolled in this class" },
        { status: 403 }
      );
    }

    // Get or create submission
    let submissionId: string;
    const now = new Date();
    const timeSpent = data.time_spent_seconds || 0;

    const { data: existingSubmission } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .single();

    if (existingSubmission) {
      // Don't allow saving draft if already submitted
      if (existingSubmission.status === "submitted" || existingSubmission.status === "graded") {
        return NextResponse.json(
          { error: "Cannot modify submitted homework" },
          { status: 400 }
        );
      }

      submissionId = existingSubmission.id;

      // Update time spent
      await supabase
        .from("homework_submissions")
        .update({
          status: "in_progress",
          time_spent_seconds: Math.max(existingSubmission.time_spent_seconds || 0, timeSpent),
          started_at: existingSubmission.started_at || now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", submissionId);
    } else {
      // Create new submission in progress
      const { data: newSubmission, error: insertError } = await supabase
        .from("homework_submissions")
        .insert({
          assignment_id: assignmentId,
          student_id: user.id,
          status: "in_progress",
          started_at: now.toISOString(),
          time_spent_seconds: timeSpent,
        })
        .select()
        .single();

      if (insertError || !newSubmission) {
        console.error("Error creating draft submission:", insertError);
        return NextResponse.json(
          { error: "Failed to save draft" },
          { status: 500 }
        );
      }

      submissionId = newSubmission.id;
    }

    // Upsert responses (update if exists, insert if not)
    for (const answer of data.answers) {
      if (!answer.response_text && !answer.response_file_url && !answer.response_file_urls) {
        continue; // Skip empty answers
      }

      const { data: existingResponse } = await supabase
        .from("homework_responses")
        .select("id")
        .eq("submission_id", submissionId)
        .eq("question_id", answer.question_id)
        .single();

      if (existingResponse) {
        await supabase
          .from("homework_responses")
          .update({
            response_text: answer.response_text || null,
            response_file_url: answer.response_file_url || null,
            response_file_urls: answer.response_file_urls || null,
            updated_at: now.toISOString(),
          })
          .eq("id", existingResponse.id);
      } else {
        await supabase
          .from("homework_responses")
          .insert({
            submission_id: submissionId,
            question_id: answer.question_id,
            response_text: answer.response_text || null,
            response_file_url: answer.response_file_url || null,
            response_file_urls: answer.response_file_urls || null,
          });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        submission_id: submissionId,
        saved_at: now.toISOString(),
      },
      message: "Draft saved successfully",
    });
  } catch (error) {
    console.error("Homework draft API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// Helper function to update student streak — returns current streak days
async function updateStudentStreak(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
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

    return newStreak;
  } else {
    await supabase.from("student_streaks").insert({
      student_id: userId,
      current_streak_days: 1,
      longest_streak_days: 1,
      last_activity_date: today,
      total_homework_completed: 1,
    });

    return 1;
  }
}
