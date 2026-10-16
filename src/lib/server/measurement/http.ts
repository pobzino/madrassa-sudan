import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeasurementErrorCode } from "@/lib/measurement/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

// The measurement tables / functions are newer than database.types.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MeasurementAdminClient = SupabaseClient<any>;

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function measurementJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export function measurementError(code: MeasurementErrorCode, status: number, message?: string) {
  return measurementJson(message ? { error: code, message } : { error: code }, status);
}

/**
 * A signed-in caller and a service client. Who may see what is decided by the
 * database functions the routes call (p_actor = this user), which raise
 * impact_forbidden / learner_forbidden / class_forbidden otherwise.
 */
export async function openSignedInRequest(): Promise<
  { ok: true; userId: string; admin: MeasurementAdminClient; supabase: Awaited<ReturnType<typeof createClient>> } | { ok: false; response: Response }
> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, response: measurementError("unauthorized", 401) };
  if (!hasServiceRoleConfig()) return { ok: false, response: measurementError("service_unavailable", 503) };
  return { ok: true, userId: user.id, admin: createServiceClient() as unknown as MeasurementAdminClient, supabase };
}

/** The error tokens the measurement / class functions raise, as HTTP responses. */
export function mapMeasurementRpcError(error: { message?: string } | null): Response {
  const message = error?.message ?? "";
  const table: Array<[string, MeasurementErrorCode, number]> = [
    ["impact_forbidden", "impact_forbidden", 403],
    ["reset_forbidden", "reset_forbidden", 403],
    ["learner_forbidden", "learner_forbidden", 403],
    ["class_forbidden", "class_forbidden", 403],
    ["invalid_query", "invalid_query", 400],
    ["invalid_code", "invalid_code", 400],
    ["already_member", "already_member", 409],
    ["milestone_not_found", "not_found", 404],
    ["not_found", "not_found", 404],
  ];
  for (const [token, code, status] of table) if (message.includes(token)) return measurementError(code, status);
  if (message) console.error("Measurement RPC failed:", message);
  return measurementError("service_unavailable", 500);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
