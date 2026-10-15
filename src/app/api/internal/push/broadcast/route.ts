import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushMessage } from "@/lib/push-messages";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { languageOf } from "@/lib/server/email-automations";
import { pushConfigured, sendPushToUsers, usersWithPush } from "@/lib/server/push";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

// The push tables aren't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

type Localised = { en: string; ar: string };

const HELLO = {
  title: { en: "👋 Hello from Amal School", ar: "👋 تحية من مدرسة آمال" },
  body: { en: "Your lesson reminders are working. Tap to keep learning.", ar: "تذكيرات الدروس تعمل. اضغطوا لمتابعة التعلّم." },
  url: "/dashboard",
};

function localised(value: unknown, fallback: Localised): Localised {
  const input = value as Partial<Localised> | undefined;
  return typeof input?.en === "string" && typeof input?.ar === "string" ? { en: input.en, ar: input.ar } : fallback;
}

// A one-off notification to every device with reminders on, in each family's
// language. Body (all optional): { title: {en, ar}, body: {en, ar}, url, dryRun }.
export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, process.env.EMAIL_AUTOMATION_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ error: "Push isn't configured" }, { status: 503 });

  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = localised(input.title, HELLO.title);
  const body = localised(input.body, HELLO.body);
  const url = typeof input.url === "string" && input.url.startsWith("/") ? input.url : HELLO.url;

  const client = createServiceClient();
  const db = client as unknown as UntypedClient;
  const subscribers = [...(await usersWithPush(db))];
  const messages = new Map<string, PushMessage>();
  for (let i = 0; i < subscribers.length; i += 100) {
    const { data, error } = await client.from("profiles").select("id, preferred_language").in("id", subscribers.slice(i, i + 100));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const profile of data ?? []) {
      const language = languageOf(profile.preferred_language);
      messages.set(profile.id, { title: title[language], body: body[language], url, tag: "announcement", lang: language });
    }
  }

  if (input.dryRun === true) return NextResponse.json({ subscribers: subscribers.length, eligible: messages.size, dryRun: true });
  const result = await sendPushToUsers(db, messages);
  return NextResponse.json({ subscribers: subscribers.length, ...result });
}
