-- =============================================================================
-- The Grand Challenge: a path's final boss
-- =============================================================================
-- A final boss is an ordinary Big Challenge (kind 'milestone': same battle,
-- hearts, pass mark, certificate, notifications and measurement capture) that
--   * sits after the path's LAST week, whatever its number (paths are 10 and 11
--     weeks long today; block bosses only exist at weeks 4, 8, 12 ...),
--   * draws its pool from the WHOLE path with the starting boss's difficulty
--     plan (4 easy / 4 medium / 4 hard), so "starting boss -> final boss" is a
--     like-for-like before/after on the same skills,
--   * is marked is_final = true. One per path.
-- Nothing changes for existing rows (is_final defaults to false).
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. learning_path_milestones.is_final, the week rule, one final per path
-- -----------------------------------------------------------------------------
ALTER TABLE public.learning_path_milestones ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

-- The week rule (named learning_path_milestones_after_week_number_check since
-- 20261018121000) now lets a final boss sit after any week > 0.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.learning_path_milestones'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) ~ '\mafter_week_number\M' OR conname = 'learning_path_milestones_final_kind_check')
  LOOP
    EXECUTE format('ALTER TABLE public.learning_path_milestones DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.learning_path_milestones ADD CONSTRAINT learning_path_milestones_after_week_number_check
  CHECK ((kind = 'milestone' AND after_week_number > 0 AND (after_week_number % 4 = 0 OR is_final))
      OR (kind = 'placement' AND after_week_number = 0));
ALTER TABLE public.learning_path_milestones ADD CONSTRAINT learning_path_milestones_final_kind_check
  CHECK (NOT is_final OR kind = 'milestone');

-- (path, week) stays unique for block bosses and the placement; a 12-week path
-- may have both its weeks 9-12 boss and its final boss after week 12.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.learning_path_milestones'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ '\(path_id, after_week_number\)'
  LOOP
    EXECUTE format('ALTER TABLE public.learning_path_milestones DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_milestones_path_week_key
  ON public.learning_path_milestones(path_id, after_week_number) WHERE NOT is_final;
CREATE UNIQUE INDEX IF NOT EXISTS learning_path_milestones_one_final
  ON public.learning_path_milestones(path_id) WHERE is_final;

-- -----------------------------------------------------------------------------
-- 2. Generation jobs: a final boss is its own job slot
-- -----------------------------------------------------------------------------
ALTER TABLE public.milestone_generation_jobs ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;
DROP INDEX IF EXISTS public.milestone_generation_jobs_one_active;
CREATE UNIQUE INDEX milestone_generation_jobs_one_active
  ON public.milestone_generation_jobs(path_id, kind, after_week_number, is_final)
  WHERE status IN ('queued', 'running');

-- -----------------------------------------------------------------------------
-- 3. publish_milestone: a final boss needs the placement's difficulty balance
--    (20261018121000's body, with is_final added to the pool_unbalanced rule)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_milestone(p_milestone_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_m     public.learning_path_milestones%ROWTYPE;
  v_count integer;
  v_d1    integer;
  v_d2    integer;
  v_d3    integer;
BEGIN
  SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_publish_milestone(p_actor, v_m.path_id) THEN
    RAISE EXCEPTION 'publish_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE hq.difficulty = 1),
         count(*) FILTER (WHERE hq.difficulty = 2),
         count(*) FILTER (WHERE hq.difficulty = 3)
    INTO v_count, v_d1, v_d2, v_d3
  FROM public.homework_questions hq
  WHERE hq.assignment_id = v_m.assignment_id
    AND public.milestone_question_gradable(hq.question_type::text, hq.correct_answer, hq.interaction);
  IF v_count < v_m.battle_question_count THEN
    RAISE EXCEPTION 'pool_too_small: % auto-gradable questions, % needed', v_count, v_m.battle_question_count
      USING ERRCODE = '22023';
  END IF;
  IF (v_m.kind = 'placement' OR v_m.is_final) AND (v_d1 < 3 OR v_d2 < 3 OR v_d3 < 3) THEN
    RAISE EXCEPTION 'pool_unbalanced: easy %, medium %, hard %', v_d1, v_d2, v_d3 USING ERRCODE = '22023';
  END IF;

  UPDATE public.learning_path_milestones
     SET status       = 'published',
         published_at = CASE WHEN status = 'published' AND published_at IS NOT NULL THEN published_at ELSE now() END,
         published_by = CASE WHEN status = 'published' AND published_at IS NOT NULL THEN published_by ELSE p_actor END,
         reviewed_at  = coalesce(reviewed_at, now()),
         reviewed_by  = coalesce(reviewed_by, p_actor)
   WHERE id = v_m.id
  RETURNING * INTO v_m;

  UPDATE public.homework_assignments SET is_published = true
   WHERE id = v_m.assignment_id AND is_published IS DISTINCT FROM true;

  RETURN to_jsonb(v_m);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3b. start_milestone_battle: the database's lock floor for a final boss is the
--     whole path, not the last 4 weeks (20261018121000's body, one line changed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_milestone_battle(
  p_milestone_id uuid, p_learner_id uuid, p_question_ids uuid[], p_preview boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_m        public.learning_path_milestones%ROWTYPE;
  v_b        public.milestone_battles%ROWTYPE;
  v_preview  boolean := coalesce(p_preview, false);
  v_n        integer;
  v_required integer;
  v_attempt  integer;
BEGIN
  -- FOR SHARE: waits for a concurrent publish/unpublish of this milestone.
  SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = p_milestone_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_m.status <> 'published' AND NOT v_preview THEN
    RAISE EXCEPTION 'milestone_unpublished' USING ERRCODE = '55000';
  END IF;
  IF p_learner_id IS NULL THEN
    RAISE EXCEPTION 'invalid_answer: learner id is required' USING ERRCODE = '22023';
  END IF;

  -- One start at a time per (learner, milestone).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_learner_id::text || ':' || p_milestone_id::text, 0));

  SELECT * INTO v_b FROM public.milestone_battles
  WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id AND status = 'active';
  IF FOUND THEN
    RETURN jsonb_build_object('battle', to_jsonb(v_b), 'resumed', true);
  END IF;

  IF v_m.kind = 'placement' THEN
    -- No week gate: a placement never locks and is never locked.
    IF NOT v_preview AND EXISTS (SELECT 1 FROM public.milestone_battles b
         WHERE b.learner_id = p_learner_id AND b.milestone_id = v_m.id AND NOT b.is_preview
           AND b.status = 'completed' AND b.superseded_at IS NULL) THEN
      RAISE EXCEPTION 'placement_done' USING ERRCODE = '55000';
    END IF;
  ELSIF NOT v_preview THEN
    IF NOT EXISTS (SELECT 1 FROM public.learning_path_weeks w
                   WHERE w.path_id = v_m.path_id AND w.week_number = v_m.after_week_number)
       OR EXISTS (
         SELECT 1
         FROM public.learning_path_weeks w
         JOIN public.learning_path_steps s ON s.week_id = w.id
         WHERE w.path_id = v_m.path_id
           -- A block boss needs its 4 weeks; the final boss needs the whole path.
           AND w.week_number BETWEEN CASE WHEN v_m.is_final THEN 1 ELSE v_m.after_week_number - 3 END AND v_m.after_week_number
           AND NOT (
             CASE WHEN s.practice_assignment_id IS NOT NULL THEN
               EXISTS (SELECT 1 FROM public.homework_submissions hs
                       JOIN public.homework_assignments ha ON ha.id = hs.assignment_id
                       WHERE hs.assignment_id = s.practice_assignment_id
                         AND hs.student_id = p_learner_id
                         AND hs.status::text IN ('graded', 'returned')
                         AND hs.score IS NOT NULL
                         AND coalesce(ha.total_points, 0) > 0
                         AND hs.score >= (coalesce(ha.passing_score, 75) / 100.0) * ha.total_points)
             ELSE
               EXISTS (SELECT 1 FROM public.lesson_progress lp
                       WHERE lp.student_id = p_learner_id AND lp.lesson_id = s.lesson_id
                         AND lp.completed = true)
             END)
       ) THEN
      RAISE EXCEPTION 'milestone_locked' USING ERRCODE = '55000';
    END IF;
  END IF;

  v_n := coalesce(array_length(p_question_ids, 1), 0);
  IF v_n < 1 OR v_n > 16 OR array_ndims(p_question_ids) <> 1
     OR array_position(p_question_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'pool_mismatch: % question ids', v_n USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT q) FROM unnest(p_question_ids) AS q) <> v_n THEN
    RAISE EXCEPTION 'pool_mismatch: question ids repeat' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.homework_questions hq
      WHERE hq.assignment_id = v_m.assignment_id
        AND hq.id = ANY (p_question_ids)
        AND public.milestone_question_gradable(hq.question_type::text, hq.correct_answer, hq.interaction)) <> v_n THEN
    RAISE EXCEPTION 'pool_mismatch: a question is not an auto-gradable question of this milestone'
      USING ERRCODE = '22023';
  END IF;

  v_required := CASE WHEN v_m.kind = 'placement' THEN 0 ELSE ceil(v_m.pass_percent * v_n / 100.0)::int END;
  SELECT coalesce(max(attempt_number), 0) + 1 INTO v_attempt
  FROM public.milestone_battles WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id;

  BEGIN
    INSERT INTO public.milestone_battles (milestone_id, assignment_id, learner_id, attempt_number, is_preview,
                                          question_ids, question_count, required_correct, hearts_total, kind)
    VALUES (v_m.id, v_m.assignment_id, p_learner_id, v_attempt, v_preview,
            p_question_ids, v_n, v_required, v_n - v_required, v_m.kind)
    RETURNING * INTO v_b;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent start won the race: resume its battle.
    SELECT * INTO v_b FROM public.milestone_battles
    WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id AND status = 'active';
    IF FOUND THEN
      RETURN jsonb_build_object('battle', to_jsonb(v_b), 'resumed', true);
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('battle', to_jsonb(v_b), 'resumed', false);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Post-checks (fail closed)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'learning_path_milestones' AND column_name = 'is_final') THEN
    RAISE EXCEPTION 'final boss migration aborted: learning_path_milestones.is_final missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.learning_path_milestones'::regclass
                   AND conname = 'learning_path_milestones_after_week_number_check'
                   AND pg_get_constraintdef(oid) ~ 'is_final') THEN
    RAISE EXCEPTION 'final boss migration aborted: the week rule does not allow a final boss';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.learning_path_milestones'::regclass AND contype = 'u'
               AND pg_get_constraintdef(oid) ~ '\(path_id, after_week_number\)') THEN
    RAISE EXCEPTION 'final boss migration aborted: the old (path_id, after_week_number) unique constraint remains';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'learning_path_milestones_one_final')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'learning_path_milestones_path_week_key') THEN
    RAISE EXCEPTION 'final boss migration aborted: unique indexes missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                 AND indexname = 'milestone_generation_jobs_one_active' AND indexdef ~ 'is_final') THEN
    RAISE EXCEPTION 'final boss migration aborted: generation job index lacks is_final';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'publish_milestone' AND p.prosrc ~ 'is_final') THEN
    RAISE EXCEPTION 'final boss migration aborted: publish_milestone does not check is_final';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'start_milestone_battle' AND p.prosrc ~ 'v_m\.is_final THEN 1') THEN
    RAISE EXCEPTION 'final boss migration aborted: start_milestone_battle does not gate the final boss on the whole path';
  END IF;
END $$;
