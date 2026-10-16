// GET /api/teacher/cohorts/[id]/progress — one class's progress: the named roster
// (approved, active members only) with level bands and skills this month, and
// whole-class figures (null under 5 children). For the class's approved teachers,
// its school's approved admins and approved admins (impact_forbidden otherwise).
// One RPC (measurement_class_progress).

import type { ClassProgressResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest, UUID_PATTERN } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  if (!UUID_PATTERN.test(id)) return measurementError("not_found", 404);
  try {
    const { data, error } = await opened.admin.rpc("measurement_class_progress", { p_actor: opened.userId, p_cohort: id });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson(data as ClassProgressResponse);
  } catch (error) {
    console.error("Class progress failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
