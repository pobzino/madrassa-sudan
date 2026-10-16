// GET /api/certificates/[id] — one certificate, authorized by the signed-in
// account rather than the active learner, so a parent can open the link from
// the notification whichever child is selected. Visible to the learner's own
// account, the parent of a (non-archived) child profile, an approved guardian
// of that learner (who is also notified), and approved admins. Anyone else
// gets 404.

import { isUuid } from "@/lib/learners/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";
import { CERTIFICATE_COLUMNS, certificateViews, type CertificateRow } from "@/lib/server/milestones/certificates";
import { milestoneError, milestoneJson, type MilestoneAdminClient } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

type LearnerOwnerRow = {
  id: string;
  role: string | null;
  parent_account_id: string | null;
  auth_user_id: string | null;
  archived_at: string | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return milestoneError("unauthorized", 401);
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  if (!hasServiceRoleConfig()) return milestoneError("service_unavailable", 503);
  const admin = createServiceClient() as unknown as MilestoneAdminClient;

  const { data: certificate } = await admin
    .from("learner_certificates")
    .select(CERTIFICATE_COLUMNS)
    .eq("id", id)
    .maybeSingle<CertificateRow>();
  if (!certificate) return milestoneError("milestone_not_found", 404);

  const [{ data: learner }, { data: caller }, { data: guardian }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, role, parent_account_id, auth_user_id, archived_at")
      .eq("id", certificate.learner_id)
      .maybeSingle<LearnerOwnerRow>(),
    admin.from("profiles").select("role, is_approved").eq("id", user.id).maybeSingle<{ role: string | null; is_approved: boolean | null }>(),
    admin
      .from("guardian_students")
      .select("id")
      .eq("guardian_id", user.id)
      .eq("student_id", certificate.learner_id)
      .eq("is_approved", true)
      .maybeSingle<{ id: string }>(),
  ]);

  const isOwnLearner = certificate.learner_id === user.id;
  const isOwnChild = Boolean(
    learner &&
      learner.parent_account_id === user.id &&
      learner.role === "student" &&
      learner.auth_user_id === null &&
      learner.archived_at === null,
  );
  const isApprovedAdmin = caller?.role === "admin" && caller.is_approved === true;
  if (!isOwnLearner && !isOwnChild && !guardian && !isApprovedAdmin) {
    return milestoneError("milestone_not_found", 404);
  }

  const [view] = await certificateViews(admin, [certificate]);
  return milestoneJson(view);
}
