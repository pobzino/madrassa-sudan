import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isDeliverableAmalEmail } from "@/lib/resend-contacts";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export const maxDuration = 60;

type ContactRole = "parent" | "volunteer";

function hasValidSecret(request: NextRequest) {
  const configuredSecret = process.env.RESEND_BACKFILL_SECRET;
  const requestSecret = request.headers.get("x-resend-backfill-secret");
  if (!configuredSecret || !requestSecret) return false;

  const configured = Buffer.from(configuredSecret);
  const supplied = Buffer.from(requestSecret);
  return configured.length === supplied.length && timingSafeEqual(configured, supplied);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function importContacts(role: ContactRole, emails: string[]) {
  const apiKey = process.env.RESEND_API_KEY;
  const segmentId = role === "parent"
    ? process.env.RESEND_AMAL_PARENTS_SEGMENT_ID
    : process.env.RESEND_AMAL_VOLUNTEERS_SEGMENT_ID;
  if (!apiKey || !segmentId) throw new Error("Resend contact import is not configured");

  const csv = ["email,amal_role", ...emails.map((email) => `${csvCell(email)},${role}`)].join("\n");
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `amal-${role}s.csv`);
  form.append("column_map", JSON.stringify({
    email: "email",
    properties: { amal_role: { column: "amal_role", type: "string" } },
  }));
  form.append("on_conflict", "upsert");
  form.append("segments", JSON.stringify([{ id: segmentId }]));

  const response = await fetch("https://api.resend.com/contacts/imports", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await response.json().catch(() => null) as { id?: string } | null;
  if (!response.ok || !payload?.id) {
    throw new Error(`Resend ${role} import failed with status ${response.status}`);
  }

  return payload.id;
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "Supabase service access is not configured" }, { status: 503 });
  }

  try {
    const service = createServiceClient();
    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .select("id, role, is_approved");
    if (profilesError) throw profilesError;

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const contacts = {
      parent: new Set<string>(),
      volunteer: new Set<string>(),
    };

    for (let page = 1; ; page += 1) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;

      for (const user of data.users) {
        const profile = profileById.get(user.id);
        const email = user.email;
        if (!email || !isDeliverableAmalEmail(email)) continue;
        const normalizedEmail = email.trim().toLowerCase();

        if (profile?.role === "parent") {
          contacts.parent.add(normalizedEmail);
        } else if (profile?.role === "teacher" && profile.is_approved) {
          contacts.volunteer.add(normalizedEmail);
        }
      }

      if (data.users.length < 1000) break;
    }

    const parents = [...contacts.parent].sort();
    const volunteers = [...contacts.volunteer].sort();
    const parentImportId = parents.length ? await importContacts("parent", parents) : null;
    const volunteerImportId = volunteers.length ? await importContacts("volunteer", volunteers) : null;

    return NextResponse.json({
      parent: { count: parents.length, importId: parentImportId },
      volunteer: { count: volunteers.length, importId: volunteerImportId },
    });
  } catch (error) {
    console.error("Resend contact backfill failed:", error);
    return NextResponse.json({ error: "Resend contact backfill failed" }, { status: 500 });
  }
}
