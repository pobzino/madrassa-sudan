import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export async function recalculateLessonTaskProgress(
  supabase: SupabaseClient<Database>,
  lessonId: string,
  studentId: string
) {
  const { data: tasks, error: tasksError } = await supabase
    .from("lesson_tasks")
    .select("id, required")
    .eq("lesson_id", lessonId);

  if (tasksError) {
    throw tasksError;
  }

  const taskIds = (tasks || []).map((task) => task.id);
  if (taskIds.length === 0) {
    return;
  }

  const { data: responses, error: responsesError } = await supabase
    .from("lesson_task_responses")
    .select("task_id, completion_score, status")
    .eq("student_id", studentId)
    .in("task_id", taskIds);

  if (responsesError) {
    throw responsesError;
  }

  const requiredTaskIds = new Set(
    (tasks || []).filter((task) => task.required !== false).map((task) => task.id)
  );

  const taskResponses = responses || [];
  const tasksCompleted = taskResponses.filter((response) => response.status === "completed").length;
  const requiredTasksCompleted = taskResponses.filter(
    (response) => response.status === "completed" && requiredTaskIds.has(response.task_id)
  ).length;
  const tasksSkipped = taskResponses.filter((response) => response.status === "skipped").length;
  const tasksTotalScore = taskResponses.reduce(
    (sum, response) => sum + (response.status === "completed" ? response.completion_score || 0 : 0),
    0
  );

  const updatePayload: Database["public"]["Tables"]["lesson_progress"]["Insert"] = {
    student_id: studentId,
    lesson_id: lessonId,
    tasks_completed: tasksCompleted,
    required_tasks_completed: requiredTasksCompleted,
    tasks_skipped: tasksSkipped,
    tasks_total_score: tasksTotalScore,
  };

  const { error: progressError } = await supabase
    .from("lesson_progress")
    .upsert(updatePayload, { onConflict: "student_id,lesson_id" });

  if (progressError) {
    throw progressError;
  }
}
