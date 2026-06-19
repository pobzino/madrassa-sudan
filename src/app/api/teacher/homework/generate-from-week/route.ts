import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import type { Slide } from "@/lib/slides.types";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/teacher/homework/generate-from-week
 *
 * Body: { week_id: string, num_questions?: number }
 *
 * Aggregates the sim deck snapshots of every lesson in a learning-path week and
 * generates a bilingual homework that covers the whole week. Returns
 * { title_ar, title_en, subject_id, questions } for prefilling the create page.
 */
export async function POST(request: NextRequest) {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const supabase = await createClient();
    // Untyped view for the learning-path tables not in database.types.ts.
    const db = supabase as unknown as SupabaseClient;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const role = await getTeacherRole(supabase, user.id);
    if (!role) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await request.json();
    const { week_id, num_questions = 8 } = body as {
      week_id?: string;
      num_questions?: number;
    };

    if (!week_id) {
      return jsonResponse({ error: "week_id is required" }, 400);
    }

    const clampedCount = Math.min(Math.max(num_questions, 2), 12);

    // Week → path → subject
    const { data: week } = await db
      .from("learning_path_weeks")
      .select("id, week_number, title_ar, title_en, path_id")
      .eq("id", week_id)
      .maybeSingle<{
        id: string;
        week_number: number;
        title_ar: string;
        title_en: string | null;
        path_id: string;
      }>();

    if (!week) {
      return jsonResponse({ error: "Week not found" }, 404);
    }

    const { data: path } = await db
      .from("learning_paths")
      .select("id, subject_id")
      .eq("id", week.path_id)
      .maybeSingle<{ id: string; subject_id: string }>();

    if (!path) {
      return jsonResponse({ error: "Learning path not found" }, 404);
    }

    // Steps → ordered lesson ids
    const { data: steps } = await db
      .from("learning_path_steps")
      .select("lesson_id, sequence")
      .eq("week_id", week_id)
      .order("sequence", { ascending: true })
      .returns<Array<{ lesson_id: string; sequence: number }>>();

    const lessonIds = (steps ?? []).map((s) => s.lesson_id);
    if (lessonIds.length === 0) {
      return jsonResponse({ error: "This week has no lessons yet." }, 400);
    }

    // Lesson metadata + their sim decks.
    const [{ data: lessons }, { data: subject }, { data: sims }] = await Promise.all([
      supabase
        .from("lessons")
        .select("id, title_ar, title_en, grade_level")
        .in("id", lessonIds),
      supabase
        .from("subjects")
        .select("name_ar, name_en")
        .eq("id", path.subject_id)
        .maybeSingle(),
      supabase
        .from("lesson_sims")
        .select("lesson_id, deck_snapshot, recorded_at")
        .in("lesson_id", lessonIds)
        .order("recorded_at", { ascending: false }),
    ]);

    const lessonById = new Map(
      (lessons ?? []).map((l) => [
        l.id,
        l as { id: string; title_ar: string; title_en: string | null; grade_level: number | null },
      ])
    );

    // Keep the most recent sim per lesson (rows are already ordered desc).
    const latestSimByLesson = new Map<string, Slide[]>();
    for (const sim of sims ?? []) {
      const row = sim as { lesson_id: string; deck_snapshot: unknown };
      if (latestSimByLesson.has(row.lesson_id)) continue;
      if (Array.isArray(row.deck_snapshot) && row.deck_snapshot.length > 0) {
        latestSimByLesson.set(row.lesson_id, row.deck_snapshot as unknown as Slide[]);
      }
    }

    // Build combined content in lesson order.
    const sections: string[] = [];
    for (const lessonId of lessonIds) {
      const deck = latestSimByLesson.get(lessonId);
      if (!deck) continue;
      const lesson = lessonById.get(lessonId);
      const lessonTitle = lesson?.title_ar || lesson?.title_en || "Lesson";
      const content = extractSlideContent(deck);
      if (content.trim().length === 0) continue;
      sections.push(`### Lesson: ${lessonTitle}\n${content}`);
    }

    if (sections.length === 0) {
      return jsonResponse(
        { error: "None of the lessons in this week have a sim recording yet." },
        400
      );
    }

    const subjectName =
      (subject as { name_en?: string; name_ar?: string } | null)?.name_en ||
      (subject as { name_en?: string; name_ar?: string } | null)?.name_ar ||
      "General";
    const gradeLevel =
      lessonIds.map((id) => lessonById.get(id)?.grade_level).find((g) => g != null) || 1;
    const weekTitle = week.title_ar || week.title_en || `Week ${week.week_number}`;
    const combinedContent = sections.join("\n\n");

    const prompt = `You are an expert curriculum designer for Amal School, a Sudanese K-12 educational platform.

Generate a single homework that reviews an entire week of lessons. The questions must draw from across ALL the lessons below, not just one.

## Week Context
- Week: ${weekTitle}
- Subject: ${subjectName}
- Grade Level: ${gradeLevel}

## Lesson Content (the whole week)
${combinedContent}

## Requirements
- Generate exactly ${clampedCount} homework questions spread across the week's lessons
- Mix of question types: mostly "multiple_choice" (4 options) with some "true_false"
- All questions must be bilingual: Arabic primary (question_text_ar), English translation (question_text_en)
- For multiple_choice: provide exactly 4 options as strings, correct_answer must match one option exactly
- For true_false: set options to ["صحيح", "خطأ"] (True/False in Arabic), correct_answer is one of them
- Each question is worth 10 points
- Difficulty should be appropriate for Grade ${gradeLevel}
- Generate a homework title in both Arabic (title_ar) and English (title_en) that reflects the week's topics`;

    const stream = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "homework_questions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              title_ar: { type: "string" },
              title_en: { type: "string" },
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question_type: {
                      type: "string",
                      enum: ["multiple_choice", "true_false"],
                    },
                    question_text_ar: { type: "string" },
                    question_text_en: { type: "string" },
                    options: {
                      type: "array",
                      items: { type: "string" },
                    },
                    correct_answer: { type: "string" },
                    points: { type: "number" },
                    display_order: { type: "number" },
                  },
                  required: [
                    "question_type",
                    "question_text_ar",
                    "question_text_en",
                    "options",
                    "correct_answer",
                    "points",
                    "display_order",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["title_ar", "title_en", "questions"],
            additionalProperties: false,
          },
        },
      },
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              controller.enqueue(encoder.encode(" "));
            }
          }

          const generated = JSON.parse(fullContent);
          const result = JSON.stringify({
            title_ar: generated.title_ar || "",
            title_en: generated.title_en || "",
            subject_id: path.subject_id,
            questions: (generated.questions || []).map(
              (q: Record<string, unknown>, i: number) => ({
                question_type: q.question_type,
                question_text_ar: q.question_text_ar,
                question_text_en: q.question_text_en || null,
                options: q.options || null,
                correct_answer: q.correct_answer || null,
                points: q.points || 10,
                display_order: q.display_order || i + 1,
              })
            ),
          });

          controller.enqueue(encoder.encode("\n" + result));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Generation failed";
          controller.enqueue(encoder.encode("\n" + JSON.stringify({ error: errorMsg })));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("generate-from-week error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
