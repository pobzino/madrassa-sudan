import { NextRequest } from "next/server";
import {
  getCurriculumPromptBlock,
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
} from "@/lib/curriculum";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Step 2: Generate questions, content blocks, and tasks from an existing transcript.
 * Uses streaming to keep the connection alive and avoid gateway timeouts.
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

    const body = await request.json().catch(() => ({}));
    const questionCount = Math.min(Math.max(body.question_count || 6, 3), 12);

    const transcriptText = lesson.ai_transcript as string | null;
    if (!transcriptText || transcriptText.trim().length < 20) {
      return jsonResponse(
        { error: "No transcript available. Run transcription first." },
        400
      );
    }

    const subject = lesson.subject as { name_ar?: string; name_en?: string } | null;
    const subjectName = subject?.name_en || subject?.name_ar || "General";
    const durationSeconds = lesson.video_duration_seconds || 300;
    const curriculumSelection = getCurriculumSelectionForLesson(
      subject,
      lesson.grade_level,
      lesson.curriculum_topic
    );
    const curriculumRequirement = getCurriculumRequirementMessage(
      subject,
      lesson.grade_level,
      curriculumSelection
    );

    if (curriculumRequirement) {
      return jsonResponse({ error: curriculumRequirement }, 400);
    }

    const curriculumBlock = getCurriculumPromptBlock(curriculumSelection);

    const prompt = `You are an expert curriculum designer for Amal School, an educational platform for Sudanese children.

Given the following video lesson transcript, generate quiz questions and bilingual content summaries.

## Lesson Context
- Title: ${lesson.title_ar || lesson.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lesson.grade_level || 1}
- Video Duration: ${durationSeconds} seconds
${curriculumBlock}

## Transcript
${transcriptText}

## Task 1: Generate ${questionCount} Quiz Questions

Requirements:
- Keep all generated material strictly aligned to the selected curriculum topic and stage.
- If the transcript includes tangents or extra examples outside the selected curriculum scope, ignore them.
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
- Keep every section summary within the selected curriculum scope
- For each section, create TWO content blocks: one Arabic ("ar") and one English ("en")
- Each block: 2-4 paragraph summary of key concepts
- source_type: "ai_transcript_summary"
- Sequence: ar at 0, en at 1, ar at 2, en at 3, etc.

## Task 3: Generate 2-4 Interactive Tasks

Requirements:
- Generate interactive tasks distributed across the video timeline
- Keep every task tightly aligned to the selected curriculum topic and stage
- Use ONLY these task_type values: "match_pairs" or "sequence_order"
- Each task must have a timestamp_seconds where it naturally fits the content (different from question timestamps)
- title_ar and instruction_ar MUST be in Arabic
- title_en and instruction_en should be English translations
- For "match_pairs": task_data must include "pairs" (array of {id, left_ar, left_en, right_ar, right_en}) and "shuffle_right" (boolean true)
  - Generate 4-6 pairs related to vocabulary, concepts, or relationships in the lesson
  - Each pair id should be a unique short string like "p1", "p2", etc.
- For "sequence_order": task_data must include "items" (array of {id, text_ar, text_en, correct_position}) and "instruction_type" (one of "ascending", "descending", "chronological", "custom")
  - Generate 4-6 items for ordering (chronological events, size ordering, process steps, etc.)
  - correct_position is 0-indexed (0 = first position)
  - Each item id should be a unique short string like "s1", "s2", etc.
- Set is_skippable to true and points to 10 for all tasks`;

    // Use streaming to keep the connection alive and avoid gateway timeouts
    const stream = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
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
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_type: { type: "string", enum: ["match_pairs", "sequence_order"] },
                    title_ar: { type: "string" },
                    title_en: { type: "string" },
                    instruction_ar: { type: "string" },
                    instruction_en: { type: "string" },
                    timestamp_seconds: { type: "number" },
                    task_data: {
                      anyOf: [
                        {
                          type: "object",
                          properties: {
                            pairs: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string" },
                                  left_ar: { type: "string" },
                                  left_en: { type: "string" },
                                  right_ar: { type: "string" },
                                  right_en: { type: "string" },
                                },
                                required: ["id", "left_ar", "left_en", "right_ar", "right_en"],
                                additionalProperties: false,
                              },
                            },
                            shuffle_right: { type: "boolean" },
                          },
                          required: ["pairs", "shuffle_right"],
                          additionalProperties: false,
                        },
                        {
                          type: "object",
                          properties: {
                            items: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string" },
                                  text_ar: { type: "string" },
                                  text_en: { type: "string" },
                                  correct_position: { type: "number" },
                                },
                                required: ["id", "text_ar", "text_en", "correct_position"],
                                additionalProperties: false,
                              },
                            },
                            instruction_type: {
                              type: "string",
                              enum: ["ascending", "descending", "chronological", "custom"],
                            },
                          },
                          required: ["items", "instruction_type"],
                          additionalProperties: false,
                        },
                      ],
                    },
                    is_skippable: { type: "boolean" },
                    points: { type: "number" },
                  },
                  required: [
                    "task_type", "title_ar", "title_en", "instruction_ar", "instruction_en",
                    "timestamp_seconds", "task_data", "is_skippable", "points",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["questions", "contentBlocks", "tasks"],
            additionalProperties: false,
          },
        },
      },
    });

    // Stream the response to the client to keep the connection alive
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullContent = "";
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullContent += delta;
              // Send a keep-alive dot so the gateway knows the connection is active
              controller.enqueue(encoder.encode(" "));
            }
          }

          const generated = JSON.parse(fullContent);

          // Update lesson with generation timestamp
          supabase
            .from("lessons")
            .update({ ai_generated_at: new Date().toISOString() })
            .eq("id", lessonId)
            .then(() => {});

          const result = JSON.stringify({
            transcript: { text: transcriptText },
            questions: generated.questions || [],
            contentBlocks: generated.contentBlocks || [],
            tasks: generated.tasks || [],
          });

          // Clear the keep-alive spaces and send the real JSON preceded by a newline marker
          controller.enqueue(encoder.encode("\n" + result));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Generation failed";
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
    console.error("generate error:", error);
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
