// GET /api/milestones/boss-book — the active learner's sticker album: one
// sticker per boss on each published path (the starting boss, every Big
// Challenge, the Grand Challenge). A sticker is earned by a certificate (a real
// win) or, for the starting boss, by a completed real battle; it is "met" after
// any real battle. Staff see their preview battles too, flagged as previews.
// Everything is derived from the learner's own rows after the ownership check,
// so there is no sticker ledger to fall out of sync.

import type { BossAlbum, BossBookResponse, BossSticker, StickerState } from "@/lib/milestones/types";
import { milestoneWeeksCovered } from "@/lib/milestones/rules";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { isBossKey, milestoneError, milestoneJson } from "@/lib/server/milestones/load";

export const dynamic = "force-dynamic";

type CertRow = { id: string; milestone_id: string | null; stars: number; awarded_at: string };
type BattleRow = { milestone_id: string; kind?: string | null; is_preview: boolean; status: string; correct_count: number | null; question_count: number | null; started_at: string; finished_at: string | null };
type MilestoneRow = { id: string; path_id: string; kind?: string | null; is_final?: boolean | null; after_week_number: number; boss_key: string; status: string };
type PathRow = { id: string; subject_id: string | null; title_ar: string; title_en: string | null; is_published: boolean | null };
type SubjectRow = { id: string; name_ar: string | null; name_en: string | null };

const MILESTONE_COLUMNS = "id, path_id, kind, is_final, after_week_number, boss_key, status";

