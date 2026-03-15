import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";

export const maxDuration = 300; // 5 minutes for Netlify

const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25 MB

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        { error: "AI not configured" },
        { status: 500 }
      );
    }

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get lesson with subject info
    const { data: lesson } = await supabase
      .from("lessons")
      .select("*, subject:subjects(name_ar, name_en)")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.created_by !== user.id) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const languageHint = (body.language_hint as string) || undefined;
    const questionCount = Math.min(Math.max(body.question_count || 6, 3), 12);

    // Get video URL (prefer smallest for faster download)
    const videoUrl =
      lesson.video_url_360p || lesson.video_url_480p || lesson.video_url_720p;

    if (!videoUrl) {
      return NextResponse.json(
        { error: "No video URL available. Upload a video first." },
        { status: 400 }
      );
    }

    // --- Step 1: Download video from Bunny CDN ---
    const videoResponse = await fetch(videoUrl, {
      signal: AbortSignal.timeout(60000),
      headers: { Referer: process.env.NEXT_PUBLIC_SITE_URL || "https://amalmadrassa.netlify.app" },
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
      warning =
        "Video was truncated for transcription. Only a portion was processed.";
    }

    // --- Step 2: Transcribe with OpenAI Whisper ---
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

    // --- Step 3: Generate content with GPT ---
    const subject = lesson.subject as { name_ar?: string; name_en?: string } | null;
    const subjectName = subject?.name_en || subject?.name_ar || "General";
    const durationSeconds = lesson.video_duration_seconds || segments[segments.length - 1]?.end || 300;

    const segmentText = segments.length > 0
      ? segments.map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`).join("\n")
      : transcriptText;

    const prompt = `You are an expert curriculum designer for Amal Madrassa, an educational platform for Sudanese children.

Given the following video lesson transcript, generate quiz questions and bilingual content summaries.

## Lesson Context
- Title: ${lesson.title_ar || lesson.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lesson.grade_level || 1}
- Video Duration: ${durationSeconds} seconds

## Transcript with Timestamps
${segmentText}

## Task 1: Generate ${questionCount} Quiz Questions

Requirements:
- Each question must have a timestamp_seconds corresponding to the relevant part of the video
- Distribute questions evenly across the video timeline
- Mix question types: use "multiple_choice" (with 4 options), "true_false", and "fill_in_blank"
- At least 60% should be "multiple_choice"
- question_text_ar MUST be in Arabic
- question_text_en should be an English translation
- For multiple_choice: provide exactly 4 options as strings, correct_answer must match one exactly
- For true_false: set options to ["صحيح", "خطأ"], correct_answer is one of them
- For fill_in_blank: set options to null, correct_answer is the expected word/phrase
- explanation_ar and explanation_en: briefly explain why the answer is correct
- Difficulty should be appropriate for Grade ${lesson.grade_level || 1}

## Task 2: Generate Content Block Summaries

Requirements:
- Divide the lesson into 3-6 logical sections based on topic changes
- For each section, create TWO content blocks: one Arabic ("ar") and one English ("en")
- Each block: 2-4 paragraph summary of key concepts
- source_type: "ai_transcript_summary"
- Sequence: ar at 0, en at 1, ar at 2, en at 3, etc.`;

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lesson_content",
          strict: true,
          schema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question_type: { type: "string", enum: ["multiple_choice", "true_false", "fill_in_blank"] },
                    question_text_ar: { type: "string" },
                    question_text_en: { type: "string" },
                    options: {
                      anyOf: [
                        { type: "array", items: { type: "string" } },
                        { type: "null" },
                      ],
                    },
                    correct_answer: { type: "string" },
                    explanation_ar: { type: "string" },
                    explanation_en: { type: "string" },
                    timestamp_seconds: { type: "number" },
                    display_order: { type: "number" },
                    is_required: { type: "boolean" },
                    allow_retry: { type: "boolean" },
                  },
                  required: [
                    "question_type", "question_text_ar", "question_text_en",
                    "options", "correct_answer", "explanation_ar", "explanation_en",
                    "timestamp_seconds", "display_order", "is_required", "allow_retry",
                  ],
                  additionalProperties: false,
                },
              },
              contentBlocks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    language: { type: "string", enum: ["ar", "en"] },
                    content: { type: "string" },
                    source_type: { type: "string" },
                    sequence: { type: "number" },
                  },
                  required: ["language", "content", "source_type", "sequence"],
                  additionalProperties: false,
                },
              },
            },
            required: ["questions", "contentBlocks"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "AI did not return content. Please try again." },
        { status: 502 }
      );
    }

    const generated = JSON.parse(content);

    // Update lesson with transcript and generation timestamp
    await supabase
      .from("lessons")
      .update({
        ai_generated_at: new Date().toISOString(),
        ai_transcript: transcriptText,
      })
      .eq("id", lessonId)
      .then(() => {}); // non-blocking, ignore errors

    return NextResponse.json({
      transcript: {
        text: transcriptText,
        language: (transcription as unknown as { language?: string }).language || languageHint || "unknown",
        segments,
      },
      questions: generated.questions || [],
      contentBlocks: generated.contentBlocks || [],
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    console.error("generate error:", error);
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
