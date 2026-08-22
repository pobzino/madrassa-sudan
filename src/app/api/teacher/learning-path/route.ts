import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";

// Keep in sync with path-autolink.ts — a week holds this many lessons.
const LESSONS_PER_WEEK = 2;

/**
 * PUT /api/teacher/learning-path
 *
 * Body: { subject_id: string, ordered_lesson_ids: string[] }
 *
 * Rebuilds a subject's published learning path from a single ordered list of
 * lessons: the list is re-packed into weeks of LESSONS_PER_WEEK, weeks are
 * reused by position (so a week's test_assignment_id stays with Week N), and
 * steps are rewritten. Lessons omitted from the list are removed from the path;
 * lessons added to the list are inserted. Idempotent and deterministic.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const db = supabase as unknown as SupabaseClient;

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

    const body = await request.json();
    const { subject_id, ordered_lesson_ids } = body as {
      subject_id?: string;
      ordered_lesson_ids?: string[];
    };

    if (!subject_id) {
      return NextResponse.json({ error: "subject_id is required" }, { status: 400 });
    }
    if (!Array.isArray(ordered_lesson_ids)) {
      return NextResponse.json({ error: "ordered_lesson_ids must be an array" }, { status: 400 });
    }

    // De-dupe while preserving order (guards against a lesson landing twice).
    const lessonIds = ordered_lesson_ids.filter(
      (id, i) => typeof id === "string" && ordered_lesson_ids.indexOf(id) === i
    );

    // 1. Find (or create) the published path for this subject.
    let { data: path } = await db
      .from("learning_paths")
      .select("id")
      .eq("subject_id", subject_id)
      .eq("is_published", true)
      .maybeSingle<{ id: string }>();

    if (!path) {
      if (lessonIds.length === 0) {
        return NextResponse.json({ success: true, weeks: 0 });
      }
      const { data: subject } = await db
        .from("subjects")
        .select("name_ar, name_en")
        .eq("id", subject_id)
        .maybeSingle<{ name_ar: string | null; name_en: string | null }>();
      const { data: created, error: createErr } = await db
        .from("learning_paths")
        .insert({
          subject_id,
          title_ar: subject?.name_ar || "مسار التعلم",
          title_en: subject?.name_en || "Learning Path",
          is_published: true,
          created_by: user.id,
        })
        .select("id")
        .single<{ id: string }>();
      if (createErr || !created) {
        return NextResponse.json(
          { error: createErr?.message || "Failed to create learning path" },
          { status: 500 }
        );
      }
      path = created;
    }

    const neededWeeks = Math.ceil(lessonIds.length / LESSONS_PER_WEEK);

    // Preserve each lesson's Practice link while steps are repacked. Also pick
    // up a canonical Practice that may have been generated before the lesson
    // was added to this path.
    const [{ data: existingStepPractices }, { data: lessonPractices }] = await Promise.all([
      db
        .from("learning_path_steps")
        .select("lesson_id, practice_assignment_id")
        .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["00000000-0000-0000-0000-000000000000"]),
      db
        .from("homework_assignments")
        .select("id, lesson_id")
        .eq("is_practice", true)
        .in("lesson_id", lessonIds.length > 0 ? lessonIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const practiceByLesson = new Map<string, string>();
    for (const row of existingStepPractices ?? []) {
      if (row.practice_assignment_id) practiceByLesson.set(row.lesson_id, row.practice_assignment_id);
    }
    for (const row of lessonPractices ?? []) {
      if (row.lesson_id) practiceByLesson.set(row.lesson_id, row.id);
    }

    // 2. Load existing weeks (ordered) so we can reuse them by position and keep
    //    their test_assignment_id attached to the same week number.
    const { data: existingWeeks } = await db
      .from("learning_path_weeks")
      .select("id, week_number")
      .eq("path_id", path.id)
      .order("week_number", { ascending: true })
      .returns<Array<{ id: string; week_number: number }>>();

    const weeksByNumber = new Map((existingWeeks ?? []).map((w) => [w.week_number, w.id]));

    // 3. Delete surplus weeks (cascades to their steps).
    const surplus = (existingWeeks ?? []).filter((w) => w.week_number > neededWeeks);
    if (surplus.length > 0) {
      const { error: delErr } = await db
        .from("learning_path_weeks")
        .delete()
        .in(
          "id",
          surplus.map((w) => w.id)
        );
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      surplus.forEach((w) => weeksByNumber.delete(w.week_number));
    }

    // 4. Ensure weeks 1..neededWeeks exist; collect their ids in order.
    const weekIdByNumber = new Map<number, string>();
    for (let n = 1; n <= neededWeeks; n++) {
      const existingId = weeksByNumber.get(n);
      if (existingId) {
        weekIdByNumber.set(n, existingId);
        continue;
      }
      const { data: newWeek, error: weekErr } = await db
        .from("learning_path_weeks")
        .insert({
          path_id: path.id,
          week_number: n,
          title_ar: `الأسبوع ${n}`,
          title_en: `Week ${n}`,
        })
        .select("id")
        .single<{ id: string }>();
      if (weekErr || !newWeek) {
        return NextResponse.json(
          { error: weekErr?.message || "Failed to create week" },
          { status: 500 }
        );
      }
      weekIdByNumber.set(n, newWeek.id);
    }

    // 5. Clean slate: remove all steps in the retained weeks, then re-insert in
    //    the new order (avoids UNIQUE(week_id, sequence) collisions).
    const retainedWeekIds = Array.from(weekIdByNumber.values());
    if (retainedWeekIds.length > 0) {
      const { error: stepDelErr } = await db
        .from("learning_path_steps")
        .delete()
        .in("week_id", retainedWeekIds);
      if (stepDelErr) {
        return NextResponse.json({ error: stepDelErr.message }, { status: 500 });
      }
    }

    // 6. Insert steps for the new ordering.
    if (lessonIds.length > 0) {
      const stepRows = lessonIds.map((lessonId, i) => {
        const weekNumber = Math.floor(i / LESSONS_PER_WEEK) + 1;
        const sequence = (i % LESSONS_PER_WEEK) + 1;
        return {
          week_id: weekIdByNumber.get(weekNumber)!,
          lesson_id: lessonId,
          sequence,
          practice_assignment_id: practiceByLesson.get(lessonId) ?? null,
        };
      });
      const { error: insErr } = await db.from("learning_path_steps").insert(stepRows);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, weeks: neededWeeks, lessons: lessonIds.length });
  } catch (error) {
    console.error("Learning path save error:", error);
    return NextResponse.json({ error: "Failed to save learning path" }, { status: 500 });
  }
}
