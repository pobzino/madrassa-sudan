// POST /api/applications — persist the sign-up application details into
// parent_applications / volunteer_applications right after account creation,
// so the team can review and follow up (WhatsApp-first) from the admin panel.
// The caller is the freshly signed-up user; inserts go through the service
// client (no public INSERT policies on these tables).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

const YES_NO = new Set(["yes", "no", "unsure"]);
const toBool = (v: unknown): boolean | null =>
  v === "yes" ? true : v === "no" ? false : null;
const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const body = await request.json();
    const service = createServiceClient();

    if (body.role === "parent" && body.parent) {
      const p = body.parent;
      const whatsapp = str(p.whatsapp, 40);
      const parentName = str(p.parent_name, 200);
      if (!whatsapp || !parentName) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const ages = Array.isArray(p.children_ages)
        ? p.children_ages
            .map((a: unknown) => Number(a))
            .filter((a: number) => Number.isInteger(a) && a >= 3 && a <= 19)
            .slice(0, 12)
        : [];

      const { error } = await service.from("parent_applications").insert({
        auth_user_id: user.id,
        parent_name: parentName,
        profession: str(p.profession, 200),
        whatsapp,
        email: str(p.email, 200),
        sudanese_descent: YES_NO.has(p.sudanese_descent) ? toBool(p.sudanese_descent) : null,
        child_war_affected: YES_NO.has(p.child_war_affected) ? toBool(p.child_war_affected) : null,
        missed_schooling: YES_NO.has(p.missed_schooling) ? toBool(p.missed_schooling) : null,
        out_of_school: YES_NO.has(p.out_of_school) ? toBool(p.out_of_school) : null,
        out_of_school_duration: str(p.out_of_school_duration, 40),
        out_of_school_details: str(p.out_of_school_details),
        children_count: Math.min(Math.max(Number(p.children_count) || 1, 1), 12),
        children_ages: ages,
        can_access_website: YES_NO.has(p.can_access_website) ? toBool(p.can_access_website) : null,
        can_access_zoom: YES_NO.has(p.can_access_zoom) ? toBool(p.can_access_zoom) : null,
        device_type: ["phone", "tablet", "computer", "shared", "none"].includes(p.device_type)
          ? p.device_type
          : null,
        access_notes: str(p.access_notes),
        country: str(p.country, 100),
        city: str(p.city, 100),
        preferred_language: p.preferred_language === "en" ? "en" : "ar",
        terms_accepted_at: new Date().toISOString(),
      });

      if (error) {
        console.error("parent_applications insert failed:", error);
        return NextResponse.json({ error: "Failed to save application" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (body.role === "teacher" && body.volunteer) {
      const v = body.volunteer;
      const name = str(v.name, 200);
      const whatsapp = str(v.whatsapp, 40);
      const email = str(v.email, 200);
      if (!name || !whatsapp || !email) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const allowedAreas = new Set([
        "teaching",
        "tech_platform",
        "content_video",
        "operations",
        "outreach",
        "other",
      ]);
      const areas = Array.isArray(v.areas)
        ? v.areas.filter((a: unknown): a is string => typeof a === "string" && allowedAreas.has(a))
        : [];

      const { error } = await service.from("volunteer_applications").insert({
        name,
        whatsapp,
        email,
        location_city: str(v.location_city, 200),
        location_country: str(v.location_country, 100),
        education_background: str(v.education_background),
        areas,
        other_area: str(v.other_area, 200),
        hours_per_week: str(v.hours_per_week, 60),
        preferred_language: v.preferred_language === "ar" ? "ar" : "en",
      });

      if (error) {
        console.error("volunteer_applications insert failed:", error);
        return NextResponse.json({ error: "Failed to save application" }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid application payload" }, { status: 400 });
  } catch (error) {
    console.error("Applications API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
