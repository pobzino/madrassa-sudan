// GET /api/milestones/boss-book — the active learner's Boss Book: every boss
// in BOSS_KEYS, whether this learner has met it (played a battle) or beaten it
// (has a certificate), best stars kept, and where. Built only from the active
// learner's own certificates and battles, after the ownership check.

import { BOSS_KEYS, type BossBookEntry, type BossBookResponse, type BossKey } from "@/lib/milestones/types";
import { milestoneBlockWeeks } from "@/lib/milestones/rules";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { isBossKey, milestoneError, milestoneJson } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

type CertRow = { id: string; boss_key: string; subject_id: string | null; after_week_number: number; stars: number; awarded_at: string };
type BattleRow = { milestone_id: string; started_at: string; kind?: string | null };
type MilestoneRow = { id: string; boss_key: string; path_id: string; after_week_number: number };
type SubjectRow = { id: string; name_ar: string | null; name_en: string | null };

function weeksOf(afterWeekNumber: number) {
  const weeks = milestoneBlockWeeks(afterWeekNumber);
  return { first: weeks[0], last: weeks[weeks.length - 1] };
}

export async function GET(request: Request) {
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;
  const learnerId = context.learnerId;

  try {
    const [{ data: certificates }, { data: allBattles }] = await Promise.all([
      admin
        .from("learner_certificates")
        .select("id, boss_key, subject_id, after_week_number, stars, awarded_at")
        .eq("learner_id", learnerId)
        .order("awarded_at", { ascending: true })
        .returns<CertRow[]>(),
      admin
        .from("milestone_battles")
        .select("milestone_id, started_at, kind")
        .eq("learner_id", learnerId)
        .eq("is_preview", false)
        .order("started_at", { ascending: false })
        .returns<BattleRow[]>(),
    ]);
    // The starting boss (placement) is not in the Boss Book (phase 1).
    const battles = (allBattles ?? []).filter((battle) => battle.kind !== "placement");

    const milestoneIds = [...new Set((battles ?? []).map((battle) => battle.milestone_id))];
    const { data: milestones } = milestoneIds.length
      ? await admin
          .from("learning_path_milestones")
          .select("id, boss_key, path_id, after_week_number")
          .in("id", milestoneIds)
          .returns<MilestoneRow[]>()
      : { data: [] as MilestoneRow[] };
    const pathIds = [...new Set((milestones ?? []).map((row) => row.path_id))];
    const { data: paths } = pathIds.length
      ? await admin.from("learning_paths").select("id, subject_id").in("id", pathIds).returns<Array<{ id: string; subject_id: string }>>()
      : { data: [] as Array<{ id: string; subject_id: string }> };
    const subjectByPath = new Map((paths ?? []).map((path) => [path.id, path.subject_id]));
    const subjectIds = [
      ...new Set([
        ...(certificates ?? []).map((row) => row.subject_id),
        ...(milestones ?? []).map((row) => subjectByPath.get(row.path_id) ?? null),
      ].filter((id): id is string => Boolean(id))),
    ];
    const { data: subjects } = subjectIds.length
      ? await admin.from("subjects").select("id, name_ar, name_en").in("id", subjectIds).returns<SubjectRow[]>()
      : { data: [] as SubjectRow[] };
    const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));
    const subjectView = (id: string | null) => {
      if (!id) return null;
      const subject = subjectById.get(id);
      return { id, nameAr: subject?.name_ar ?? null, nameEn: subject?.name_en ?? null };
    };

    const milestoneById = new Map((milestones ?? []).map((row) => [row.id, row]));
    // Battles are newest first, so the first one seen per boss is the latest.
    const latestBattleByBoss = new Map<BossKey, MilestoneRow>();
    for (const battle of battles ?? []) {
      const milestone = milestoneById.get(battle.milestone_id);
      if (!milestone || !isBossKey(milestone.boss_key) || latestBattleByBoss.has(milestone.boss_key)) continue;
      latestBattleByBoss.set(milestone.boss_key, milestone);
    }

    const entries: BossBookEntry[] = BOSS_KEYS.map((bossKey) => {
      const own = (certificates ?? []).filter((row) => row.boss_key === bossKey);
      const best = own.reduce<CertRow | null>((top, row) => (!top || row.stars > top.stars ? row : top), null);
      const battle = latestBattleByBoss.get(bossKey);
      const stars = best ? (Math.min(3, Math.max(1, best.stars)) as 1 | 2 | 3) : null;
      return {
        bossKey,
        met: own.length > 0 || Boolean(battle),
        beatenAt: own[0]?.awarded_at ?? null,
        starsKept: stars,
        certificateId: best?.id ?? null,
        beatenCount: own.length,
        subject: best ? subjectView(best.subject_id) : battle ? subjectView(subjectByPath.get(battle.path_id) ?? null) : null,
        weeks: best ? weeksOf(best.after_week_number) : battle ? weeksOf(battle.after_week_number) : null,
      };
    });
    return milestoneJson({ entries } satisfies BossBookResponse);
  } catch (error) {
    console.error("Boss book failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
