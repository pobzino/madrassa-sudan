import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

const ALLOWED_RANGES = new Set([7, 30, 90]);

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_approved")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || !profile.is_approved) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "Analytics is not configured" }, { status: 503 });
  }

  const requestedDays = Number(request.nextUrl.searchParams.get("days") || 30);
  const days = ALLOWED_RANGES.has(requestedDays) ? requestedDays : 30;
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const service = createServiceClient();
  const [analyticsResult, registrationsResult, completionsResult, attemptsResult] = await Promise.all([
    service.rpc("get_analytics_summary", { p_days: days }),
    service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since.toISOString()),
    service
      .from("lesson_progress")
      .select("id", { count: "exact", head: true })
      .eq("completed", true)
      .gte("completed_at", since.toISOString()),
    service
      .from("homework_attempts")
      .select("id", { count: "exact", head: true })
      .gte("submitted_at", since.toISOString()),
  ]);

  if (analyticsResult.error) {
    console.error("Admin analytics summary failed:", analyticsResult.error.message);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }

  return NextResponse.json({
    analytics: analyticsResult.data,
    product: {
      lessonCompletions: completionsResult.count || 0,
      practiceAttempts: attemptsResult.count || 0,
      registrations: registrationsResult.count || 0,
    },
  });
}
