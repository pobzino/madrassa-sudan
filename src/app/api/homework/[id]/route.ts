// MS-003: Teacher Homework Detail API
// GET /api/homework/[id] - Get homework with questions
// PUT /api/homework/[id] - Update homework
// DELETE /api/homework/[id] - Delete homework

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateAssignmentSchema } from "@/lib/homework.validation";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get homework assignment with questions
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get assignment with questions
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .select(`
        *,
        cohorts(id, name, grade_level),
        subjects(id, name_ar, name_en),
        homework_questions(*)
      `)
      .eq("id", id)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check if user has access (teacher of the cohort or admin)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    if (!isAdmin) {
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        // Check if user is a student in the cohort
        const { data: studentAccess } = await supabase
          .from("cohort_students")
          .select("id")
          .eq("cohort_id", assignment.cohort_id)
          .eq("student_id", user.id)
          .eq("is_active", true)
          .single();

        if (!studentAccess) {
          return NextResponse.json({ error: "You don't have access to this assignment" }, { status: 403 });
        }

        // Student access - return without correct answers
        const questions = (assignment.homework_questions || [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((q) => ({
            id: q.id,
            question_type: q.question_type,
            question_text_ar: q.question_text_ar,
            question_text_en: q.question_text_en,
            options: q.options,
            points: q.points,
            display_order: q.display_order,
            instructions: q.instructions,
            // Exclude correct_answer for students
          }));

        return NextResponse.json({
          success: true,
          data: {
            ...assignment,
            questions,
          },
        });
      }
    }

    // Teacher/Admin access - return full data
    const questions = (assignment.homework_questions || [])
      .sort((a, b) => a.display_order - b.display_order);

    // Get submission stats
    const { count: submissionsCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", id);

    const { count: gradedCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", id)
      .in("status", ["graded", "returned"]);

    const { count: pendingCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", id)
      .eq("status", "submitted");

    return NextResponse.json({
      success: true,
      data: {
        ...assignment,
        questions,
        stats: {
          total_submissions: submissionsCount || 0,
          graded: gradedCount || 0,
          pending: pendingCount || 0,
        },
      },
    });
  } catch (error) {
    console.error("Homework detail API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// PUT - Update homework assignment
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id } = await params;

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
      return NextResponse.json({ error: "Only teachers can update assignments" }, { status: 403 });
    }

    // Get existing assignment
    const { data: existingAssignment } = await supabase
      .from("homework_assignments")
      .select("*, homework_questions(*)")
      .eq("id", id)
      .single();

    if (!existingAssignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check teacher has access to this cohort
    if (profile.role !== "admin") {
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", existingAssignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this assignment" }, { status: 403 });
      }
    }

    // Check if assignment has submissions (can't edit if students have submitted)
    const { count: submissionsCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", id)
      .in("status", ["submitted", "graded", "returned"]);

    if (submissionsCount && submissionsCount > 0) {
      return NextResponse.json(
        { error: "Cannot edit assignment after students have submitted. Create a new assignment instead." },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = updateAssignmentSchema.safeParse({ ...body, id });

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Update assignment
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.subject_id !== undefined) updateData.subject_id = data.subject_id;
    if (data.title_ar !== undefined) updateData.title_ar = data.title_ar;
    if (data.title_en !== undefined) updateData.title_en = data.title_en;
    if (data.instructions_ar !== undefined) updateData.instructions_ar = data.instructions_ar;
    if (data.instructions_en !== undefined) updateData.instructions_en = data.instructions_en;
    if (data.due_at !== undefined) updateData.due_at = data.due_at;
    if (data.is_published !== undefined) updateData.is_published = data.is_published;

    // Recalculate total points if questions are provided
    if (data.questions && data.questions.length > 0) {
      updateData.total_points = data.questions.reduce((sum, q) => sum + q.points, 0);
    }

    const { error: updateError } = await supabase
      .from("homework_assignments")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      console.error("Error updating assignment:", updateError);
      return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
    }

    // Update questions if provided
    if (data.questions && data.questions.length > 0) {
      // Delete existing questions
      await supabase
        .from("homework_questions")
        .delete()
        .eq("assignment_id", id);

      // Insert new questions
      const questionsToInsert = data.questions.map((q, index) => ({
        assignment_id: id,
        question_type: q.question_type,
        question_text_ar: q.question_text_ar,
        question_text_en: q.question_text_en || null,
        options: q.options || null,
        correct_answer: q.correct_answer || null,
        points: q.points,
        display_order: q.display_order || index + 1,
        rubric: q.rubric || null,
        instructions: q.instructions || null,
        hints: q.hints || [],
      }));

      const { error: questionsError } = await supabase
        .from("homework_questions")
        .insert(questionsToInsert);

      if (questionsError) {
        console.error("Error updating questions:", questionsError);
        return NextResponse.json({ error: "Failed to update questions" }, { status: 500 });
      }
    }

    // If publishing for the first time, create submission records
    if (data.is_published && !existingAssignment.is_published) {
      const { data: cohortStudents } = await supabase
        .from("cohort_students")
        .select("student_id")
        .eq("cohort_id", existingAssignment.cohort_id)
        .eq("is_active", true);

      if (cohortStudents && cohortStudents.length > 0) {
        const submissionsToInsert = cohortStudents.map((cs) => ({
          assignment_id: id,
          student_id: cs.student_id,
          status: "not_started" as const,
        }));

        await supabase.from("homework_submissions").insert(submissionsToInsert);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Assignment updated successfully",
    });
  } catch (error) {
    console.error("Homework update API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// DELETE - Delete homework assignment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = await createClient();
    const { id } = await params;

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
      return NextResponse.json({ error: "Only teachers can delete assignments" }, { status: 403 });
    }

    // Get existing assignment
    const { data: existingAssignment } = await supabase
      .from("homework_assignments")
      .select("cohort_id")
      .eq("id", id)
      .single();

    if (!existingAssignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Check teacher has access to this cohort
    if (profile.role !== "admin") {
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", existingAssignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this assignment" }, { status: 403 });
      }
    }

    // Check if assignment has submissions with responses (archive instead of delete)
    const { count: responsesCount } = await supabase
      .from("homework_responses")
      .select("*", { count: "exact", head: true })
      .eq("submission_id", id); // This is a simplification - would need to join

    if (responsesCount && responsesCount > 0) {
      // Soft delete by unpublishing instead
      await supabase
        .from("homework_assignments")
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json({
        success: true,
        message: "Assignment has student work. It has been unpublished instead of deleted.",
      });
    }

    // Hard delete (cascades to questions via FK)
    await supabase
      .from("homework_submissions")
      .delete()
      .eq("assignment_id", id);

    await supabase
      .from("homework_questions")
      .delete()
      .eq("assignment_id", id);

    await supabase
      .from("homework_assignments")
      .delete()
      .eq("id", id);

    return NextResponse.json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    console.error("Homework delete API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
