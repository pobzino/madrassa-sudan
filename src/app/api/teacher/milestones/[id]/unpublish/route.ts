// POST /api/teacher/milestones/[id]/unpublish — back to draft. Every active
// battle is abandoned, and learners stop seeing it until it is published again.

import { isUuid } from "@/lib/learners/types";
import { mapMilestoneRpcError, milestoneError, milestoneJson, type MilestoneRow } from "@/lib/server/milestones/load";
import { openStaffRequest, teacherMilestoneRow } from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);

  const { data, error } = await staff.admin.rpc("unpublish_milestone", { p_milestone_id: id, p_actor: staff.userId });
  if (error || !data) {
    const mapped = mapMilestoneRpcError(error);
    return milestoneError(mapped.code, mapped.status);
  }
  return milestoneJson({ milestone: await teacherMilestoneRow(staff.admin, data as MilestoneRow) });
}
