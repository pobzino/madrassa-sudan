import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}
