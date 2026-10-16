-- =============================================================================
-- Learning measurement (phase 1), 3/6: first-attempt record and offline marker
-- =============================================================================
-- Definitions (the contract for every metric):
--   * Measured learner: profiles.role = 'student' and either no owning account
--     or an owning account with role 'parent' (staff test children excluded).
--     Preview battles never count.
--   * Occasion: one per (learner, milestone).
--       - milestone: the learner's FIRST finished attempt (lowest attempt_number
--         among non-preview battles with status won/lost; abandoned attempts are
--         skipped). Never replaced.
--       - placement: the latest completed, non-superseded, non-preview battle.
--         A staff reset deletes it; the next completion captures again.
--   * Scored item: an answered position that is not the hinted one.
--   * LEVEL SCORE (0-100): 100 * sum(w * correct) / sum(w) over scored items,
--     w = coalesce(difficulty, 2). Bands: <40 getting_started, <70 on_the_way,
--     else confident.
--
-- The capture runs in the database, in an AFTER UPDATE trigger on
-- milestone_battles that swallows every error (RAISE WARNING): measurement can
-- never fail or change a battle. A missed capture is repaired by
-- measurement_rebuild().
--
-- lesson_progress.completion_source records how a completion arrived
-- ('online', 'offline_sync', 'server'); historic rows stay NULL (unknown).
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.measurement_occasions (
  learner_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  milestone_id             uuid NOT NULL REFERENCES public.learning_path_milestones(id) ON DELETE CASCADE,
  battle_id                uuid NOT NULL UNIQUE REFERENCES public.milestone_battles(id) ON DELETE CASCADE,
  kind                     text NOT NULL CHECK (kind IN ('milestone','placement')),
  path_id                  uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  subject_id               uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  after_week_number        integer NOT NULL,
  attempt_number           integer NOT NULL,
  outcome                  text NOT NULL CHECK (outcome IN ('won','lost','completed')),
  question_count           integer NOT NULL,
  answered_count           integer NOT NULL,
  scored_count             integer NOT NULL,
  scored_correct           integer NOT NULL,
  level_score              numeric(5,2),
  prior_lessons_completed  integer NOT NULL,
  baseline_valid           boolean NOT NULL,
  -- Owner decision: every learner may take the placement once; one taken after more than
  -- PLACEMENT_MAX_PRIOR_LESSONS (3) completed lessons of the path is a "late" baseline,
  -- reported separately and never used as a baseline for growth.
  late                     boolean GENERATED ALWAYS AS (kind = 'placement' AND NOT baseline_valid) STORED,
  started_at               timestamptz NOT NULL,
  finished_at              timestamptz NOT NULL,
  captured_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, milestone_id),
  CHECK (baseline_valid = false OR kind = 'placement')
);
CREATE INDEX IF NOT EXISTS idx_measurement_occasions_subject ON public.measurement_occasions(subject_id, kind, finished_at);
CREATE INDEX IF NOT EXISTS idx_measurement_occasions_path ON public.measurement_occasions(path_id, kind);

