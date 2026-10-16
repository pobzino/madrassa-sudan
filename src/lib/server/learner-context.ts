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
export interface ResolveLearnerOptions {
  /**
   * Verify the session token locally (Supabase getClaims, the project signs
   * with asymmetric ES256 keys) instead of asking the auth server. Saves a
   * round trip to the database region on hot routes such as answering a
   * battle; the token stays valid until it expires (about an hour) even
   * after sign-out elsewhere.
   */
  fastAuth?: boolean;
}

async function authenticatedUserId(supabase: Awaited<ReturnType<typeof createClient>>, fastAuth: boolean): Promise<string | null> {
  if (fastAuth) {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!error && typeof sub === "string" && sub) return sub;
    return null;
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  return !error && user ? user.id : null;
}

export async function resolveLearnerContext(
  request: Request,
  existingClient?: Awaited<ReturnType<typeof createClient>>,
  options: ResolveLearnerOptions = {},
): Promise<LearnerContext> {
  const supabase = existingClient ?? await createClient();
  const userId = await authenticatedUserId(supabase, options.fastAuth === true);
  if (!userId) throw new LearnerContextError(401, "unauthorized");
  const user = { id: userId };

  const learnerId = request.headers.get(LEARNER_HEADER);
  const wantsChild = learnerId !== null && learnerId !== user.id;
  if (wantsChild && !isUuid(learnerId)) throw new LearnerContextError(400, "invalid_learner_id");

  // The account and (for a child) the learner in one round trip; RLS still
  // decides what this session can read.
  const { data: rawProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", wantsChild ? [user.id, learnerId] : [user.id]);
  const profiles = (rawProfiles ?? []) as LearnerProfile[];
  const rawAccount = profiles.find((profile) => profile.id === user.id);
  if (profilesError || !rawAccount) throw new LearnerContextError(403, "account_profile_unavailable");

  const accountProfile = rawAccount;
  if (!wantsChild) {
    return { accountId: user.id, learnerId: user.id, learnerProfile: accountProfile, accountProfile, isSelf: true };
  }
  const canManageChildren = accountProfile.role === "parent" ||
    (accountProfile.role === "admin" && accountProfile.is_approved);
  if (!canManageChildren) throw new LearnerContextError(403, "learner_forbidden");

  const learnerError = null;
  const learnerProfile = profiles.find((profile) => profile.id === learnerId) ?? null;
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
  options: ResolveLearnerOptions = {},
): Promise<{ context: LearnerContext; response: null } | { context: null; response: Response }> {
  try {
    return { context: await resolveLearnerContext(request, existingClient, options), response: null };
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
