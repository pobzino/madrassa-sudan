import { NextRequest, NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

export const maxDuration = 300;

const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25 MB

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
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

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

    const videoUrl =
      lesson.video_url_360p || lesson.video_url_480p || lesson.video_url_720p || lesson.video_url_1080p;

    if (!videoUrl) {
      return NextResponse.json(
        { error: "No video URL available. Upload a video first." },
        { status: 400 }
      );
    }

    // Download video
    const videoResponse = await fetch(videoUrl, {
      signal: AbortSignal.timeout(60000),
      headers: { Referer: getSiteUrl() },
    });

    if (!videoResponse.ok) {
      return NextResponse.json(
        { error: "Could not download video from CDN" },
        { status: 502 }
      );
    }

    let videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    let warning: string | undefined;

    if (videoBuffer.length > MAX_WHISPER_SIZE) {
      videoBuffer = videoBuffer.subarray(0, MAX_WHISPER_SIZE);
      warning = "Video was truncated for transcription. Only a portion was processed.";
    }

    // Transcribe with Whisper
    const file = new File([videoBuffer], "lesson.mp4", { type: "video/mp4" });

    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      ...(languageHint ? { language: languageHint } : {}),
    });

    const segments: Array<{ start: number; end: number; text: string }> =
      (transcription as unknown as { segments?: Array<{ start: number; end: number; text: string }> })
        .segments || [];

    const transcriptText =
      (transcription as unknown as { text?: string }).text ||
      segments.map((s) => s.text).join(" ");

    if (!transcriptText || transcriptText.trim().length < 20) {
      return NextResponse.json(
        { error: "Could not extract meaningful transcript from the video. Check that the video has audio." },
        { status: 422 }
      );
    }

    // Save transcript to DB
    await supabase
      .from("lessons")
      .update({ ai_transcript: transcriptText })
      .eq("id", lessonId);

    return NextResponse.json({
      transcript: transcriptText,
      cached: false,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    console.error("transcribe error:", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
