-- =============================================================================
-- Milestone Tests ("Big Challenge" boss battles)
-- =============================================================================
-- One milestone after every 4 weeks of a published learning path (after weeks
-- 4, 8, 12 ...). Week k+1 stays locked until the learner passes milestone k
-- (75%). Passing earns the child a certificate; the parent is notified.
--
--   * learning_path_milestones: keyed by (path_id, after_week_number), not by a
--     week row, so the teacher learning-path PUT (which deletes and rebuilds
--     weeks) never destroys a milestone or its review/publish state.
--   * The question pool reuses homework_assignments + homework_questions with
--     is_milestone = true and cohort_id NULL (milestones never involve
--     classes). Each pool item carries a rich `interaction` (the shared
--     Interaction shape, answer keys included). No learner policy matches these
--     rows (not practice, no cohort): the answer keys never reach a learner.
--   * milestone_battles / milestone_battle_answers hold each attempt. Clients
--     have no write privilege at all; every write goes through the
--     service-role-only functions below, called by the server, which grades
--     each answer (gradeInteraction) and passes the verdict in.
--   * Publish / unpublish: approved admins, or the approved teacher who
--     authored the path.
--   * learner_certificates snapshot the milestone, so a certificate survives
--     milestone edits and deletes.
--
-- Safe to paste twice (IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE);
-- run it as ONE transaction (psql -1 or the SQL editor). It is safe with the
-- old app code: everything is new and unused, the new column defaults to
-- false, and the email_log / push_log CHECKs only widen. The DO block at the
-- end checks the result and rolls everything back if anything is open.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 0. helper: approved teacher/admin (SECURITY DEFINER like is_approved_admin)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_approved_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()
                 AND role IN ('teacher','admin') AND is_approved = true);
$$;
REVOKE ALL ON FUNCTION public.is_approved_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_staff() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. homework_assignments / homework_questions
-- -----------------------------------------------------------------------------
ALTER TABLE public.homework_assignments ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;
ALTER TABLE public.homework_assignments DROP CONSTRAINT IF EXISTS homework_assignments_milestone_check;
ALTER TABLE public.homework_assignments ADD CONSTRAINT homework_assignments_milestone_check
  CHECK (is_milestone = false OR (cohort_id IS NULL AND is_practice = false AND is_test = false));
CREATE INDEX IF NOT EXISTS idx_homework_assignments_milestone ON public.homework_assignments(id) WHERE is_milestone = true;
-- which lesson a pool question came from (balanced draw across the 4 weeks)
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS source_lesson_id uuid
  REFERENCES public.lessons(id) ON DELETE SET NULL;
-- Battle items are rich interactions: the shared Interaction shape from
-- src/lib/interactions/types.ts, answer keys included, stored with
-- question_type 'long_answer' and no correct_answer. NULL is allowed: the
-- server converts legacy MC / TF / short-answer rows on the fly. No learner
-- policy reads milestone questions, so the keys never reach a learner.
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS interaction jsonb;

