// GET /api/teacher/milestones/generate/status?job=<id>
// The state of a boss-generation job: its requester or an approved admin.

import { openStaffRequest } from "@/lib/server/milestones/teacher";
import { loadGenerationJob } from "@/lib/server/milestones/jobs";
import { milestoneError, milestoneJson } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const staff = await openStaffRequest({ fastAuth: true });
  if (!staff.ok) return staff.response;
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  if (!UUID.test(jobId)) return milestoneError("milestone_not_found", 400, { message: "job is required" });
  const job = await loadGenerationJob(staff.admin, jobId);
  if (!job || (job.requested_by !== staff.userId && staff.role !== "admin")) return milestoneError("milestone_not_found", 404, { message: "Unknown job" });
  return milestoneJson({
    jobId: job.id,
    pathId: job.path_id,
    kind: job.kind,
    afterWeekNumber: job.after_week_number,
    status: job.status,
    progressDone: job.progress_done,
    progressTotal: job.progress_total,
    message: job.message,
    warnings: job.warnings ?? [],
    milestoneId: job.milestone_id,
    updatedAt: job.updated_at,
  });
}
