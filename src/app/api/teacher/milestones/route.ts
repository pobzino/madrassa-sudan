// GET /api/teacher/milestones?subject_id= — one block per 4 weeks of the
// subject's published learning path, with its milestone (or null).

import { MILESTONE_WEEKS_PER_BLOCK, type TeacherMilestoneBlock, type TeacherMilestoneListResponse } from "@/lib/milestones/types";
import { milestoneBlockWeeks } from "@/lib/milestones/rules";
import { MILESTONE_COLUMNS, milestoneError, milestoneJson, type MilestoneRow } from "@/lib/server/milestones/load";
import { openStaffRequest, teacherMilestoneRow } from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await openStaffRequest({ fastAuth: true });
  if (!staff.ok) return staff.response;
  const { admin } = staff;
  const subjectId = new URL(request.url).searchParams.get("subject_id");
  if (!subjectId) return milestoneError("milestone_not_found", 400, { message: "subject_id is required" });

  try {
    const { data: path } = await admin
      .from("learning_paths")
      .select("id")
      .eq("subject_id", subjectId)
      .eq("is_published", true)
      .maybeSingle<{ id: string }>();
    if (!path) return milestoneJson({ pathId: null, blocks: [], placement: null } satisfies TeacherMilestoneListResponse);

    const [{ data: weeks }, { data: milestones }] = await Promise.all([
      admin
        .from("learning_path_weeks")
        .select("id, week_number")
        .eq("path_id", path.id)
        .returns<Array<{ id: string; week_number: number }>>(),
      admin.from("learning_path_milestones").select(MILESTONE_COLUMNS).eq("path_id", path.id).returns<MilestoneRow[]>(),
    ]);
    const weekList = weeks ?? [];
    const { data: steps } = weekList.length
      ? await admin
          .from("learning_path_steps")
          .select("week_id, lesson_id")
          .in("week_id", weekList.map((week) => week.id))
          .returns<Array<{ week_id: string; lesson_id: string }>>()
      : { data: [] as Array<{ week_id: string; lesson_id: string }> };
    const lessonIds = [...new Set((steps ?? []).map((step) => step.lesson_id))];
    // Only whether each recorded deck has a first slide (its type), not the decks themselves (hundreds of KB per path).
    const { data: sims } = lessonIds.length
      ? await admin
          .from("lesson_sims")
          .select("lesson_id, first_slide_type:deck_snapshot->0->>type")
          .in("lesson_id", lessonIds)
          .returns<Array<{ lesson_id: string; first_slide_type?: string | null; deck_snapshot?: unknown }>>()
      : { data: [] as Array<{ lesson_id: string; first_slide_type?: string | null; deck_snapshot?: unknown }> };
    const withContent = new Set(
      (sims ?? [])
        .filter((sim) => sim.first_slide_type != null || (Array.isArray(sim.deck_snapshot) && sim.deck_snapshot.length > 0))
        .map((sim) => sim.lesson_id),
    );

    const weekByNumber = new Map(weekList.map((week) => [week.week_number, week]));
    const maxWeek = Math.max(0, ...weekList.map((week) => week.week_number));
    // Blocks are Big Challenges only; the placement ("Meet your first boss") is returned on its own.
    const blockMilestones = (milestones ?? []).filter((row) => row.kind !== "placement");
    const placementRow = (milestones ?? []).find((row) => row.kind === "placement") ?? null;
    const milestoneByWeek = new Map(blockMilestones.map((row) => [row.after_week_number, row]));

    const blockWeeksAt: number[] = [];
    for (let k = MILESTONE_WEEKS_PER_BLOCK; k <= maxWeek; k += MILESTONE_WEEKS_PER_BLOCK) blockWeeksAt.push(k);
    // Every boss's details at once (each is its own small query).
    const [blocks, placement] = await Promise.all([
      Promise.all(blockWeeksAt.map(async (k): Promise<TeacherMilestoneBlock> => {
        const blockWeeks = milestoneBlockWeeks(k).filter((number) => weekByNumber.has(number));
        const blockWeekIds = new Set(blockWeeks.map((number) => weekByNumber.get(number)!.id));
        const blockLessons = [...new Set((steps ?? []).filter((step) => blockWeekIds.has(step.week_id)).map((step) => step.lesson_id))];
        const milestone = milestoneByWeek.get(k);
        return {
          afterWeekNumber: k,
          weekNumbers: blockWeeks,
          lessonCount: blockLessons.length,
          lessonsWithContent: blockLessons.filter((id) => withContent.has(id)).length,
          milestone: milestone ? await teacherMilestoneRow(admin, milestone) : null,
        };
      })),
      placementRow ? teacherMilestoneRow(admin, placementRow) : Promise.resolve(null),
    ]);
    return milestoneJson({ pathId: path.id, blocks, placement } satisfies TeacherMilestoneListResponse);
  } catch (error) {
    console.error("Teacher milestone list failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
