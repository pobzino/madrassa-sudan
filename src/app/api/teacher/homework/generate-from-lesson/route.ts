import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import { generatePracticeContent } from "@/lib/server/practice-generator";
import type { Slide } from "@/lib/slides.types";
import { z } from "zod";

export const maxDuration = 300;
const requestSchema = z.object({
  lesson_id: z.string().uuid(),
  num_questions: z.number().int().min(4).max(12).default(10),
});

/** Returns form content only; never publishes or overwrites an assignment.
 * Uses the same quality pipeline as automatic Practice draft creation. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await getTeacherRole(supabase, user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lesson or question count" }, { status: 400 });
  }
  const { lesson_id, num_questions } = parsed.data;
  const { data: lesson, error: lessonError } = await supabase.from("lessons")
    .select("id,title_ar,title_en,grade_level,subject_id,subject:subjects(name_ar,name_en)")
    .eq("id", lesson_id).maybeSingle();
  if (lessonError || !lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  const [sims, slides] = await Promise.all([
    supabase.from("lesson_sims").select("deck_snapshot").eq("lesson_id", lesson_id)
      .order("recorded_at", { ascending: false }).limit(1),
    supabase.from("lesson_slides").select("slides").eq("lesson_id", lesson_id).maybeSingle(),
  ]);
  if (sims.error || slides.error) {
    return NextResponse.json({ error: "Cannot load lesson source" }, { status: 500 });
  }
  const deck = sims.data?.[0]?.deck_snapshot ?? slides.data?.slides;
  if (!Array.isArray(deck)) {
    return NextResponse.json({ error: "This lesson has no source slides" }, { status: 400 });
  }
  const content = extractSlideContent(deck as unknown as Slide[]);
  if (!content.trim()) {
    return NextResponse.json({ error: "This lesson has no readable source" }, { status: 400 });
  }
  const subject = Array.isArray(lesson.subject) ? lesson.subject[0] : lesson.subject;
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(" "));
      }, 10000);
      try {
        const generated = await generatePracticeContent({
          content,
          lessonTitleAr: lesson.title_ar,
          lessonTitleEn: lesson.title_en ?? lesson.title_ar,
          subjectName: subject?.name_en ?? subject?.name_ar ?? "General",
          gradeLevel: lesson.grade_level ?? 1,
          questionCount: num_questions,
        });
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify({
          ...generated,
          subject_id: lesson.subject_id,
          questions: generated.questions.map((q, i) => ({
            ...q,
            options: q.options_ar,
            correct_option_index: q.correct_option_index < 0 ? null : q.correct_option_index,
            points: 10,
            display_order: i + 1,
          })),
        })));
      } catch (error) {
        console.error("Practice draft generation failed", error);
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify({
          error: "Practice did not pass generation checks. Please try again.",
        })));
      } finally {
        clearInterval(heartbeat);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; clearInterval(heartbeat); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
