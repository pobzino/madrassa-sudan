// POST /api/teacher/milestones/generate { path_id, after_week_number | kind: "placement", pool_size?, step? }
// AI-generates (or regenerates, while draft) a milestone's question pool from
// the block's lessons. Without `step` it does everything in one request, which
// can take minutes. The teacher page runs it as short steps instead, each well
// under the function time limit (about 30 s on Netlify):
//   step "plan"                       -> { lessons: [{ lessonId, titleEn, titleAr }], skippedLessons }
//   step "lesson", lesson_id          -> one lesson's signed result (four run at once)
//   step "finish", results: [...]     -> writes the draft, same response as the one-request form

import { z } from "zod";
import { MILESTONE_DEFAULT_POOL_SIZE } from "@/lib/milestones/types";
import { finishMilestonePool, generateMilestonePoolLesson, generateMilestonePool, planMilestonePool } from "@/lib/server/milestones/generate";
import { MilestoneRouteError, milestoneError, milestoneJson } from "@/lib/server/milestones/load";
import {
  canManagePathMilestones,
  loadMilestoneRow,
  openStaffRequest,
  publishForbiddenResponse,
  teacherMilestoneRow,
} from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z
  .object({
    path_id: z.string().uuid(),
    after_week_number: z.number().int().min(0).optional(),
    kind: z.enum(["milestone", "placement"]).optional(),
    pool_size: z.number().int().min(12).max(32).optional(),
    step: z.enum(["plan", "lesson", "finish"]).optional(),
    lesson_id: z.string().uuid().optional(),
    // Signed lesson results from the "lesson" step (checked again by the server).
    results: z.array(z.unknown()).max(64).optional(),
  })
  // A Big Challenge needs its week (> 0); a placement is always week 0.
  .refine((body) => body.kind === "placement" || (body.after_week_number ?? 0) > 0);

export async function POST(request: Request) {
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("block_incomplete", 400, { message: "Invalid request" });
  if (!(await canManagePathMilestones(staff.admin, staff, parsed.data.path_id))) return publishForbiddenResponse();
  const kind = parsed.data.kind ?? "milestone";

  const scope = {
    admin: staff.admin,
    pathId: parsed.data.path_id,
    afterWeekNumber: kind === "placement" ? 0 : parsed.data.after_week_number ?? 0,
    kind,
    poolSize: parsed.data.pool_size ?? MILESTONE_DEFAULT_POOL_SIZE,
  };

  try {
    if (parsed.data.step === "plan") return milestoneJson(await planMilestonePool(scope));
    if (parsed.data.step === "lesson") {
      if (!parsed.data.lesson_id) return milestoneError("block_incomplete", 400, { message: "lesson_id is required" });
      return milestoneJson(await generateMilestonePoolLesson({ ...scope, lessonId: parsed.data.lesson_id }));
    }
    const result =
      parsed.data.step === "finish"
        ? await finishMilestonePool({ ...scope, actorId: staff.userId, results: (parsed.data.results ?? []) as never })
        : await generateMilestonePool({ ...scope, actorId: staff.userId });
    const row = await loadMilestoneRow(staff.admin, result.milestoneId);
    if (!row) return milestoneError("service_unavailable", 500);
    return milestoneJson({ milestone: await teacherMilestoneRow(staff.admin, row), skippedLessons: result.skippedLessons, droppedItems: result.droppedItems });
  } catch (error) {
    if (error instanceof MilestoneRouteError) return milestoneError(error.code, error.status, { message: error.message });
    console.error("Milestone generation failed:", error);
    return milestoneError("generation_failed", 502);
  }
}
