import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Verify lesson exists
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Reject: clear review flag, lesson reverts to draft
    const { error: updateError } = await supabase
      .from("lessons")
      .update({
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
    console.error("Admin lesson reject error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
