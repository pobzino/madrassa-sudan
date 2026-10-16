import "server-only";

import type { InteractionAnswer } from "@/lib/interactions/types";
import {
  gradeBattleInteraction,
  InvalidAnswerError,
  legacyBattleAnswer,
  MAX_TEXT_ANSWER_LENGTH,
  toCanonicalAnswer,
  type BattleInteraction,
  type InteractionPerms,
} from "@/lib/server/milestones/interactions";

export { InvalidAnswerError, MAX_TEXT_ANSWER_LENGTH };

/**
 * Grade one battle answer against the server-held key. The answer arrives in
 * DISPLAY indexes (an InteractionAnswer, or the older { choiceIndex, text }
 * shape for choice / free-entry items); it is mapped back through this
 * battle's shuffles and graded with the shared gradeInteraction. Throws
 * InvalidAnswerError (400, nothing written) for a malformed answer.
 */
export function gradeBattleAnswer(
  interaction: BattleInteraction,
  perms: InteractionPerms,
  answer: { answer?: unknown; choiceIndex?: number; text?: string },
): { isCorrect: boolean; canonical: InteractionAnswer } {
  const displayAnswer = answer.answer ?? legacyBattleAnswer(interaction, answer.choiceIndex, answer.text);
  if (!displayAnswer) throw new InvalidAnswerError();
  const canonical = toCanonicalAnswer(interaction, perms, displayAnswer);
  return { isCorrect: gradeBattleInteraction(interaction, canonical), canonical };
}
