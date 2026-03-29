import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify teacher owns the lesson
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, created_by")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (lesson.created_by !== user.id && profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch all responses for this lesson
  const { data: responses, error: responsesError } = await supabase
    .from("lesson_slide_responses")
    .select("slide_id, student_id, interaction_type, is_correct, time_spent_seconds, attempts, completed_at")
    .eq("lesson_id", lessonId)
    .order("completed_at", { ascending: false });

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 });
  }

  // Fetch student names
  const studentIds = [...new Set((responses || []).map((r) => r.student_id))];
  const { data: students } = studentIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };

  const studentMap = new Map((students || []).map((s) => [s.id, s.full_name]));

  // Aggregate per-slide stats
  const slideStats: Record<string, {
    slide_id: string;
    interaction_type: string;
    total_attempts: number;
    correct_count: number;
    total_time_seconds: number;
    students: Array<{
      student_id: string;
      student_name: string | null;
      is_correct: boolean;
      time_spent_seconds: number;
      attempts: number;
      completed_at: string;
    }>;
  }> = {};

  for (const r of responses || []) {
    if (!slideStats[r.slide_id]) {
      slideStats[r.slide_id] = {
        slide_id: r.slide_id,
        interaction_type: r.interaction_type,
        total_attempts: 0,
        correct_count: 0,
        total_time_seconds: 0,
        students: [],
      };
    }

    const stat = slideStats[r.slide_id];
    stat.total_attempts += 1;
    if (r.is_correct) stat.correct_count += 1;
    stat.total_time_seconds += r.time_spent_seconds || 0;
    stat.students.push({
      student_id: r.student_id,
      student_name: studentMap.get(r.student_id) || null,
      is_correct: r.is_correct,
      time_spent_seconds: r.time_spent_seconds || 0,
      attempts: r.attempts || 1,
      completed_at: r.completed_at,
    });
  }

  const slides = Object.values(slideStats);
  const totalAttempts = slides.reduce((sum, s) => sum + s.total_attempts, 0);
  const totalCorrect = slides.reduce((sum, s) => sum + s.correct_count, 0);
  const totalTime = slides.reduce((sum, s) => sum + s.total_time_seconds, 0);

  return NextResponse.json({
    summary: {
      total_interactions: totalAttempts,
      total_correct: totalCorrect,
      accuracy_percent: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
      avg_time_seconds: totalAttempts > 0 ? Math.round(totalTime / totalAttempts) : 0,
      unique_students: studentIds.length,
    },
    slides,
  });
}
