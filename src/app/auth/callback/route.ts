import { createClient } from "@/lib/supabase/server";
import { syncAmalContact } from "@/lib/resend-contacts";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_approved")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "parent") {
          try {
            await syncAmalContact(
              user.email,
              "parent",
              user.user_metadata.email_updates_opt_in === true,
            );
          } catch (syncError) {
            console.error("Resend parent contact sync failed:", syncError);
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/login?error=Could not authenticate`);
}
