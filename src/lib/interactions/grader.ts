/**
 * Interaction grader.
 *
 * Single entry point `gradeInteraction(interaction, answer)` that dispatches
 * by interaction type. For client-side types (MCQ, true/false, counts, pair
 * matching, drag-drop, sequence, sort) grading runs synchronously. For
 * vision-graded types (draw_answer) the caller is expected to embed the
 * vision verdict on the answer and we simply read it back.
 *
 * AI-graded types (free_response) currently resolve to `is_correct: true`
 * when the student has typed something, matching today's behaviour in
 * computeSlideInteractionCorrectness. Swap in a real AI call later without
 * changing callers.
 */
import type { Interaction, InteractionAnswer, InteractionResult } from './types';

function result(
  answer: InteractionAnswer,
  is_correct: boolean,
  graded_by: InteractionResult['graded_by'] = 'client',
  feedback?: string
): InteractionResult {
  return {
    answer,
    is_correct,
    graded_by,
    graded_at: new Date().toISOString(),
    feedback,
  };
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim();
}

export function gradeInteraction(
  interaction: Interaction,
  answer: InteractionAnswer
): InteractionResult {
  if (interaction.type !== answer.type) {
    return result(answer, false);
  }

  switch (interaction.type) {
    case 'free_response':
      // Free responses are "correct" as soon as the student has typed
      // something. Real AI grading replaces this later.
      if (answer.type !== 'free_response') return result(answer, false);
      return result(answer, answer.text.trim().length > 0, 'ai');

    case 'choose_correct':
      if (answer.type !== 'choose_correct') return result(answer, false);
      return result(answer, answer.selected_index === interaction.correct_index);

    case 'fill_missing_word': {
      if (answer.type !== 'fill_missing_word') return result(answer, false);
      if (interaction.free_entry) {
        if (typeof answer.text !== 'string') return result(answer, false);
        const normalized = normalize(answer.text);
        const expectedAr = interaction.expected_answer?.ar?.trim() ?? '';
        const expectedEn = interaction.expected_answer?.en?.trim() ?? '';
        const matches =
          (expectedAr.length > 0 && normalize(expectedAr) === normalized) ||
          (expectedEn.length > 0 && normalize(expectedEn) === normalized);
        return result(answer, matches);
      }
      return result(answer, answer.selected_index === interaction.correct_index);
    }

    case 'true_false':
      if (answer.type !== 'true_false') return result(answer, false);
      return result(answer, answer.value === interaction.answer);

    case 'tap_to_count':
      if (answer.type !== 'tap_to_count') return result(answer, false);
      return result(answer, answer.count === interaction.target);

    case 'match_pairs': {
      if (answer.type !== 'match_pairs') return result(answer, false);
      const len = Math.max(interaction.items.ar.length, interaction.items.en.length);
      if (len === 0 || answer.placements.length !== len) return result(answer, false);
      const map = new Map<number, number>();
      for (const p of answer.placements) map.set(p.item_index, p.target_index);
      const ok = Array.from({ length: len }).every((_, i) => map.get(i) === i);
      return result(answer, ok);
    }

    case 'sequence_order': {
      if (answer.type !== 'sequence_order') return result(answer, false);
      const len = Math.max(interaction.items.ar.length, interaction.items.en.length);
      if (answer.order.length !== len) return result(answer, false);
      const ok = answer.order.every((value, index) => value === index);
      return result(answer, ok);
    }

    case 'sort_groups': {
      if (answer.type !== 'sort_groups') return result(answer, false);
      const len = interaction.solution_map.length;
      if (len === 0 || answer.placements.length !== len) return result(answer, false);
      const map = new Map<number, number>();
      for (const p of answer.placements) map.set(p.item_index, p.target_index);
      const ok = interaction.solution_map.every(
        (targetIndex, itemIndex) => map.get(itemIndex) === targetIndex
      );
      return result(answer, ok);
    }

    case 'draw_answer': {
      if (answer.type !== 'draw_answer') return result(answer, false);
      // Drawings are graded by the vision API at submit time. The caller
      // attaches the verdict to the answer before handing it to the grader.
      if (answer.vision_result) {
        return {
          answer,
          is_correct: answer.vision_result.is_correct,
          graded_by: 'vision',
          graded_at: new Date().toISOString(),
          feedback: answer.vision_result.feedback,
        };
      }
      // No verdict yet: treat any non-empty drawing as pending but accepted,
      // matching today's behaviour in computeSlideInteractionCorrectness.
      return result(answer, answer.image_data_url.trim().length > 0, 'vision');
    }

    case 'drag_drop_label': {
      if (answer.type !== 'drag_drop_label') return result(answer, false);
      const len = interaction.hotspots.length;
      if (
        len === 0 ||
        len !== Math.max(interaction.labels.ar.length, interaction.labels.en.length) ||
        answer.placements.length !== len
      ) {
        return result(answer, false);
      }
      const map = new Map<number, number>();
      for (const p of answer.placements) map.set(p.hotspot_index, p.label_index);
      // Correct iff hotspot[i] holds label[i].
      const ok = Array.from({ length: len }).every((_, i) => map.get(i) === i);
      return result(answer, ok);
    }
  }
}
