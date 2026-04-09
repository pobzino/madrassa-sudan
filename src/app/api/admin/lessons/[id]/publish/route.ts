import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLessonPublishReadiness } from "@/lib/lessons/publish-readiness";
import type { Slide } from "@/lib/slides.types";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: lessonId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify caller is an approved admin
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.is_approved) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch lesson with related data for readiness check
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select(
        `
        id,
        grade_level,
        curriculum_topic,
        subject:subjects (
          name_ar,
          name_en
        )
      `
      )
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Validate publish readiness
    const [{ data: lessonSlides }, { data: simRow }] = await Promise.all([
      supabase
        .from("lesson_slides")
        .select("slides")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
      supabase
        .from("lesson_sims")
        .select("id")
        .eq("lesson_id", lessonId)
        .maybeSingle(),
    ]);

    const publishReadiness = getLessonPublishReadiness({
      subject: Array.isArray(lesson.subject) ? lesson.subject[0] ?? null : lesson.subject,
      gradeLevel: lesson.grade_level,
      curriculumTopic: (lesson.curriculum_topic ?? null) as never,
      slides: Array.isArray(lessonSlides?.slides)
        ? (lessonSlides?.slides as unknown as Slide[])
        : [],
      hasSim: !!simRow,
    });

    if (!publishReadiness.canPublish) {
      return NextResponse.json(
        {
          error:
            publishReadiness.blockingReasons[0]?.message ||
            "Lesson does not meet publish requirements.",
          details: publishReadiness.blockingReasons,
        },
        { status: 400 }
      );
    }

    // Publish and clear review flag
    const { error: updateError } = await supabase
      .from("lessons")
      .update({
        is_published: true,
        submitted_for_review: false,
        submitted_for_review_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin lesson publish error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
