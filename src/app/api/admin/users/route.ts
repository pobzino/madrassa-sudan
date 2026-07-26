import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

type UserMetadata = Record<string, unknown>;

async function loadAuthMetadataByUserId() {
  const metadataByUserId = new Map<string, UserMetadata>();

  if (!hasServiceRoleConfig()) {
    return metadataByUserId;
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) {
      console.warn("Admin users metadata lookup failed:", error.message);
      return metadataByUserId;
    }

    for (const authUser of data.users) {
      metadataByUserId.set(authUser.id, authUser.user_metadata as UserMetadata);
    }
  } catch (error) {
    console.warn("Admin users metadata lookup failed:", error);
  }

  return metadataByUserId;
}

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
      .from("profiles")
      .select("id, full_name, role, is_approved, preferred_language, phone, created_at")
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query = query.eq("is_approved", false);
    } else if (filter === "approved") {
      query = query.eq("is_approved", true);
    }
    // filter === "all" → no extra filter

    const { data: users, error } = await query;

    if (error) {
      console.error("Admin users list error:", error);
      return NextResponse.json(
        { error: "Failed to load users" },
        { status: 500 }
      );
    }

    const metadataByUserId = await loadAuthMetadataByUserId();
    const enrichedUsers = (users || []).map((profile) => {
      const metadata = metadataByUserId.get(profile.id) || {};
      return {
        ...profile,
        signup_details: metadata.signup_details ?? null,
        contact_phone: profile.phone ?? metadata.phone ?? null,
      };
    });

    return NextResponse.json({ users: enrichedUsers });
  } catch (error) {
    console.error("Admin users GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
