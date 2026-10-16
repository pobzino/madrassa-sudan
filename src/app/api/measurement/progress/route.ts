// GET /api/measurement/progress — the active learner's skills and level bands
// (x-amal-learner: the parent's own child, or the self account). Bands and skill
// names only, never a score. One RPC call.

import type { LearnerProgressResponse, LearnerProgressSummary } from "@/lib/measurement/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { mapMeasurementRpcError, measurementError, measurementJson } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Authenticates, resolves x-amal-learner and checks the account owns that learner (403 otherwise).
  const opened = await openMilestoneLearnerRequest(request, { preview: false });
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;

  try {
    const { data, error } = await admin.rpc("measurement_learner_summaries", { p_learner_ids: [context.learnerId] });
    if (error) return mapMeasurementRpcError(error);
    const summary = ((data ?? []) as LearnerProgressSummary[])[0];
    if (!summary) return measurementError("service_unavailable", 500);
    return measurementJson({ summary } satisfies LearnerProgressResponse);
  } catch (error) {
    console.error("Learner progress failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
