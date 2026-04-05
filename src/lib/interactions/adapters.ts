/**
 * Legacy ↔ primitive adapters.
 *
 * Converts the flat `interaction_*` columns on Slide (and any other container
 * that embeds them) into a typed Interaction, and packs/unpacks typed answers
 * to and from the legacy `boolean | number | string | string[] | null` shape
 * already stored in StoredSlideInteractionResponses and task_responses rows.
 *
 * These adapters let Phase 1 callers consume the new primitive without any
 * DB migration. Existing storage remains untouched.
 */
import type { Slide, SlideInteractionType } from '@/lib/slides.types';
import type {
  Interaction,
  InteractionAnswer,
  BilingualList,
} from './types';

type LegacyAnswer = boolean | number | string | string[] | null;

function pickList(
  ar: string[] | null | undefined,
  en: string[] | null | undefined
): BilingualList {
  return {
    ar: Array.isArray(ar) ? ar : [],
    en: Array.isArray(en) ? en : [],
  };
}

/**
 * Build an Interaction from the flat interaction_* fields on a container.
 * Returns null when the container has no interaction_type set or the data is
 * too incomplete to form a valid Interaction.
 */
export function slideToInteraction(slide: Slide): Interaction | null {
  if (!slide.interaction_type) {
    return null;
  }

  const prompt = {
    ar: slide.interaction_prompt_ar?.trim() || '',
    en: slide.interaction_prompt_en?.trim() || '',
  };

  switch (slide.interaction_type) {
    case 'free_response':
      return {
        type: 'free_response',
        prompt,
        expected_answer: {
          ar: slide.interaction_expected_answer_ar?.trim() || '',
          en: slide.interaction_expected_answer_en?.trim() || '',
        },
      };

    case 'choose_correct':
      return {
        type: 'choose_correct',
        prompt,
        options: pickList(slide.interaction_options_ar, slide.interaction_options_en),
        correct_index: slide.interaction_correct_index ?? -1,
      };

    case 'fill_missing_word': {
      const freeEntry = slide.interaction_free_entry === true;
      if (freeEntry) {
        return {
          type: 'fill_missing_word',
          prompt,
          free_entry: true,
          expected_answer: {
            ar: slide.interaction_expected_answer_ar?.trim() || '',
            en: slide.interaction_expected_answer_en?.trim() || '',
          },
        };
      }
      return {
        type: 'fill_missing_word',
        prompt,
        free_entry: false,
        options: pickList(slide.interaction_options_ar, slide.interaction_options_en),
        correct_index: slide.interaction_correct_index ?? -1,
      };
    }

    case 'true_false':
      return {
        type: 'true_false',
        prompt,
        answer: slide.interaction_true_false_answer ?? false,
      };

    case 'tap_to_count':
      return {
        type: 'tap_to_count',
        prompt,
        target: slide.interaction_count_target ?? 0,
        emoji: slide.interaction_visual_emoji?.trim() || '⭐',
      };

    case 'match_pairs':
      return {
        type: 'match_pairs',
        prompt,
        items: pickList(slide.interaction_items_ar, slide.interaction_items_en),
        targets: pickList(slide.interaction_targets_ar, slide.interaction_targets_en),
      };

    case 'sequence_order':
      return {
        type: 'sequence_order',
        prompt,
        items: pickList(slide.interaction_items_ar, slide.interaction_items_en),
      };

    case 'sort_groups':
      return {
        type: 'sort_groups',
        prompt,
        items: pickList(slide.interaction_items_ar, slide.interaction_items_en),
        targets: pickList(slide.interaction_targets_ar, slide.interaction_targets_en),
        solution_map: slide.interaction_solution_map ?? [],
      };

    case 'draw_answer':
      return {
        type: 'draw_answer',
        prompt,
        expected_answer: {
          ar: slide.interaction_expected_answer_ar?.trim() || '',
          en: slide.interaction_expected_answer_en?.trim() || '',
        },
      };

    case 'drag_drop_label':
      return {
        type: 'drag_drop_label',
        prompt,
        image_url: slide.image_url || null,
        labels: pickList(slide.interaction_items_ar, slide.interaction_items_en),
        hotspots: slide.interaction_hotspots ?? [],
      };

    default:
      return null;
  }
}

