import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { ensureLessonPractice } from "@/lib/server/practice-generator";
import { PRACTICE_QUESTION_COUNT } from "@/lib/practice";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Regenerates a saved learning-path step's Practice for teacher vetting. The
 * shared generator is also used by publish/recording automation and backfill.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const role = await getTeacherRole(supabase, user.id);
    if (!role) return jsonResponse({ error: "Forbidden" }, 403);

    const body = (await request.json()) as { step_id?: string; num_questions?: number };
    if (!body.step_id) return jsonResponse({ error: "step_id is required" }, 400);

    const { data: step, error: stepError } = await supabase
      .from("learning_path_steps")
      .select("id, lesson_id")
      .eq("id", body.step_id)
      .maybeSingle();
    if (stepError) throw stepError;
    if (!step) return jsonResponse({ error: "Step not found" }, 404);

    const client = hasServiceRoleConfig() ? createServiceClient() : supabase;
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const keepAlive = setInterval(() => controller.enqueue(encoder.encode(" ")), 1000);
        try {
          const result = await ensureLessonPractice({
            client,
            lessonId: step.lesson_id,
            createdBy: user.id,
            force: true,
            numQuestions: body.num_questions ?? PRACTICE_QUESTION_COUNT,
          });
          controller.enqueue(
            encoder.encode(
              "\n" +
                JSON.stringify({
                  assignment_id: result.assignmentId,
                  title_ar: result.titleAr,
                  title_en: result.titleEn,
                  question_count: result.questionCount,
                })
            )
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Generation failed";
          controller.enqueue(encoder.encode("\n" + JSON.stringify({ error: message })));
        } finally {
          clearInterval(keepAlive);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("generate-practice error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