export async function GET(request: Request) {
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin, preview: staff } = opened.value;
  const learnerId = context.learnerId;

  try {
    const [{ data: certificates }, { data: battleRows }, { data: publishedRows }] = await Promise.all([
      admin
        .from("learner_certificates")
        .select("id, milestone_id, stars, awarded_at")
        .eq("learner_id", learnerId)
        .order("awarded_at", { ascending: true })
        .returns<CertRow[]>(),
      admin
        .from("milestone_battles")
        .select("milestone_id, kind, is_preview, status, correct_count, question_count, started_at, finished_at")
        .eq("learner_id", learnerId)
        .order("started_at", { ascending: false })
        .returns<BattleRow[]>(),
      admin.from("learning_path_milestones").select(MILESTONE_COLUMNS).eq("status", "published").returns<MilestoneRow[]>(),
    ]);
    // Children never have preview battles; staff see theirs, flagged.
    const battles = (battleRows ?? []).filter((battle) => staff || !battle.is_preview);

    // Every published boss, plus any boss the learner has a row for (a regenerated draft keeps its sticker).
    const milestones = new Map((publishedRows ?? []).map((row) => [row.id, row]));
    const missing = [
      ...new Set([...(certificates ?? []).map((row) => row.milestone_id), ...battles.map((row) => row.milestone_id)].filter((id): id is string => Boolean(id) && !milestones.has(id as string))),
    ];
    if (missing.length) {
      const { data: extra } = await admin.from("learning_path_milestones").select(MILESTONE_COLUMNS).in("id", missing).returns<MilestoneRow[]>();
      for (const row of extra ?? []) milestones.set(row.id, row);
    }

    const pathIds = [...new Set([...milestones.values()].map((row) => row.path_id))];
    const { data: paths } = pathIds.length
      ? await admin.from("learning_paths").select("id, subject_id, title_ar, title_en, is_published").in("id", pathIds).returns<PathRow[]>()
      : { data: [] as PathRow[] };
    const subjectIds = [...new Set((paths ?? []).map((path) => path.subject_id).filter((id): id is string => Boolean(id)))];
    const { data: subjects } = subjectIds.length
      ? await admin.from("subjects").select("id, name_ar, name_en").in("id", subjectIds).returns<SubjectRow[]>()
      : { data: [] as SubjectRow[] };
    const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));

    const certsByMilestone = new Map<string, CertRow[]>();
    for (const row of certificates ?? []) {
      if (!row.milestone_id) continue;
      certsByMilestone.set(row.milestone_id, [...(certsByMilestone.get(row.milestone_id) ?? []), row]);
    }
    const battlesByMilestone = new Map<string, BattleRow[]>();
    for (const row of battles) battlesByMilestone.set(row.milestone_id, [...(battlesByMilestone.get(row.milestone_id) ?? []), row]);

    const stickerFor = (milestone: MilestoneRow): BossSticker | null => {
      if (!isBossKey(milestone.boss_key)) return null;
      const kind = milestone.kind === "placement" ? "starting" : milestone.is_final ? "final" : "boss";
      const own = certsByMilestone.get(milestone.id) ?? [];
      const played = battlesByMilestone.get(milestone.id) ?? [];
      const real = played.filter((battle) => !battle.is_preview);
      // The starting boss is "earned" by finishing it; a boss by a certificate (a real win) or, in preview, a won battle.
      const completed = (list: BattleRow[]) => list.find((battle) => (kind === "starting" ? battle.status === "completed" : battle.status === "won"));
      const best = own.reduce<CertRow | null>((top, row) => (!top || row.stars > top.stars ? row : top), null);
      const realDone = kind === "starting" ? completed(real) : best ? real.find((battle) => battle.status === "won") ?? real[0] ?? null : null;
      const previewDone = completed(played.filter((battle) => battle.is_preview));
      let state: StickerState = "locked";
      let preview = false;
      if (best || (kind === "starting" && realDone)) state = "earned";
      else if (real.length) state = "met";
      else if (previewDone) {
        state = "earned";
        preview = true;
      } else if (played.length) {
        state = "met";
        preview = true;
      }
      const done = kind === "starting" ? (realDone ?? previewDone ?? null) : null;
      return {
        id: milestone.id,
        bossKey: milestone.boss_key,
        kind,
        weeks: kind === "starting" ? null : milestoneWeeksCovered(milestone.after_week_number, kind === "final"),
        state,
        preview,
        // First earned: the earliest certificate (they are ordered by award time), or the completed starting battle.
        earnedAt: state !== "earned" ? null : own[0]?.awarded_at ?? done?.finished_at ?? done?.started_at ?? previewDone?.finished_at ?? null,
        stars: best ? (Math.min(3, Math.max(1, best.stars)) as 1 | 2 | 3) : null,
        certificateId: best?.id ?? null,
        score: done && done.question_count ? { correct: done.correct_count ?? 0, total: done.question_count } : null,
      };
    };

    const order = (row: MilestoneRow) => (row.kind === "placement" ? -1 : row.is_final ? 1_000_000 : row.after_week_number);
    const albums: BossAlbum[] = [];
    for (const path of (paths ?? []).sort((a, b) => (a.title_en ?? a.title_ar).localeCompare(b.title_en ?? b.title_ar))) {
      const stickers = [...milestones.values()]
        .filter((row) => row.path_id === path.id)
        .sort((a, b) => order(a) - order(b))
        .map(stickerFor)
        .filter((sticker): sticker is BossSticker => sticker !== null);
      // An unpublished path shows only once the learner has something in it.
      if (!stickers.length || (path.is_published === false && stickers.every((sticker) => sticker.state === "locked"))) continue;
      const subject = path.subject_id ? subjectById.get(path.subject_id) : null;
      albums.push({
        pathId: path.id,
        titleAr: path.title_ar,
        titleEn: path.title_en,
        subject: path.subject_id ? { id: path.subject_id, nameAr: subject?.name_ar ?? null, nameEn: subject?.name_en ?? null } : null,
        stickers,
      });
    }
    const all = albums.flatMap((album) => album.stickers);
    return milestoneJson({ albums, earned: all.filter((sticker) => sticker.state === "earned").length, total: all.length } satisfies BossBookResponse);
  } catch (error) {
    console.error("Boss book failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
