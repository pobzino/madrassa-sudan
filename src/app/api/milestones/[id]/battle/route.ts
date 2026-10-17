// GET  /api/milestones/[id]/battle?lang= — the active battle (to resume), or null.
// POST /api/milestones/[id]/battle {lang} — start a battle, or resume the active one.
// Questions are drawn and shuffled server-side; the client only ever sees the
// current question in its per-battle option order, never an answer key.

import { isUuid } from "@/lib/learners/types";
import { BOSS_SIGNATURE_TYPES, drawBattleQuestions } from "@/lib/milestones/rules";
import { drawPlacementQuestions } from "@/lib/measurement/rules";
import { battleInteractionFor } from "@/lib/server/milestones/interactions";
import type { GetBattleResponse, StartBattleResponse } from "@/lib/milestones/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import {
  battleStateFor,
  isBossKey,
  isFinalBoss,
  isPlacement,
  loadActiveBattle,
  loadBlockLessons,
  loadMilestoneForLearner,
  loadPool,
  mapMilestoneRpcError,
  milestoneError,
  milestoneJson,
  milestoneLockedMessage,
  milestoneUnlockedFor,
  parseLang,
  type MilestoneAdminClient,
  type MilestoneRow,
  type PathRow,
} from "@/lib/server/milestones/load";
import type { MilestoneBattleRow } from "@/lib/server/milestones/present";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin, preview } = opened.value;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const lang = parseLang(new URL(request.url).searchParams.get("lang"));

  try {
    const loaded = await loadMilestoneForLearner(admin, id, { preview });
    if (!loaded) return milestoneError("milestone_not_found", 404);
    const active = await loadActiveBattle(admin, context.learnerId, id);
    const body: GetBattleResponse = { battle: active ? await battleStateFor(admin, active, lang) : null };
    return milestoneJson(body);
  } catch (error) {
    console.error("Milestone battle lookup failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}

/**
 * A placement's or final boss's draw: the 12 items follow the difficulty plan
 * (4 easy, 4 medium, 4 hard; skills round-robin, earlier weeks first) from the
 * whole path's pool; no "recently seen" preference and no signature-turn reordering.
 */
async function drawAcrossPath(admin: MilestoneAdminClient, row: MilestoneRow, path: PathRow) {
  // The pool and each lesson's week, in parallel (one query: weeks with their steps embedded).
  const [pool, { data: weeks }] = await Promise.all([
    loadPool(admin, row.assignment_id),
    admin
      .from("learning_path_weeks")
      .select("week_number, learning_path_steps(lesson_id)")
      .eq("path_id", path.id)
      .returns<Array<{ week_number: number; learning_path_steps?: Array<{ lesson_id: string }> | null }>>(),
  ]);
  const weekOfLesson = new Map<string, number>();
  for (const week of weeks ?? []) {
    for (const step of week.learning_path_steps ?? []) {
      weekOfLesson.set(step.lesson_id, Math.min(week.week_number, weekOfLesson.get(step.lesson_id) ?? 99));
    }
  }
  const drawn = drawPlacementQuestions(
    pool.map((question) => ({
      id: question.id,
      skillKey: question.skill_key ?? null,
      difficulty: question.difficulty === 1 || question.difficulty === 2 || question.difficulty === 3 ? question.difficulty : null,
      sourceWeek: question.source_lesson_id ? weekOfLesson.get(question.source_lesson_id) ?? 99 : 99,
      sourceLessonId: question.source_lesson_id,
    })),
    row.battle_question_count,
  );
  return drawn;
}

/** A block boss's draw: the block's questions, later weeks ranking harder, signature moves on block turns. */
async function drawFromBlock(admin: MilestoneAdminClient, row: MilestoneRow, path: PathRow, learnerId: string) {
  const [pool, blockLessons, { data: lastBattle }] = await Promise.all([
    loadPool(admin, row.assignment_id),
    loadBlockLessons(admin, path.id, row.after_week_number, "ar"),
    admin
      .from("milestone_battles")
      .select("question_ids")
      .eq("learner_id", learnerId)
      .eq("milestone_id", row.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ question_ids: string[] }>(),
  ]);
  // Later lessons in the block rank harder, so phase 2 skews to the later weeks.
  const lessonRank = new Map(blockLessons.map((lesson, index) => [lesson.lessonId, index]));
  // The boss's signature moves go on its block turns where the pool allows.
  const signature = new Set<string>(BOSS_SIGNATURE_TYPES[isBossKey(row.boss_key) ? row.boss_key : "puzzle_owlet"]);
  const drawn = drawBattleQuestions(
    pool.map((question) => ({
      id: question.id,
      sourceLessonId: question.source_lesson_id,
      type: battleInteractionFor(question)?.type ?? null,
    })),
    row.battle_question_count,
    {
      recentlySeen: new Set(lastBattle?.question_ids ?? []),
      rankOf: (question) => (question.sourceLessonId ? lessonRank.get(question.sourceLessonId) ?? 0 : 0),
      preferred: (question) => question.type !== null && signature.has(question.type),
    },
  );
  return drawn;
}

/**
 * A placement ("Meet your first boss"): never locked; the 12 items follow the
 * difficulty plan (4 easy, 4 medium, 4 hard; skills round-robin, earlier weeks
 * first); no "recently seen" preference and no signature-turn reordering.
 */
async function startPlacement(
  admin: MilestoneAdminClient,
  row: MilestoneRow,
  path: PathRow,
  learnerId: string,
  preview: boolean,
  lang: "ar" | "en",
) {
  const active = await loadActiveBattle(admin, learnerId, row.id);
  if (active) {
    const resumed: StartBattleResponse = { battle: await battleStateFor(admin, active, lang), resumed: true };
    return milestoneJson(resumed);
  }
  const drawn = await drawAcrossPath(admin, row, path);
  if (drawn.length === 0) return milestoneError("service_unavailable", 503);

  const { data, error } = await admin.rpc("start_milestone_battle", {
    p_milestone_id: row.id,
    p_learner_id: learnerId,
    p_question_ids: drawn.map((question) => question.id),
    p_preview: preview,
  });
  if (error || !data) {
    const mapped = mapMilestoneRpcError(error, { lang, bossKey: isBossKey(row.boss_key) ? row.boss_key : null });
    return milestoneError(mapped.code, mapped.status, mapped.code === "placement_done" ? { message: mapped.message } : {});
  }
  const result = data as { battle: MilestoneBattleRow; resumed: boolean };
  const response: StartBattleResponse = { battle: await battleStateFor(admin, result.battle, lang), resumed: result.resumed === true };
  return milestoneJson(response);
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin, preview } = opened.value;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const body = (await request.json().catch(() => null)) as { lang?: unknown } | null;
  const lang = parseLang(body?.lang);
  const learnerId = context.learnerId;

  try {
    const loaded = await loadMilestoneForLearner(admin, id, { preview });
    if (!loaded) return milestoneError("milestone_not_found", 404);
    const { row, path } = loaded;

    if (isPlacement(row)) return startPlacement(admin, row, path, learnerId, preview, lang);

    if (!preview && !(await milestoneUnlockedFor(admin, row, path, learnerId))) {
      return milestoneError("milestone_locked", 409, { message: milestoneLockedMessage(lang, row.after_week_number, isFinalBoss(row)) });
    }

    const active = await loadActiveBattle(admin, learnerId, row.id);
    if (active) {
      const resumed: StartBattleResponse = { battle: await battleStateFor(admin, active, lang), resumed: true };
      return milestoneJson(resumed);
    }

    // The final boss plays as a Big Challenge but draws like the starting boss: 4/4/4 across the whole path.
    const drawn = isFinalBoss(row) ? await drawAcrossPath(admin, row, path) : await drawFromBlock(admin, row, path, learnerId);
    if (drawn.length === 0) return milestoneError("service_unavailable", 503);

    const { data, error } = await admin.rpc("start_milestone_battle", {
      p_milestone_id: row.id,
      p_learner_id: learnerId,
      p_question_ids: drawn.map((question) => question.id),
      p_preview: preview,
    });
    if (error || !data) {
      // The database re-checks the block (milestone_locked) as a floor under the check above.
      const mapped = mapMilestoneRpcError(error, { lang, afterWeekNumber: row.after_week_number, final: isFinalBoss(row) });
      return milestoneError(mapped.code, mapped.status, mapped.code === "milestone_locked" ? { message: mapped.message } : {});
    }
    const result = data as { battle: MilestoneBattleRow; resumed: boolean };
    const response: StartBattleResponse = {
      battle: await battleStateFor(admin, result.battle, lang),
      resumed: result.resumed === true,
    };
    return milestoneJson(response);
  } catch (error) {
    console.error("Milestone battle start failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
