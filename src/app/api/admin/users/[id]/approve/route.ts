import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

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

    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ error: "Admin approval is not configured" }, { status: 503 });
    }

    const service = createServiceClient();
    const { data: targetAuthData, error: targetAuthError } =
      await service.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuthData.user) {
      return NextResponse.json({ error: "Authentication account not found" }, { status: 404 });
    }

    if (approved) {
      const authUser = targetAuthData.user;
      const isConfirmed = Boolean(authUser.email_confirmed_at || authUser.confirmed_at);
      const isWhatsappOnly = authUser.email?.endsWith("@parents.amalschool.app") ?? false;

      if (!isConfirmed && !isWhatsappOnly) {
        return NextResponse.json(
          { error: "The applicant must verify their email before approval." },
          { status: 409 },
        );
      }

      if (!isConfirmed && isWhatsappOnly) {
        const { error: confirmError } = await service.auth.admin.updateUserById(
          targetUserId,
          { email_confirm: true },
        );
        if (confirmError) {
          console.error("Approve WhatsApp parent confirmation error:", confirmError);
          return NextResponse.json(
            { error: "Could not activate the parent's WhatsApp login" },
            { status: 500 },
          );
        }
      }
    }

    const { data: updated, error: updateError } = await service
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
