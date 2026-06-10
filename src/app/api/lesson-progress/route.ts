import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST - Save/update lesson progress
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      lesson_id,
      position_seconds,
      watch_time_delta = 0,
      completed = false,
      questions_answered,
      questions_correct
    } = body;

    if (!lesson_id) {
      return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });
    }

    // Check if progress record exists
    const { data: existingProgress } = await supabase
      .from("lesson_progress")
      .select("*")
      .eq("student_id", user.id)
      .eq("lesson_id", lesson_id)
      .single();

    if (existingProgress) {
      // Update existing progress
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (position_seconds !== undefined) {
        updates.last_position_seconds = position_seconds;
      }

      if (watch_time_delta > 0) {
        updates.total_watch_time_seconds = existingProgress.total_watch_time_seconds + watch_time_delta;
      }

      if (completed && !existingProgress.completed) {
        updates.completed = true;
        updates.completed_at = new Date().toISOString();
      }

      if (questions_answered !== undefined) {
        updates.questions_answered = questions_answered;
      }

      if (questions_correct !== undefined) {
        updates.questions_correct = questions_correct;
      }

      const { data: updatedProgress, error: updateError } = await supabase
        .from("lesson_progress")
        .update(updates)
        .eq("id", existingProgress.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating progress:", updateError);
        return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
      }

      // Streak/total_lessons_completed is handled by the
      // trg_lesson_progress_streak DB trigger so every completion path
      // (sim auto-complete, mark-complete, offline sync) stays consistent.

      return NextResponse.json({ progress: updatedProgress });
    } else {
      // Create new progress record
      const { data: newProgress, error: insertError } = await supabase
        .from("lesson_progress")
        .insert({
          student_id: user.id,
          lesson_id,
          last_position_seconds: position_seconds || 0,
          total_watch_time_seconds: watch_time_delta || 0,
          completed: completed || false,
          completed_at: completed ? new Date().toISOString() : null,
          questions_answered: questions_answered || 0,
          questions_correct: questions_correct || 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating progress:", insertError);
        return NextResponse.json({ error: "Failed to create progress" }, { status: 500 });
      }

      // Streak/total_lessons_completed is handled by the
      // trg_lesson_progress_streak DB trigger (see migration).

      return NextResponse.json({ progress: newProgress });
    }
  } catch (error) {
    console.error("Lesson progress API error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

// GET - Get lesson progress
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lessonId = searchParams.get("lesson_id");

    if (lessonId) {
      // Get progress for specific lesson
      const { data: progress, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("student_id", user.id)
        .eq("lesson_id", lessonId)
        .single();

      if (error && error.code !== "PGRST116") {
        return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
      }

      return NextResponse.json({ progress: progress || null });
    } else {
      // Get all progress for user
      const { data: progress, error } = await supabase
        .from("lesson_progress")
        .select(`
          *,
          lessons (
            id,
            title_ar,
            title_en,
            subject_id,
            thumbnail_url,
            video_duration_seconds
          )
        `)
        .eq("student_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: "Failed to fetch progress" }, { status: 500 });
      }

      return NextResponse.json({ progress });
    }
  } catch (error) {
    console.error("Lesson progress GET error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}

