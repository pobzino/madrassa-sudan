// GET /api/teacher/measurement/scopes — what the signed-in viewer may switch the
// impact page between (all / their schools / their classes). One RPC.

import type { ImpactScopesResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  try {
    const { data, error } = await opened.admin.rpc("measurement_scope_options", { p_actor: opened.userId });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson(data as ImpactScopesResponse);
  } catch (error) {
    console.error("Impact scopes failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
