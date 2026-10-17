// POST /api/internal/milestones/generate-job { jobId, step, lesson_id?, results? }
// One step of a boss-generation job, called by netlify/functions/
// generate-milestone-background.ts with the shared job secret. The job row
// carries the scope and the requester; the function records progress and
// the final outcome (the "finish" step marks the job done here).

import { NextRequest } from "next/server";
import { z } from "zod";
import { hasAutomationSecret } from "@/lib/server/automation-auth";
import { jobSecret, loadGenerationJob, runGenerationStep } from "@/lib/server/milestones/jobs";
import { MilestoneRouteError, milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.discriminatedUnion("step", [
  z.object({ jobId: z.string().uuid(), step: z.literal("plan") }),
  z.object({ jobId: z.string().uuid(), step: z.literal("lesson"), lesson_id: z.string().uuid() }),
  z.object({ jobId: z.string().uuid(), step: z.literal("lesson-start"), lesson_id: z.string().uuid() }),
  z.object({ jobId: z.string().uuid(), step: z.literal("lesson-poll"), lesson_id: z.string().uuid(), generation: z.string().min(1).max(200), verification: z.string().min(1).max(200).nullable().optional() }),
  z.object({ jobId: z.string().uuid(), step: z.literal("finish"), results: z.array(z.unknown()).max(64) }),
]);

export async function POST(request: NextRequest) {
  if (!hasAutomationSecret(request, jobSecret() ?? undefined)) return milestoneError("unauthorized", 401);
  if (!hasServiceRoleConfig()) return milestoneError("service_unavailable", 503);
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("block_incomplete", 400, { message: "Invalid step" });

  const admin = createServiceClient() as never;
  const job = await loadGenerationJob(admin, parsed.data.jobId);
  if (!job) return milestoneError("milestone_not_found", 404, { message: "Unknown job" });
  if (job.status === "done" || job.status === "failed") return milestoneError("job_running", 409, { message: `This job is already ${job.status}.` });

  try {
    const { jobId: _jobId, ...body } = parsed.data;
    return milestoneJson(await runGenerationStep(admin, job, body));
  } catch (error) {
    if (error instanceof MilestoneRouteError) return milestoneError(error.code, error.status, { message: error.message });
    if ((error as { code?: string })?.code === "ai_timeout") return milestoneError("generation_failed", 504, { message: (error as Error).message });
    console.error("Milestone job step failed:", parsed.data.step, error);
    return milestoneError("generation_failed", 502, { message: error instanceof Error ? error.message : "Generation failed" });
  }
}
