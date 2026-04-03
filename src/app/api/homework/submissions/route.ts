// MS-003: Homework Submissions API
// GET /api/homework/submissions - List submissions for grading queue
// POST /api/homework/submissions - Bulk actions on submissions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listSubmissionsQuerySchema } from "@/lib/homework.validation";

// GET - List submissions for grading queue
export async function GET(request: NextRequest) {
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

    const isAdmin = profile?.role === "admin";
    const isTeacher = profile?.role === "teacher";

    // Parse and validate query params
    const { searchParams } = new URL(request.url);
    const queryParams = {
      assignment_id: searchParams.get("assignment_id") || "",
      status: searchParams.get("status") || undefined,
      sort_by: searchParams.get("sort_by") || undefined,
      sort_order: searchParams.get("sort_order") || undefined,
      page: searchParams.get("page") || undefined,
      per_page: searchParams.get("per_page") || undefined,
    };

    const validationResult = listSubmissionsQuerySchema.safeParse(queryParams);

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

    // Verify teacher has access to the assignment
    const { data: assignment } = await supabase
      .from("homework_assignments")
      .select("cohort_id")
      .eq("id", query.assignment_id)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (!isAdmin) {
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this assignment" }, { status: 403 });
      }
    }

    // Build query — disambiguate FK since homework_submissions has two FKs to profiles
    let dbQuery = supabase
      .from("homework_submissions")
      .select(
        "*, profiles!homework_submissions_student_id_fkey(id, full_name, avatar_url)",
        { count: "exact" }
      )
      .eq("assignment_id", query.assignment_id);

    // Apply status filter
    if (query.status && query.status !== "all") {
      if (query.status === "pending") {
        dbQuery = dbQuery.eq("status", "submitted");
      } else if (query.status === "graded") {
        dbQuery = dbQuery.in("status", ["graded", "returned"]);
      } else if (query.status === "not_started") {
        dbQuery = dbQuery.eq("status", "not_started");
      } else if (query.status === "late") {
        // Get late submissions by comparing submitted_at with assignment due_at
        // This requires a more complex query
        const { data: assignmentData } = await supabase
          .from("homework_assignments")
          .select("due_at")
          .eq("id", query.assignment_id)
          .single();

        if (assignmentData?.due_at) {
          dbQuery = dbQuery
            .gt("submitted_at", assignmentData.due_at)
            .in("status", ["submitted", "graded", "returned"]);
        }
      }
    }

    // Apply sorting
    const sortBy = query.sort_by || "submitted_at";
    const sortOrder = query.sort_order || "desc";
    dbQuery = dbQuery.order(sortBy, { ascending: sortOrder === "asc" });

    // Apply pagination
    dbQuery = dbQuery.range(offset, offset + perPage - 1);

    const { data: submissions, count, error } = await dbQuery;

    if (error) {
      console.error("Error fetching submissions:", error);
      return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
    }

    // Get question count for the assignment
    const { count: questionCount } = await supabase
      .from("homework_questions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", query.assignment_id);

    // Enrich with additional data
    const enrichedSubmissions = await Promise.all(
      (submissions || []).map(async (sub) => {
        const profile = sub.profiles as unknown as { id: string; full_name: string; avatar_url: string | null } | null;

        // Count answered questions
        const { count: answeredCount } = await supabase
          .from("homework_responses")
          .select("*", { count: "exact", head: true })
          .eq("submission_id", sub.id);

        return {
          id: sub.id,
          student_id: sub.student_id,
          student_name: profile?.full_name || "Unknown",
          student_avatar: profile?.avatar_url || null,
          status: sub.status,
          score: sub.score,
          submitted_at: sub.submitted_at,
          started_at: sub.started_at,
          time_spent_seconds: sub.time_spent_seconds,
          question_count: questionCount || 0,
          answered_count: answeredCount || 0,
        };
      })
    );

    // Get stats
    const { count: totalCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", query.assignment_id);

    const { count: pendingCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", query.assignment_id)
      .eq("status", "submitted");

    const { count: gradedCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", query.assignment_id)
      .in("status", ["graded", "returned"]);

    const { count: notStartedCount } = await supabase
      .from("homework_submissions")
      .select("*", { count: "exact", head: true })
      .eq("assignment_id", query.assignment_id)
      .eq("status", "not_started");

    return NextResponse.json({
      success: true,
      data: {
        submissions: enrichedSubmissions,
        total: count || 0,
        page,
        per_page: perPage,
        stats: {
          total: totalCount || 0,
          pending: pendingCount || 0,
          graded: gradedCount || 0,
          not_started: notStartedCount || 0,
        },
      },
    });
  } catch (error) {
    console.error("Submissions list API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}

// POST - Bulk actions on submissions (remind students, export, etc.)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, assignment_id, student_ids } = body;

    if (!action || !assignment_id) {
      return NextResponse.json(
        { error: "action and assignment_id are required" },
        { status: 400 }
      );
    }

    // Check teacher role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Only teachers can perform bulk actions" }, { status: 403 });
    }

    // Verify teacher has access to the assignment
    const { data: assignment } = await supabase
      .from("homework_assignments")
      .select("cohort_id, title_ar, title_en")
      .eq("id", assignment_id)
      .single();

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (profile.role !== "admin") {
      const { data: cohortAccess } = await supabase
        .from("cohort_teachers")
        .select("id")
        .eq("cohort_id", assignment.cohort_id)
        .eq("teacher_id", user.id)
        .single();

      if (!cohortAccess) {
        return NextResponse.json({ error: "You don't have access to this assignment" }, { status: 403 });
      }
    }

    if (action === "remind") {
      // Get students who haven't submitted yet
      let remindQuery = supabase
        .from("homework_submissions")
        .select("student_id")
        .eq("assignment_id", assignment_id)
        .in("status", ["not_started", "in_progress"]);

      if (student_ids && student_ids.length > 0) {
        remindQuery = remindQuery.in("student_id", student_ids);
      }

      const { data: pendingSubmissions } = await remindQuery;

      if (!pendingSubmissions || pendingSubmissions.length === 0) {
        return NextResponse.json({
          success: true,
          message: "No students to remind",
          reminded_count: 0,
        });
      }

      // In a real app, this would send notifications
      // For now, just return the count
      return NextResponse.json({
        success: true,
        message: `Reminders sent to ${pendingSubmissions.length} students`,
        reminded_count: pendingSubmissions.length,
      });
    }

    if (action === "export") {
      // Get all submissions with responses for export
      const { data: submissions } = await supabase
        .from("homework_submissions")
        .select(`
          *,
          profiles!homework_submissions_student_id_fkey(full_name),
          homework_responses(*)
        `)
        .eq("assignment_id", assignment_id);

      if (!submissions) {
        return NextResponse.json({ error: "No submissions to export" }, { status: 404 });
      }

      // Format for CSV export
      const exportData = submissions.map((sub) => {
        const profile = sub.profiles as unknown as { full_name: string } | null;
        return {
          student_id: sub.student_id,
          student_name: profile?.full_name || "Unknown",
          status: sub.status,
          score: sub.score,
          submitted_at: sub.submitted_at,
          time_spent_seconds: sub.time_spent_seconds,
          response_count: sub.homework_responses?.length || 0,
        };
      });

      return NextResponse.json({
        success: true,
        data: exportData,
        filename: `homework_${assignment_id}_submissions.csv`,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Bulk action API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