-- A pool row the server can grade on its own: an interaction of a
-- deterministic type (not free_response / draw_answer), or a legacy
-- multiple-choice / true-false / short-answer row with a non-empty key.
CREATE OR REPLACE FUNCTION public.milestone_question_gradable(
  p_question_type text, p_correct_answer text, p_interaction jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(p_interaction ->> 'type', '') IN ('choose_correct', 'true_false', 'fill_missing_word',
                                                    'tap_to_count', 'match_pairs', 'sequence_order',
                                                    'sort_groups', 'drag_drop_label')
      OR (coalesce(p_question_type, '') IN ('multiple_choice', 'true_false', 'short_answer')
          AND nullif(btrim(p_correct_answer), '') IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.milestone_question_gradable(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.milestone_question_gradable(text, text, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. learning_path_milestones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_path_milestones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id               uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  after_week_number     integer NOT NULL CHECK (after_week_number > 0 AND after_week_number % 4 = 0),
  assignment_id         uuid NOT NULL UNIQUE REFERENCES public.homework_assignments(id) ON DELETE RESTRICT,
  title_ar              text NOT NULL,
  title_en              text,
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  battle_question_count integer NOT NULL DEFAULT 12 CHECK (battle_question_count BETWEEN 8 AND 16),
  pass_percent          integer NOT NULL DEFAULT 75 CHECK (pass_percent = 75),  -- owner decision; column for future
  boss_key              text NOT NULL DEFAULT 'puzzle_owlet'
                        CHECK (boss_key IN ('number_giant','word_dragon','letter_camel','sprout_buddy','puzzle_owlet',
                                            'letter_dragon')),
  generated_at          timestamptz,
  generated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  reviewed_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at          timestamptz,
  published_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (path_id, after_week_number)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname = 'update_learning_path_milestones_updated_at'
                   AND tgrelid = 'public.learning_path_milestones'::regclass) THEN
    CREATE TRIGGER update_learning_path_milestones_updated_at
      BEFORE UPDATE ON public.learning_path_milestones
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. milestone_battles (one row per attempt)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milestone_battles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id     uuid NOT NULL REFERENCES public.learning_path_milestones(id) ON DELETE CASCADE,
  assignment_id    uuid NOT NULL REFERENCES public.homework_assignments(id) ON DELETE CASCADE,
  learner_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_number   integer NOT NULL CHECK (attempt_number > 0),
  is_preview       boolean NOT NULL DEFAULT false,      -- staff trying it: never a certificate
  question_ids     uuid[] NOT NULL,                     -- drawn + shuffled order; index 1 = position 0
  question_count   integer NOT NULL CHECK (question_count BETWEEN 1 AND 16),
  required_correct integer NOT NULL,                    -- ceil(pass_percent*N/100)
  hearts_total     integer NOT NULL,                    -- N - required_correct ("tries")
  correct_count    integer NOT NULL DEFAULT 0,
  wrong_count      integer NOT NULL DEFAULT 0,
  answered_count   integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','lost','abandoned')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  last_answer_at   timestamptz,
  finished_at      timestamptz,
  CHECK (array_length(question_ids, 1) = question_count),
  CHECK (required_correct + hearts_total = question_count),
  UNIQUE (learner_id, milestone_id, attempt_number)
);
-- "Owl Hint": at most one per battle, on the position it was used. Set once by
-- the server (service_role) with a guarded UPDATE ... WHERE
-- hint_used_question_index IS NULL; start/record never touch it.
ALTER TABLE public.milestone_battles ADD COLUMN IF NOT EXISTS hint_used_question_index integer
  CONSTRAINT milestone_battles_hint_used_question_index_check
  CHECK (hint_used_question_index IS NULL OR (hint_used_question_index >= 0 AND hint_used_question_index < question_count));
ALTER TABLE public.milestone_battles ADD COLUMN IF NOT EXISTS hint_used_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.milestone_battles'::regclass
                 AND conname = 'milestone_battles_hint_used_pair_check') THEN
    ALTER TABLE public.milestone_battles ADD CONSTRAINT milestone_battles_hint_used_pair_check
      CHECK ((hint_used_question_index IS NULL) = (hint_used_at IS NULL));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_battle
  ON public.milestone_battles(learner_id, milestone_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_milestone_battles_learner ON public.milestone_battles(learner_id, milestone_id, started_at DESC);

-- -----------------------------------------------------------------------------
-- 4. milestone_battle_answers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milestone_battle_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id     uuid NOT NULL REFERENCES public.milestone_battles(id) ON DELETE CASCADE,
  position      integer NOT NULL CHECK (position >= 0),
  question_id   uuid REFERENCES public.homework_questions(id) ON DELETE SET NULL,
  choice_index  integer,              -- CANONICAL option index (after un-permuting)
  response_text text CHECK (response_text IS NULL OR char_length(response_text) <= 200),  -- typed / serialized answer
  -- optional: the full canonical InteractionAnswer (src/lib/interactions/types.ts)
  answer        jsonb CHECK (answer IS NULL OR (jsonb_typeof(answer) = 'object' AND octet_length(answer::text) <= 16384)),
  is_correct    boolean NOT NULL,
  answered_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, position)
);

