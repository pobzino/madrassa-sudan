import { NextRequest, NextResponse } from "next/server";
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

    // Upsert: insert or update on conflict
    const { error } = await supabase
      .from("lesson_slides")
      .upsert(
        {
          lesson_id: lessonId,
          slides,
          language_mode: language_mode || "ar",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id" }
      );

    if (error) {
      console.error("Save slides error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save slides error:", error);
    return NextResponse.json({ error: "Failed to save slides" }, { status: 500 });
  }
}
