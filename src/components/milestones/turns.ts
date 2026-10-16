import type { AnswerResult, BattlePhase, BattleQuestion, BattleState, BattleTurn } from "@/lib/milestones/types";
import { battlePhase, battleTurn } from "@/lib/milestones/rules";

/**
 * Turn-based fight fields. The server sends them (types.ts); these readers
 * fall back to the shared rules if a field is ever missing.
 */
export type { BattlePhase, BattleTurn };

export function turnOf(question: BattleQuestion): BattleTurn {
  return question.turn === "attack" || question.turn === "block" ? question.turn : battleTurn(question.position);
}

export function phaseOf(source: BattleState | AnswerResult, hpPercent: number): BattlePhase {
  return source.phase === 1 || source.phase === 2 ? source.phase : battlePhase(hpPercent);
}

/** Every 3rd right answer in a row charges the Super Star for the next one. */
export function superReady(combo: number): boolean {
  return combo > 0 && combo % 3 === 0;
}
