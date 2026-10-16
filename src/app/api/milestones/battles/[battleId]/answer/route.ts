// POST /api/milestones/battles/[battleId]/answer — grade one answer.
// Body: { position, answer? (InteractionAnswer in display indexes), lang }
// (or the older { choiceIndex?, text? } for choice / free-entry items).
// The server maps the answer back through this battle's shuffles, grades it
// with the shared gradeInteraction against the key it holds and
// records it through record_milestone_answer. The response says only whether
// the answer was right; it never contains the correct answer.

import { after } from "next/server";
import { z } from "zod";
import { isUuid } from "@/lib/learners/types";
import { battlePhase, bossHpPercent, starsFor } from "@/lib/milestones/rules";
import type { AnswerResult, BattleQuestion } from "@/lib/milestones/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { gradeBattleAnswer, InvalidAnswerError, MAX_TEXT_ANSWER_LENGTH } from "@/lib/server/milestones/grade";
import { storedAnswer } from "@/lib/server/milestones/interactions";
import {
  battleStateFor,
  loadBattle,
  loadBattleCombo,
  loadBattleQuestion,
  mapMilestoneRpcError,
  milestoneError,
  milestoneJson,
  parseLang,
  type MilestoneAdminClient,
} from "@/lib/server/milestones/load";
import { notifyMilestonePassed } from "@/lib/server/milestones/notify";
import { heartsLeftFor, servedItem, toBattleQuestion, type MilestoneBattleRow } from "@/lib/server/milestones/present";

export const dynamic = "force-dynamic";

const AnswerSchema = z.object({
  position: z.number().int().min(0).max(15),
  answer: z.object({ type: z.string() }).passthrough().optional(),
  choiceIndex: z.number().int().min(0).max(15).optional(),
  text: z.string().max(MAX_TEXT_ANSWER_LENGTH).optional(),
  lang: z.enum(["ar", "en"]).optional(),
});

type RecordResult = {
  battle: MilestoneBattleRow;
  is_correct: boolean;
  replay: boolean;
  certificate_id: string | null;
  first_pass: boolean;
};

async function nextQuestion(admin: MilestoneAdminClient, battle: MilestoneBattleRow, lang: "ar" | "en"): Promise<BattleQuestion | null> {
  if (battle.status !== "active") return null;
  const loaded = await loadBattleQuestion(admin, battle, battle.answered_count);
  return loaded ? toBattleQuestion(loaded.question, battle.id, battle.answered_count, lang, loaded.languageMode) : null;
}

async function conflict(admin: MilestoneAdminClient, code: "battle_finished" | "position_mismatch", battleId: string, lang: "ar" | "en") {
  const current = await loadBattle(admin, battleId);
  return milestoneError(code, 409, current ? { battle: await battleStateFor(admin, current, lang) } : {});
}

export async function POST(request: Request, { params }: { params: Promise<{ battleId: string }> }) {
  const { battleId } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;
  if (!isUuid(battleId)) return milestoneError("battle_not_found", 404);

  const parsed = AnswerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return milestoneError("invalid_answer", 400);
  const { position, answer, choiceIndex, text } = parsed.data;
  const lang = parseLang(parsed.data.lang);

  try {
    const battle = await loadBattle(admin, battleId);
    if (!battle || battle.learner_id !== context.learnerId) return milestoneError("battle_not_found", 404);

    const isReplay = position < battle.answered_count;
    if (!isReplay) {
      if (battle.status !== "active") return conflict(admin, "battle_finished", battleId, lang);
      if (position !== battle.answered_count) return conflict(admin, "position_mismatch", battleId, lang);
    }

    let isCorrect = false;
    let canonicalIndex: number | null = null;
    let responseText: string | null = null;
    if (!isReplay) {
      const loaded = await loadBattleQuestion(admin, battle, position);
      if (!loaded) return milestoneError("service_unavailable", 503);
      const item = servedItem(loaded.question, battle.id);
      if (!item) return milestoneError("service_unavailable", 503);
      const graded = gradeBattleAnswer(item.interaction, item.perms, { answer, choiceIndex, text });
      isCorrect = graded.isCorrect;
      ({ choiceIndex: canonicalIndex, responseText } = storedAnswer(graded.canonical));
    }

    const { data, error } = await admin.rpc("record_milestone_answer", {
      p_battle_id: battle.id,
      p_position: position,
      p_choice_index: canonicalIndex,
      p_response_text: responseText,
      p_is_correct: isCorrect,
    });
    if (error || !data) {
      const mapped = mapMilestoneRpcError(error);
      if (mapped.code === "battle_finished" || mapped.code === "position_mismatch") {
        return conflict(admin, mapped.code, battleId, lang);
      }
      return milestoneError(mapped.code, mapped.status);
    }

    const recorded = data as RecordResult;
    const row = recorded.battle;
    const finished = row.status !== "active";
    const passed = row.status === "won";
    const certificateId = passed && !row.is_preview ? recorded.certificate_id ?? null : null;
    const firstPass = recorded.first_pass === true && !recorded.replay && certificateId !== null;

    if (firstPass && certificateId) {
      after(() => notifyMilestonePassed(admin, certificateId).then(
        () => undefined,
        (notifyError) => console.error("Milestone pass notification failed:", notifyError),
      ));
    }

    const hp = bossHpPercent(row.correct_count, row.required_correct);
    const result: AnswerResult = {
      correct: recorded.is_correct === true,
      heartsLeft: heartsLeftFor(row),
      bossHpPercent: hp,
      finished,
      passed,
      replay: recorded.replay === true,
      next: finished ? null : await nextQuestion(admin, row, lang),
      certificateId,
      firstPass,
      stars: passed ? starsFor(row.wrong_count, row.hearts_total) : null,
      combo: await loadBattleCombo(admin, row.id),
      phase: battlePhase(hp),
    };
    return milestoneJson(result);
  } catch (error) {
    if (error instanceof InvalidAnswerError) return milestoneError("invalid_answer", 400);
    console.error("Milestone answer failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
