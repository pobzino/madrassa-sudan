import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { remindersOnMessage } from "@/lib/push-messages";
import { languageOf } from "@/lib/server/email-automations";
import { pushConfigured, sendPushToDevice } from "@/lib/server/push";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Saves (POST) or removes (DELETE) this device's push subscription for the
// signed-in user. With `confirm: true`, sends a "reminders are on" push so
// the family sees straight away that it works.

// The push tables aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

type Parsed = { endpoint: string; p256dh: string; auth: string };

function parseSubscription(body: unknown): Parsed | null {
  if (!body || typeof body !== "object") return null;
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, p256dh, auth };
}

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function POST(request: NextRequest) {
  if (!pushConfigured()) return NextResponse.json({ error: "Reminders aren't available" }, { status: 503 });
  const { supabase, user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const subscription = parseSubscription(body);
  if (!subscription) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });

  const db = createServiceClient() as unknown as UntypedClient;
  const { data: saved, error } = await db
    .from("push_subscriptions")
    .upsert({ user_id: user.id, ...subscription, last_seen_at: new Date().toISOString() }, { onConflict: "endpoint" })
    .select("id, user_id, endpoint, p256dh, auth")
    .single();
  if (error || !saved) {
    console.error("Saving push subscription failed:", error);
    return NextResponse.json({ error: "Could not turn reminders on" }, { status: 500 });
  }

  if (body?.confirm === true) {
    let language: "ar" | "en" | null = body.language === "en" || body.language === "ar" ? body.language : null;
    if (!language) {
      const { data: profile } = await supabase.from("profiles").select("preferred_language").eq("id", user.id).maybeSingle();
      language = languageOf(profile?.preferred_language);
    }
    await sendPushToDevice(saved, remindersOnMessage(language));
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { user } = await signedInUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const db = createServiceClient() as unknown as UntypedClient;
  await db.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
