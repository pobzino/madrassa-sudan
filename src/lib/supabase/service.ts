import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export function getServiceRoleKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function hasServiceRoleConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getServiceRoleKey());
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
}
