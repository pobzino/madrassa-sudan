// GET /api/school/overview[?school_id=] — a school's classes for its approved
// school admins (approved admins pass school_id, else the first school). Class
// figures are null under 5 children. One RPC (measurement_school_overview).

import type { SchoolOverviewResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest, UUID_PATTERN } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  const schoolId = new URL(request.url).searchParams.get("school_id");
  if (schoolId && !UUID_PATTERN.test(schoolId)) return measurementError("invalid_query", 400);
  try {
    const { data, error } = await opened.admin.rpc("measurement_school_overview", { p_actor: opened.userId, p_school: schoolId || null });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson(data as SchoolOverviewResponse);
  } catch (error) {
    console.error("School overview failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
