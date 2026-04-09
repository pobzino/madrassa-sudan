import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role, is_approved")
    .eq("id", user.id)
    .single();

  if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.is_approved) {
    return null;
  }

  return user;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const admin = await verifyAdmin(supabase);

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: cohortId } = await params;
    const body = await request.json();

    const allowedFields = ["name", "description", "grade_level", "is_active"] as const;
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data: updated, error } = await supabase
      .from("cohorts")
      .update(updates)
      .eq("id", cohortId)
      .select("id, name, description, grade_level, join_code, is_active")
      .single();

    if (error) {
      console.error("Admin update cohort error:", error);
      return NextResponse.json(
        { error: "Failed to update cohort" },
        { status: 500 }
      );
    }

    return NextResponse.json({ cohort: updated });
  } catch (error) {
    console.error("Admin cohort PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const admin = await verifyAdmin(supabase);

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: cohortId } = await params;

    const { error } = await supabase
      .from("cohorts")
      .delete()
      .eq("id", cohortId);

    if (error) {
      console.error("Admin delete cohort error:", error);
      return NextResponse.json(
        { error: "Failed to delete cohort" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin cohort DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
