// POST /api/learners/classes/join { code, learnerId } — the family asks to join a
// class with its join code, choosing which child. Only the owning parent (or the
// adult self account) can; the request is pending until the class teacher
// approves. Errors: invalid_code (400), already_member (409), learner_forbidden (403).

import { z } from "zod";
import type { JoinClassResponse } from "@/lib/measurement/types";
import { mapMeasurementRpcError, measurementError, measurementJson, openSignedInRequest } from "@/lib/server/measurement/http";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ code: z.string().trim().min(1).max(64), learnerId: z.string().uuid() });

export async function POST(request: Request) {
  const opened = await openSignedInRequest();
  if (!opened.ok) return opened.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return measurementError("invalid_code", 400);
  try {
    const { data, error } = await opened.admin.rpc("enrol_learner_in_class", {
      p_actor: opened.userId,
      p_learner: parsed.data.learnerId,
      p_code: parsed.data.code,
    });
    if (error || !data) return mapMeasurementRpcError(error);
    const row = data as { cohortId: string; name: string; status: "pending" | "active" };
    return measurementJson({ cohortId: row.cohortId, name: row.name, status: row.status } satisfies JoinClassResponse);
  } catch (error) {
    console.error("Class join failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
