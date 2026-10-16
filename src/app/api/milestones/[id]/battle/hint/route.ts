// POST /api/milestones/[id]/battle/hint { position, lang? } — the one Owl Hint
// of the learner's active battle, for the current question, server-computed in
// display indexes: choices hide up to two WRONG options; match / sort / label
// lock one correct placement; put-in-order places the first step. The use is
// recorded on the battle, so it cannot be reused: a retry for the same
// question returns the same hint, another question gets 409 hint_used. Items
// with no fitting hint (true/false, tap-to-count, free entry) get 400
// hint_unavailable and the hint is not spent.

import { z } from "zod";
import { isUuid } from "@/lib/learners/types";
import type { HintResponse } from "@/lib/milestones/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { owlHintFor } from "@/lib/server/milestones/interactions";
import {
  battleStateFor,
  loadActiveBattle,
  loadBattle,
  loadBattleQuestion,
  loadMilestoneForLearner,
  milestoneError,
  milestoneJson,
  parseLang,
} from "@/lib/server/milestones/load";
import { servedItem } from "@/lib/server/milestones/present";

export const dynamic = "force-dynamic";

const HintSchema = z.object({
  position: z.number().int().min(0).max(15),
  lang: z.enum(["ar", "en"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin, preview } = opened.value;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const parsed = HintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("invalid_answer", 400);
  const { position } = parsed.data;
  const lang = parseLang(parsed.data.lang);

  try {
    const loaded = await loadMilestoneForLearner(admin, id, { preview });
    if (!loaded) return milestoneError("milestone_not_found", 404);
    const battle = await loadActiveBattle(admin, context.learnerId, id);
    if (!battle) return milestoneError("battle_not_found", 404);
    if (position !== battle.answered_count) {
      return milestoneError("position_mismatch", 409, { battle: await battleStateFor(admin, battle, lang) });
    }

    const question = await loadBattleQuestion(admin, battle, position);
    if (!question) return milestoneError("service_unavailable", 503);
    const item = servedItem(question.question, battle.id);
    if (!item) return milestoneError("service_unavailable", 503);
    const hint = owlHintFor(battle.id, question.question.id, item.interaction, item.perms);

    if (battle.hint_used_question_index !== null && battle.hint_used_question_index !== undefined) {
      return battle.hint_used_question_index === position && hint
        ? milestoneJson({ position, ...hint } satisfies HintResponse)
        : milestoneError("hint_used", 409);
    }
    if (!hint) return milestoneError("hint_unavailable", 400);
    const response: HintResponse = { position, ...hint };

    const { data: claimed, error } = await admin
      .from("milestone_battles")
      .update({ hint_used_question_index: position, hint_used_at: new Date().toISOString() })
      .eq("id", battle.id)
      .eq("status", "active")
      .eq("answered_count", position)
      .is("hint_used_question_index", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!claimed?.length) {
      // Lost a race (double tap, or an answer landed): report what is true now.
      const current = await loadBattle(admin, battle.id);
      if (current?.hint_used_question_index === position && current.answered_count === position) return milestoneJson(response);
      if (current && current.answered_count !== position) {
        return milestoneError("position_mismatch", 409, { battle: await battleStateFor(admin, current, lang) });
      }
      return milestoneError("hint_used", 409);
    }
    return milestoneJson(response);
  } catch (error) {
    console.error("Milestone hint failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
