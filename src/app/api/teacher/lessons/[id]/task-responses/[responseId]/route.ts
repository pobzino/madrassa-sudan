import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeTaskType } from "@/lib/lesson-activities";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { recalculateLessonTaskProgress } from "@/lib/server/lesson-task-progress";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

const ReviewSchema = z.object({
  review_status: z.enum(["pending_review", "accepted", "needs_retry"]),
  feedback: z.string().trim().max(2000).optional().nullable(),
  score: z.number().min(0).max(1).optional(),
});

function toResponsePayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...value } as Record<string, unknown>)
    : {};
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  const { id: lessonId, responseId } = await params;
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

  const validation = ReviewSchema.safeParse(await request.json().catch(() => ({})));
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid input", details: validation.error.issues },
      { status: 400 }
    );
  }

  const service = createServiceClient();
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

  const { data: responseRow, error: responseError } = await service
    .from("lesson_task_responses")
    .select("id, student_id, status, response_data, task_id")
    .eq("id", responseId)
    .single();

  if (responseError || !responseRow) {
    return NextResponse.json({ error: "Response not found" }, { status: 404 });
  }

  const { data: taskRow, error: taskError } = await service
    .from("lesson_tasks")
    .select("id, lesson_id, task_type")
    .eq("id", responseRow.task_id)
    .single();

  if (taskError || !taskRow || taskRow.lesson_id !== lessonId) {
    return NextResponse.json({ error: "Task not found for this lesson" }, { status: 404 });
  }

  if (normalizeTaskType(taskRow.task_type) !== "free_response") {
    return NextResponse.json(
      { error: "Only free response activities can be teacher-reviewed." },
      { status: 400 }
    );
  }

  const { review_status, feedback, score } = validation.data;
  const normalizedScore =
    review_status === "accepted" ? score ?? 1 : review_status === "needs_retry" ? 0 : 0;

  const nextPayload = {
    ...toResponsePayload(responseRow.response_data),
    teacher_review: {
      status: review_status,
      feedback: feedback?.trim() || null,
      score: normalizedScore,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    },
  };

  const { data: updatedRow, error: updateError } = await service
    .from("lesson_task_responses")
    .update({
      response_data: nextPayload,
      completion_score: normalizedScore,
    })
    .eq("id", responseId)
    .select("id, task_id, student_id, status, completion_score, response_data, time_spent_seconds, attempts, updated_at")
    .single();

  if (updateError || !updatedRow) {
    return NextResponse.json({ error: updateError?.message || "Failed to save review" }, { status: 500 });
  }

  try {
    await recalculateLessonTaskProgress(service, lessonId, responseRow.student_id);
  } catch (progressError) {
    return NextResponse.json(
      { error: progressError instanceof Error ? progressError.message : "Failed to refresh progress" },
      { status: 500 }
    );
  }

  return NextResponse.json({ response: updatedRow });
}
