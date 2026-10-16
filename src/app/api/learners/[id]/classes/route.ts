// GET /api/learners/[learnerId]/classes — a child's classes (pending requests and
// active memberships), for the owning parent or the adult self account only.
// (The folder is [id] because /api/learners/[id] already exists.) One RPC.

import type { LearnerClassesResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest, UUID_PATTERN } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: learnerId } = await params;
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  if (!UUID_PATTERN.test(learnerId)) return measurementError("learner_forbidden", 403);
  try {
    const { data, error } = await opened.admin.rpc("learner_classes", { p_actor: opened.userId, p_learner: learnerId });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson(data as LearnerClassesResponse);
  } catch (error) {
    console.error("Learner classes failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
