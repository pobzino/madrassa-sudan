import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getLearnerContextResult, type LearnerContext } from "@/lib/server/learner-context";
import { createOwnedLearnerAdminClient } from "@/lib/server/learner-admin";
import { getTeacherRole } from "@/lib/server/teacher-lesson-access";
import { milestoneError, type MilestoneAdminClient } from "@/lib/server/milestones/load";

export interface MilestoneLearnerRequest {
  context: LearnerContext;
  admin: MilestoneAdminClient;
  /** Staff trying a milestone as themselves: drafts and locked blocks open, no certificate. */
  preview: boolean;
}

/**
 * The shared opening of every learner milestone route: authenticate, resolve
 * the active learner from the x-amal-learner header, and only then hand out a
 * service client that is rechecked against the account's ownership.
 */
export async function openMilestoneLearnerRequest(
  request: Request,
): Promise<{ ok: true; value: MilestoneLearnerRequest } | { ok: false; response: Response }> {
  const supabase = await createClient();
  const resolved = await getLearnerContextResult(request, supabase);
  if (resolved.response) return { ok: false, response: resolved.response };
  const context = resolved.context;
  const service = await createOwnedLearnerAdminClient(context);
  if (service.error === "service_role_unavailable" || (!service.error && !service.admin)) {
    return { ok: false, response: milestoneError("service_unavailable", 503) };
  }
  if (service.error || !service.admin) {
    return {
      ok: false,
      response: milestoneError(
        service.error === "ownership_check_failed" ? "service_unavailable" : "learner_forbidden",
        service.error === "ownership_check_failed" ? 500 : 403,
      ),
    };
  }
  const preview = context.isSelf && (await getTeacherRole(supabase, context.accountId)) !== null;
  return { ok: true, value: { context, admin: service.admin, preview } };
}
