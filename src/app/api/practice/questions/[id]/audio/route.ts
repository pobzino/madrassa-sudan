import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import type { LessonLanguageMode } from "@/lib/practice-language";
import { NARRATION_QUESTION_COLUMNS, narrateQuestion } from "@/lib/server/question-audio";

export const maxDuration = 120;

const RequestSchema = z.object({ language: z.enum(["ar", "en"]) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "Narration storage is not configured" }, { status: 503 });
  }

  const { id: questionId } = await params;
  const { data: question, error: questionError } = await supabase
    .from("homework_questions")
    .select(NARRATION_QUESTION_COLUMNS)
    .eq("id", questionId)
    .maybeSingle();
  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const { data: assignment } = await supabase
    .from("homework_assignments")
    .select("is_practice, is_published, lesson_id")
    .eq("id", question.assignment_id)
    .maybeSingle();
  if (!assignment?.is_practice || !assignment.is_published) {
    return NextResponse.json({ error: "Question not available" }, { status: 403 });
  }

  const language = parsed.data.language;
  const { data: slideDeck } = assignment.lesson_id
    ? await supabase
        .from("lesson_slides")
        .select("language_mode")
        .eq("lesson_id", assignment.lesson_id)
        .maybeSingle()
    : { data: null };
  const result = await narrateQuestion(
    createServiceClient(),
    question,
    language,
    slideDeck?.language_mode as LessonLanguageMode,
  );
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ audio_url: result.audioUrl, cached: result.cached });
}
