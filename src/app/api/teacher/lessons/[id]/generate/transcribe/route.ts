import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { transcribeLessonVideo } from "@/lib/server/published-lesson-video";

export const maxDuration = 300;

/**
 * Step 1: Download video + transcribe with Whisper.
 * Saves transcript to lessons.ai_transcript and returns it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getTeacherRole(supabase, user.id);
    if (!role) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: lesson } = await supabase
      .from("lessons")
      .select("*, subject:subjects(name_ar, name_en)")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // If we already have a transcript, return it immediately
    if (lesson.ai_transcript && typeof lesson.ai_transcript === "string" && lesson.ai_transcript.trim().length > 20) {
      return NextResponse.json({
        transcript: lesson.ai_transcript,
        cached: true,
      });
    }

    const body = await request.json().catch(() => ({}));
    const languageHint = (body.language_hint as string) || undefined;
    const result = await transcribeLessonVideo(lessonId, languageHint);

    return NextResponse.json({
      transcript: result.transcript,
      cached: result.cached,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (error) {
    console.error("transcribe error:", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
