// GET /api/milestones/placement-gate?lesson_id=<id>
// Whether the active learner must meet a starting boss before this lesson:
// the lesson is in a published path whose published placement is required,
// the learner has completed no lesson of that path, has not met the boss, and
// is a child / student (staff are never gated). The lesson page sends a gated
// learner to the boss; the path tree applies the same rule (src/lib/learning-path-gate.ts).
// The common case (no required placement) answers after three small reads.

import { placementGateApplies } from "@/lib/learning-path-gate";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { isBossKey, milestoneError, milestoneJson } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

export interface PlacementGateResponse {
  gated: boolean;
  placementId: string | null;
  bossKey: string | null;
}

const NONE: PlacementGateResponse = { gated: false, placementId: null, bossKey: null };

export async function GET(request: Request) {
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;
  const learnerId = context.learnerId;
  const lessonId = new URL(request.url).searchParams.get("lesson_id") ?? "";
  if (!ID.test(lessonId)) return milestoneError("milestone_not_found", 400, { message: "lesson_id is required" });

  try {
    const { data: steps } = await admin.from("learning_path_steps").select("week_id").eq("lesson_id", lessonId).returns<Array<{ week_id: string }>>();
    const weekIds = [...new Set((steps ?? []).map((s) => s.week_id))];
    if (!weekIds.length) return milestoneJson(NONE);
    const { data: weeks } = await admin.from("learning_path_weeks").select("path_id").in("id", weekIds).returns<Array<{ path_id: string }>>();
    const pathIds = [...new Set((weeks ?? []).map((w) => w.path_id))];
    if (!pathIds.length) return milestoneJson(NONE);

    const [{ data: placements }, { data: paths }, { data: profile }] = await Promise.all([
      admin
        .from("learning_path_milestones")
        .select("id, path_id, boss_key, required")
        .in("path_id", pathIds)
        .eq("kind", "placement")
        .eq("status", "published")
        .returns<Array<{ id: string; path_id: string; boss_key: string; required: boolean | null }>>(),
      admin.from("learning_paths").select("id").in("id", pathIds).eq("is_published", true).returns<Array<{ id: string }>>(),
      admin.from("profiles").select("role").eq("id", learnerId).maybeSingle<{ role: string | null }>(),
    ]);
    const published = new Set((paths ?? []).map((p) => p.id));
    const candidates = (placements ?? []).filter((p) => p.required !== false && published.has(p.path_id));
    if (!candidates.length) return milestoneJson(NONE);

    for (const placement of candidates) {
      const [{ data: pathWeeks }, { count: metCount }] = await Promise.all([
        admin.from("learning_path_weeks").select("id").eq("path_id", placement.path_id).returns<Array<{ id: string }>>(),
        admin
          .from("milestone_battles")
          .select("id", { count: "exact", head: true })
          .eq("learner_id", learnerId)
          .eq("milestone_id", placement.id)
          .eq("status", "completed")
          .eq("is_preview", false)
          .is("superseded_at", null),
      ]);
      const pathWeekIds = (pathWeeks ?? []).map((w) => w.id);
      const { data: pathSteps } = pathWeekIds.length
        ? await admin.from("learning_path_steps").select("lesson_id").in("week_id", pathWeekIds).returns<Array<{ lesson_id: string }>>()
        : { data: [] as Array<{ lesson_id: string }> };
      const lessonIds = [...new Set((pathSteps ?? []).map((s) => s.lesson_id))];
      const { count: doneCount } = lessonIds.length
        ? await admin
            .from("lesson_progress")
            .select("lesson_id", { count: "exact", head: true })
            .eq("student_id", learnerId)
            .eq("completed", true)
            .in("lesson_id", lessonIds)
        : { count: 0 };
      const gated = placementGateApplies({
        required: true,
        completed: (metCount ?? 0) > 0,
        completedLessonsInPath: doneCount ?? 0,
        learnerRole: profile?.role ?? null,
      });
      if (gated) {
        return milestoneJson({ gated: true, placementId: placement.id, bossKey: isBossKey(placement.boss_key) ? placement.boss_key : "puzzle_owlet" } satisfies PlacementGateResponse);
      }
    }
    return milestoneJson(NONE);
  } catch (error) {
    console.error("Placement gate check failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
