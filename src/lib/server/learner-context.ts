import "server-only";

import { headers } from "next/headers";
import { isUuid, LEARNER_HEADER } from "@/lib/learners/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type LearnerProfile = Database["public"]["Tables"]["profiles"]["Row"] & {
  auth_user_id?: string | null;
  parent_account_id?: string | null;
  learner_name?: string | null;
  learner_avatar?: string | null;
  archived_at?: string | null;
};

export interface LearnerContext {
  accountId: string;
  learnerId: string;
  learnerProfile: LearnerProfile;
  accountProfile: LearnerProfile;
  isSelf: boolean;
}

export class LearnerContextError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 500,
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "LearnerContextError";
  }
}

/**
 * Authenticate from the request's Supabase session first, then resolve the
 * optional learner selector. The selector is never an authentication token.
 * Routes may pass an existing cookie-backed client to avoid creating another.
 */
export async function resolveLearnerContext(
  request: Request,
  existingClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<LearnerContext> {
  const supabase = existingClient ?? await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new LearnerContextError(401, "unauthorized");

  const { data: rawAccount, error: accountError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (accountError || !rawAccount) throw new LearnerContextError(403, "account_profile_unavailable");

  const accountProfile = rawAccount as LearnerProfile;
  const learnerId = request.headers.get(LEARNER_HEADER);
  if (learnerId === null || learnerId === user.id) {
    return { accountId: user.id, learnerId: user.id, learnerProfile: accountProfile, accountProfile, isSelf: true };
  }
  if (!isUuid(learnerId)) throw new LearnerContextError(400, "invalid_learner_id");
  const canManageChildren = accountProfile.role === "parent" ||
    (accountProfile.role === "admin" && accountProfile.is_approved);
  if (!canManageChildren) throw new LearnerContextError(403, "learner_forbidden");

  const { data: rawLearner, error: learnerError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", learnerId)
    .maybeSingle();

  const learnerProfile = rawLearner as LearnerProfile | null;
  if (
    learnerError ||
    !learnerProfile ||
    learnerProfile.parent_account_id !== user.id ||
    learnerProfile.role !== "student" ||
    learnerProfile.auth_user_id !== null ||
    learnerProfile.archived_at != null
  ) throw new LearnerContextError(403, "learner_forbidden");
  return {
    accountId: user.id,
    learnerId,
    learnerProfile,
    accountProfile,
    isSelf: false,
  };
}

export function learnerContextResponse(error: unknown): Response | null {
  if (!(error instanceof LearnerContextError)) return null;
  return Response.json({ error: error.code }, { status: error.status });
}

export async function getLearnerContextResult(
  request: Request,
  existingClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<{ context: LearnerContext; response: null } | { context: null; response: Response }> {
  try {
    return { context: await resolveLearnerContext(request, existingClient), response: null };
  } catch (error) {
    return {
      context: null,
      response: learnerContextResponse(error) ?? Response.json({ error: "learner_context_unavailable" }, { status: 500 }),
    };
  }
}

/** Resolve the same selector for an authenticated Server Component data loader. */
export async function resolveLearnerContextFromHeaders(
  existingClient?: Awaited<ReturnType<typeof createClient>>,
): Promise<LearnerContext> {
  const requestHeaders = new Headers(await headers());
  const request = new Request("http://localhost", { headers: requestHeaders });
  return resolveLearnerContext(request, existingClient);
}
