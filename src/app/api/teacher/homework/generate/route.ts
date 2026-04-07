import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/teacher/homework/generate
 *
 * Generates homework questions using AI based on subject, grade level, and topic.
 * No lesson required — works from curriculum context alone.
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
    const {
      subject_name = "General",
      grade_level = 1,
      topic = "",
      num_questions = 6,
    } = body as {
      subject_name?: string;
      grade_level?: number;
      topic?: string;
      num_questions?: number;
    };

    const clampedCount = Math.min(Math.max(num_questions, 2), 12);

    const topicInstruction = topic
      ? `The homework should focus on: "${topic}"`
      : `Generate questions covering key topics in ${subject_name} appropriate for Grade ${grade_level}.`;

    const prompt = `You are an expert curriculum designer for Amal School, a Sudanese K-12 educational platform.

Generate homework questions for the following context:

## Context
- Subject: ${subject_name}
- Grade Level: ${grade_level}
${topicInstruction}

## Requirements
- Generate exactly ${clampedCount} homework questions
- Mix of question types:
  - "multiple_choice" (4 options each) — at least half the questions
  - "true_false" — 1-2 questions
  - "short_answer" — 1-2 questions if appropriate for the grade level
- All questions must be bilingual: Arabic primary (question_text_ar), English translation (question_text_en)
- For multiple_choice: provide exactly 4 options as strings, correct_answer must match one option exactly
- For true_false: set options to ["صحيح", "خطأ"], correct_answer is one of them
- For short_answer: options should be null, correct_answer is the expected answer
- Each question is worth 10 points
- Difficulty appropriate for Grade ${grade_level}
- Generate a homework title in both Arabic (title_ar) and English (title_en) that reflects the topic
- For each question, provide 1-2 helpful hints in Arabic in the "hints" array to guide students`;

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
                      enum: ["multiple_choice", "true_false", "short_answer"],
                    },
                    question_text_ar: { type: "string" },
                    question_text_en: { type: "string" },
                    options: {
                      type: ["array", "null"],
                      items: { type: "string" },
                    },
                    correct_answer: { type: ["string", "null"] },
                    points: { type: "number" },
                    display_order: { type: "number" },
                    hints: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "question_type",
                    "question_text_ar",
                    "question_text_en",
                    "options",
                    "correct_answer",
                    "points",
                    "display_order",
                    "hints",
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

    // Stream to keep connection alive (same pattern as lesson-based route)
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
                hints: Array.isArray(q.hints) ? q.hints : [],
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
