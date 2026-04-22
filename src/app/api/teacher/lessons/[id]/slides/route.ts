import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import {
  normalizeLessonTaskForm,
  reconcileEditedSlidesWithTasks,
} from "@/lib/lesson-activities";
import type { Slide } from "@/lib/slides.types";
import { createClient } from "@/lib/supabase/server";
import { canEditAssignedLesson, getTeacherRole } from "@/lib/server/teacher-lesson-access";

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

    const canEdit = lesson
      ? await canEditAssignedLesson({
          supabase,
          role,
          userId: user.id,
          lessonId,
          lessonCreatedBy: lesson.created_by,
        })
      : false;

    if (!lesson) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit this lesson." },
        { status: 403 }
      );
    }

    const { data: deck } = await supabase
      .from("lesson_slides")
      .select("*")
      .eq("lesson_id", lessonId)
      .maybeSingle();

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

    const canEdit = lesson
      ? await canEditAssignedLesson({
          supabase,
          role,
          userId: user.id,
          lessonId,
          lessonCreatedBy: lesson.created_by,
        })
      : false;

    if (!lesson) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to edit this lesson." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { slides, language_mode, expected_updated_at } = body;

    if (!Array.isArray(slides)) {
      return NextResponse.json({ error: "slides must be an array" }, { status: 400 });
    }

    const { data: existingDeck, error: existingDeckError } = await supabase
      .from("lesson_slides")
      .select("updated_at")
      .eq("lesson_id", lessonId)
      .maybeSingle();

    if (existingDeckError) {
      console.error("Load existing slide deck error:", existingDeckError);
      return NextResponse.json({ error: existingDeckError.message }, { status: 500 });
    }

    if (
      typeof expected_updated_at === "string" &&
      existingDeck?.updated_at &&
      expected_updated_at !== existingDeck.updated_at
    ) {
      return NextResponse.json(
        {
          error: "This lesson was updated by someone else. Reload before saving.",
          code: "SLIDE_DECK_CONFLICT",
          updated_at: existingDeck.updated_at,
        },
        { status: 409 }
      );
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

    const { slides: slidesWithActivities, tasks: syncedTasks } = reconcileEditedSlidesWithTasks(
      slides as Slide[],
      normalizedTasks
    );

    const savedAt = new Date().toISOString();
    let savedDeck: { slides: Json | null; updated_at: string | null } | null = null;
    const savePayload = {
      lesson_id: lessonId,
      slides: slidesWithActivities as unknown as Json,
      language_mode: language_mode || "ar",
      updated_at: savedAt,
    };

    if (existingDeck) {
      let saveQuery = supabase
        .from("lesson_slides")
        .update(savePayload)
        .eq("lesson_id", lessonId);

      if (typeof expected_updated_at === "string") {
        saveQuery = saveQuery.eq("updated_at", expected_updated_at);
      }

      const { data: updatedDeck, error: slidesError } = await saveQuery
        .select("slides, updated_at")
        .maybeSingle();

      if (slidesError) {
        console.error("Save slides error:", slidesError);
        return NextResponse.json({ error: slidesError.message }, { status: 500 });
      }

      if (!updatedDeck) {
        return NextResponse.json(
          {
            error: "This lesson was updated by someone else. Reload before saving.",
            code: "SLIDE_DECK_CONFLICT",
          },
          { status: 409 }
        );
      }

      savedDeck = updatedDeck;
    } else {
      const { data: insertedDeck, error: slidesError } = await supabase
        .from("lesson_slides")
        .insert(savePayload)
        .select("slides, updated_at")
        .single();

      if (slidesError) {
        if (slidesError.code === "23505") {
          return NextResponse.json(
            {
              error: "This lesson was updated by someone else. Reload before saving.",
              code: "SLIDE_DECK_CONFLICT",
            },
            { status: 409 }
          );
        }
        console.error("Save slides error:", slidesError);
        return NextResponse.json({ error: slidesError.message }, { status: 500 });
      }

      savedDeck = insertedDeck;
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

    return NextResponse.json({
      success: true,
      slides: (Array.isArray(savedDeck?.slides)
        ? savedDeck.slides
        : slidesWithActivities) as unknown as Slide[],
      tasks: syncedTasks,
      updated_at: savedDeck?.updated_at || savedAt,
    });
  } catch (error) {
    console.error("Save slides error:", error);
    return NextResponse.json({ error: "Failed to save slides" }, { status: 500 });
  }
}
