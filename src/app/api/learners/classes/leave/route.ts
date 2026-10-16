// POST /api/learners/classes/leave { cohortId, learnerId } — the family takes a
// child out of a class (or withdraws a pending request). The class teacher and
// its school's admins lose access to the child's progress at once.

import { z } from "zod";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ cohortId: z.string().uuid(), learnerId: z.string().uuid() });

export async function POST(request: Request) {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return measurementError("invalid_query", 400);
  try {
    const { data, error } = await opened.admin.rpc("leave_class", {
      p_actor: opened.userId,
      p_learner: parsed.data.learnerId,
      p_cohort: parsed.data.cohortId,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson({ ok: true as const });
  } catch (error) {
    console.error("Class leave failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
