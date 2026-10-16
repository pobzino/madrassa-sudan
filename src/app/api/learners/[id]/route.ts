import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { gradeFromAge, isLearnerAvatar, MAX_LEARNER_NAME_LENGTH } from "@/lib/learners/types";
import { LearnerContextError, resolveLearnerContext } from "@/lib/server/learner-context";

interface RouteParams { params: Promise<{ id: string }> }

const PatchSchema = z.object({
  name: z.string().trim().min(1).max(MAX_LEARNER_NAME_LENGTH).optional(),
  age: z.number().int().min(3).max(19).nullable().optional(),
  avatar: z.string().nullable().optional().refine((value) => value === undefined || value === null || isLearnerAvatar(value)),
}).strict().refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

function contextError(error: unknown) {
  if (error instanceof LearnerContextError) return NextResponse.json({ error: error.code }, { status: error.status });
  return null;
}

export async function PATCH(request: NextRequest, route: RouteParams) {
  try {
    const { id } = await route.params;
    const supabase = await createClient();
    const context = await resolveLearnerContext(request, supabase);
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
    const canManageChildren = context.accountProfile.role === "parent" ||
      (context.accountProfile.role === "admin" && context.accountProfile.is_approved);
    if (!context.isSelf && !canManageChildren) return NextResponse.json({ error: "parent_required" }, { status: 403 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "invalid_learner_id" }, { status: 400 });
    }
    if (context.isSelf && id !== context.accountId) return NextResponse.json({ error: "learner_forbidden" }, { status: 403 });

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      updates.learner_name = parsed.data.name;
      if (id !== context.accountId) updates.full_name = parsed.data.name;
    }
    if (parsed.data.avatar !== undefined) updates.learner_avatar = parsed.data.avatar;
    if (typeof parsed.data.age === "number") updates.grade_level = gradeFromAge(parsed.data.age);
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: "validation_error" }, { status: 400 });

    let query = supabase.from("profiles").update(updates).eq("id", id);
    if (id !== context.accountId) {
      query = query.eq("parent_account_id", context.accountId).eq("role", "student").is("auth_user_id", null);
    }
    const { data, error } = await query.select("*").maybeSingle();
    // The database refuses a child without a name (children made from signup
    // ages start unnamed), so ask for one instead of failing.
    if (error?.code === "22023") {
      const nameMissing = /name/i.test(error.message || "");
      return NextResponse.json({ error: nameMissing ? "learner_name_required" : "validation_error" }, { status: 400 });
    }
    if (error) {
      console.error("Update learner failed:", error);
      return NextResponse.json({ error: "learner_update_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    const row = data as unknown as Record<string, unknown>;
    const learnerName = typeof row.learner_name === "string" ? row.learner_name : (id === context.accountId && typeof row.full_name === "string" ? row.full_name : "");
    return NextResponse.json({ learner: {
      id: String(row.id),
      name: learnerName,
      avatar: typeof row.learner_avatar === "string" ? row.learner_avatar : null,
      gradeLevel: typeof row.grade_level === "number" ? row.grade_level : null,
      isSelf: id === context.accountId,
      needsSetup: id !== context.accountId && !learnerName,
    } });
  } catch (error) {
    return contextError(error) ?? NextResponse.json({ error: "learner_update_failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, route: RouteParams) {
  try {
    const { id } = await route.params;
    const supabase = await createClient();
    const context = await resolveLearnerContext(request, supabase);
    const canManageChildren = context.accountProfile.role === "parent" ||
      (context.accountProfile.role === "admin" && context.accountProfile.is_approved);
    if (!canManageChildren) return NextResponse.json({ error: "parent_required" }, { status: 403 });
    if (id === context.accountId) return NextResponse.json({ error: "self_learner_cannot_be_deleted" }, { status: 400 });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "invalid_learner_id" }, { status: 400 });
    }
    const { data: ownedChild, error: ownershipError } = await supabase.from("profiles").select("id")
      .eq("id", id)
      .eq("parent_account_id", context.accountId)
      .eq("role", "student")
      .is("auth_user_id", null)
      .maybeSingle();
    if (ownershipError) {
      console.error("Verify child learner before delete failed:", ownershipError);
      return NextResponse.json({ error: "learner_delete_failed" }, { status: 500 });
    }
    if (!ownedChild) return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    if (!hasServiceRoleConfig()) return NextResponse.json({ error: "learner_delete_unavailable" }, { status: 503 });

    // Child deletion intentionally uses elevated access because profile deletes
    // are not exposed through client RLS. Keep both verified identities in the
    // service-role filter so no unchecked ID can widen the operation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createServiceClient() as unknown as import("@supabase/supabase-js").SupabaseClient<any>;
    const { data, error } = await admin.from("profiles").delete()
      .eq("id", ownedChild.id)
      .eq("parent_account_id", context.accountId)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Delete learner failed:", error);
      return NextResponse.json({ error: "learner_delete_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return contextError(error) ?? NextResponse.json({ error: "learner_delete_failed" }, { status: 500 });
  }
}
