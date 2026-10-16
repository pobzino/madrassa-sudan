// POST /api/teacher/milestones/generate { path_id, after_week_number, pool_size? }
// AI-generates (or regenerates, while draft) a milestone's question pool from
// the block's lessons. Can take a couple of minutes.

import { z } from "zod";
import { MILESTONE_DEFAULT_POOL_SIZE } from "@/lib/milestones/types";
import { generateMilestonePool } from "@/lib/server/milestones/generate";
import { MilestoneRouteError, milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import { loadMilestoneRow, openStaffRequest, teacherMilestoneRow } from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  path_id: z.string().uuid(),
  after_week_number: z.number().int().positive(),
  pool_size: z.number().int().min(12).max(32).optional(),
});

export async function POST(request: Request) {
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("block_incomplete", 400, { message: "Invalid request" });

  try {
    const result = await generateMilestonePool({
      admin: staff.admin,
      pathId: parsed.data.path_id,
      afterWeekNumber: parsed.data.after_week_number,
      poolSize: parsed.data.pool_size ?? MILESTONE_DEFAULT_POOL_SIZE,
      actorId: staff.userId,
    });
    const row = await loadMilestoneRow(staff.admin, result.milestoneId);
    if (!row) return milestoneError("service_unavailable", 500);
    return milestoneJson({ milestone: await teacherMilestoneRow(staff.admin, row), skippedLessons: result.skippedLessons });
  } catch (error) {
    if (error instanceof MilestoneRouteError) return milestoneError(error.code, error.status, { message: error.message });
    console.error("Milestone generation failed:", error);
    return milestoneError("generation_failed", 502);
  }
}
