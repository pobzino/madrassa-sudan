// POST /api/teacher/milestones/[id]/unpublish — back to draft. Every active
// battle is abandoned, and learners stop seeing it until it is published again.
// Approved admins, or the approved teacher who created the path.

import { isUuid } from "@/lib/learners/types";
import { mapMilestoneRpcError, milestoneError, milestoneJson, type MilestoneRow } from "@/lib/server/milestones/load";
import {
  canManagePathMilestones,
  loadMilestoneRow,
  openStaffRequest,
  publishForbiddenResponse,
  teacherMilestoneRow,
} from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);

  const row = await loadMilestoneRow(staff.admin, id);
  if (!row) return milestoneError("milestone_not_found", 404);
  if (!(await canManagePathMilestones(staff.admin, staff, row.path_id))) return publishForbiddenResponse();

  const { data, error } = await staff.admin.rpc("unpublish_milestone", { p_milestone_id: id, p_actor: staff.userId });
  if (error || !data) {
    const mapped = mapMilestoneRpcError(error);
    return mapped.code === "publish_forbidden" ? publishForbiddenResponse() : milestoneError(mapped.code, mapped.status);
  }
  return milestoneJson({ milestone: await teacherMilestoneRow(staff.admin, data as MilestoneRow) });
}
