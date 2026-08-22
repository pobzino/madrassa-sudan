import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import type { Slide } from "@/lib/slides.types";
import { PRACTICE_QUESTION_COUNT } from "@/lib/practice";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/teacher/homework/generate-from-lesson
 *
 * Body: { lesson_id: string, num_questions?: number }
 *
 * Generates bilingual Practice questions from a single lesson's content. Prefers the
 * most recent sim deck snapshot; falls back to the lesson's slide deck so
 * homework can be generated even before a sim has been recorded. Returns
 * { title_ar, title_en, subject_id, questions } for prefilling the create page.
 */
export async function POST(request: NextRequest) {
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const supabase = await createClient();
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
    const { lesson_id, num_questions = PRACTICE_QUESTION_COUNT } = body as {
      lesson_id?: string;
      num_questions?: number;
    };

    if (!lesson_id) {
      return jsonResponse({ error: "lesson_id is required" }, 400);
    }

    const clampedCount = Math.min(Math.max(num_questions, 2), 12);

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, title_ar, title_en, grade_level, subject_id, subject:subjects(name_ar, name_en)")
      .eq("id", lesson_id)
      .maybeSingle();

    if (!lesson) {
      return jsonResponse({ error: "Lesson not found" }, 404);
    }

    // Prefer the most recent sim deck; fall back to the lesson's slide deck.
    const [{ data: sims }, { data: slideDeck }] = await Promise.all([
      supabase
        .from("lesson_sims")
        .select("deck_snapshot, recorded_at")
        .eq("lesson_id", lesson_id)
        .order("recorded_at", { ascending: false })
        .limit(1),
      supabase
        .from("lesson_slides")
        .select("slides")
        .eq("lesson_id", lesson_id)
        .maybeSingle(),
    ]);

    let deck: Slide[] | null = null;
    const latestSim = (sims ?? [])[0] as { deck_snapshot?: unknown } | undefined;
    if (Array.isArray(latestSim?.deck_snapshot) && latestSim.deck_snapshot.length > 0) {
      deck = latestSim.deck_snapshot as unknown as Slide[];
    } else if (
      slideDeck &&
      Array.isArray((slideDeck as { slides?: unknown }).slides) &&
      ((slideDeck as { slides: unknown[] }).slides.length > 0)
    ) {
      deck = (slideDeck as { slides: unknown }).slides as unknown as Slide[];
    }

    if (!deck) {
      return jsonResponse(
        { error: "This lesson has no slides or sim recording to generate from yet." },
        400
      );
    }

    const content = extractSlideContent(deck);
    if (content.trim().length === 0) {
      return jsonResponse({ error: "This lesson's slides have no readable content yet." }, 400);
    }

    const subject = (lesson as { subject?: { name_ar?: string; name_en?: string } | null }).subject;
    const subjectName = subject?.name_en || subject?.name_ar || "General";
    const gradeLevel = (lesson as { grade_level?: number | null }).grade_level || 1;
    const lessonTitle = lesson.title_ar || lesson.title_en || "Lesson";

    const prompt = `You are an expert curriculum designer for Amal School, a Sudanese K-12 educational platform.

Generate a single Practice that reviews ONE lesson. Every question must draw from the lesson content below.

## Lesson Context
- Lesson: ${lessonTitle}
- Subject: ${subjectName}
- Grade Level: ${gradeLevel}

## Lesson Content
${content}

## Requirements
- Generate exactly ${clampedCount} Practice questions covering this lesson
- Mix of question types: mostly "multiple_choice" (4 options) with some "true_false"
- All questions must be bilingual: Arabic primary (question_text_ar), English translation (question_text_en)
- For multiple_choice: provide exactly 4 options as strings, correct_answer must match one option exactly
- For true_false: set options to ["صحيح", "خطأ"] (True/False in Arabic), correct_answer is one of them
- Each question is worth 10 points
- Difficulty should be appropriate for Grade ${gradeLevel}
- Generate a Practice title in both Arabic (title_ar) and English (title_en) that reflects the lesson`;

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
            subject_id: (lesson as { subject_id?: string | null }).subject_id ?? null,
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
    console.error("generate-from-lesson error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
