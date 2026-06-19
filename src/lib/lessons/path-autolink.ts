import type { SupabaseClient } from "@supabase/supabase-js";

// A week groups roughly this many lessons before a new week is started.
const LESSONS_PER_WEEK = 2;

/**
 * Appends a newly published lesson to its subject's published learning path so
 * the student lesson tree stays in sync without manual curation.
 *
 * Behaviour:
 *  - Finds the published learning_path for the lesson's subject (creates one if
 *    none exists yet).
 *  - Skips silently if the lesson is already a step anywhere in that path.
 *  - Fills the last week up to LESSONS_PER_WEEK lessons, otherwise starts a new
 *    week, then appends the lesson as the next step in that week.
 *
 * Best-effort: callers should wrap this in try/catch and never block publishing
 * on a linking failure. Relies on the caller's RLS context (teacher/admin), so
 * no service-role client is required.
 */
export async function linkLessonToLearningPath(
  client: SupabaseClient,
  lessonId: string,
  subjectId: string | null | undefined,
  options?: { createdBy?: string | null }
): Promise<{ linked: boolean; reason?: string }> {
  if (!subjectId) return { linked: false, reason: "no-subject" };

  const db = client as unknown as SupabaseClient;

  // 1. Find (or create) the published path for this subject.
  let { data: path } = await db
    .from("learning_paths")
    .select("id")
    .eq("subject_id", subjectId)
    .eq("is_published", true)
    .maybeSingle<{ id: string }>();

  if (!path) {
    const { data: subject } = await db
      .from("subjects")
      .select("name_ar, name_en")
      .eq("id", subjectId)
      .maybeSingle<{ name_ar: string | null; name_en: string | null }>();

    const { data: created, error: createErr } = await db
      .from("learning_paths")
      .insert({
        subject_id: subjectId,
        title_ar: subject?.name_ar || "مسار التعلم",
        title_en: subject?.name_en || "Learning Path",
        is_published: true,
        created_by: options?.createdBy ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (createErr || !created) {
      return { linked: false, reason: createErr?.message || "path-create-failed" };
    }
    path = created;
  }

  // 2. Already linked anywhere in this path? Then we're done.
  const { data: existingWeeks } = await db
    .from("learning_path_weeks")
    .select("id, week_number")
    .eq("path_id", path.id)
    .order("week_number", { ascending: true })
    .returns<Array<{ id: string; week_number: number }>>();

  const weeks = existingWeeks ?? [];

  if (weeks.length > 0) {
    const { data: existingStep } = await db
      .from("learning_path_steps")
      .select("id")
      .eq("lesson_id", lessonId)
      .in(
        "week_id",
        weeks.map((w) => w.id)
      )
      .maybeSingle<{ id: string }>();

    if (existingStep) return { linked: false, reason: "already-linked" };
  }

  // 3. Decide which week to append to.
  const lastWeek = weeks[weeks.length - 1] ?? null;
  let targetWeekId: string | null = null;
  let nextSequence = 1;

  if (lastWeek) {
    const { data: lastWeekSteps } = await db
      .from("learning_path_steps")
      .select("sequence")
      .eq("week_id", lastWeek.id)
      .order("sequence", { ascending: false })
      .returns<Array<{ sequence: number }>>();

    const stepCount = lastWeekSteps?.length ?? 0;
    if (stepCount < LESSONS_PER_WEEK) {
      targetWeekId = lastWeek.id;
      nextSequence = (lastWeekSteps?.[0]?.sequence ?? 0) + 1;
    }
  }

  // 4. Start a new week when there's no room in the last one.
  if (!targetWeekId) {
    const nextWeekNumber = (lastWeek?.week_number ?? 0) + 1;
    const { data: newWeek, error: weekErr } = await db
      .from("learning_path_weeks")
      .insert({
        path_id: path.id,
        week_number: nextWeekNumber,
        title_ar: `الأسبوع ${nextWeekNumber}`,
        title_en: `Week ${nextWeekNumber}`,
      })
      .select("id")
      .single<{ id: string }>();

    if (weekErr || !newWeek) {
      return { linked: false, reason: weekErr?.message || "week-create-failed" };
    }
    targetWeekId = newWeek.id;
    nextSequence = 1;
  }

  // 5. Append the step.
  const { error: stepErr } = await db.from("learning_path_steps").insert({
    week_id: targetWeekId,
    lesson_id: lessonId,
    sequence: nextSequence,
  });

  if (stepErr) {
    return { linked: false, reason: stepErr.message };
  }

  return { linked: true };
}
