import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export const config = { schedule: "@daily" };

export async function handler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return { statusCode: 500, body: "Missing Supabase configuration" };
  }

  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase
    .from("analytics_events")
    .delete()
    .lt("created_at", cutoff.toISOString());

  if (error) {
    console.error("Scheduled analytics cleanup failed:", error.message);
    return { statusCode: 500, body: "Cleanup failed" };
  }

  // Generated database types are refreshed separately after remote migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceDb: any = supabase;
  const signupCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { error: signupCleanupError } = await serviceDb
    .from("signup_attempts")
    .delete()
    .lt("created_at", signupCutoff);

  if (signupCleanupError) {
    console.error("Scheduled signup-attempt cleanup failed:", signupCleanupError.message);
    return { statusCode: 500, body: "Cleanup failed" };
  }

  return { statusCode: 204, body: "" };
}
