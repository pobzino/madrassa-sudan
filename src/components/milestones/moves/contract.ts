import type { AnswerRequest, BattleInteractionType, BattleQuestion, Lang, PublicInteraction } from "@/lib/milestones/types";
import type { BilingualList, BilingualText, InteractionAnswer } from "@/lib/interactions/types";

/**
 * A battle move is the question's PublicInteraction (types.ts): a shared
 * Interaction with every answer key stripped and every list in display order.
 * The answer goes back as an InteractionAnswer in those display indexes.
 */
export type { PublicInteraction };
export type MoveType = BattleInteractionType;

/** The localized list, falling back to the other language (as InteractionRenderer does). */
export function pickList(list: BilingualList | null | undefined, lang: Lang): string[] {
  if (!list) return [];
  return list[lang]?.length ? list[lang] : list[lang === "ar" ? "en" : "ar"] ?? [];
}

export function pickText(text: BilingualText | null | undefined, lang: Lang): string {
  if (!text) return "";
  return text[lang] || text[lang === "ar" ? "en" : "ar"] || "";
}

/** The prompt to show: the server's localized instruction, else the interaction's own. */
export function promptOf(question: BattleQuestion, lang: Lang): string {
  return question.instruction || pickText(question.interaction.prompt, lang);
}

export function answerRequestFor(question: BattleQuestion, answer: InteractionAnswer): AnswerRequest {
  return { position: question.position, answer };
}

/** Moves the Owl hint can help with. */
export function hintFits(interaction: PublicInteraction): boolean {
  switch (interaction.type) {
    case "choose_correct":
      return interaction.options.ar.length >= 3 || interaction.options.en.length >= 3;
    case "fill_missing_word":
      return !interaction.free_entry && Boolean(interaction.options) && Math.max(interaction.options?.ar.length ?? 0, interaction.options?.en.length ?? 0) >= 3;
    case "match_pairs":
    case "sort_groups":
    case "drag_drop_label":
    case "sequence_order":
      return true;
    default:
      return false;
  }
}
