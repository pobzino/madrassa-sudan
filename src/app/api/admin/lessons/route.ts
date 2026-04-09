import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
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

    const filter = request.nextUrl.searchParams.get("filter") || "pending";

    let query = supabase
      .from("lessons")
      .select(
        `
        id,
        title_ar,
        title_en,
        grade_level,
        is_published,
        submitted_for_review,
        submitted_for_review_at,
        created_at,
        updated_at,
        subject:subjects (
          id,
          name_ar,
          name_en
        ),
        creator:profiles!created_by (
          id,
          full_name
        )
      `
      );

    if (filter === "pending") {
      query = query.eq("submitted_for_review", true).eq("is_published", false);
    } else if (filter === "published") {
      query = query.eq("is_published", true);
    } else if (filter === "draft") {
      query = query.eq("is_published", false).eq("submitted_for_review", false);
    }
    // filter === "all" → no extra filter

    query = query.order("updated_at", { ascending: false });

    const { data: lessons, error } = await query;

    if (error) {
      console.error("Admin lessons list error:", error);
      return NextResponse.json(
        { error: "Failed to load lessons" },
        { status: 500 }
      );
    }

    return NextResponse.json({ lessons });
  } catch (error) {
    console.error("Admin lessons GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
