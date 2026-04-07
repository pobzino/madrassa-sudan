import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: targetUserId } = await params;
    const body = await request.json();
    const { approved } = body as { approved: boolean };

    if (typeof approved !== "boolean") {
      return NextResponse.json(
        { error: "Missing required field: approved (boolean)" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({ is_approved: approved })
      .eq("id", targetUserId)
      .select("id, full_name, role, is_approved")
      .single();

    if (updateError) {
      console.error("Approve user error:", updateError);
      return NextResponse.json(
        { error: "Failed to update user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Admin approve API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
