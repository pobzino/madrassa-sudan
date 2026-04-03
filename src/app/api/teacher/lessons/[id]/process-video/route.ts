import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { processPublishedLessonVideo } from "@/lib/server/published-lesson-video";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

export const maxDuration = 300;

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

    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("created_by, is_published")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!lesson.is_published) {
      return NextResponse.json(
        { error: "Only published lessons are processed automatically." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const languageHint = (body.language_hint as string) || undefined;
    const result = await processPublishedLessonVideo(lessonId, languageHint);

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
      transcript_cached: result.transcriptCached,
      embedding_count: result.embeddingCount,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Published lesson video processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