-- -----------------------------------------------------------------------------
-- 5. learner_certificates (snapshot columns so a certificate survives milestone edits/deletes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learner_certificates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_id       uuid REFERENCES public.learning_path_milestones(id) ON DELETE SET NULL,
  assignment_id      uuid REFERENCES public.homework_assignments(id) ON DELETE SET NULL,
  battle_id          uuid REFERENCES public.milestone_battles(id) ON DELETE SET NULL,
  subject_id         uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  after_week_number  integer NOT NULL,
  title_ar           text NOT NULL,
  title_en           text,
  boss_key           text NOT NULL,
  score_percent      numeric(5,2) NOT NULL CHECK (score_percent BETWEEN 0 AND 100),  -- correct/answered*100
  correct_count      integer NOT NULL,
  wrong_count        integer NOT NULL,
  question_count     integer NOT NULL,
  stars              smallint NOT NULL CHECK (stars BETWEEN 1 AND 3),
  awarded_at         timestamptz NOT NULL DEFAULT now(),
  parent_notified_at timestamptz,
  UNIQUE (learner_id, milestone_id)
);
CREATE INDEX IF NOT EXISTS idx_learner_certificates_learner ON public.learner_certificates(learner_id, awarded_at DESC);

-- -----------------------------------------------------------------------------
-- 6. notification kinds. Production may name these constraints differently:
--    drop every CHECK on the table that mentions "kind", then add ours.
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
  CHECK (kind IN ('welcome','weekly_progress','volunteer_impact','milestone_passed'));
ALTER TABLE public.push_log ADD CONSTRAINT push_log_kind_check
  CHECK (kind IN ('weekly_summary','streak_reminder','milestone_passed'));

-- -----------------------------------------------------------------------------
-- 7. RLS and privileges. No client writes anywhere: privileges are checked
--    before RLS, so no policy (present or future) can reopen them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.learning_path_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_battles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_battle_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_certificates     ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.learning_path_milestones, public.milestone_battles,
  public.milestone_battle_answers, public.learner_certificates FROM anon, authenticated;
REVOKE ALL ON public.learning_path_milestones, public.milestone_battles,
  public.milestone_battle_answers, public.learner_certificates FROM anon;
GRANT SELECT ON public.learning_path_milestones, public.milestone_battles,
  public.milestone_battle_answers, public.learner_certificates TO authenticated;
GRANT ALL ON public.learning_path_milestones, public.milestone_battles,
  public.milestone_battle_answers, public.learner_certificates TO service_role;

DROP POLICY IF EXISTS "Published milestones are viewable" ON public.learning_path_milestones;
CREATE POLICY "Published milestones are viewable" ON public.learning_path_milestones FOR SELECT TO authenticated
  USING ((status = 'published' AND EXISTS (SELECT 1 FROM public.learning_paths p
           WHERE p.id = learning_path_milestones.path_id AND p.is_published = true))
         OR public.is_approved_staff());

DROP POLICY IF EXISTS "Learners view their own battles" ON public.milestone_battles;
CREATE POLICY "Learners view their own battles" ON public.milestone_battles FOR SELECT TO authenticated
  USING (public.can_access_learner(learner_id) OR public.is_approved_staff());

-- learners: no access to per-answer rows
DROP POLICY IF EXISTS "Staff view battle answers" ON public.milestone_battle_answers;
CREATE POLICY "Staff view battle answers" ON public.milestone_battle_answers FOR SELECT TO authenticated
  USING (public.is_approved_staff());

DROP POLICY IF EXISTS "Learners view their own certificates" ON public.learner_certificates;
CREATE POLICY "Learners view their own certificates" ON public.learner_certificates FOR SELECT TO authenticated
  USING (public.can_access_learner(learner_id) OR public.is_approved_admin());