/**
 * Convert a typed Interaction back into the flat interaction_* columns on a
 * Slide (or any container with the same column set). Returns every
 * interaction_* column so callers can shallow-merge the result into their
 * state without stale values from a previous type leaking through.
 */
export function interactionToSlide(interaction: Interaction): Partial<Slide> {
  const base: Partial<Slide> = {
    interaction_type: interaction.type as SlideInteractionType,
    interaction_prompt_ar: interaction.prompt.ar || null,
    interaction_prompt_en: interaction.prompt.en || null,
    interaction_expected_answer_ar: null,
    interaction_expected_answer_en: null,
    interaction_options_ar: null,
    interaction_options_en: null,
    interaction_correct_index: null,
    interaction_true_false_answer: null,
    interaction_count_target: null,
    interaction_visual_emoji: null,
    interaction_items_ar: null,
    interaction_items_en: null,
    interaction_targets_ar: null,
    interaction_targets_en: null,
    interaction_solution_map: null,
    interaction_free_entry: null,
    interaction_hotspots: null,
  };

  switch (interaction.type) {
    case 'free_response':
      return {
        ...base,
        interaction_expected_answer_ar: interaction.expected_answer.ar || null,
        interaction_expected_answer_en: interaction.expected_answer.en || null,
      };

    case 'choose_correct':
      return {
        ...base,
        interaction_options_ar: interaction.options.ar,
        interaction_options_en: interaction.options.en,
        interaction_correct_index: interaction.correct_index,
      };

    case 'fill_missing_word':
      if (interaction.free_entry) {
        return {
          ...base,
          interaction_free_entry: true,
          interaction_expected_answer_ar:
            interaction.expected_answer?.ar || null,
          interaction_expected_answer_en:
            interaction.expected_answer?.en || null,
        };
      }
      return {
        ...base,
        interaction_free_entry: false,
        interaction_options_ar: interaction.options?.ar ?? [],
        interaction_options_en: interaction.options?.en ?? [],
        interaction_correct_index: interaction.correct_index ?? 0,
      };

    case 'true_false':
      return {
        ...base,
        interaction_true_false_answer: interaction.answer,
      };

    case 'tap_to_count':
      return {
        ...base,
        interaction_count_target: interaction.target,
        interaction_visual_emoji: interaction.emoji,
      };

    case 'match_pairs':
      return {
        ...base,
        interaction_items_ar: interaction.items.ar,
        interaction_items_en: interaction.items.en,
        interaction_targets_ar: interaction.targets.ar,
        interaction_targets_en: interaction.targets.en,
      };

    case 'sequence_order':
      return {
        ...base,
        interaction_items_ar: interaction.items.ar,
        interaction_items_en: interaction.items.en,
      };

    case 'sort_groups':
      return {
        ...base,
        interaction_items_ar: interaction.items.ar,
        interaction_items_en: interaction.items.en,
        interaction_targets_ar: interaction.targets.ar,
        interaction_targets_en: interaction.targets.en,
        interaction_solution_map: interaction.solution_map,
      };

    case 'draw_answer':
      return {
        ...base,
        interaction_expected_answer_ar: interaction.expected_answer.ar || null,
        interaction_expected_answer_en: interaction.expected_answer.en || null,
      };

    case 'drag_drop_label':
      return {
        ...base,
        interaction_items_ar: interaction.labels.ar,
        interaction_items_en: interaction.labels.en,
        interaction_hotspots: interaction.hotspots,
      };
  }
}

// ── Answer conversions ───────────────────────────────────────────────────

