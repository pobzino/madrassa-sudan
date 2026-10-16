// POST /api/teacher/measurement/placement/reset { learnerId, milestoneId, reason }
// Re-place a child: the completed starting boss is kept but superseded, an
// active one abandoned, and the child may play it again. Approved admins or the
// path's author (the database re-checks: reset_forbidden). One RPC.

import { z } from "zod";
import type { PlacementResetResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson } from "@/lib/server/measurement/http";
import { openStaffRequest } from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  learnerId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
});

export async function POST(request: Request) {
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return measurementError("invalid_query", 400);

  try {
    const { data, error } = await staff.admin.rpc("reset_placement", {
      p_milestone_id: parsed.data.milestoneId,
      p_learner_id: parsed.data.learnerId,
      p_actor: staff.userId,
      p_reason: parsed.data.reason,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    const resetAt = String((data as { reset_at?: string }).reset_at ?? new Date().toISOString());
    return measurementJson({ ok: true, resetAt } satisfies PlacementResetResponse);
  } catch (error) {
    console.error("Placement reset failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
