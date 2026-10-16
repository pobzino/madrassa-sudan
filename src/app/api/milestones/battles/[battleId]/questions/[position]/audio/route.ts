// POST /api/milestones/battles/[battleId]/questions/[position]/audio {lang}
// Narrates one question of the learner's own battle (instruction, content and
// the options in this battle's display order) for pre-readers.

import { isUuid } from "@/lib/learners/types";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import { loadBattle, loadBattleQuestion, milestoneError, milestoneJson, parseLang } from "@/lib/server/milestones/load";
import { battleDisplayOptions } from "@/lib/server/milestones/present";
import { narrateQuestion } from "@/lib/server/question-audio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ battleId: string; position: string }> },
) {
  const { battleId, position: rawPosition } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin } = opened.value;

  const position = Number(rawPosition);
  if (!isUuid(battleId) || !/^\d+$/.test(rawPosition) || !Number.isInteger(position)) {
    return milestoneError("battle_not_found", 404);
  }
  const body = (await request.json().catch(() => null)) as { lang?: unknown } | null;
  const lang = parseLang(body?.lang);

  try {
    const battle = await loadBattle(admin, battleId);
    if (!battle || battle.learner_id !== context.learnerId || position >= battle.question_count) {
      return milestoneError("battle_not_found", 404);
    }
    const loaded = await loadBattleQuestion(admin, battle, position);
    if (!loaded) return milestoneError("battle_not_found", 404);

    const result = await narrateQuestion(admin, loaded.question, lang, loaded.languageMode, {
      displayOptions: battleDisplayOptions(loaded.question, battle.id, lang, loaded.languageMode),
      reuseStoredVariant: true,
    });
    if ("error" in result) {
      return milestoneError("service_unavailable", result.status, { message: result.error });
    }
    return milestoneJson({ audio_url: result.audioUrl });
  } catch (error) {
    console.error("Milestone narration failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
