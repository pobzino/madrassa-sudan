// POST /api/teacher/cohorts/[id]/requests/[requestId] { decision: "approve" | "decline" }
// A class teacher (approved) or an approved admin answers a family's join
// request. Teachers can approve, decline or remove a child; only the family
// can enrol one. One RPC (decide_class_request).

import { z } from "zod";
import type { ClassRequestDecisionResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest, UUID_PATTERN } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ decision: z.enum(["approve", "decline"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(requestId)) return measurementError("not_found", 404);
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return measurementError("invalid_query", 400);
  try {
    const { data, error } = await opened.admin.rpc("decide_class_request", {
      p_actor: opened.userId,
      p_cohort: id,
      p_request: requestId,
      p_decision: parsed.data.decision,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    return measurementJson(data as ClassRequestDecisionResponse);
  } catch (error) {
    console.error("Class request decision failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
