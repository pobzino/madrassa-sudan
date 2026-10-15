import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearnerContext } from "@/lib/server/learner-context";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

// New profile ownership columns are added by the accompanying migration and
// aren't yet present in every generated Database type checkout.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LearnerAdminClient = SupabaseClient<any>;

/**
 * Give a trusted server writer an elevated client only after rechecking that
 * the resolved learner still belongs to the authenticated account.
 */
export async function createOwnedLearnerAdminClient(context: Pick<LearnerContext, "accountId" | "learnerId" | "isSelf">) {
  if (!hasServiceRoleConfig()) return { admin: null, error: "service_role_unavailable" } as const;

  const admin = createServiceClient() as unknown as LearnerAdminClient;
  let query = admin.from("profiles").select("id").eq("id", context.learnerId);
  query = context.isSelf
    ? query.eq("id", context.accountId).eq("auth_user_id", context.accountId).is("parent_account_id", null)
    : query.eq("parent_account_id", context.accountId).eq("role", "student").is("auth_user_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return { admin: null, error: "ownership_check_failed" } as const;
  if (!data) return { admin: null, error: "learner_not_owned" } as const;
  return { admin, error: null } as const;
}
