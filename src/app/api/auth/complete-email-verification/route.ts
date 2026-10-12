import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAmalContact } from "@/lib/resend-contacts";

/** Sync an email-signup parent after a browser-side OTP confirmation. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "parent") {
    try {
      await syncAmalContact(
        user.email,
        "parent",
        user.user_metadata.email_updates_opt_in === true,
      );
    } catch (error) {
      console.error("Resend parent contact sync failed:", error);
    }
  }

  return new NextResponse(null, { status: 204 });
}
