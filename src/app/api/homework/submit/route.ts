import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST as submitHomeworkById } from "@/app/api/homework/[id]/submit/route";

// POST - Submit homework (legacy body shape: { assignment_id, responses }).
// Kept for compatibility only: it forwards to /api/homework/[id]/submit so
// there is a single grading path (enrollment and due-date checks, one answer
// per question, server-side scoring). The app itself calls the [id] route.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const assignmentId = body?.assignment_id;
    const responses = body?.responses;

    if (typeof assignmentId !== "string" || !assignmentId) {
      return NextResponse.json({ error: "assignment_id is required" }, { status: 400 });
    }

    if (!Array.isArray(responses)) {
      return NextResponse.json({ error: "responses array is required" }, { status: 400 });
    }

    const forwarded = new NextRequest(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: responses,
        ...(typeof body.time_spent_seconds === "number" ? { time_spent_seconds: body.time_spent_seconds } : {}),
      }),
    });

    return submitHomeworkById(forwarded, { params: Promise.resolve({ id: assignmentId }) });
  } catch (error) {
    console.error("Homework submit API error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
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
