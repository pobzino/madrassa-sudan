import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Generate a 6-character alphanumeric code
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars (0,O,1,I)
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const relationshipType = body.relationshipType || "parent";

    // Validate relationship type
    const validTypes = ["parent", "guardian", "sibling", "other"];
    if (!validTypes.includes(relationshipType)) {
      return NextResponse.json(
        { error: "Invalid relationship type" },
        { status: 400 }
      );
    }

    // Verify user is a student
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "student") {
      return NextResponse.json(
        { error: "Only students can generate invite codes" },
        { status: 403 }
      );
    }

    // Generate unique code
    let code = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from("guardian_invites")
        .select("code")
        .eq("code", code)
        .single();

      if (!existing) break;
      code = generateInviteCode();
      attempts++;
    }

    if (attempts >= 10) {
      return NextResponse.json(
        { error: "Failed to generate unique code. Please try again." },
        { status: 500 }
      );
    }

    // Create invite (expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: invite, error: insertError } = await supabase
      .from("guardian_invites")
      .insert({
        code,
        student_id: user.id,
        created_by: user.id,
        relationship_type: relationshipType,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating invite:", insertError);
      return NextResponse.json(
        { error: "Failed to create invite" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      code: invite.code,
      expiresAt: invite.expires_at,
      relationshipType: invite.relationship_type,
    });
  } catch (error) {
    console.error("Error in POST /api/guardian/invite:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
