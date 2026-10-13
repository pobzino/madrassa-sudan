import { NextRequest, NextResponse } from "next/server";
import { syncAmalContact } from "@/lib/resend-contacts";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .single();

    if (!adminProfile || adminProfile.role !== "admin" || !adminProfile.is_approved) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ error: "Email verification is not configured" }, { status: 503 });
    }

    const { id: targetUserId } = await params;
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", targetUserId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (targetProfile.role !== "parent") {
      return NextResponse.json(
        { error: "Only parent accounts can be verified manually" },
        { status: 400 },
      );
    }

    const service = createServiceClient();
    const { data: targetAuthData, error: targetAuthError } = await service.auth.admin.getUserById(targetUserId);
    const authUser = targetAuthData.user;

    if (targetAuthError || !authUser) {
      return NextResponse.json({ error: "Authentication account not found" }, { status: 404 });
    }

    if (!authUser.email || authUser.email.endsWith("@parents.amalschool.app")) {
      return NextResponse.json(
        { error: "This parent uses WhatsApp login and does not need email verification" },
        { status: 400 },
      );
    }

    const isConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
    if (!isConfirmed) {
      const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, {
        email_confirm: true,
      });

      if (updateError) {
        console.error("Admin parent email verification failed:", updateError);
        return NextResponse.json({ error: "Could not verify the parent's email" }, { status: 500 });
      }
    }

    try {
      await syncAmalContact(
        authUser.email,
        "parent",
        authUser.user_metadata.email_updates_opt_in === true,
      );
    } catch (syncError) {
      console.error("Resend parent contact sync failed after manual verification:", syncError);
    }

    return NextResponse.json({
      user: {
        id: targetUserId,
        emailConfirmed: true,
      },
    });
  } catch (error) {
    console.error("Admin parent email verification API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
