import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";
import type { Slide } from "@/lib/slides.types";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Extracts text content from a sim's deck snapshot for AI prompt building.
 */
function extractSlideContent(deck: Slide[]): string {
  return deck
    .map((slide, i) => {
      const parts: string[] = [`Slide ${i + 1} (${slide.type}):`];
      const title = slide.title_ar || slide.title_en;
      if (title) parts.push(`  Title: ${title}`);
      const body = slide.body_ar || slide.body_en;
      if (body) parts.push(`  Content: ${body}`);
      const bullets = slide.bullets_ar?.length ? slide.bullets_ar : slide.bullets_en;
      if (bullets?.length) parts.push(`  Key points: ${bullets.join("; ")}`);
      const notes = slide.speaker_notes_ar || slide.speaker_notes_en;
      if (notes) parts.push(`  Speaker notes: ${notes}`);
      if (slide.interaction_type) {
        const prompt = slide.interaction_prompt_ar || slide.interaction_prompt_en;
        parts.push(`  Activity: ${slide.interaction_type}${prompt ? ` — "${prompt}"` : ""}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

/**
 * POST /api/teacher/lessons/[id]/generate-homework
 *
 * Uses the sim's deck_snapshot to generate homework questions via AI.
 * Returns { questions, title_ar, title_en } for prefilling the homework creation page.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
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

    const { data: lesson } = await supabase
      .from("lessons")
      .select("*, subject:subjects(name_ar, name_en)")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return jsonResponse({ error: "Lesson not found" }, 404);
    }

    // Load the most recent sim for this lesson
    const { data: sim } = await supabase
      .from("lesson_sims")
      .select("deck_snapshot")
      .eq("lesson_id", lessonId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sim?.deck_snapshot || !Array.isArray(sim.deck_snapshot) || sim.deck_snapshot.length === 0) {
      return jsonResponse({ error: "No sim recording found for this lesson." }, 400);
    }

    const deck = sim.deck_snapshot as unknown as Slide[];
    const slideContent = extractSlideContent(deck);

    if (slideContent.trim().length < 30) {
      return jsonResponse({ error: "Sim slides have too little content to generate homework." }, 400);
    }

    const subject = lesson.subject as { name_ar?: string; name_en?: string } | null;
    const subjectName = subject?.name_en || subject?.name_ar || "General";
    const gradeLevel = lesson.grade_level || 1;
    const lessonTitle = lesson.title_ar || lesson.title_en || "Untitled";

    const prompt = `You are an expert curriculum designer for Amal School, a Sudanese K-12 educational platform.

Given the following lesson slide content, generate homework questions that test student understanding of the material.

## Lesson Context
- Title: ${lessonTitle}
- Subject: ${subjectName}
- Grade Level: ${gradeLevel}

## Slide Content
${slideContent}

## Requirements
- Generate 5-8 homework questions
- Mix of question types: mostly "multiple_choice" (4 options) with some "true_false"
- All questions must be bilingual: Arabic primary (question_text_ar), English translation (question_text_en)
- For multiple_choice: provide exactly 4 options as strings, correct_answer must match one option exactly
- For true_false: set options to ["صحيح", "خطأ"] (True/False in Arabic), correct_answer is one of them
- Each question is worth 10 points
- Difficulty should be appropriate for Grade ${gradeLevel}
- Questions should cover key concepts from the lesson slides
- Generate a homework title in both Arabic (title_ar) and English (title_en) that reflects the lesson topic`;

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

    // Stream to keep connection alive, same pattern as /generate route
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
          const errorMsg =
            err instanceof Error ? err.message : "Generation failed";
          controller.enqueue(
            encoder.encode("\n" + JSON.stringify({ error: errorMsg }))
          );
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
    console.error("generate-homework error:", error);
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
