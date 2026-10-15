-- =============================================================================
-- lesson_slide_responses: accept drawing and drag-the-label answers
-- =============================================================================
-- Slides can ask for a drawing (draw_answer, which the AI deck generator
-- creates) or for labels dragged onto a picture (drag_drop_label, which
-- teachers author), but the interaction_type CHECK from 20260405152116 only
-- lists the eight older kinds. Every such answer, and every skip of such a
-- slide, failed with a check violation: teachers never saw them, and the
-- lesson players kept them queued and re-sent them (drawings included) on
-- every sync.
--
-- Ship with or before the offline-lessons code. Answers already queued on
-- phones go through on their next sync once this is applied.
-- =============================================================================

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.lesson_slide_responses
  DROP CONSTRAINT IF EXISTS lesson_slide_responses_interaction_type_check;

ALTER TABLE public.lesson_slide_responses
  ADD CONSTRAINT lesson_slide_responses_interaction_type_check
  CHECK (interaction_type IN (
    'free_response',
    'choose_correct',
    'true_false',
    'tap_to_count',
    'match_pairs',
    'sequence_order',
    'sort_groups',
    'fill_missing_word',
    'draw_answer',
    'drag_drop_label'
  ));
