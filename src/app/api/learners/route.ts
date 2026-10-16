import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isLearnerAvatar, learnerDisplayName, MAX_LEARNER_NAME_LENGTH } from "@/lib/learners/types";
import { LearnerContextError, resolveLearnerContext } from "@/lib/server/learner-context";

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_LEARNER_NAME_LENGTH),
  age: z.number().int().min(3).max(19).nullable().optional(),
  avatar: z.string().nullable().optional().refine((value) => value === undefined || value === null || isLearnerAvatar(value)),
}).strict();

function toLearner(profile: Record<string, unknown>, isSelf: boolean) {
  const learnerName = typeof profile.learner_name === "string" ? profile.learner_name.trim() : "";
  const fullName = typeof profile.full_name === "string" ? profile.full_name.trim() : "";
  const name = learnerName || (isSelf ? fullName : "");
  return {
    id: String(profile.id),
    name,
    avatar: typeof profile.learner_avatar === "string" ? profile.learner_avatar : null,
    gradeLevel: typeof profile.grade_level === "number" ? profile.grade_level : null,
    isSelf,
    needsSetup: !isSelf && !name,
  };
}

function knownError(error: unknown) {
  if (error instanceof LearnerContextError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const context = await resolveLearnerContext(request, supabase);
    const account = context.accountProfile as Record<string, unknown>;
    const isParent = account.role === "parent";
    const canManageChildren = isParent || (account.role === "admin" && account.is_approved === true);

    const { data: rawChildren, error: childrenError } = canManageChildren
      ? await supabase.from("profiles").select("*").eq("parent_account_id", context.accountId).order("created_at", { ascending: true }).order("id", { ascending: true })
      : { data: [], error: null };
    if (childrenError) return NextResponse.json({ error: "learners_unavailable" }, { status: 500 });

    const learners = [toLearner(account, true), ...(rawChildren ?? []).map((row) => toLearner(row as unknown as Record<string, unknown>, false))];
    let suggestedChildren: { name: string | null; age: number | null }[] = [];
    let selfSuggestedAge: number | null = null;

    if (isParent && (rawChildren?.length ?? 0) === 0) {
      // The schema migration that adds the consumption marker lands with the
      // database slice, so read this additive column through a loose client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as unknown as SupabaseClient<any>;
      const { data: intake, error: intakeError } = await db
        .from("parent_applications")
        .select("children_ages, learner_intake_consumed_at")
        .eq("auth_user_id", context.accountId)
        .maybeSingle();
      if (intakeError) return NextResponse.json({ error: "learners_unavailable" }, { status: 500 });
      const ages: number[] = Array.isArray(intake?.children_ages)
        ? intake.children_ages.filter((age: unknown): age is number => typeof age === "number" && Number.isInteger(age) && age >= 3 && age <= 19)
        : [];
      if (!intake?.learner_intake_consumed_at) {
        selfSuggestedAge = ages[0] ?? null;
        suggestedChildren = ages.map((age) => ({ name: null, age }));
      }
    }

    const response: Record<string, unknown> = {
      accountId: context.accountId,
      learners,
    };
    response.isParent = isParent;
    response.canManageChildren = canManageChildren;
    if (canManageChildren) {
      response.canHaveChildren = (rawChildren?.length ?? 0) < 8;
      response.needsSelfName = !learnerDisplayName(account as { full_name?: string | null; learner_name?: string | null });
      response.selfSuggestedAge = selfSuggestedAge;
      response.suggestedChildren = suggestedChildren;
    }
    return NextResponse.json(response);
  } catch (error) {
    return knownError(error) ?? NextResponse.json({ error: "learners_unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const context = await resolveLearnerContext(request, supabase);
    const canManageChildren = context.accountProfile.role === "parent" ||
      (context.accountProfile.role === "admin" && context.accountProfile.is_approved);
    if (!canManageChildren) return NextResponse.json({ error: "parent_required" }, { status: 403 });

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });

    // This SECURITY DEFINER RPC derives auth.uid(), completes a pending signup
    // learner when available, and enforces the family limit atomically.
    const rpcClient = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
    };
    const { data, error } = await rpcClient.rpc("create_child_profile", {
      p_name: parsed.data.name,
      p_age: parsed.data.age ?? null,
      p_avatar: parsed.data.avatar ?? null,
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (error.code === "23514" && (message.includes("child profile limit") || message.includes("max_child_profiles_per_account"))) {
        return NextResponse.json({ error: "child_limit_reached" }, { status: 409 });
      }
      if (error.code === "42501") return NextResponse.json({ error: "parent_required" }, { status: 403 });
      console.error("Create child learner failed:", error);
      return NextResponse.json({ error: "learner_create_failed" }, { status: 500 });
    }
    const created = Array.isArray(data) ? data[0] : data;
    if (!created || typeof created !== "object") return NextResponse.json({ error: "learner_create_failed" }, { status: 500 });
    return NextResponse.json({ learner: toLearner(created as Record<string, unknown>, false) }, { status: 201 });
  } catch (error) {
    return knownError(error) ?? NextResponse.json({ error: "learner_create_failed" }, { status: 500 });
  }
}
