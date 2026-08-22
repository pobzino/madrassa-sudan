import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import type { Slide } from "@/lib/slides.types";
import { PRACTICE_PASSING_SCORE, PRACTICE_QUESTION_COUNT } from "@/lib/practice";

export const maxDuration = 300;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * POST /api/teacher/learning-path/generate-practice
 *
 * Body: { step_id: string, num_questions?: number }
 *
 * Generates the lesson's "Practice" for an independent-track step: ~10
 * auto-markable questions (multiple choice, true/false, typed number answers)
 * drawn from the lesson's sim/slide content. Creates a published cohort-less
 * practice assignment, links it to the step, and returns it
 * for vetting. Regenerating replaces the questions of the existing practice.
 *
 * Streams keep-alive whitespace while the model works (Netlify timeout), then
 * a final JSON line: { assignment_id, title_ar, title_en, questions } or
 * { error }.
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
    const { step_id, num_questions = PRACTICE_QUESTION_COUNT } = body as {
      step_id?: string;
      num_questions?: number;
    };

    if (!step_id) {
      return jsonResponse({ error: "step_id is required" }, 400);
    }

    const clampedCount = Math.min(Math.max(num_questions, 4), 12);

    const { data: step } = await supabase
      .from("learning_path_steps")
      .select("id, lesson_id, practice_assignment_id")
      .eq("id", step_id)
      .maybeSingle();

    if (!step) {
      return jsonResponse({ error: "Step not found" }, 404);
    }

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, title_ar, title_en, grade_level, subject_id, subject:subjects(name_ar, name_en)")
      .eq("id", step.lesson_id)
      .maybeSingle();

    if (!lesson) {
      return jsonResponse({ error: "Lesson not found" }, 404);
    }

    // Prefer the most recent sim deck; fall back to the lesson's slide deck.
    const [{ data: sims }, { data: slideDeck }] = await Promise.all([
      supabase
        .from("lesson_sims")
        .select("deck_snapshot, recorded_at")
        .eq("lesson_id", step.lesson_id)
        .order("recorded_at", { ascending: false })
        .limit(1),
      supabase
        .from("lesson_slides")
        .select("slides")
        .eq("lesson_id", step.lesson_id)
        .maybeSingle(),
    ]);

    let deck: Slide[] | null = null;
    const latestSim = (sims ?? [])[0] as { deck_snapshot?: unknown } | undefined;
    if (Array.isArray(latestSim?.deck_snapshot) && latestSim.deck_snapshot.length > 0) {
      deck = latestSim.deck_snapshot as unknown as Slide[];
    } else if (
      slideDeck &&
      Array.isArray((slideDeck as { slides?: unknown }).slides) &&
      (slideDeck as { slides: unknown[] }).slides.length > 0
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

    const prompt = `You are an expert curriculum designer for Amal School, a Sudanese K-12 educational platform for children learning independently on phones.

Generate a "Practice" — a short mastery check a child answers right after watching this one lesson. Every question must come directly from the lesson content below. Questions must be simple, warm and unambiguous; a ${gradeLevel}-grade child answers them alone with no adult nearby.

## Lesson Context
- Lesson: ${lessonTitle}
- Subject: ${subjectName}
- Grade Level: ${gradeLevel}

## Lesson Content
${content}

## Requirements
- Exactly ${clampedCount} questions, every one auto-markable
- Allowed types:
  - "multiple_choice": exactly 4 options, one clearly correct; wrong options plausible but not tricky
  - "true_false": options exactly ["صحيح", "خطأ"], correct_answer one of them
  - "short_answer": ONLY for answers that are a single number (e.g. "7", "45"); correct_answer is that number as digits
- For maths lessons include several "short_answer" number questions; for language lessons prefer multiple choice
- All questions bilingual: Arabic primary (question_text_ar) + English (question_text_en)
- 10 points each; difficulty right for Grade ${gradeLevel}
- Title both languages (title_ar / title_en), like "تدريب: ${lessonTitle}"`;

    const stream = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: true,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "practice_questions",
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
                    options: { type: "array", items: { type: "string" } },
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

          const generated = JSON.parse(fullContent) as {
            title_ar?: string;
            title_en?: string;
            questions?: Array<Record<string, unknown>>;
          };
          const questions = (generated.questions ?? []).map((q, i) => ({
            question_type: q.question_type as "multiple_choice" | "true_false" | "short_answer",
            question_text_ar: (q.question_text_ar as string) || "",
            question_text_en: (q.question_text_en as string) || null,
            options:
              q.question_type === "short_answer" ? null : ((q.options as string[]) ?? null),
            correct_answer: (q.correct_answer as string) || null,
            points: 10,
            display_order: (q.display_order as number) || i + 1,
          }));

          if (questions.length === 0 || questions.some((q) => !q.correct_answer)) {
            throw new Error("Generation produced unusable questions — try again");
          }

          // Create or reuse the practice assignment, then replace its questions.
          let assignmentId = step.practice_assignment_id as string | null;
          const totalPoints = questions.length * 10;
          const titleAr = generated.title_ar || `تدريب: ${lesson.title_ar ?? ""}`;
          const titleEn = generated.title_en || `Practice: ${lesson.title_en ?? ""}`;

          if (assignmentId) {
            const { error: updateError } = await supabase
              .from("homework_assignments")
              .update({
                title_ar: titleAr,
                title_en: titleEn,
                total_points: totalPoints,
                updated_at: new Date().toISOString(),
              })
              .eq("id", assignmentId);
            if (updateError) throw updateError;
            const { error: deleteError } = await supabase
              .from("homework_questions")
              .delete()
              .eq("assignment_id", assignmentId);
            if (deleteError) throw deleteError;
          } else {
            const { data: created, error: insertError } = await supabase
              .from("homework_assignments")
              .insert({
                cohort_id: null,
                subject_id: (lesson as { subject_id?: string | null }).subject_id ?? null,
                lesson_id: step.lesson_id,
                created_by: user.id,
                title_ar: titleAr,
                title_en: titleEn,
                total_points: totalPoints,
                is_published: true,
                is_practice: true,
                is_test: false,
                passing_score: PRACTICE_PASSING_SCORE,
                show_instant_feedback: true,
              })
              .select("id")
              .single();
            if (insertError || !created) throw insertError ?? new Error("Failed to create practice");
            assignmentId = created.id;

            const { error: linkError } = await supabase
              .from("learning_path_steps")
              .update({ practice_assignment_id: assignmentId })
              .eq("id", step.id);
            if (linkError) throw linkError;
          }

          const { error: questionsError } = await supabase.from("homework_questions").insert(
            questions.map((q) => ({ ...q, assignment_id: assignmentId as string }))
          );
          if (questionsError) throw questionsError;

          controller.enqueue(
            encoder.encode(
              "\n" +
                JSON.stringify({
                  assignment_id: assignmentId,
                  title_ar: titleAr,
                  title_en: titleEn,
                  questions,
                })
            )
          );
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
    console.error("generate-practice error:", error);
    const message = error instanceof Error ? error.message : "Generation failed";
    return jsonResponse({ error: message }, 500);
  }
}
