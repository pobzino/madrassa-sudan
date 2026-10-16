-- Accept point-cloud answers from Arabic and English letter-tracing slides.
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
    'drag_drop_label',
    'trace_letter'
  ));

ALTER TYPE public.homework_question_type ADD VALUE IF NOT EXISTS 'trace_letter';
