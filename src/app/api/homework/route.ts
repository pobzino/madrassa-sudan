// MS-003: Teacher Homework API
// POST /api/homework - Create new homework assignment
// GET /api/homework - List teacher's homework assignments

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAssignmentSchema, listAssignmentsQuerySchema } from "@/lib/homework.validation";
import type { CreateAssignmentInput } from "@/lib/homework.validation";

// POST - Create new homework assignment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

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
      return NextResponse.json({ error: "Only teachers can create assignments" }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data: CreateAssignmentInput = validationResult.data;

    // Verify teacher has access to the cohort
    const { data: cohortAccess } = await supabase
      .from("cohort_teachers")
      .select("id")
      .eq("cohort_id", data.cohort_id)
      .eq("teacher_id", user.id)
      .single();

    if (!cohortAccess) {
      return NextResponse.json({ error: "You don't have access to this cohort" }, { status: 403 });
    }

    // Calculate total points from questions
    const totalPoints = data.questions.reduce((sum, q) => sum + q.points, 0);

    // Create assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("homework_assignments")
      .insert({
        cohort_id: data.cohort_id,
        subject_id: data.subject_id || null,
        title_ar: data.title_ar,
        title_en: data.title_en || null,
        instructions_ar: data.instructions_ar || null,
        instructions_en: data.instructions_en || null,
        due_at: data.due_at || null,
        total_points: totalPoints,
        is_published: data.is_published,
        created_by: user.id,
      })
      .select()
      .single();

    if (assignmentError || !assignment) {
      console.error("Error creating assignment:", assignmentError);
      return NextResponse.json(
        { error: "Failed to create assignment" },
        { status: 500 }
      );
    }

    // Create questions
    const questionsToInsert = data.questions.map((q, index) => ({
      assignment_id: assignment.id,
      question_type: q.question_type,
      question_text_ar: q.question_text_ar,
      question_text_en: q.question_text_en || null,
      options: q.options || null,
      correct_answer: q.correct_answer || null,
      points: q.points,
      display_order: q.display_order || index + 1,
      rubric: q.rubric || null,
      instructions: q.instructions || null,
    }));

    const { error: questionsError } = await supabase
      .from("homework_questions")
      .insert(questionsToInsert);

    if (questionsError) {
      console.error("Error creating questions:", questionsError);
      // Rollback assignment creation
      await supabase.from("homework_assignments").delete().eq("id", assignment.id);
      return NextResponse.json(
        { error: "Failed to create questions" },
        { status: 500 }
      );
    }

    // If published, create submission records for all students in the cohort
    if (data.is_published) {
      const { data: cohortStudents } = await supabase
        .from("cohort_students")
        .select("student_id")
        .eq("cohort_id", data.cohort_id)
        .eq("is_active", true);

      if (cohortStudents && cohortStudents.length > 0) {
        const submissionsToInsert = cohortStudents.map((cs) => ({
          assignment_id: assignment.id,
          student_id: cs.student_id,
          status: "not_started" as const,
        }));

        await supabase.from("homework_submissions").insert(submissionsToInsert);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        assignment,
        question_count: data.questions.length,
      },
      message: "Assignment created successfully",
    });
  } catch (error) {
    console.error("Homework creation API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

// GET - List teacher's homework assignments
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const queryParams = {
      cohort_id: searchParams.get("cohort_id") || undefined,
      status: searchParams.get("status") || undefined,
      subject_id: searchParams.get("subject_id") || undefined,
      sort_by: searchParams.get("sort_by") || undefined,
      sort_order: searchParams.get("sort_order") || undefined,
      page: searchParams.get("page") || undefined,
      per_page: searchParams.get("per_page") || undefined,
    };

    const validationResult = listAssignmentsQuerySchema.safeParse(queryParams);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const query = validationResult.data;
    const page = query.page || 1;
    const perPage = query.per_page || 20;
    const offset = (page - 1) * perPage;

    // Get teacher's cohorts
    const { data: teacherCohorts } = await supabase
      .from("cohort_teachers")
      .select("cohort_id")
      .eq("teacher_id", user.id);

    const cohortIds = teacherCohorts?.map((tc) => tc.cohort_id) || [];

    if (cohortIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          assignments: [],
          total: 0,
          page,
          per_page: perPage,
        },
      });
    }

    // Build base query
    let dbQuery = supabase
      .from("homework_assignments")
      .select(
        `
        *,
        cohorts(name),
        subjects(name_ar, name_en)
      `,
        { count: "exact" }
      )
      .in("cohort_id", cohortIds);

    // Apply filters
    if (query.cohort_id) {
      dbQuery = dbQuery.eq("cohort_id", query.cohort_id);
    }

    if (query.subject_id) {
      dbQuery = dbQuery.eq("subject_id", query.subject_id);
    }

    if (query.status && query.status !== "all") {
      if (query.status === "published") {
        dbQuery = dbQuery.eq("is_published", true);
      } else if (query.status === "draft") {
        dbQuery = dbQuery.eq("is_published", false);
      }
      // "closed" would need additional logic based on due date
    }

    // Apply sorting
    const sortBy = query.sort_by || "created_at";
    const sortOrder = query.sort_order || "desc";
    dbQuery = dbQuery.order(sortBy, { ascending: sortOrder === "asc" });

    // Apply pagination
    dbQuery = dbQuery.range(offset, offset + perPage - 1);

    const { data: assignments, count, error } = await dbQuery;

    if (error) {
      console.error("Error fetching assignments:", error);
      return NextResponse.json(
        { error: "Failed to fetch assignments" },
        { status: 500 }
      );
    }

    // Enrich with submission stats
    const enrichedAssignments = await Promise.all(
      (assignments || []).map(async (assignment) => {
        const { count: submissionsCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignment.id);

        const { count: gradedCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignment.id)
          .in("status", ["graded", "returned"]);

        const { count: pendingCount } = await supabase
          .from("homework_submissions")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignment.id)
          .eq("status", "submitted");

        const { data: avgScoreData } = await supabase
          .from("homework_submissions")
          .select("score")
          .eq("assignment_id", assignment.id)
          .not("score", "is", null);

        const avgScore = avgScoreData?.length
          ? avgScoreData.reduce((sum, s) => sum + (s.score || 0), 0) / avgScoreData.length
          : null;

        return {
          ...assignment,
          cohort_name: (assignment.cohorts as { name: string })?.name || "Unknown",
          subject_name: (assignment.subjects as { name_ar: string; name_en: string } | null)?.name_en ||
            (assignment.subjects as { name_ar: string; name_en: string } | null)?.name_ar || null,
          submissions_count: submissionsCount || 0,
          graded_count: gradedCount || 0,
          pending_count: pendingCount || 0,
          average_score: avgScore,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        assignments: enrichedAssignments,
        total: count || 0,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    console.error("Homework list API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
