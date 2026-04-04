import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeTaskType } from "@/lib/lesson-activities";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { getOpenAIClient } from "@/lib/ai/openai-client";

const AiGradeSchema = z.object({
  response_ids: z.array(z.string().uuid()).min(1).max(20),
});

interface AiGradeSuggestion {
  response_id: string;
  review_status: "accepted" | "needs_retry";
  feedback: string;
  score: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: lessonId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await getTeacherRole(supabase, user.id);
  if (!role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const validation = AiGradeSchema.safeParse(await request.json().catch(() => ({})));
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.issues },
      { status: 400 }
    );
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json(
      { error: "AI grading is not configured (missing OPENAI_API_KEY)" },
      { status: 503 }
    );
  }

  const service = createServiceClient();

  // Verify lesson access
  const { data: lesson, error: lessonError } = await service
    .from("lessons")
    .select("created_by")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  if (!canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { response_ids } = validation.data;

  // Load all responses
  const { data: responses, error: responsesError } = await service
    .from("lesson_task_responses")
    .select("id, task_id, response_data")
    .in("id", response_ids);

  if (responsesError || !responses) {
    return NextResponse.json({ error: "Failed to load responses" }, { status: 500 });
  }

  // Load associated tasks
  const taskIds = [...new Set(responses.map((r) => r.task_id))];
  const { data: tasks, error: tasksError } = await service
    .from("lesson_tasks")
    .select("id, lesson_id, task_type, task_data")
    .in("id", taskIds);

  if (tasksError || !tasks) {
    return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
  }

  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Grade each response in parallel
  const results = await Promise.allSettled(
    responses.map(async (response): Promise<AiGradeSuggestion> => {
      const task = taskMap.get(response.task_id);
      if (!task || task.lesson_id !== lessonId) {
        throw new Error(`Task not found for response ${response.id}`);
      }

      if (normalizeTaskType(task.task_type) !== "free_response") {
        throw new Error(`Response ${response.id} is not a free response task`);
      }

      const responseData =
        response.response_data && typeof response.response_data === "object"
          ? (response.response_data as Record<string, unknown>)
          : {};
      const studentAnswer = String(responseData.answer || "").trim();

      const taskData =
        task.task_data && typeof task.task_data === "object"
          ? (task.task_data as Record<string, unknown>)
          : {};
      const modelAnswer =
        String(taskData.expected_answer_en || taskData.expected_answer_ar || "").trim();
      const questionTitle =
        String(taskData.title_en || taskData.title_ar || "").trim();

      if (!studentAnswer) {
        return {
          response_id: response.id,
          review_status: "needs_retry",
          feedback: "No answer was provided.",
          score: 0,
        };
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a kind, encouraging teacher assistant grading a young student's (age 5-6) free response answer. Be generous — partial credit is encouraged. If the answer shows genuine understanding, accept it.

Return ONLY a JSON object:
{
  "review_status": "accepted" or "needs_retry",
  "feedback": "Short encouraging feedback in the same language as the student answer (max 100 chars)",
  "score": number from 0.0 to 1.0
}`,
          },
          {
            role: "user",
            content: `Question: ${questionTitle}\nModel answer: ${modelAnswer || "(no model answer provided)"}\nStudent answer: ${studentAnswer}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content || "{}";
      let parsed: { review_status?: string; feedback?: string; score?: number };
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {};
      }

      const reviewStatus =
        parsed.review_status === "needs_retry" ? "needs_retry" : "accepted";
      const score = typeof parsed.score === "number"
        ? Math.max(0, Math.min(1, parsed.score))
        : reviewStatus === "accepted"
          ? 1
          : 0;

      return {
        response_id: response.id,
        review_status: reviewStatus,
        feedback: String(parsed.feedback || "").slice(0, 200),
        score,
      };
    })
  );

  const suggestions: AiGradeSuggestion[] = [];
  const errors: { response_id: string; error: string }[] = [];

  results.forEach((settledResult, index) => {
    if (settledResult.status === "fulfilled") {
      suggestions.push(settledResult.value);
    } else {
      errors.push({
        response_id: response_ids[index],
        error:
          settledResult.reason instanceof Error
            ? settledResult.reason.message
            : "Unknown error",
      });
    }
  });

  return NextResponse.json({ suggestions, errors });
}
