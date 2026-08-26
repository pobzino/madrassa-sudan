import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isTrustedAnalyticsOrigin } from "@/lib/analytics.validation";
import { whatsappLoginEmail } from "@/lib/whatsapp-login";
import {
  createServiceClient,
  getServiceRoleKey,
  hasServiceRoleConfig,
} from "@/lib/supabase/service";

const answerSchema = z.enum(["yes", "no", "unsure", ""]);

const ParentSignupSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  password: z.string().min(8).max(128),
  whatsapp: z.string().trim().min(7).max(40),
  language: z.enum(["ar", "en"]),
  website: z.string().max(0).optional(),
  parent: z.object({
    profession: z.string().trim().max(200),
    eligibility: z.object({
      sudanese_descent: answerSchema,
      child_affected_by_war: answerSchema,
      child_missed_significant_schooling: answerSchema,
      out_of_school: z.enum(["yes", "no", ""]),
      out_of_school_duration: z.string().trim().max(40),
      out_of_school_details: z.string().trim().max(2000),
    }),
    children_count: z.number().int().min(1).max(8),
    children_ages: z.array(z.coerce.number().int().min(3).max(19)).min(1).max(8),
    access: z.object({
      can_access_website: answerSchema,
      can_access_zoom: answerSchema,
      device_type: z.enum(["phone", "tablet", "computer", "shared", "none", ""]),
      notes: z.string().trim().max(2000),
    }),
    country: z.string().trim().max(100),
    city: z.string().trim().max(100),
    programme_acknowledged: z.literal(true),
  }),
});

function clientKey(request: NextRequest, secret: string) {
  const address =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 240) || "unknown";
  return createHmac("sha256", secret).update(`${address}\n${userAgent}`).digest("hex");
}

export async function POST(request: NextRequest) {
  if (!isTrustedAnalyticsOrigin(
    request.headers.get("origin"),
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  )) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "Parent signup is not configured" }, { status: 503 });
  }

  const parsed = ParentSignupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the required parent signup fields" }, { status: 400 });
  }

  const serviceKey = getServiceRoleKey();
  if (!serviceKey) {
    return NextResponse.json({ error: "Parent signup is not configured" }, { status: 503 });
  }

  const service = createServiceClient();
  // This migration is deployed alongside the route; the generated client types
  // are refreshed separately from production schema changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceDb: any = service;
  const keyHash = clientKey(request, serviceKey);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await serviceDb
    .from("signup_attempts")
    .select("id", { count: "exact", head: true })
    .eq("key_hash", keyHash)
    .gte("created_at", oneHourAgo);

  if (countError) {
    console.error("Parent signup rate-limit check failed:", countError.message);
    return NextResponse.json({ error: "Signup is temporarily unavailable" }, { status: 503 });
  }
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please try again later." },
      { status: 429 },
    );
  }

  const { data: attempt, error: attemptError } = await serviceDb
    .from("signup_attempts")
    .insert({
      key_hash: keyHash,
      role: "parent",
      succeeded: false,
    })
    .select("id")
    .single();
  if (attemptError || !attempt) {
    console.error("Parent signup rate-limit record failed:", attemptError?.message);
    return NextResponse.json({ error: "Signup is temporarily unavailable" }, { status: 503 });
  }

  const input = parsed.data;
  const loginEmail = whatsappLoginEmail(input.whatsapp);
  const { data, error } = await service.auth.admin.createUser({
    email: loginEmail,
    password: input.password,
    email_confirm: false,
    user_metadata: {
      full_name: input.fullName,
      role: "parent",
      preferred_language: input.language,
      phone: input.whatsapp,
      signup_details: {
        role: "parent",
        parent: {
          ...input.parent,
          whatsapp_number: input.whatsapp,
        },
        teacher_volunteer: null,
      },
      consent_given_at: new Date().toISOString(),
    },
  });

  if (error || !data.user) {
    const duplicate = /already|registered|exists/i.test(error?.message || "");
    return NextResponse.json(
      {
        error: duplicate
          ? "An account already exists for this WhatsApp number."
          : "The account could not be created. Please try again.",
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  await serviceDb
    .from("signup_attempts")
    .update({ succeeded: true })
    .eq("id", attempt.id);

  return NextResponse.json({ success: true }, { status: 201 });
}