-- Same RESTRICTIVE policy as 20261016120000 section 7, on all four new tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_path_milestones', 'milestone_battles',
                           'milestone_battle_answers', 'learner_certificates']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Unapproved staff have no staff access" ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT (SELECT public.is_unapproved_staff())) '
      || 'WITH CHECK (NOT (SELECT public.is_unapproved_staff()))',
      t
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Functions. SECURITY INVOKER, service_role only, one transaction each.
--    The server maps the error message text; keep these tokens exact:
--    milestone_not_found | milestone_unpublished | milestone_locked |
--    pool_mismatch | battle_not_found | battle_finished | position_mismatch |
--    invalid_answer | pool_too_small | publish_forbidden
-- -----------------------------------------------------------------------------

-- Start or resume. Returns the active battle if one exists (resume), else
-- inserts attempt_number = max+1. required/hearts are computed HERE.
-- Outside preview, the learner must have completed every step of weeks k-3..k
-- (the same step rule as evaluatePath: a Practice-gated step needs a passing
-- graded Practice, any other step a completed lesson). This is a floor under
-- the server's milestoneUnlockedFor check, never stricter than it.
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

  IF NOT v_preview THEN
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

  v_required := ceil(v_m.pass_percent * v_n / 100.0)::int;
  SELECT coalesce(max(attempt_number), 0) + 1 INTO v_attempt
  FROM public.milestone_battles WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id;

  BEGIN
    INSERT INTO public.milestone_battles (milestone_id, assignment_id, learner_id, attempt_number, is_preview,
                                          question_ids, question_count, required_correct, hearts_total)
    VALUES (v_m.id, v_m.assignment_id, p_learner_id, v_attempt, v_preview,
            p_question_ids, v_n, v_required, v_n - v_required)
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

-- Record one answer. The server grades it (gradeInteraction) and passes the
-- verdict (p_is_correct) with the canonical choice / text, and optionally the
-- full canonical InteractionAnswer (p_answer).
DROP FUNCTION IF EXISTS public.record_milestone_answer(uuid, int, int, text, boolean);
DROP FUNCTION IF EXISTS public.record_milestone_answer(uuid, int, jsonb, boolean);
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
    RETURN jsonb_build_object('battle', to_jsonb(v_b), 'is_correct', v_stored, 'replay', true,
                              'certificate_id', v_cert, 'first_pass', false);
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

  v_status := 'active';
  IF v_b.correct_count + (CASE WHEN p_is_correct THEN 1 ELSE 0 END) >= v_b.required_correct THEN
    v_status := 'won';
  ELSIF v_b.wrong_count + (CASE WHEN p_is_correct THEN 0 ELSE 1 END) > v_b.hearts_total THEN
    v_status := 'lost';
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

  IF v_status = 'won' AND NOT v_b.is_preview
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

  RETURN jsonb_build_object('battle', to_jsonb(v_b), 'is_correct', p_is_correct, 'replay', false,
                            'certificate_id', v_cert, 'first_pass', v_first);
END;
$$;

-- Who may publish / unpublish (owner decision): an approved admin, or an
-- approved teacher who authored the path. Milestones never involve classes.
CREATE OR REPLACE FUNCTION public.can_publish_milestone(p_actor uuid, p_path_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles a
    WHERE a.id = p_actor AND a.is_approved = true
      AND (a.role::text = 'admin'
           OR (a.role::text = 'teacher'
               AND EXISTS (SELECT 1 FROM public.learning_paths lp
                           WHERE lp.id = p_path_id AND lp.created_by = p_actor)))
  );
$$;

