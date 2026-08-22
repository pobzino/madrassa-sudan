import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ensureLessonPractice,
  findNextLessonMissingPractice,
} from "@/lib/server/practice-generator";

export const maxDuration = 300;

function authorized(request: NextRequest) {
  const configured = process.env.PRACTICE_AUTOMATION_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = createServiceClient();
    const body = (await request.json().catch(() => ({}))) as {
      lesson_id?: string;
      next_missing?: boolean;
      force?: boolean;
    };
    let lessonId = body.lesson_id ?? null;
    let createdBy: string | null = null;
    let title: string | null = null;

    if (body.next_missing || !lessonId) {
      const lesson = await findNextLessonMissingPractice(client);
      if (!lesson) return NextResponse.json({ complete: true });
      lessonId = lesson.id;
      createdBy = lesson.created_by;
      title = lesson.title_en || lesson.title_ar;
    }

    if (!createdBy) {
      const { data: lesson } = await client
        .from("lessons")
        .select("created_by, title_ar, title_en")
        .eq("id", lessonId)
        .maybeSingle();
      createdBy = lesson?.created_by ?? null;
      title = lesson?.title_en || lesson?.title_ar || title;
    }
    if (!createdBy) {
      const { data: admin } = await client
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_approved", true)
        .limit(1)
        .maybeSingle();
      createdBy = admin?.id ?? null;
    }
    if (!createdBy) throw new Error("No approved content owner is available.");

    const result = await ensureLessonPractice({
      client,
      lessonId,
      createdBy,
      force: body.force === true,
    });
    return NextResponse.json({
      complete: false,
      lesson_id: lessonId,
      title,
      assignment_id: result.assignmentId,
      question_count: result.questionCount,
      generated: result.generated,
    });
  } catch (error) {
    console.error("Practice automation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Practice generation failed" },
      { status: 500 }
    );
  }
}
