-- =============================================================================
-- Big Challenge: letter tracing (trace_letter) as a battle move
-- =============================================================================
-- A trace_letter pool item is graded by the server (stroke matching against
-- the letter's template, gradeInteraction) like every other interaction, so
-- it counts as auto-gradable: start_milestone_battle may draw it and
-- publish_milestone counts it. Only milestone_question_gradable changes (same
-- signature, same privileges: service_role only). Runs after
-- 20261016190000_trace_letter_interactions.sql (lesson / homework tracing) and
-- 20261017120000_milestone_tests.sql (which created the function).
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.milestone_question_gradable(
  p_question_type text, p_correct_answer text, p_interaction jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(p_interaction ->> 'type', '') IN ('choose_correct', 'true_false', 'fill_missing_word',
                                                    'tap_to_count', 'match_pairs', 'sequence_order',
                                                    'sort_groups', 'drag_drop_label', 'trace_letter')
      OR (coalesce(p_question_type, '') IN ('multiple_choice', 'true_false', 'short_answer')
          AND nullif(btrim(p_correct_answer), '') IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.milestone_question_gradable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.milestone_question_gradable(text, text, jsonb) TO service_role;

-- Fail closed: abort unless the function is exactly as intended.
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = 'milestone_question_gradable') <> 1 THEN
    RAISE EXCEPTION 'milestone trace migration aborted: expected exactly one milestone_question_gradable';
  END IF;
  IF has_function_privilege('authenticated', 'public.milestone_question_gradable(text, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.milestone_question_gradable(text, text, jsonb)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = 'public.milestone_question_gradable(text, text, jsonb)'::regprocedure
                  AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.milestone_question_gradable(text, text, jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'milestone trace migration aborted: milestone_question_gradable is callable by clients or SECURITY DEFINER';
  END IF;
  IF NOT public.milestone_question_gradable('long_answer', NULL, '{"type": "trace_letter"}'::jsonb)
     OR public.milestone_question_gradable('long_answer', NULL, '{"type": "draw_answer"}'::jsonb)
     OR public.milestone_question_gradable('long_answer', NULL, '{"type": "free_response"}'::jsonb)
     OR public.milestone_question_gradable('trace_letter', NULL, NULL)
     OR NOT public.milestone_question_gradable('multiple_choice', 'x', NULL) THEN
    RAISE EXCEPTION 'milestone trace migration aborted: milestone_question_gradable gives the wrong answer';
  END IF;
END;
$$;