CREATE TABLE IF NOT EXISTS public.measurement_item_results (
  battle_id         uuid NOT NULL REFERENCES public.milestone_battles(id) ON DELETE CASCADE,
  position          integer NOT NULL,
  learner_id        uuid NOT NULL,
  milestone_id      uuid NOT NULL,
  question_id       uuid REFERENCES public.homework_questions(id) ON DELETE SET NULL,
  skill_key         text REFERENCES public.curriculum_skills(skill_key) ON UPDATE CASCADE,
  difficulty        smallint CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  interaction_type  text,
  source_lesson_id  uuid,
  is_correct        boolean NOT NULL,
  hinted            boolean NOT NULL DEFAULT false,
  answered_at       timestamptz NOT NULL,
  PRIMARY KEY (battle_id, position),
  FOREIGN KEY (learner_id, milestone_id) REFERENCES public.measurement_occasions(learner_id, milestone_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mir_milestone_skill ON public.measurement_item_results(milestone_id, skill_key);
CREATE INDEX IF NOT EXISTS idx_mir_learner_skill ON public.measurement_item_results(learner_id, skill_key);
CREATE INDEX IF NOT EXISTS idx_mir_question ON public.measurement_item_results(question_id);
CREATE INDEX IF NOT EXISTS idx_mir_occasion ON public.measurement_item_results(learner_id, milestone_id);

-- -----------------------------------------------------------------------------
-- 2. RLS and privileges: no client privilege at all (reads go through the
--    service-role report functions, called by the server after its checks)
-- -----------------------------------------------------------------------------
ALTER TABLE public.measurement_occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_item_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.measurement_occasions, public.measurement_item_results FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.measurement_occasions, public.measurement_item_results TO service_role;

-- Belt and braces: only matters if a future migration ever grants SELECT.
DROP POLICY IF EXISTS "Own learner measurement" ON public.measurement_occasions;
CREATE POLICY "Own learner measurement" ON public.measurement_occasions FOR SELECT TO authenticated
  USING (public.can_access_learner(learner_id));
DROP POLICY IF EXISTS "Own learner measurement" ON public.measurement_item_results;
CREATE POLICY "Own learner measurement" ON public.measurement_item_results FOR SELECT TO authenticated
  USING (public.can_access_learner(learner_id));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['measurement_occasions', 'measurement_item_results']
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
-- 3. Capture
-- -----------------------------------------------------------------------------
-- Write the occasion (and its item rows) for one finished battle when it is the
-- occasion by the definitions above. Idempotent; returns whether it wrote.
CREATE OR REPLACE FUNCTION public.measurement_capture_battle(p_battle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  b          public.milestone_battles%ROWTYPE;
  m          public.learning_path_milestones%ROWTYPE;
  v_subject  uuid;
  v_prior    integer;
  v_scored   integer;
  v_correct  integer;
  v_score    numeric;
  v_inserted boolean;
BEGIN
  SELECT * INTO b FROM public.milestone_battles WHERE id = p_battle_id;
  IF NOT FOUND OR b.is_preview OR b.status NOT IN ('won', 'lost', 'completed') THEN
    RETURN false;
  END IF;
  -- Measured learners only: students without an owner, or owned by a parent account.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN public.profiles o ON o.id = p.parent_account_id
                 WHERE p.id = b.learner_id AND p.role::text = 'student'
                   AND (p.parent_account_id IS NULL OR o.role::text = 'parent')) THEN
    RETURN false;
  END IF;
  SELECT * INTO m FROM public.learning_path_milestones WHERE id = b.milestone_id;
  IF NOT FOUND OR m.kind IS DISTINCT FROM b.kind THEN
    RETURN false;
  END IF;
  SELECT subject_id INTO v_subject FROM public.learning_paths WHERE id = m.path_id;
  IF v_subject IS NULL THEN
    RETURN false;
  END IF;

  IF b.kind = 'milestone' THEN
    IF b.status NOT IN ('won', 'lost') THEN
      RETURN false;
    END IF;
    -- Never replaced, and only the lowest finished attempt counts.
    IF EXISTS (SELECT 1 FROM public.measurement_occasions o
               WHERE o.learner_id = b.learner_id AND o.milestone_id = b.milestone_id) THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.milestone_battles o
               WHERE o.learner_id = b.learner_id AND o.milestone_id = b.milestone_id AND NOT o.is_preview
                 AND o.status IN ('won', 'lost') AND o.attempt_number < b.attempt_number) THEN
      RETURN false;
    END IF;
  ELSE
    IF b.status <> 'completed' OR b.superseded_at IS NOT NULL THEN
      RETURN false;
    END IF;
    -- The latest completed, non-superseded placement wins.
    IF EXISTS (SELECT 1 FROM public.milestone_battles o
               WHERE o.learner_id = b.learner_id AND o.milestone_id = b.milestone_id AND NOT o.is_preview
                 AND o.status = 'completed' AND o.superseded_at IS NULL AND o.attempt_number > b.attempt_number) THEN
      RETURN false;
    END IF;
    IF EXISTS (SELECT 1 FROM public.measurement_occasions o WHERE o.battle_id = b.id) THEN
      RETURN false;
    END IF;
    DELETE FROM public.measurement_occasions o WHERE o.learner_id = b.learner_id AND o.milestone_id = b.milestone_id;
  END IF;

  SELECT count(DISTINCT lp.lesson_id)::int INTO v_prior
  FROM public.lesson_progress lp
  WHERE lp.student_id = b.learner_id AND lp.completed AND lp.completed_at < b.started_at
    AND lp.lesson_id IN (SELECT s.lesson_id FROM public.learning_path_steps s
                         JOIN public.learning_path_weeks w ON w.id = s.week_id
                         WHERE w.path_id = m.path_id);

  SELECT count(*) FILTER (WHERE NOT x.hinted)::int,
         count(*) FILTER (WHERE NOT x.hinted AND x.is_correct)::int,
         CASE WHEN coalesce(sum(x.w) FILTER (WHERE NOT x.hinted), 0) > 0
              THEN round(100.0 * coalesce(sum(x.w) FILTER (WHERE NOT x.hinted AND x.is_correct), 0)
                         / sum(x.w) FILTER (WHERE NOT x.hinted), 2) END
    INTO v_scored, v_correct, v_score
  FROM (SELECT a.is_correct, (a.position = b.hint_used_question_index) IS TRUE AS hinted,
               coalesce(q.difficulty, 2)::numeric AS w
        FROM public.milestone_battle_answers a
        LEFT JOIN public.homework_questions q ON q.id = a.question_id
        WHERE a.battle_id = b.id) x;

  INSERT INTO public.measurement_occasions (learner_id, milestone_id, battle_id, kind, path_id, subject_id, after_week_number,
                                            attempt_number, outcome, question_count, answered_count, scored_count,
                                            scored_correct, level_score, prior_lessons_completed, baseline_valid,
                                            started_at, finished_at)
  VALUES (b.learner_id, b.milestone_id, b.id, b.kind, m.path_id, v_subject, m.after_week_number,
          b.attempt_number, b.status, b.question_count, b.answered_count, v_scored,
          v_correct, v_score, v_prior, b.kind = 'placement' AND v_prior <= 3,
          b.started_at, coalesce(b.finished_at, b.last_answer_at, now()))
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;
  IF v_inserted IS NOT TRUE THEN
    RETURN false;
  END IF;

  INSERT INTO public.measurement_item_results (battle_id, position, learner_id, milestone_id, question_id, skill_key,
                                               difficulty, interaction_type, source_lesson_id, is_correct, hinted, answered_at)
  SELECT b.id, a.position, b.learner_id, b.milestone_id, a.question_id, q.skill_key, q.difficulty,
         coalesce(q.interaction ->> 'type', q.question_type::text), q.source_lesson_id, a.is_correct,
         (a.position = b.hint_used_question_index) IS TRUE, a.answered_at
  FROM public.milestone_battle_answers a
  LEFT JOIN public.homework_questions q ON q.id = a.question_id
  WHERE a.battle_id = b.id;
  RETURN true;
END;
$$;

-- The trigger: measurement can never fail or change a battle.
CREATE OR REPLACE FUNCTION public.measurement_capture_on_battle_finish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  BEGIN
    PERFORM public.measurement_capture_battle(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'measurement capture failed for battle %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS milestone_battles_measurement_capture ON public.milestone_battles;
CREATE TRIGGER milestone_battles_measurement_capture
  AFTER UPDATE OF status ON public.milestone_battles
  FOR EACH ROW
  WHEN (OLD.status = 'active' AND NEW.status IN ('won', 'lost', 'completed') AND NOT NEW.is_preview)
  EXECUTE FUNCTION public.measurement_capture_on_battle_finish();

-- Repair: for every (measured learner, milestone) in scope, the occasion is the
-- battle the definitions pick; rewrite only where the stored one differs.
CREATE OR REPLACE FUNCTION public.measurement_rebuild(p_milestone_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r   record;
  v_n integer := 0;
BEGIN
  FOR r IN
    WITH measured AS (
      SELECT p.id FROM public.profiles p LEFT JOIN public.profiles o ON o.id = p.parent_account_id
      WHERE p.role::text = 'student' AND (p.parent_account_id IS NULL OR o.role::text = 'parent')
    ), chosen AS (
      SELECT DISTINCT ON (b.learner_id, b.milestone_id) b.learner_id, b.milestone_id, b.id AS battle_id
      FROM public.milestone_battles b
      JOIN measured ON measured.id = b.learner_id
      JOIN public.learning_path_milestones m ON m.id = b.milestone_id AND m.kind = b.kind
      WHERE NOT b.is_preview
        AND (p_milestone_id IS NULL OR b.milestone_id = p_milestone_id)
        AND ((b.kind = 'milestone' AND b.status IN ('won', 'lost'))
          OR (b.kind = 'placement' AND b.status = 'completed' AND b.superseded_at IS NULL))
      ORDER BY b.learner_id, b.milestone_id,
               CASE WHEN b.kind = 'milestone' THEN b.attempt_number ELSE -b.attempt_number END
    ), stored AS (
      SELECT o.learner_id, o.milestone_id, o.battle_id FROM public.measurement_occasions o
      WHERE p_milestone_id IS NULL OR o.milestone_id = p_milestone_id
    )
    SELECT coalesce(s.learner_id, c.learner_id) AS learner_id, coalesce(s.milestone_id, c.milestone_id) AS milestone_id,
           s.battle_id AS stored_battle, c.battle_id AS chosen_battle
    FROM stored s
    FULL JOIN chosen c ON c.learner_id = s.learner_id AND c.milestone_id = s.milestone_id
    WHERE s.battle_id IS DISTINCT FROM c.battle_id
  LOOP
    IF r.stored_battle IS NOT NULL THEN
      DELETE FROM public.measurement_occasions WHERE learner_id = r.learner_id AND milestone_id = r.milestone_id;
    END IF;
    IF r.chosen_battle IS NOT NULL AND public.measurement_capture_battle(r.chosen_battle) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Teacher / model tag edits are corrections and apply to history: refresh the
-- item snapshots of one milestone and recompute its occasions' level scores.
CREATE OR REPLACE FUNCTION public.measurement_refresh_tags(p_milestone_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.measurement_item_results r
     SET skill_key = q.skill_key, difficulty = q.difficulty
    FROM public.homework_questions q
   WHERE r.question_id = q.id AND r.milestone_id = p_milestone_id
     AND (r.skill_key, r.difficulty) IS DISTINCT FROM (q.skill_key, q.difficulty);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.measurement_occasions o
     SET level_score = x.score
    FROM (SELECT r.learner_id,
                 CASE WHEN coalesce(sum(coalesce(r.difficulty, 2)) FILTER (WHERE NOT r.hinted), 0) > 0
                      THEN round(100.0 * coalesce(sum(coalesce(r.difficulty, 2)) FILTER (WHERE NOT r.hinted AND r.is_correct), 0)
                                 / sum(coalesce(r.difficulty, 2)) FILTER (WHERE NOT r.hinted), 2) END AS score
          FROM public.measurement_item_results r
          WHERE r.milestone_id = p_milestone_id
          GROUP BY r.learner_id) x
   WHERE o.milestone_id = p_milestone_id AND o.learner_id = x.learner_id
     AND o.level_score IS DISTINCT FROM x.score;
  RETURN v_n;
END;
$$;

-- Staff re-placement: an approved admin or the path's author. The completed
-- placement is kept (superseded), an active one is abandoned, the occasion goes,
-- and the learner may play the placement again.
CREATE OR REPLACE FUNCTION public.reset_placement(p_milestone_id uuid, p_learner_id uuid, p_actor uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_m  public.learning_path_milestones%ROWTYPE;
  v_at timestamptz := now();
BEGIN
  SELECT * INTO v_m FROM public.learning_path_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND OR v_m.kind <> 'placement' THEN
    RAISE EXCEPTION 'milestone_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.can_publish_milestone(p_actor, v_m.path_id) THEN
    RAISE EXCEPTION 'reset_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_learner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_learner_id) THEN
    RAISE EXCEPTION 'invalid_query: unknown learner' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'invalid_query: a reason of 3 to 200 characters is required' USING ERRCODE = '22023';
  END IF;
  -- The same lock as start_milestone_battle, so a start cannot interleave.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_learner_id::text || ':' || p_milestone_id::text, 0));

  INSERT INTO public.placement_resets (learner_id, milestone_id, reset_by, reason, reset_at)
  VALUES (p_learner_id, p_milestone_id, p_actor, btrim(p_reason), v_at);
  UPDATE public.milestone_battles SET superseded_at = v_at
   WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id AND status = 'completed' AND superseded_at IS NULL;
  UPDATE public.milestone_battles SET status = 'abandoned', finished_at = v_at
   WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id AND status = 'active';
  DELETE FROM public.measurement_occasions WHERE learner_id = p_learner_id AND milestone_id = p_milestone_id;
  RETURN jsonb_build_object('reset_at', v_at);
END;
$$;

REVOKE ALL ON FUNCTION public.measurement_capture_battle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_capture_on_battle_finish() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_rebuild(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_refresh_tags(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_placement(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_capture_battle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_rebuild(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_refresh_tags(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_placement(uuid, uuid, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Offline marker on lesson_progress
-- -----------------------------------------------------------------------------
ALTER TABLE public.lesson_progress ADD COLUMN IF NOT EXISTS completion_source text;
ALTER TABLE public.lesson_progress DROP CONSTRAINT IF EXISTS lesson_progress_completion_source_check;
ALTER TABLE public.lesson_progress ADD CONSTRAINT lesson_progress_completion_source_check
  CHECK (completion_source IS NULL OR completion_source IN ('online','offline_sync','server'));

-- SECURITY INVOKER on purpose: current_user identifies a learner's own session.
-- Named to fire after guard_lesson_progress_client_write and
-- lesson_progress_limit_completed_at_backdate (triggers fire in name order), so
-- it sees the settled, clamped completed_at.
CREATE OR REPLACE FUNCTION public.mark_lesson_completion_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_completing boolean;
BEGIN
  v_completing := NEW.completed IS TRUE AND (TG_OP = 'INSERT' OR OLD.completed IS NOT TRUE);
  IF v_completing THEN
    IF current_user IN ('authenticated', 'anon') THEN
      NEW.completion_source := CASE WHEN NEW.completion_source = 'offline_sync' THEN 'offline_sync'
                                    WHEN NEW.completed_at < now() - interval '30 minutes' THEN 'offline_sync'
                                    ELSE 'online' END;
    ELSE
      NEW.completion_source := coalesce(NEW.completion_source, 'server');
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.completion_source := OLD.completion_source;   -- never rewritten
  ELSE
    NEW.completion_source := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_lesson_completion_source() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS lesson_progress_mark_completion_source ON public.lesson_progress;
CREATE TRIGGER lesson_progress_mark_completion_source
  BEFORE INSERT OR UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.mark_lesson_completion_source();

-- -----------------------------------------------------------------------------
-- 5. Capture what already exists (production: no real battles yet)
-- -----------------------------------------------------------------------------
SELECT public.measurement_rebuild();

-- -----------------------------------------------------------------------------
-- 6. Fail-closed postcheck
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad  text;
  tbls text[] := ARRAY['measurement_occasions', 'measurement_item_results'];
  mine text;
BEGIN
  SELECT string_agg(t, ', ') INTO bad FROM unnest(tbls) AS t
  WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                    WHERE c.relname = t AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t
                    AND p.policyname = 'Unapproved staff have no staff access' AND p.permissive = 'RESTRICTIVE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement capture migration aborted: RLS / RESTRICTIVE policy missing on: %', bad;
  END IF;
  SELECT string_agg(format('%s can %s %s', r, priv, t), '; ') INTO bad
  FROM unnest(tbls) AS t, unnest(ARRAY['authenticated', 'anon']) AS r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS priv
  WHERE has_table_privilege(r, format('public.%I', t), priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement capture migration aborted: client privileges remain: %', bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.milestone_battles'::regclass
                 AND tgname = 'milestone_battles_measurement_capture' AND tgenabled <> 'D' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'measurement capture migration aborted: the capture trigger is missing or disabled';
  END IF;
  SELECT tgname INTO mine FROM pg_trigger WHERE tgrelid = 'public.lesson_progress'::regclass
    AND tgname = 'lesson_progress_mark_completion_source' AND tgenabled <> 'D' AND NOT tgisinternal;
  IF mine IS NULL THEN
    RAISE EXCEPTION 'measurement capture migration aborted: the completion_source trigger is missing or disabled';
  END IF;
  -- BEFORE ROW triggers fire in name order: ours must come after the guard and the back-date clamp.
  SELECT string_agg(tgname, ', ') INTO bad FROM pg_trigger
  WHERE tgrelid = 'public.lesson_progress'::regclass AND NOT tgisinternal
    AND tgname IN ('guard_lesson_progress_client_write', 'lesson_progress_limit_completed_at_backdate')
    AND tgname >= mine;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement capture migration aborted: trigger order: % fires after %', bad, mine;
  END IF;

  SELECT string_agg(DISTINCT p.oid::regprocedure::text, '; ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('measurement_capture_battle', 'measurement_rebuild', 'measurement_refresh_tags', 'reset_placement',
                      'measurement_capture_on_battle_finish', 'mark_lesson_completion_source')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         OR p.prosecdef);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement capture migration aborted: callable by clients or SECURITY DEFINER: %', bad;
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname IN ('measurement_capture_battle', 'measurement_rebuild', 'measurement_refresh_tags', 'reset_placement')) <> 4 THEN
    RAISE EXCEPTION 'measurement capture migration aborted: expected exactly 4 measurement functions';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lesson_progress'::regclass
                 AND conname = 'lesson_progress_completion_source_check') THEN
    RAISE EXCEPTION 'measurement capture migration aborted: lesson_progress_completion_source_check is missing';
  END IF;

  PERFORM public.measurement_rebuild();
END;
$$;