function parseMapping(entries: string[]): Array<{ a: number; b: number }> {
  const out: Array<{ a: number; b: number }> = [];
  for (const entry of entries) {
    const [aRaw, bRaw] = entry.split(':');
    const a = Number(aRaw);
    const b = Number(bRaw);
    if (Number.isInteger(a) && Number.isInteger(b)) {
      out.push({ a, b });
    }
  }
  return out;
}

function packMapping(pairs: Array<{ a: number; b: number }>): string[] {
  return pairs.map(({ a, b }) => `${a}:${b}`);
}

/**
 * Convert a typed InteractionAnswer to the legacy storage shape
 * (boolean | number | string | string[] | null) used by existing tables.
 */
export function answerToLegacy(answer: InteractionAnswer): LegacyAnswer {
  switch (answer.type) {
    case 'free_response':
      return answer.text;
    case 'choose_correct':
      return answer.selected_index;
    case 'fill_missing_word':
      if (typeof answer.text === 'string') return answer.text;
      if (typeof answer.selected_index === 'number') return answer.selected_index;
      return null;
    case 'true_false':
      return answer.value;
    case 'tap_to_count':
      return answer.count;
    case 'match_pairs':
      return packMapping(
        answer.placements.map((p) => ({ a: p.item_index, b: p.target_index }))
      );
    case 'sequence_order':
      return answer.order.map(String);
    case 'sort_groups':
      return packMapping(
        answer.placements.map((p) => ({ a: p.item_index, b: p.target_index }))
      );
    case 'draw_answer':
      return answer.image_data_url;
    case 'drag_drop_label':
      return packMapping(
        answer.placements.map((p) => ({ a: p.label_index, b: p.hotspot_index }))
      );
  }
}

/**
 * Convert a legacy raw answer back into a typed InteractionAnswer using the
 * Interaction as the discriminator. Returns null when the raw data is absent
 * or malformed.
 */
export function answerFromLegacy(
  interaction: Interaction,
  raw: LegacyAnswer
): InteractionAnswer | null {
  switch (interaction.type) {
    case 'free_response':
      return typeof raw === 'string' ? { type: 'free_response', text: raw } : null;

    case 'choose_correct':
      return typeof raw === 'number'
        ? { type: 'choose_correct', selected_index: raw }
        : null;

    case 'fill_missing_word':
      if (interaction.free_entry) {
        return typeof raw === 'string'
          ? { type: 'fill_missing_word', text: raw }
          : null;
      }
      return typeof raw === 'number'
        ? { type: 'fill_missing_word', selected_index: raw }
        : null;

    case 'true_false':
      return typeof raw === 'boolean' ? { type: 'true_false', value: raw } : null;

    case 'tap_to_count':
      return typeof raw === 'number' ? { type: 'tap_to_count', count: raw } : null;

    case 'match_pairs':
      return Array.isArray(raw)
        ? {
            type: 'match_pairs',
            placements: parseMapping(raw).map(({ a, b }) => ({
              item_index: a,
              target_index: b,
            })),
          }
        : null;

    case 'sequence_order':
      return Array.isArray(raw)
        ? {
            type: 'sequence_order',
            order: raw
              .map((v) => Number(v))
              .filter((n) => Number.isInteger(n)),
          }
        : null;

    case 'sort_groups':
      return Array.isArray(raw)
        ? {
            type: 'sort_groups',
            placements: parseMapping(raw).map(({ a, b }) => ({
              item_index: a,
              target_index: b,
            })),
          }
        : null;

    case 'draw_answer':
      return typeof raw === 'string'
        ? { type: 'draw_answer', image_data_url: raw }
        : null;

    case 'drag_drop_label':
      return Array.isArray(raw)
        ? {
            type: 'drag_drop_label',
            placements: parseMapping(raw).map(({ a, b }) => ({
              label_index: a,
              hotspot_index: b,
            })),
          }
        : null;
  }
}
