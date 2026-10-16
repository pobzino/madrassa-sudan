// POST /api/internal/narration/backlog { limit? }
// One batch of the narration backlog (see src/lib/server/narration-backlog.ts),
// called by netlify/functions/narrate-backlog-background.ts with the job secret.

import { NextRequest } from "next/server";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { jobSecret } from "@/lib/server/milestones/jobs";
import { milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import { runNarrationBatch } from "@/lib/server/narration-backlog";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, jobSecret() ?? undefined)) return milestoneError("unauthorized", 401);
  if (!hasServiceRoleConfig()) return milestoneError("service_unavailable", 503);
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : 10;
  try {
    return milestoneJson(await runNarrationBatch(createServiceClient() as never, limit));
  } catch (error) {
    console.error("Narration batch failed:", error);
    return milestoneError("service_unavailable", 500, { message: error instanceof Error ? error.message : "Narration batch failed" });
  }
}