-- Publish (idempotent). Needs at least battle_question_count auto-gradable
-- questions (milestone_question_gradable).
CREATE OR REPLACE FUNCTION public.publish_milestone(p_milestone_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_m     public.learning_path_milestones%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_publish_milestone(p_actor, v_m.path_id) THEN
    RAISE EXCEPTION 'publish_forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.homework_questions hq
  WHERE hq.assignment_id = v_m.assignment_id
    AND public.milestone_question_gradable(hq.question_type::text, hq.correct_answer, hq.interaction);
  IF v_count < v_m.battle_question_count THEN
    RAISE EXCEPTION 'pool_too_small: % auto-gradable questions, % needed', v_count, v_m.battle_question_count
      USING ERRCODE = '22023';
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

-- Unpublish: back to draft, pool unpublished, every active battle abandoned.
CREATE OR REPLACE FUNCTION public.unpublish_milestone(p_milestone_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_m public.learning_path_milestones%ROWTYPE;
BEGIN
  SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_publish_milestone(p_actor, v_m.path_id) THEN
    RAISE EXCEPTION 'publish_forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.learning_path_milestones SET status = 'draft' WHERE id = v_m.id RETURNING * INTO v_m;
  UPDATE public.homework_assignments SET is_published = false
   WHERE id = v_m.assignment_id AND is_published IS DISTINCT FROM false;
  UPDATE public.milestone_battles SET status = 'abandoned', finished_at = now()
   WHERE milestone_id = v_m.id AND status = 'active';

  RETURN to_jsonb(v_m);
END;
$$;

REVOKE ALL ON FUNCTION public.start_milestone_battle(uuid, uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_milestone_answer(uuid, int, int, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_milestone(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpublish_milestone(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_publish_milestone(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_milestone_battle(uuid, uuid, uuid[], boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_milestone_answer(uuid, int, int, text, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_milestone(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unpublish_milestone(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_publish_milestone(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. Fail-closed postcheck: any finding aborts (and rolls back) the migration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
  tbls text[] := ARRAY['learning_path_milestones', 'milestone_battles',
                       'milestone_battle_answers', 'learner_certificates'];
BEGIN
  SELECT string_agg(format('%s: RLS is disabled', c.relname), '; ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relname = ANY (tbls) AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone migration aborted: %', bad;
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relname = ANY (tbls)) <> 4 THEN
    RAISE EXCEPTION 'milestone migration aborted: a milestone table is missing';
  END IF;

  SELECT string_agg(format('%s can %s %s', r, priv, t), '; ') INTO bad
  FROM unnest(tbls) AS t, unnest(ARRAY['authenticated', 'anon']) AS r,
       unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS priv
  WHERE has_table_privilege(r, format('public.%I', t), priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone migration aborted: client write privileges remain: %', bad;
  END IF;

  SELECT string_agg(format('%s "%s"', tablename, policyname), '; ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = ANY (tbls) AND permissive = 'PERMISSIVE'
    AND (btrim(qual) = 'true' OR btrim(with_check) = 'true');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone migration aborted: always-true policies: %', bad;
  END IF;

  SELECT string_agg(t, ', ') INTO bad
  FROM unnest(tbls) AS t
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = t
                      AND p.policyname = 'Unapproved staff have no staff access'
                      AND p.permissive = 'RESTRICTIVE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone migration aborted: RESTRICTIVE unapproved-staff policy missing on: %', bad;
  END IF;

  SELECT string_agg(DISTINCT p.oid::regprocedure::text, '; ') INTO bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('start_milestone_battle', 'record_milestone_answer', 'publish_milestone', 'unpublish_milestone',
                      'can_publish_milestone')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         OR p.prosecdef);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone migration aborted: callable by clients or SECURITY DEFINER: %', bad;
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname IN ('start_milestone_battle', 'record_milestone_answer', 'publish_milestone', 'unpublish_milestone',
                          'can_publish_milestone')) <> 5 THEN
    RAISE EXCEPTION 'milestone migration aborted: expected exactly 5 milestone functions (an old overload is left?)';
  END IF;

  IF has_function_privilege('authenticated', 'public.milestone_question_gradable(text, text, jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.milestone_question_gradable(text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'milestone migration aborted: milestone_question_gradable is callable by clients';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.homework_assignments'::regclass
                   AND conname = 'homework_assignments_milestone_check') THEN
    RAISE EXCEPTION 'milestone migration aborted: homework_assignments_milestone_check is missing';
  END IF;
END;
$$;
