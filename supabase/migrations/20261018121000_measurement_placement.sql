-- =============================================================================
-- Learning measurement (phase 1), 2/6: placement ("Meet your first boss") as a battle kind
-- =============================================================================
-- A placement is a learning_path_milestones row with kind = 'placement' and
-- after_week_number = 0 (at most one per path, by the existing UNIQUE). It
-- reuses the pool tables, start/record, audio, staff review/publish and resume.
--   * It never locks and is never locked; a learner plays it once per path
--     (placement_done), until staff re-place them (reset_placement, 3/5).
--   * It never ends early: 'completed' after the last answer, no hearts, no
--     hint, and it never creates a certificate.
--   * record_milestone_answer returns two new keys the old server ignores:
--     placement_skills (per-skill counts once a placement is completed) and
--     placement_first (this answer completed the learner's first placement).
--   * publish_milestone also needs >= 3 gradable items per difficulty (1/2/3)
--     for a placement (pool_unbalanced).
--
-- Old-app safety: no placement row exists until the new staff UI creates one;
-- the old learner routes look for week 0 and find none (404); existing battles
-- keep kind = 'milestone' and behave exactly as before (the function bodies
-- below are 20261017120000's plus the kind branches).
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. learning_path_milestones.kind and the week rule
-- -----------------------------------------------------------------------------
ALTER TABLE public.learning_path_milestones ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'milestone';

-- Production names the old week CHECK learning_path_milestones_after_week_number_check;
-- look it up by definition instead (any CHECK on this table that mentions after_week_number).
-- The kind-aware rule below keeps that name, so existing checks / error texts still match.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.learning_path_milestones'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) ~ '\mafter_week_number\M' OR conname = 'learning_path_milestones_kind_check')
  LOOP
    EXECUTE format('ALTER TABLE public.learning_path_milestones DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.learning_path_milestones ADD CONSTRAINT learning_path_milestones_kind_check
  CHECK (kind IN ('milestone','placement'));
ALTER TABLE public.learning_path_milestones ADD CONSTRAINT learning_path_milestones_after_week_number_check
  CHECK ((kind = 'milestone' AND after_week_number > 0 AND after_week_number % 4 = 0)
      OR (kind = 'placement' AND after_week_number = 0));

-- -----------------------------------------------------------------------------
-- 2. milestone_battles.kind / superseded_at and the status rules
-- -----------------------------------------------------------------------------
ALTER TABLE public.milestone_battles ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'milestone';
ALTER TABLE public.milestone_battles ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.milestone_battles'::regclass AND contype = 'c'
      AND (pg_get_constraintdef(oid) ~ '\mstatus\M'
           OR conname IN ('milestone_battles_kind_check', 'milestone_battles_kind_rules_check', 'milestone_battles_superseded_check'))
  LOOP
    EXECUTE format('ALTER TABLE public.milestone_battles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.milestone_battles ADD CONSTRAINT milestone_battles_status_check
  CHECK (status IN ('active','won','lost','abandoned','completed'));
ALTER TABLE public.milestone_battles ADD CONSTRAINT milestone_battles_kind_check
  CHECK (kind IN ('milestone','placement'));
ALTER TABLE public.milestone_battles ADD CONSTRAINT milestone_battles_kind_rules_check
  CHECK ((kind = 'milestone' AND status <> 'completed')
      OR (kind = 'placement' AND status IN ('active','completed','abandoned')
          AND required_correct = 0 AND hint_used_question_index IS NULL));
ALTER TABLE public.milestone_battles ADD CONSTRAINT milestone_battles_superseded_check
  CHECK (superseded_at IS NULL OR (kind = 'placement' AND status = 'completed'));
CREATE INDEX IF NOT EXISTS idx_milestone_battles_kind_learner ON public.milestone_battles(learner_id, kind, status);

-- -----------------------------------------------------------------------------
-- 3. placement_resets: audit log of staff re-placements (server-only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.placement_resets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_id  uuid NOT NULL REFERENCES public.learning_path_milestones(id) ON DELETE CASCADE,
  reset_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason        text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200),
  reset_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_placement_resets_learner ON public.placement_resets(learner_id, milestone_id);
ALTER TABLE public.placement_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.placement_resets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.placement_resets TO service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['placement_resets']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Unapproved staff have no staff access" ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT (SELECT public.is_unapproved_staff())) '
      || 'WITH CHECK (NOT (SELECT public.is_unapproved_staff()))', t);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. notification kinds (widened only; same drop-every-kind-CHECK loop as 20261017120000 §6)
-- -----------------------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conrelid::regclass AS tbl, conname
    FROM pg_constraint
    WHERE conrelid IN ('public.email_log'::regclass, 'public.push_log'::regclass)
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mkind\M'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
  END LOOP;
END $$;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_kind_check
  CHECK (kind IN ('welcome','weekly_progress','volunteer_impact','milestone_passed','placement_done'));
ALTER TABLE public.push_log ADD CONSTRAINT push_log_kind_check
  CHECK (kind IN ('weekly_summary','streak_reminder','milestone_passed','placement_done'));

-- -----------------------------------------------------------------------------
-- 5. Functions (same signatures; SECURITY INVOKER, service_role only)
-- -----------------------------------------------------------------------------

-- Start or resume. A placement has no week gate, is played once (placement_done
-- after a completed, non-superseded, non-preview battle) and needs 0 correct.
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
           AND w.week_number BETWEEN v_m.after_week_number - 3 AND v_m.after_week_number
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

-- Record one answer (the server grades it). Milestones: unchanged. Placements:
-- 'completed' after the last answer, never a certificate, plus placement_skills
-- and placement_first in the result.
CREATE OR REPLACE FUNCTION public.record_milestone_answer(
  p_battle_id uuid, p_position int, p_choice_index int, p_response_text text, p_is_correct boolean,
  p_answer jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_b          public.milestone_battles%ROWTYPE;
  v_m          public.learning_path_milestones%ROWTYPE;
  v_stored     boolean;
  v_status     text;
  v_cert       uuid;
  v_first      boolean := false;
  v_stars      smallint;
  v_subject    uuid;
  v_skills     jsonb;
  v_pl_first   boolean := false;
BEGIN
  SELECT * INTO v_b FROM public.milestone_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'battle_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_position IS NULL OR p_position < 0 THEN
    RAISE EXCEPTION 'position_mismatch: expected %', v_b.answered_count USING ERRCODE = '22023';
  END IF;

  -- Idempotent replay of an answered position: no writes.
  IF p_position < v_b.answered_count THEN
    SELECT is_correct INTO v_stored FROM public.milestone_battle_answers
    WHERE battle_id = v_b.id AND position = p_position;
    IF v_b.status = 'won' AND NOT v_b.is_preview THEN
      SELECT id INTO v_cert FROM public.learner_certificates
      WHERE learner_id = v_b.learner_id AND milestone_id = v_b.milestone_id;
    END IF;
    IF v_b.kind = 'placement' AND v_b.status = 'completed' THEN
      SELECT coalesce(jsonb_agg(x.row ORDER BY x.sort_order NULLS LAST, x.skill_key NULLS LAST), '[]'::jsonb) INTO v_skills
      FROM (
        SELECT q.skill_key, min(s.sort_order) AS sort_order,
               jsonb_build_object('skill_key', q.skill_key, 'family_label_en', min(s.family_label_en),
                                  'family_label_ar', min(s.family_label_ar), 'answered', count(*),
                                  'correct', count(*) FILTER (WHERE a.is_correct)) AS row
        FROM public.milestone_battle_answers a
        LEFT JOIN public.homework_questions q ON q.id = a.question_id
        LEFT JOIN public.curriculum_skills s ON s.skill_key = q.skill_key
        WHERE a.battle_id = v_b.id
        GROUP BY q.skill_key
      ) x;
    END IF;
    RETURN jsonb_build_object('battle', to_jsonb(v_b), 'is_correct', v_stored, 'replay', true,
                              'certificate_id', v_cert, 'first_pass', false,
                              'placement_skills', v_skills, 'placement_first', false);
  END IF;

  IF v_b.status <> 'active' THEN
    RAISE EXCEPTION 'battle_finished' USING ERRCODE = '55000';
  END IF;
  IF p_position <> v_b.answered_count THEN
    RAISE EXCEPTION 'position_mismatch: expected %', v_b.answered_count USING ERRCODE = '22023';
  END IF;
  IF p_is_correct IS NULL THEN
    RAISE EXCEPTION 'invalid_answer: a verdict is required' USING ERRCODE = '22023';
  END IF;
  IF p_response_text IS NOT NULL AND char_length(p_response_text) > 200 THEN
    RAISE EXCEPTION 'invalid_answer: response text is too long' USING ERRCODE = '22023';
  END IF;
  IF p_answer IS NOT NULL THEN
    IF jsonb_typeof(p_answer) <> 'object' OR octet_length(p_answer::text) > 16384 THEN
      RAISE EXCEPTION 'invalid_answer: the answer must be a JSON object of at most 16 KB' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.homework_questions hq
               WHERE hq.id = v_b.question_ids[p_position + 1] AND hq.interaction ? 'type'
                 AND (hq.interaction ->> 'type') IS DISTINCT FROM (p_answer ->> 'type')) THEN
      RAISE EXCEPTION 'invalid_answer: the answer type does not match the question' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.milestone_battle_answers (battle_id, position, question_id, choice_index, response_text, answer, is_correct)
  VALUES (v_b.id, p_position, v_b.question_ids[p_position + 1], p_choice_index, p_response_text, p_answer, p_is_correct);

  IF v_b.kind = 'placement' THEN
    v_status := CASE WHEN v_b.answered_count + 1 >= v_b.question_count THEN 'completed' ELSE 'active' END;
  ELSE
    v_status := 'active';
    IF v_b.correct_count + (CASE WHEN p_is_correct THEN 1 ELSE 0 END) >= v_b.required_correct THEN
      v_status := 'won';
    ELSIF v_b.wrong_count + (CASE WHEN p_is_correct THEN 0 ELSE 1 END) > v_b.hearts_total THEN
      v_status := 'lost';
    END IF;
  END IF;

  UPDATE public.milestone_battles
     SET correct_count  = correct_count + (CASE WHEN p_is_correct THEN 1 ELSE 0 END),
         wrong_count    = wrong_count + (CASE WHEN p_is_correct THEN 0 ELSE 1 END),
         answered_count = answered_count + 1,
         last_answer_at = now(),
         status         = v_status,
         finished_at    = CASE WHEN v_status = 'active' THEN NULL ELSE now() END
   WHERE id = v_b.id
  RETURNING * INTO v_b;

  IF v_status <> 'active' THEN
    INSERT INTO public.homework_attempts (assignment_id, student_id, submission_id, attempt_number,
                                          score, max_score, correct_count, total_questions, answers, submitted_at)
    SELECT v_b.assignment_id, v_b.learner_id, NULL, v_b.attempt_number,
           v_b.correct_count, v_b.question_count, v_b.correct_count, v_b.answered_count,
           coalesce(jsonb_agg(jsonb_build_object('question_id', a.question_id, 'position', a.position,
                                                 'choice_index', a.choice_index, 'is_correct', a.is_correct)
                              || jsonb_strip_nulls(jsonb_build_object('response_text', a.response_text, 'answer', a.answer))
                              ORDER BY a.position), '[]'::jsonb),
           now()
    FROM public.milestone_battle_answers a
    WHERE a.battle_id = v_b.id;
  END IF;

  -- A placement never creates a certificate.
  IF v_b.kind = 'milestone' AND v_status = 'won' AND NOT v_b.is_preview
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_b.learner_id AND role::text = 'student') THEN
    SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = v_b.milestone_id;
    SELECT subject_id INTO v_subject FROM public.learning_paths WHERE id = v_m.path_id;
    v_stars := CASE WHEN v_b.wrong_count = 0 THEN 3
                    WHEN v_b.wrong_count <= floor(v_b.hearts_total / 2.0) THEN 2
                    ELSE 1 END;
    INSERT INTO public.learner_certificates (learner_id, milestone_id, assignment_id, battle_id, subject_id,
                                             after_week_number, title_ar, title_en, boss_key, score_percent,
                                             correct_count, wrong_count, question_count, stars)
    VALUES (v_b.learner_id, v_m.id, v_m.assignment_id, v_b.id, v_subject,
            v_m.after_week_number, v_m.title_ar, v_m.title_en, v_m.boss_key,
            round(100.0 * v_b.correct_count / v_b.answered_count, 2),
            v_b.correct_count, v_b.wrong_count, v_b.question_count, v_stars)
    ON CONFLICT (learner_id, milestone_id) DO NOTHING
    RETURNING id INTO v_cert;
    v_first := v_cert IS NOT NULL;
    IF v_cert IS NULL THEN
      SELECT id INTO v_cert FROM public.learner_certificates
      WHERE learner_id = v_b.learner_id AND milestone_id = v_b.milestone_id;
    END IF;
  END IF;

  IF v_b.kind = 'placement' AND v_status = 'completed' THEN
    SELECT coalesce(jsonb_agg(x.row ORDER BY x.sort_order NULLS LAST, x.skill_key NULLS LAST), '[]'::jsonb) INTO v_skills
    FROM (
      SELECT q.skill_key, min(s.sort_order) AS sort_order,
             jsonb_build_object('skill_key', q.skill_key, 'family_label_en', min(s.family_label_en),
                                'family_label_ar', min(s.family_label_ar), 'answered', count(*),
                                'correct', count(*) FILTER (WHERE a.is_correct)) AS row
      FROM public.milestone_battle_answers a
      LEFT JOIN public.homework_questions q ON q.id = a.question_id
      LEFT JOIN public.curriculum_skills s ON s.skill_key = q.skill_key
      WHERE a.battle_id = v_b.id
      GROUP BY q.skill_key
    ) x;
    -- The one-time parent note: the learner's FIRST ever completed placement of this milestone.
    v_pl_first := NOT v_b.is_preview
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_b.learner_id AND role::text = 'student')
      AND NOT EXISTS (SELECT 1 FROM public.milestone_battles o
                      WHERE o.learner_id = v_b.learner_id AND o.milestone_id = v_b.milestone_id
                        AND o.id <> v_b.id AND o.status = 'completed' AND NOT o.is_preview);
  END IF;

  RETURN jsonb_build_object('battle', to_jsonb(v_b), 'is_correct', p_is_correct, 'replay', false,
                            'certificate_id', v_cert, 'first_pass', v_first,
                            'placement_skills', v_skills, 'placement_first', v_pl_first);
END;
$$;

-- Publish (idempotent). Needs at least battle_question_count auto-gradable
-- questions; a placement also needs >= 3 gradable items of each difficulty.
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
  IF v_m.kind = 'placement' AND (v_d1 < 3 OR v_d2 < 3 OR v_d3 < 3) THEN
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

REVOKE ALL ON FUNCTION public.start_milestone_battle(uuid, uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_milestone_answer(uuid, int, int, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_milestone(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_milestone_battle(uuid, uuid, uuid[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_milestone_answer(uuid, int, int, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_milestone(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Fail-closed postcheck
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.learning_path_milestones'::regclass
                 AND conname = 'learning_path_milestones_kind_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.learning_path_milestones'::regclass
                    AND conname = 'learning_path_milestones_after_week_number_check') THEN
    RAISE EXCEPTION 'measurement placement migration aborted: a learning_path_milestones CHECK is missing';
  END IF;
  SELECT string_agg(conname, ', ') INTO bad FROM pg_constraint
  WHERE conrelid = 'public.learning_path_milestones'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ~ 'after_week_number % 4' AND pg_get_constraintdef(oid) !~ '\mkind\M';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement placement migration aborted: an old week CHECK without kind remains: %', bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestone_battles'::regclass
                 AND conname = 'milestone_battles_status_check' AND pg_get_constraintdef(oid) ~ '''completed''')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestone_battles'::regclass
                    AND conname = 'milestone_battles_kind_rules_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestone_battles'::regclass
                    AND conname = 'milestone_battles_superseded_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestone_battles'::regclass
                    AND conname = 'milestone_battles_kind_check') THEN
    RAISE EXCEPTION 'measurement placement migration aborted: a milestone_battles CHECK is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.email_log'::regclass
                 AND conname = 'email_log_kind_check' AND pg_get_constraintdef(oid) ~ 'placement_done')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.push_log'::regclass
                    AND conname = 'push_log_kind_check' AND pg_get_constraintdef(oid) ~ 'placement_done') THEN
    RAISE EXCEPTION 'measurement placement migration aborted: email_log / push_log kinds lack placement_done';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                 WHERE c.relname = 'placement_resets' AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'placement_resets'
                    AND policyname = 'Unapproved staff have no staff access' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'measurement placement migration aborted: placement_resets RLS / RESTRICTIVE policy missing';
  END IF;
  SELECT string_agg(format('%s can %s', r, priv), '; ') INTO bad
  FROM unnest(ARRAY['authenticated', 'anon']) AS r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS priv
  WHERE has_table_privilege(r, 'public.placement_resets', priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement placement migration aborted: client privileges on placement_resets: %', bad;
  END IF;

  SELECT string_agg(DISTINCT p.oid::regprocedure::text, '; ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('start_milestone_battle', 'record_milestone_answer', 'publish_milestone', 'unpublish_milestone')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         OR p.prosecdef);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement placement migration aborted: callable by clients or SECURITY DEFINER: %', bad;
  END IF;
  SELECT string_agg(x.proname || '=' || x.n, ', ') INTO bad FROM (
    SELECT f.proname, (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
                       WHERE p.proname = f.proname) AS n
    FROM unnest(ARRAY['start_milestone_battle', 'record_milestone_answer', 'publish_milestone', 'unpublish_milestone']) AS f(proname)
  ) x WHERE x.n <> 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement placement migration aborted: expected exactly one of each battle function: %', bad;
  END IF;

  -- Existing battles keep kind 'milestone': every battle's kind is its milestone's kind.
  IF EXISTS (SELECT 1 FROM public.milestone_battles b JOIN public.learning_path_milestones m ON m.id = b.milestone_id
             WHERE b.kind <> m.kind) THEN
    RAISE EXCEPTION 'measurement placement migration aborted: a battle''s kind differs from its milestone''s kind';
  END IF;
END;
$$;
