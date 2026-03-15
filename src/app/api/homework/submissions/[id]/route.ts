// MS-003: Single Submission Grading API
// GET /api/homework/submissions/[id] - Get single submission with answers
// POST /api/homework/submissions/[id]/grade - Grade submission

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gradeSubmissionSchema } from "@/lib/homework.validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get single submission with full details for grading
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: submissionId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get submission with responses and assignment info
    const { data: submission, error: submissionError } = await supabase
      .from("homework_submissions")
      .select(`
        *,
        homework_assignments(
          *,
          homework_questions(*),
          cohorts(id, name),
          subjects(id, name_ar, name_en)
        )
      `)
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Get student profile separately
    const { data: studentProfileData } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", submission.student_id)
      .single();

    const assignment = submission.homework_assignments as Record<string, unknown>;

    // Check access
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";
    const isTeacher = profile?.role === "teacher";
    const isStudent = profile?.role === "student";

    // Student can only view their own submission
    if (isStudent && submission.student_id !== user.id) {
      return NextResponse.json({ error: "You can only view your own submissions" }, { status: 403 });
    }

    // Teacher must have access to the cohort
    if (isTeacher) {
      const cohortId = assignment.cohort_id as string;
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", cohortId)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this submission" }, { status: 403 });
      }
    }

    // Get responses with question details
    const { data: responses } = await supabase
      .from("homework_responses")
      .select(`
        *,
        homework_questions(*)
      `)
      .eq("submission_id", submissionId);

    // Format for the grading interface
    const studentProfile = studentProfileData as unknown as { id: string; full_name: string; avatar_url: string | null } | null;
    const questions = (assignment.homework_questions || []) as Record<string, unknown>[];

    const formattedResponses = questions.map((question) => {
      const response = responses?.find((r) => r.question_id === question.id);

      return {
        response_id: response?.id || null,
        question_id: question.id,
        question_type: question.question_type,
        question_text_ar: question.question_text_ar,
        question_text_en: question.question_text_en,
        options: question.options,
        correct_answer: question.correct_answer,
        points: question.points,
        display_order: question.display_order,
        rubric: question.rubric,
        response_text: response?.response_text || null,
        response_file_url: response?.response_file_url || null,
        response_file_urls: response?.response_file_urls || null,
        points_earned: response?.points_earned || null,
        teacher_comment: response?.teacher_comment || null,
        created_at: response?.created_at || null,
        updated_at: response?.updated_at || null,
      };
    }).sort((a, b) => (a.display_order as number) - (b.display_order as number));

    return NextResponse.json({
      success: true,
      data: {
        submission: {
          id: submission.id,
          student_id: submission.student_id,
          student_name: studentProfile?.full_name || "Unknown",
          student_avatar: studentProfile?.avatar_url || null,
          status: submission.status,
          score: submission.score,
          submitted_at: submission.submitted_at,
          started_at: submission.started_at,
          time_spent_seconds: submission.time_spent_seconds,
          overall_feedback: submission.overall_feedback || submission.feedback,
          graded_at: submission.graded_at,
          graded_by: submission.graded_by,
        },
        assignment: {
          id: assignment.id,
          title_ar: assignment.title_ar,
          title_en: assignment.title_en,
          instructions_ar: assignment.instructions_ar,
          instructions_en: assignment.instructions_en,
          total_points: assignment.total_points,
          due_at: assignment.due_at,
          cohort_name: (assignment.cohorts as { name: string } | null)?.name || "Unknown",
          subject_name: (assignment.subjects as { name_ar: string; name_en: string } | null)?.name_en ||
            (assignment.subjects as { name_ar: string; name_en: string } | null)?.name_ar || null,
        },
        responses: formattedResponses,
      },
    });
  } catch (error) {
    console.error("Submission detail API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// POST - Grade a submission
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: submissionId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check teacher role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Only teachers can grade submissions" }, { status: 403 });
    }

    // Get submission
    const { data: submission, error: submissionError } = await supabase
      .from("homework_submissions")
      .select("*, homework_assignments(cohort_id)")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Verify teacher has access
    if (profile.role !== "admin") {
      const assignment = submission.homework_assignments as { cohort_id: string };
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this submission" }, { status: 403 });
      }
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = gradeSubmissionSchema.safeParse({
      ...body,
      submission_id: submissionId,
    });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Update each response with grades
    for (const grade of data.grades) {
      const updateData: Record<string, unknown> = {
        points_earned: grade.points_earned,
        updated_at: new Date().toISOString(),
      };

      if (grade.teacher_comment !== undefined) {
        updateData.teacher_comment = grade.teacher_comment;
      }

      const { error: updateError } = await supabase
        .from("homework_responses")
        .update(updateData)
        .eq("id", grade.response_id);

      if (updateError) {
        console.error("Error updating response:", updateError);
        return NextResponse.json(
          { error: `Failed to update response ${grade.response_id}` },
          { status: 500 }
        );
      }
    }

    // Calculate total score
    const totalScore = data.grades.reduce((sum, g) => sum + g.points_earned, 0);

    // Update submission
    const submissionUpdate: Record<string, unknown> = {
      score: totalScore,
      status: "graded",
      graded_by: user.id,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (data.overall_feedback !== undefined) {
      submissionUpdate.overall_feedback = data.overall_feedback;
    }

    const { error: submissionUpdateError } = await supabase
      .from("homework_submissions")
      .update(submissionUpdate)
      .eq("id", submissionId);

    if (submissionUpdateError) {
      console.error("Error updating submission:", submissionUpdateError);
      return NextResponse.json({ error: "Failed to update submission" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        submission_id: submissionId,
        total_score: totalScore,
        graded_responses: data.grades.length,
      },
      message: "Submission graded successfully",
    });
  } catch (error) {
    console.error("Grade submission API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// PATCH - Update grade (partial update)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id: submissionId } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check teacher role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Only teachers can update grades" }, { status: 403 });
    }

    const body = await request.json();
    const { response_id, points_earned, teacher_comment } = body;

    if (!response_id) {
      return NextResponse.json({ error: "response_id is required" }, { status: 400 });
    }

    // Update response
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (points_earned !== undefined) updateData.points_earned = points_earned;
    if (teacher_comment !== undefined) updateData.teacher_comment = teacher_comment;

    const { error: updateError } = await supabase
      .from("homework_responses")
      .update(updateData)
      .eq("id", response_id)
      .eq("submission_id", submissionId);

    if (updateError) {
      console.error("Error updating response:", updateError);
      return NextResponse.json({ error: "Failed to update grade" }, { status: 500 });
    }

    // Recalculate total score
    const { data: responses } = await supabase
      .from("homework_responses")
      .select("points_earned")
      .eq("submission_id", submissionId);

    const totalScore = responses?.reduce((sum, r) => sum + (r.points_earned || 0), 0) || 0;

    await supabase
      .from("homework_submissions")
      .update({
        score: totalScore,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    return NextResponse.json({
      success: true,
      data: {
        response_id,
        points_earned,
        teacher_comment,
        new_total_score: totalScore,
      },
      message: "Grade updated successfully",
    });
  } catch (error) {
    console.error("Update grade API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
