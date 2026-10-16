// GET  /api/milestones/[id]/battle?lang= — the active battle (to resume), or null.
// POST /api/milestones/[id]/battle {lang} — start a battle, or resume the active one.
// Questions are drawn and shuffled server-side; the client only ever sees the
// current question in its per-battle option order, never an answer key.

import { isUuid } from "@/lib/learners/types";
import { BOSS_SIGNATURE_TYPES, drawBattleQuestions } from "@/lib/milestones/rules";
import { battleInteractionFor } from "@/lib/server/milestones/interactions";
import type { GetBattleResponse, StartBattleResponse } from "@/lib/milestones/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import {
  battleStateFor,
  isBossKey,
  loadActiveBattle,
  loadBlockLessons,
  loadMilestoneForLearner,
  loadPool,
  mapMilestoneRpcError,
  milestoneError,
  milestoneJson,
  milestoneUnlockedFor,
  parseLang,
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

    if (!preview && !(await milestoneUnlockedFor(admin, row, path, learnerId))) {
      return milestoneError("milestone_locked", 409);
    }

    const active = await loadActiveBattle(admin, learnerId, row.id);
    if (active) {
      const resumed: StartBattleResponse = { battle: await battleStateFor(admin, active, lang), resumed: true };
      return milestoneJson(resumed);
    }

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
    if (drawn.length === 0) return milestoneError("service_unavailable", 503);

    const { data, error } = await admin.rpc("start_milestone_battle", {
      p_milestone_id: row.id,
      p_learner_id: learnerId,
      p_question_ids: drawn.map((question) => question.id),
      p_preview: preview,
    });
    if (error || !data) {
      const mapped = mapMilestoneRpcError(error);
      return milestoneError(mapped.code, mapped.status);
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
