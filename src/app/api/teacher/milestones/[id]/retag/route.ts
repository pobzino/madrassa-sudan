// POST /api/teacher/milestones/[id]/retag { scope: "untagged" | "all" }
// "Tag questions with AI": the model tags pool items with a skill and a
// difficulty (teacher tags are never overwritten). Approved admins or the
// path's author. Can take a while.

import { z } from "zod";
import { isUuid } from "@/lib/learners/types";
import type { RetagResponse } from "@/lib/measurement/types";
import { milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import { canManagePathMilestones, loadMilestoneRow, openStaffRequest, publishForbiddenResponse } from "@/lib/server/milestones/teacher";
import { retagMilestone } from "@/lib/server/measurement/retag";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({ scope: z.enum(["untagged", "all"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("invalid_answer", 400, { message: "scope must be untagged or all" });

  try {
    const row = await loadMilestoneRow(staff.admin, id);
    if (!row) return milestoneError("milestone_not_found", 404);
    if (!(await canManagePathMilestones(staff.admin, staff, row.path_id))) return publishForbiddenResponse();
    const result: RetagResponse = await retagMilestone(staff.admin, row, parsed.data.scope);
    return milestoneJson(result);
  } catch (error) {
    console.error("Milestone retag failed:", error);
    return milestoneError("generation_failed", 502);
  }
}
