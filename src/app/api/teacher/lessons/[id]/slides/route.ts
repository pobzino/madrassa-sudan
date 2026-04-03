import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import {
  ensureSlidesForSupportedTasks,
  normalizeLessonTaskForm,
  syncTaskFormsFromSlides,
} from "@/lib/lesson-activities";
import type { Slide } from "@/lib/slides.types";
import { createClient } from "@/lib/supabase/server";
import { canManageLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, created_by")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: deck } = await supabase
      .from("lesson_slides")
      .select("*")
      .eq("lesson_id", lessonId)
      .single();

    return NextResponse.json({ slideDeck: deck || null });
  } catch (error) {
    console.error("Load slides error:", error);
    return NextResponse.json({ error: "Failed to load slides" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const { data: lesson } = await supabase
      .from("lessons")
      .select("id, created_by")
      .eq("id", lessonId)
      .single();

    if (!lesson || !canManageLesson({ role, userId: user.id, lessonCreatedBy: lesson.created_by })) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const { slides, language_mode } = body;

    if (!Array.isArray(slides)) {
      return NextResponse.json({ error: "slides must be an array" }, { status: 400 });
    }

    const { data: existingTasks, error: tasksError } = await supabase
      .from("lesson_tasks")
      .select("*")
      .eq("lesson_id", lessonId);

    if (tasksError) {
      console.error("Load lesson tasks error:", tasksError);
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }

    const normalizedTasks = (existingTasks || []).map((task) =>
      normalizeLessonTaskForm({
        ...task,
        linked_slide_id: task.linked_slide_id ?? null,
        required: task.required ?? true,
      })
    );

    const slidesWithActivities = ensureSlidesForSupportedTasks(slides as Slide[], normalizedTasks);
    const syncedTasks = syncTaskFormsFromSlides(slidesWithActivities, normalizedTasks);

    const { error: slidesError } = await supabase
      .from("lesson_slides")
      .upsert(
        {
          lesson_id: lessonId,
          slides: slidesWithActivities,
          language_mode: language_mode || "ar",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id" }
      );

    if (slidesError) {
      console.error("Save slides error:", slidesError);
      return NextResponse.json({ error: slidesError.message }, { status: 500 });
    }

    const upsertRows = syncedTasks.map((task) => ({
      id: task.id,
      lesson_id: lessonId,
      task_type: task.task_type,
      title_ar: task.title_ar,
      title_en: task.title_en || null,
      instruction_ar: task.instruction_ar,
      instruction_en: task.instruction_en || null,
      timestamp_seconds: task.timestamp_seconds,
      task_data: task.task_data as Json,
      timeout_seconds: task.timeout_seconds ?? null,
      is_skippable: task.is_skippable,
      points: task.points,
      display_order: task.display_order ?? task.timestamp_seconds,
      required: task.required,
      linked_slide_id: task.linked_slide_id ?? null,
    }));

    if (upsertRows.length > 0) {
      const { error: taskUpsertError } = await supabase
        .from("lesson_tasks")
        .upsert(upsertRows, { onConflict: "id" });

      if (taskUpsertError) {
        console.error("Save lesson tasks error:", taskUpsertError);
        return NextResponse.json({ error: taskUpsertError.message }, { status: 500 });
      }
    }

    const syncedTaskIds = new Set(syncedTasks.map((task) => task.id));
    const removedTaskIds = (existingTasks || [])
      .map((task) => task.id)
      .filter((taskId) => !syncedTaskIds.has(taskId));

    if (removedTaskIds.length > 0) {
      const { error: taskDeleteError } = await supabase
        .from("lesson_tasks")
        .delete()
        .eq("lesson_id", lessonId)
        .in("id", removedTaskIds);

      if (taskDeleteError) {
        console.error("Delete lesson tasks error:", taskDeleteError);
        return NextResponse.json({ error: taskDeleteError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, slides: slidesWithActivities, tasks: syncedTasks });
  } catch (error) {
    console.error("Save slides error:", error);
    return NextResponse.json({ error: "Failed to save slides" }, { status: 500 });
  }
}
