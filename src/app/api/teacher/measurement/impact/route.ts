// GET /api/teacher/measurement/impact?from&to&subject_id&path_id&split&scope
// The impact report: one RPC (measurement_impact) with the signed-in account as
// the actor. Scope (school / class based): approved admins every learner;
// teachers their classes; school admins their schools' classes; scope=all |
// school:<id> | class:<id> narrows. Groups of fewer than 5 children are
// suppressed. Defaults: the last 84 days, split none, scope all.

import type { ImpactReport, ImpactResponse } from "@/lib/measurement/types";
import { MIN_CELL_SIZE } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest } from "@/lib/server/measurement/http";
import { parseImpactQuery } from "@/lib/server/measurement/query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  const parsed = parseImpactQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return measurementError("invalid_query", 400);
  const { query } = parsed;

  try {
    const { data, error } = await opened.admin.rpc("measurement_impact", {
      p_actor: opened.userId,
      p_from: query.from,
      p_to: query.to,
      p_subject_id: query.subjectId,
      p_path_id: query.pathId,
      p_split: query.split,
      p_min_cell: MIN_CELL_SIZE,
      p_scope: query.scope,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson({ report: data as ImpactReport } satisfies ImpactResponse);
  } catch (error) {
    console.error("Impact report failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
