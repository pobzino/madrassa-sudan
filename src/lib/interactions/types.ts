/**
 * Shared interaction primitive.
 *
 * A single discriminated-union shape for every student interaction on the
 * platform. Slides, lesson tasks, homework questions, diagnostic tests, and
 * sim checkpoints all speak this same language.
 *
 * Design notes
 * ------------
 * - Answers are strongly typed per interaction (no more "0:1" string parsing).
 * - Interactions are self-contained JSON: hand them to <InteractionRenderer>
 *   and they render, grade, and collect answers.
 * - Adapters in ./adapters.ts convert the legacy flat slide shape (20
 *   interaction_* columns on the Slide row) into this primitive on the fly,
 *   so no DB migration is required for Phase 1.
 */
import type { SlideInteractionHotspot } from '@/lib/slides.types';

export type InteractionType =
  | 'free_response'
  | 'choose_correct'
  | 'fill_missing_word'
  | 'true_false'
  | 'tap_to_count'
  | 'match_pairs'
  | 'sequence_order'
  | 'sort_groups'
  | 'draw_answer'
  | 'drag_drop_label';

export interface BilingualText {
  ar: string;
  en: string;
}

export interface BilingualList {
  ar: string[];
  en: string[];
}

interface InteractionBase<T extends InteractionType> {
  type: T;
  prompt: BilingualText;
}

export interface FreeResponseInteraction extends InteractionBase<'free_response'> {
  expected_answer: BilingualText;
}

export interface ChooseCorrectInteraction extends InteractionBase<'choose_correct'> {
  options: BilingualList;
  correct_index: number;
}

export interface FillMissingWordInteraction extends InteractionBase<'fill_missing_word'> {
  free_entry: boolean;
  /** Populated when free_entry is false. */
  options?: BilingualList;
  correct_index?: number;
  /** Populated when free_entry is true. */
  expected_answer?: BilingualText;
}

export interface TrueFalseInteraction extends InteractionBase<'true_false'> {
  answer: boolean;
}

export interface TapToCountInteraction extends InteractionBase<'tap_to_count'> {
  target: number;
  emoji: string;
}

export interface MatchPairsInteraction extends InteractionBase<'match_pairs'> {
  items: BilingualList;
  targets: BilingualList;
}

export interface SequenceOrderInteraction extends InteractionBase<'sequence_order'> {
  /** The listed order IS the correct order. */
  items: BilingualList;
}

export interface SortGroupsInteraction extends InteractionBase<'sort_groups'> {
  items: BilingualList;
  targets: BilingualList;
  /** solution_map[item_index] = target_index. */
  solution_map: number[];
}

export interface DrawAnswerInteraction extends InteractionBase<'draw_answer'> {
  expected_answer: BilingualText;
}

export interface DragDropLabelInteraction extends InteractionBase<'drag_drop_label'> {
  image_url: string | null;
  labels: BilingualList;
  /** hotspots[i] is the correct spot for labels.ar[i] / labels.en[i]. */
  hotspots: SlideInteractionHotspot[];
}

export type Interaction =
  | FreeResponseInteraction
  | ChooseCorrectInteraction
  | FillMissingWordInteraction
  | TrueFalseInteraction
  | TapToCountInteraction
  | MatchPairsInteraction
  | SequenceOrderInteraction
  | SortGroupsInteraction
  | DrawAnswerInteraction
  | DragDropLabelInteraction;

// ── Answers ──────────────────────────────────────────────────────────────

export interface Placement {
  /** Index into the items/labels list. */
  item_index: number;
  /** Index into the targets/hotspots list. */
  target_index: number;
}

export type InteractionAnswer =
  | { type: 'free_response'; text: string }
  | { type: 'choose_correct'; selected_index: number }
  | {
      type: 'fill_missing_word';
      /** Populated when the interaction is free-entry. */
      text?: string;
      /** Populated when the interaction is multiple choice. */
      selected_index?: number;
    }
  | { type: 'true_false'; value: boolean }
  | { type: 'tap_to_count'; count: number }
  | { type: 'match_pairs'; placements: Placement[] }
  | { type: 'sequence_order'; order: number[] }
  | { type: 'sort_groups'; placements: Placement[] }
  | {
      type: 'draw_answer';
      /** PNG data URL of the rasterized whiteboard. */
      image_data_url: string;
      /** Populated after the vision grader returns. */
      vision_result?: { is_correct: boolean; feedback?: string };
    }
  | {
      type: 'drag_drop_label';
      placements: Array<{ label_index: number; hotspot_index: number }>;
    };

// ── Results ──────────────────────────────────────────────────────────────

export type GradingSource = 'client' | 'vision' | 'ai' | 'manual';

export interface InteractionResult {
  answer: InteractionAnswer;
  is_correct: boolean;
  /** 0-1 partial credit, or undefined for binary. */
  score?: number;
  feedback?: string;
  graded_by: GradingSource;
  graded_at: string;
  time_spent_ms?: number;
}
