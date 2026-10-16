-- =============================================================================
-- Learning measurement (phase 1), 5/6: report functions
-- =============================================================================
-- Every report is ONE call to ONE function returning jsonb (the database is
-- far from the functions):
--   * measurement_impact(actor, from, to, subject, path, split, min_cell)
--       the staff impact page (ImpactReport in src/lib/measurement/types.ts);
--       approved admins see every path, approved teachers their own paths.
--   * measurement_funder_export(actor, from, to, min_cell)
--       the anonymised funder tables (FunderExport); approved admins only.
--   * measurement_learner_summaries(learner_ids, now)
--       the parent card and the weekly digest (LearnerProgressSummary[]):
--       bands and skill names only, never a score.
-- Helpers (service_role only): measurement_impact_data (the shared engine),
-- measurement_band, measurement_subject_key, measurement_secondary_suppress.
--
-- Conventions: weeks start on Sunday (UTC), like the emails. Windows are
-- inclusive UTC days, at most 366, never in the future. Every row that reports
-- on a set of children carries `learners`; under k = 5 (never lower) every
-- number in it is NULL and `suppressed` is true. The funder export also
-- suppresses a second cell where one suppressed group could be recovered by
-- subtraction from its published total. Sensitive signup answers (war-affected,
-- out of school, country ...) are never read; ages are the ages given at signup.
--
-- All functions are SECURITY INVOKER, STABLE / IMMUTABLE, service_role only.
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. Small helpers
-- -----------------------------------------------------------------------------
-- The group of a row for a split: a learner band, or the row's subject.
CREATE OR REPLACE FUNCTION public.measurement_band(p_split text, p_grade text, p_age text, p_mode text, p_subject uuid)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT CASE p_split WHEN 'grade_band' THEN p_grade WHEN 'age_band' THEN p_age WHEN 'mode' THEN p_mode
                      WHEN 'subject' THEN p_subject::text END $$;

-- The curriculum_skills subject key of a subject, from its names (mirrors measurementSubjectKey in src/lib/measurement/rules.ts).
CREATE OR REPLACE FUNCTION public.measurement_subject_key(p_name_en text, p_name_ar text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN n ~ '(math|arith|رياضيات|حساب)' THEN 'math'
    WHEN n ~ '(english|إنجليزي|انجليزي|الإنكليزية)' THEN 'english'
    WHEN n ~ '(arabic|عربي|لغتي)' THEN 'arabic'
    WHEN n ~ '(science|علوم)' THEN 'science'
    WHEN n ~ '(islam|quran|qur''an|إسلام|اسلام|قرآن|دين)' THEN 'islamic'
    WHEN n ~ '(social|اجتماع)' THEN 'social'
    ELSE 'general' END
  FROM (SELECT lower(coalesce(p_name_en, '') || ' ' || coalesce(p_name_ar, '')) AS n) x $$;

-- Secondary (subtraction) suppression for the funder tables. Each row carries
-- `_part` (its partition: the rows that add up to a total) and `_total` (it is
-- that total). While a partition's published total has exactly one suppressed
-- group row, the published group row with the fewest learners is suppressed
-- too. The value keys of a suppressed row become null. `_part`/`_total` are removed.
CREATE OR REPLACE FUNCTION public.measurement_secondary_suppress(p_rows jsonb, p_value_keys text[])
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_rows    jsonb := coalesce(p_rows, '[]'::jsonb);
  v_changed boolean := true;
  v_part    text;
  v_pick    int;
  v_key     text;
  v_row     jsonb;
  v_guard   int := 0;
BEGIN
  WHILE v_changed AND v_guard < 1000 LOOP
    v_changed := false;
    v_guard := v_guard + 1;
    FOR v_part IN
      SELECT r ->> '_part' FROM jsonb_array_elements(v_rows) r
      WHERE r ->> '_part' IS NOT NULL
      GROUP BY r ->> '_part'
      HAVING bool_or(coalesce((r ->> '_total')::boolean, false) AND NOT coalesce((r ->> 'suppressed')::boolean, false))
         AND count(*) FILTER (WHERE NOT coalesce((r ->> '_total')::boolean, false) AND coalesce((r ->> 'suppressed')::boolean, false)) = 1
         AND count(*) FILTER (WHERE NOT coalesce((r ->> '_total')::boolean, false) AND NOT coalesce((r ->> 'suppressed')::boolean, false)) >= 1
    LOOP
      SELECT e.ord - 1 INTO v_pick
      FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(r, ord)
      WHERE e.r ->> '_part' = v_part AND NOT coalesce((e.r ->> '_total')::boolean, false)
        AND NOT coalesce((e.r ->> 'suppressed')::boolean, false)
      ORDER BY (e.r ->> 'learners')::numeric NULLS FIRST, e.ord
      LIMIT 1;
      v_row := v_rows -> v_pick;
      FOREACH v_key IN ARRAY p_value_keys || ARRAY['learners'] LOOP
        IF v_row ? v_key THEN v_row := jsonb_set(v_row, ARRAY[v_key], 'null'::jsonb); END IF;
      END LOOP;
      v_row := jsonb_set(v_row, '{suppressed}', 'true'::jsonb);
      v_rows := jsonb_set(v_rows, ARRAY[v_pick::text], v_row);
      v_changed := true;
    END LOOP;
  END LOOP;
  RETURN coalesce((SELECT jsonb_agg((r - '_part') - '_total' ORDER BY ord) FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(r, ord)),
                  '[]'::jsonb);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. The shared engine: every impact section for a set of paths, suppressed at k.
--    p_monthly: retention cohorts by calendar month (YYYY-MM) instead of week.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.measurement_impact_data(uuid[], date, date, text, int, boolean);
CREATE OR REPLACE FUNCTION public.measurement_impact_data(
  p_paths uuid[], p_from date, p_to date, p_split text, p_k int, p_monthly boolean DEFAULT false, p_learners uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_k      int := greatest(5, coalesce(p_k, 5));
  v_split  text := coalesce(p_split, 'none');
  v_start  timestamptz := (p_from::timestamp AT TIME ZONE 'UTC');
  v_end    timestamptz := ((p_to + 1)::timestamp AT TIME ZONE 'UTC');
  v_today  date := (now() AT TIME ZONE 'UTC')::date;
  v_wfrom  date := p_from - extract(dow FROM p_from)::int;
  v_wto    date := p_to - extract(dow FROM p_to)::int;
  v_result jsonb;
BEGIN
  IF v_split NOT IN ('none', 'grade_band', 'age_band', 'subject', 'mode') OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;

  WITH
  measured AS (
    SELECT p.id, p.grade_level FROM public.profiles p LEFT JOIN public.profiles o ON o.id = p.parent_account_id
    WHERE p.role::text = 'student' AND (p.parent_account_id IS NULL OR o.role::text = 'parent')
      AND (p_learners IS NULL OR p.id = ANY (p_learners))
  ),
  ages AS (
    SELECT DISTINCT ON (x.lid) x.lid, x.age
    FROM (SELECT a.learner_profile_ids[i] AS lid, a.learner_profile_ages[i] AS age, a.created_at
          FROM public.parent_applications a, generate_subscripts(a.learner_profile_ids, 1) AS i) x
    WHERE x.lid IS NOT NULL
    ORDER BY x.lid, x.created_at DESC
  ),
  scope_paths AS (SELECT p.id, p.subject_id FROM public.learning_paths p WHERE p.id = ANY (coalesce(p_paths, '{}'::uuid[]))),
  path_lessons AS (
    SELECT DISTINCT s.lesson_id, sp.id AS path_id, sp.subject_id
    FROM public.learning_path_steps s JOIN public.learning_path_weeks w ON w.id = s.week_id JOIN scope_paths sp ON sp.id = w.path_id
  ),
  scope_lessons AS (SELECT DISTINCT lesson_id, subject_id FROM path_lessons),
  progress AS (
    SELECT lp.student_id AS learner_id, sl.subject_id, lp.lesson_id, lp.created_at, lp.updated_at,
           lp.completed, lp.completed_at, lp.completion_source
    FROM public.lesson_progress lp JOIN scope_lessons sl ON sl.lesson_id = lp.lesson_id JOIN measured me ON me.id = lp.student_id
  ),
  completions AS (
    SELECT DISTINCT learner_id, subject_id, lesson_id, completed_at, completion_source,
           (completed_at AT TIME ZONE 'UTC')::date - extract(dow FROM (completed_at AT TIME ZONE 'UTC'))::int AS wk
    FROM progress WHERE completed AND completed_at >= v_start AND completed_at < v_end
  ),
  modes AS (
    SELECT c.learner_id,
           CASE WHEN count(*) FILTER (WHERE c.completion_source IN ('online', 'offline_sync')) < 2 THEN 'unknown'
                WHEN 2 * count(*) FILTER (WHERE c.completion_source = 'offline_sync')
                     >= count(*) FILTER (WHERE c.completion_source IN ('online', 'offline_sync')) THEN 'offline_heavy'
                WHEN count(*) FILTER (WHERE c.completion_source = 'offline_sync') = 0 THEN 'online'
                ELSE 'mixed' END AS mode
    FROM (SELECT DISTINCT learner_id, lesson_id, completion_source FROM completions) c
    GROUP BY c.learner_id
  ),
  lb AS (
    SELECT me.id AS learner_id,
           CASE WHEN me.grade_level IS NULL OR me.grade_level < 1 THEN 'unknown' WHEN me.grade_level <= 2 THEN '1-2'
                WHEN me.grade_level <= 4 THEN '3-4' WHEN me.grade_level <= 6 THEN '5-6' ELSE '7+' END AS grade_band,
           CASE WHEN ag.age IS NULL OR ag.age < 3 THEN 'unknown' WHEN ag.age <= 6 THEN '3-6' WHEN ag.age <= 8 THEN '7-8'
                WHEN ag.age <= 10 THEN '9-10' WHEN ag.age <= 12 THEN '11-12' ELSE '13+' END AS age_band,
           coalesce(md.mode, 'unknown') AS mode
    FROM measured me LEFT JOIN ages ag ON ag.lid = me.id LEFT JOIN modes md ON md.learner_id = me.id
  ),
  activity AS (
    SELECT DISTINCT x.learner_id, x.subject_id, x.day, x.day - extract(dow FROM x.day)::int AS wk
    FROM (
      SELECT pr.learner_id, pr.subject_id, (t.ts AT TIME ZONE 'UTC')::date AS day
      FROM progress pr CROSS JOIN LATERAL unnest(ARRAY[pr.created_at, pr.updated_at, pr.completed_at]) AS t(ts)
      WHERE t.ts IS NOT NULL
      UNION ALL
      SELECT ha.student_id, sl.subject_id, (ha.submitted_at AT TIME ZONE 'UTC')::date
      FROM public.homework_attempts ha
      JOIN public.homework_assignments a ON a.id = ha.assignment_id
      JOIN scope_lessons sl ON sl.lesson_id = a.lesson_id
      JOIN measured me ON me.id = ha.student_id
      UNION ALL
      SELECT b.learner_id, sp.subject_id, (ans.answered_at AT TIME ZONE 'UTC')::date
      FROM public.milestone_battle_answers ans
      JOIN public.milestone_battles b ON b.id = ans.battle_id AND NOT b.is_preview
      JOIN public.learning_path_milestones ml ON ml.id = b.milestone_id
      JOIN scope_paths sp ON sp.id = ml.path_id
      JOIN measured me ON me.id = b.learner_id
    ) x
  ),
  occ AS (
    SELECT o.* FROM public.measurement_occasions o JOIN scope_paths sp ON sp.id = o.path_id JOIN measured me ON me.id = o.learner_id
  ),
  scored AS (
    SELECT i.*, o.kind, o.subject_id, o.finished_at, o.scored_count, o.scored_correct
    FROM public.measurement_item_results i JOIN occ o ON o.battle_id = i.battle_id
    WHERE NOT i.hinted
  ),
  scope_bosses AS (
    SELECT ml.id, ml.path_id, sp.subject_id, ml.after_week_number, ml.title_en, ml.title_ar
    FROM public.learning_path_milestones ml JOIN scope_paths sp ON sp.id = ml.path_id WHERE ml.kind = 'milestone'
  ),
  path_start AS (
    SELECT x.learner_id, x.path_id, min(x.ts) AS started
    FROM (
      SELECT lp.student_id AS learner_id, pl.path_id, lp.created_at AS ts
      FROM public.lesson_progress lp JOIN path_lessons pl ON pl.lesson_id = lp.lesson_id JOIN measured me ON me.id = lp.student_id
      UNION ALL
      SELECT b.learner_id, ml.path_id, b.started_at
      FROM public.milestone_battles b
      JOIN public.learning_path_milestones ml ON ml.id = b.milestone_id AND ml.kind = 'placement'
      JOIN scope_paths sp ON sp.id = ml.path_id
      JOIN measured me ON me.id = b.learner_id
      WHERE NOT b.is_preview
    ) x
    GROUP BY x.learner_id, x.path_id
  ),

  -- ---------------- growth: skills ----------------
  base_occ AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.battle_id, o.finished_at, o.level_score
    FROM occ o WHERE o.kind = 'placement' AND o.baseline_valid
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  lat_skill AS (
    SELECT DISTINCT ON (s.learner_id, s.skill_key) s.learner_id, s.skill_key, s.subject_id, s.battle_id, s.finished_at
    FROM scored s WHERE s.kind = 'milestone' AND s.skill_key IS NOT NULL AND s.finished_at < v_end
    ORDER BY s.learner_id, s.skill_key, s.finished_at DESC
  ),
  gs_pop AS (
    SELECT l.learner_id, l.skill_key, l.subject_id, l.battle_id AS lat_battle, b.battle_id AS base_battle
    FROM lat_skill l
    JOIN base_occ b ON b.learner_id = l.learner_id AND b.subject_id = l.subject_id AND b.finished_at < l.finished_at
    WHERE l.finished_at >= v_start
      AND EXISTS (SELECT 1 FROM scored s WHERE s.battle_id = b.battle_id AND s.skill_key = l.skill_key)
  ),
  gs_items AS (
    SELECT p.learner_id, p.subject_id, p.skill_key, 'B'::text AS side, s.difficulty, s.is_correct
    FROM gs_pop p JOIN scored s ON s.battle_id = p.base_battle AND s.skill_key = p.skill_key
    UNION ALL
    SELECT p.learner_id, p.subject_id, p.skill_key, 'L'::text, s.difficulty, s.is_correct
    FROM gs_pop p JOIN scored s ON s.battle_id = p.lat_battle AND s.skill_key = p.skill_key
  ),
  gs_g AS (
    SELECT g.grp, it.* FROM gs_items it JOIN lb ON lb.learner_id = it.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, it.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
  ),
  gs_d AS (
    SELECT grp, subject_id, skill_key, difficulty,
           count(*) FILTER (WHERE side = 'B') AS nb, count(*) FILTER (WHERE side = 'B' AND is_correct) AS cb,
           count(*) FILTER (WHERE side = 'L') AS nl, count(*) FILTER (WHERE side = 'L' AND is_correct) AS cl
    FROM gs_g WHERE difficulty IS NOT NULL GROUP BY grp, subject_id, skill_key, difficulty
  ),
  gs_m AS (
    SELECT grp, subject_id, skill_key,
           sum(least(nb, nl) * (cl::numeric / nl - cb::numeric / nb)) / nullif(sum(least(nb, nl)), 0) AS matched
    FROM gs_d WHERE nb > 0 AND nl > 0 GROUP BY grp, subject_id, skill_key
  ),
  gs_rows AS (
    SELECT g.grp, g.subject_id, g.skill_key, count(DISTINCT g.learner_id) AS learners,
           count(*) FILTER (WHERE g.side = 'B' AND g.is_correct)::numeric / nullif(count(*) FILTER (WHERE g.side = 'B'), 0) AS br,
           count(*) FILTER (WHERE g.side = 'L' AND g.is_correct)::numeric / nullif(count(*) FILTER (WHERE g.side = 'L'), 0) AS lr
    FROM gs_g g GROUP BY g.grp, g.subject_id, g.skill_key
  ),

  -- ---------------- growth: subjects ----------------
  lat_occ AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.level_score, o.finished_at
    FROM occ o WHERE o.kind = 'milestone' AND o.level_score IS NOT NULL AND o.finished_at < v_end
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  sg_units AS (
    SELECT l.learner_id, l.subject_id, b.level_score AS base, l.level_score AS latest, l.level_score - b.level_score AS delta
    FROM lat_occ l JOIN base_occ b ON b.learner_id = l.learner_id AND b.subject_id = l.subject_id AND b.finished_at < l.finished_at
    WHERE l.finished_at >= v_start AND b.level_score IS NOT NULL
  ),
  sg_rows AS (
    SELECT g.grp, u.subject_id, count(DISTINCT u.learner_id) AS learners,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u.base) AS mb,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u.latest) AS ml,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u.delta) AS md,
           avg((u.delta > 0)::int) AS improved
    FROM sg_units u JOIN lb ON lb.learner_id = u.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, u.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
    GROUP BY g.grp, u.subject_id
  ),

  -- ---------------- bosses ----------------
  fin_battles AS (
    SELECT b.learner_id, b.milestone_id, b.status, b.started_at
    FROM public.milestone_battles b JOIN scope_bosses sb ON sb.id = b.milestone_id JOIN measured me ON me.id = b.learner_id
    WHERE NOT b.is_preview AND b.status IN ('won', 'lost') AND b.finished_at < v_end
  ),
  boss_learners AS (
    SELECT f.milestone_id, f.learner_id, count(*) FILTER (WHERE f.status = 'lost') AS lost_count
    FROM fin_battles f GROUP BY f.milestone_id, f.learner_id
  ),
  certs AS (
    SELECT c.learner_id, c.milestone_id, c.awarded_at, cb.started_at AS cert_battle_started
    FROM public.learner_certificates c
    JOIN scope_bosses sb ON sb.id = c.milestone_id
    LEFT JOIN public.milestone_battles cb ON cb.id = c.battle_id
    WHERE c.awarded_at < v_end
  ),
  boss_units AS (
    SELECT bl.milestone_id, bl.learner_id, sb.subject_id,
           c.learner_id IS NOT NULL AS has_cert,
           bl.lost_count >= 3 AND c.learner_id IS NULL AS stuck,
           o.outcome AS occ_outcome,
           CASE WHEN o.scored_count > 0 THEN 100.0 * o.scored_correct / o.scored_count END AS occ_score,
           CASE WHEN c.awarded_at >= v_start AND c.cert_battle_started IS NOT NULL THEN
             (SELECT count(*) FROM public.milestone_battles b2
              WHERE b2.learner_id = bl.learner_id AND b2.milestone_id = bl.milestone_id AND NOT b2.is_preview
                AND b2.started_at <= c.cert_battle_started) END AS attempts_to_pass
    FROM boss_learners bl
    JOIN scope_bosses sb ON sb.id = bl.milestone_id
    LEFT JOIN certs c ON c.learner_id = bl.learner_id AND c.milestone_id = bl.milestone_id
    LEFT JOIN occ o ON o.learner_id = bl.learner_id AND o.milestone_id = bl.milestone_id AND o.kind = 'milestone'
                   AND o.finished_at >= v_start AND o.finished_at < v_end
  ),
  boss_g AS (
    SELECT g.grp, u.* FROM boss_units u JOIN lb ON lb.learner_id = u.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, u.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
  ),
  boss_rows AS (
    SELECT grp, milestone_id, count(DISTINCT learner_id) AS learners,
           count(*) FILTER (WHERE occ_outcome IS NOT NULL) AS n_occ,
           count(*) FILTER (WHERE occ_outcome = 'won') AS n_occ_won,
           count(*) FILTER (WHERE has_cert) AS n_cert,
           count(*) FILTER (WHERE attempts_to_pass IS NOT NULL) AS n_pass,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY attempts_to_pass) AS med_att,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY occ_score) AS med_score,
           count(*) FILTER (WHERE stuck) AS n_stuck
    FROM boss_g GROUP BY grp, milestone_id
  ),
  boss_all AS (
    SELECT grp, count(DISTINCT learner_id) FILTER (WHERE occ_outcome IS NOT NULL) AS learners,
           count(*) FILTER (WHERE occ_outcome IS NOT NULL) AS n_occ,
           count(*) FILTER (WHERE occ_outcome = 'won') AS n_occ_won,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY occ_score) AS med_score
    FROM boss_g GROUP BY grp
  ),

  -- ---------------- stuck skills ----------------
  st_occ AS (
    SELECT s.learner_id, s.subject_id, s.skill_key, s.battle_id, count(*) AS n, count(*) FILTER (WHERE s.is_correct) AS c
    FROM scored s
    WHERE s.kind = 'milestone' AND s.skill_key IS NOT NULL AND s.finished_at >= v_start AND s.finished_at < v_end
    GROUP BY s.learner_id, s.subject_id, s.skill_key, s.battle_id
  ),
  st_units AS (
    SELECT learner_id, subject_id, skill_key, sum(n) AS n, sum(c) AS c,
           bool_or(n >= 2) AS eligible, bool_or(n >= 2 AND c::numeric / n < 0.5) AS stuck
    FROM st_occ GROUP BY learner_id, subject_id, skill_key
  ),
  st_rows AS (
    SELECT g.grp, u.subject_id, u.skill_key, count(*) AS learners,
           sum(u.c)::numeric / nullif(sum(u.n), 0) AS rate,
           count(*) FILTER (WHERE u.eligible) AS n_elig,
           count(*) FILTER (WHERE u.stuck) AS n_stuck
    FROM st_units u JOIN lb ON lb.learner_id = u.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, u.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
    GROUP BY g.grp, u.subject_id, u.skill_key
  ),

  -- ---------------- item QA (milestone and placement occasions) ----------------
  qa_rows AS (
    SELECT s.question_id, s.milestone_id, min(s.kind) AS kind, count(*) AS responses, count(DISTINCT s.learner_id) AS learners,
           avg(s.is_correct::int) AS p,
           corr(s.is_correct::int, (s.scored_correct - s.is_correct::int)::float8 / (s.scored_count - 1))
             FILTER (WHERE s.scored_count >= 4) AS disc,
           count(*) FILTER (WHERE s.scored_count >= 4) AS n_disc
    FROM scored s
    WHERE s.question_id IS NOT NULL AND s.answered_at >= v_start AND s.answered_at < v_end
    GROUP BY s.question_id, s.milestone_id
  ),

  -- ---------------- engagement ----------------
  eng_units AS (
    SELECT a.learner_id, a.subject_id, count(DISTINCT a.wk) AS active_weeks
    FROM activity a WHERE a.day BETWEEN p_from AND p_to
    GROUP BY GROUPING SETS ((a.learner_id), (a.learner_id, a.subject_id))
  ),
  comp_units AS (
    SELECT c.learner_id, c.subject_id, count(DISTINCT c.lesson_id) AS completions, count(DISTINCT c.wk) AS completion_weeks
    FROM completions c
    GROUP BY GROUPING SETS ((c.learner_id), (c.learner_id, c.subject_id))
  ),
  eng_g AS (
    SELECT g.grp, e.learner_id, e.active_weeks, coalesce(c.completions, 0) AS completions, coalesce(c.completion_weeks, 0) AS completion_weeks
    FROM eng_units e
    JOIN lb ON lb.learner_id = e.learner_id
    LEFT JOIN comp_units c ON c.learner_id = e.learner_id AND c.subject_id IS NOT DISTINCT FROM e.subject_id
    CROSS JOIN LATERAL (
      SELECT 'all'::text AS grp WHERE e.subject_id IS NULL
      UNION ALL SELECT public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, NULL)
        WHERE e.subject_id IS NULL AND v_split IN ('grade_band', 'age_band', 'mode')
      UNION ALL SELECT e.subject_id::text WHERE e.subject_id IS NOT NULL AND v_split = 'subject'
    ) g
  ),
  eng_rows AS (
    SELECT grp, count(DISTINCT learner_id) AS learners,
           count(DISTINCT learner_id) FILTER (WHERE completions > 0) AS active_learners,
           sum(completions) AS completions,
           sum(completions)::numeric / nullif(sum(completion_weeks), 0) AS lpaw,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY active_weeks) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY active_weeks) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY active_weeks) AS p75
    FROM eng_g GROUP BY grp
  ),
  eng_weeks AS (
    SELECT w.wk::date AS wk, count(DISTINCT c.learner_id) AS active, count(DISTINCT (c.learner_id, c.lesson_id)) FILTER (WHERE c.learner_id IS NOT NULL) AS completions
    FROM generate_series(v_wfrom::timestamp, v_wto::timestamp, interval '7 days') AS w(wk)
    LEFT JOIN completions c ON c.wk = w.wk::date
    GROUP BY w.wk
  ),

  -- ---------------- retention ----------------
  first_act AS (
    SELECT a.learner_id, a.subject_id, min(a.day) AS first_day
    FROM activity a GROUP BY GROUPING SETS ((a.learner_id), (a.learner_id, a.subject_id))
  ),
  cohort AS (
    SELECT f.learner_id, f.subject_id, f.first_day - extract(dow FROM f.first_day)::int AS cweek,
           CASE WHEN p_monthly THEN to_char(f.first_day, 'YYYY-MM')
                ELSE to_char(f.first_day - extract(dow FROM f.first_day)::int, 'YYYY-MM-DD') END AS cohort_key
    FROM first_act f WHERE f.first_day BETWEEN p_from AND p_to
  ),
  act_weeks AS (
    SELECT DISTINCT learner_id, subject_id, wk FROM activity
    UNION
    SELECT DISTINCT learner_id, NULL::uuid, wk FROM activity
  ),
  ret_hits AS (
    SELECT c.learner_id, c.subject_id, ((aw.wk - c.cweek) / 7) AS k
    FROM cohort c
    JOIN act_weeks aw ON aw.learner_id = c.learner_id AND aw.subject_id IS NOT DISTINCT FROM c.subject_id
                     AND aw.wk > c.cweek AND ((aw.wk - c.cweek) / 7) IN (1, 2, 4, 8, 12)
  ),
  ret_g AS (
    SELECT g.grp, c.learner_id, c.subject_id, c.cweek, c.cohort_key
    FROM cohort c
    JOIN lb ON lb.learner_id = c.learner_id
    CROSS JOIN LATERAL (
      SELECT 'all'::text AS grp WHERE c.subject_id IS NULL
      UNION ALL SELECT public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, NULL)
        WHERE c.subject_id IS NULL AND v_split IN ('grade_band', 'age_band', 'mode')
      UNION ALL SELECT c.subject_id::text WHERE c.subject_id IS NOT NULL AND v_split = 'subject'
    ) g
  ),
  ret_rows AS (
    SELECT r.grp, r.cohort_key, count(DISTINCT r.learner_id) AS learners, max(r.cweek) AS last_week,
           count(DISTINCT r.learner_id) FILTER (WHERE h.k = 1) AS k1,
           count(DISTINCT r.learner_id) FILTER (WHERE h.k = 2) AS k2,
           count(DISTINCT r.learner_id) FILTER (WHERE h.k = 4) AS k4,
           count(DISTINCT r.learner_id) FILTER (WHERE h.k = 8) AS k8,
           count(DISTINCT r.learner_id) FILTER (WHERE h.k = 12) AS k12
    FROM ret_g r
    LEFT JOIN ret_hits h ON h.learner_id = r.learner_id AND h.subject_id IS NOT DISTINCT FROM r.subject_id
    GROUP BY r.grp, r.cohort_key
  ),

  -- ---------------- pace ----------------
  pace_units AS (
    SELECT sb.id AS milestone_id, sb.subject_id, c.learner_id,
           extract(epoch FROM (c.awarded_at - ps.started)) / 604800.0 AS weeks
    FROM public.learner_certificates c
    JOIN scope_bosses sb ON sb.id = c.milestone_id
    JOIN measured me ON me.id = c.learner_id
    JOIN path_start ps ON ps.learner_id = c.learner_id AND ps.path_id = sb.path_id
    WHERE c.awarded_at >= v_start AND c.awarded_at < v_end
  ),
  pace_rows AS (
    SELECT g.grp, u.milestone_id, count(DISTINCT u.learner_id) AS learners,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY u.weeks) AS med,
           percentile_cont(0.25) WITHIN GROUP (ORDER BY u.weeks) AS p25,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY u.weeks) AS p75
    FROM pace_units u JOIN lb ON lb.learner_id = u.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, u.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
    GROUP BY g.grp, u.milestone_id
  ),

  -- ---------------- placement coverage ----------------
  pc_units AS (
    SELECT ps.learner_id, sp.subject_id,
           bool_or(o.learner_id IS NOT NULL) AS placed,
           bool_or(coalesce(o.baseline_valid, false)) AS valid,
           bool_or(coalesce(o.late, false)) AS late
    FROM path_start ps
    JOIN scope_paths sp ON sp.id = ps.path_id
    LEFT JOIN occ o ON o.learner_id = ps.learner_id AND o.path_id = ps.path_id AND o.kind = 'placement'
    WHERE ps.started >= v_start AND ps.started < v_end
    GROUP BY ps.learner_id, sp.subject_id
  ),
  pc_rows AS (
    SELECT g.grp, u.subject_id, count(*) AS learners,
           count(*) FILTER (WHERE u.placed) AS placed, count(*) FILTER (WHERE u.valid) AS valid,
           count(*) FILTER (WHERE u.late) AS late
    FROM pc_units u JOIN lb ON lb.learner_id = u.learner_id
    CROSS JOIN LATERAL (VALUES ('all'::text), (public.measurement_band(v_split, lb.grade_band, lb.age_band, lb.mode, u.subject_id))) g(grp)
    WHERE g.grp IS NOT NULL
    GROUP BY g.grp, u.subject_id
  )

  SELECT jsonb_build_object(
    'subjects', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', sj.id, 'nameAr', sj.name_ar, 'nameEn', sj.name_en) ORDER BY sj.name_en NULLS LAST, sj.id)
      FROM public.subjects sj WHERE sj.id IN (SELECT subject_id FROM scope_paths)), '[]'::jsonb),
    'bossLabels', coalesce((
      SELECT jsonb_agg(jsonb_build_object('milestoneId', sb.id, 'subjectId', sb.subject_id, 'afterWeekNumber', sb.after_week_number,
                                          'titleEn', sb.title_en, 'titleAr', sb.title_ar) ORDER BY sb.subject_id, sb.after_week_number)
      FROM scope_bosses sb), '[]'::jsonb),
    'growth', jsonb_build_object(
      'skills', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
                 'subjectId', r.subject_id, 'skillKey', r.skill_key, 'labelEn', cs.label_en, 'labelAr', cs.label_ar,
                 'baselineRate', CASE WHEN r.learners >= v_k THEN round(r.br, 3) END,
                 'latestRate', CASE WHEN r.learners >= v_k THEN round(r.lr, 3) END,
                 'growthPp', CASE WHEN r.learners >= v_k THEN round(100 * (r.lr - r.br), 1) END,
                 'matchedGrowthPp', CASE WHEN r.learners >= v_k THEN round(100 * m.matched, 1) END)
               ORDER BY r.grp <> 'all', r.grp, r.subject_id, cs.sort_order, r.skill_key)
        FROM gs_rows r
        LEFT JOIN gs_m m ON m.grp = r.grp AND m.subject_id = r.subject_id AND m.skill_key = r.skill_key
        LEFT JOIN public.curriculum_skills cs ON cs.skill_key = r.skill_key), '[]'::jsonb),
      'subjects', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
                 'subjectId', r.subject_id,
                 'medianBaselineScore', CASE WHEN r.learners >= v_k THEN round(r.mb::numeric, 1) END,
                 'medianLatestScore', CASE WHEN r.learners >= v_k THEN round(r.ml::numeric, 1) END,
                 'medianGrowth', CASE WHEN r.learners >= v_k THEN round(r.md::numeric, 1) END,
                 'improvedShare', CASE WHEN r.learners >= v_k THEN round(r.improved, 3) END)
               ORDER BY r.grp <> 'all', r.grp, r.subject_id)
        FROM sg_rows r), '[]'::jsonb)),
    'bosses', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'milestoneId', sb.id, 'pathId', sb.path_id, 'subjectId', sb.subject_id, 'afterWeekNumber', sb.after_week_number,
               'firstTryPassRate', CASE WHEN r.learners >= v_k AND r.n_occ >= v_k THEN round(r.n_occ_won::numeric / r.n_occ, 3) END,
               'eventualPassRate', CASE WHEN r.learners >= v_k THEN round(r.n_cert::numeric / r.learners, 3) END,
               'medianAttemptsToPass', CASE WHEN r.learners >= v_k AND r.n_pass >= v_k THEN round(r.med_att::numeric, 1) END,
               'medianFirstTryScore', CASE WHEN r.learners >= v_k AND r.n_occ >= v_k THEN round(r.med_score::numeric, 1) END,
               'stuckLearners', CASE WHEN r.learners >= v_k THEN r.n_stuck END)
             ORDER BY r.grp <> 'all', r.grp, sb.subject_id, sb.after_week_number)
      FROM boss_rows r JOIN scope_bosses sb ON sb.id = r.milestone_id), '[]'::jsonb),
    'bossesOverall', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'firstTryPassRate', CASE WHEN r.learners >= v_k THEN round(r.n_occ_won::numeric / nullif(r.n_occ, 0), 3) END,
               'medianFirstTryScore', CASE WHEN r.learners >= v_k THEN round(r.med_score::numeric, 1) END)
             ORDER BY r.grp <> 'all', r.grp)
      FROM boss_all r), '[]'::jsonb),
    'stuckSkills', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'subjectId', r.subject_id, 'skillKey', r.skill_key, 'labelEn', cs.label_en, 'labelAr', cs.label_ar,
               'firstTryRate', CASE WHEN r.learners >= v_k THEN round(r.rate, 3) END,
               'stuckRate', CASE WHEN r.learners >= v_k AND r.n_elig >= v_k THEN round(r.n_stuck::numeric / r.n_elig, 3) END)
             ORDER BY r.grp <> 'all', r.grp,
                      CASE WHEN r.learners >= v_k AND r.n_elig >= v_k THEN r.n_stuck::numeric / r.n_elig END DESC NULLS LAST,
                      r.subject_id, cs.sort_order, r.skill_key)
      FROM st_rows r LEFT JOIN public.curriculum_skills cs ON cs.skill_key = r.skill_key), '[]'::jsonb),
    'itemQa', coalesce((
      SELECT jsonb_agg(x.row ORDER BY x.suppressed, x.nflags DESC, x.p NULLS LAST, x.question_id)
      FROM (
        SELECT r.question_id, r.learners < v_k AS suppressed, r.p,
               jsonb_array_length(f.flags) AS nflags,
               jsonb_build_object(
                 'questionId', r.question_id, 'milestoneId', r.milestone_id, 'kind', r.kind,
                 'skillKey', q.skill_key, 'difficulty', q.difficulty,
                 'interactionType', CASE coalesce(q.interaction ->> 'type', q.question_type::text)
                                      WHEN 'multiple_choice' THEN 'choose_correct'
                                      WHEN 'short_answer' THEN 'fill_missing_word'
                                      WHEN 'choose_correct' THEN 'choose_correct' WHEN 'true_false' THEN 'true_false'
                                      WHEN 'fill_missing_word' THEN 'fill_missing_word' WHEN 'tap_to_count' THEN 'tap_to_count'
                                      WHEN 'match_pairs' THEN 'match_pairs' WHEN 'sequence_order' THEN 'sequence_order'
                                      WHEN 'sort_groups' THEN 'sort_groups' WHEN 'drag_drop_label' THEN 'drag_drop_label'
                                      WHEN 'trace_letter' THEN 'trace_letter' END,
                 'promptPreview', left(coalesce(nullif(btrim(q.question_text_en), ''), q.question_text_ar, ''), 80),
                 'responses', CASE WHEN r.learners >= v_k THEN r.responses END,
                 'learners', CASE WHEN r.learners >= v_k THEN r.learners END,
                 'pValue', CASE WHEN r.learners >= v_k THEN round(r.p, 3) END,
                 'discrimination', CASE WHEN r.learners >= v_k THEN round(r.disc::numeric, 3) END,
                 'flags', f.flags,
                 'suppressed', r.learners < v_k) AS row
        FROM qa_rows r
        JOIN public.homework_questions q ON q.id = r.question_id
        CROSS JOIN LATERAL (
          SELECT CASE WHEN r.learners < v_k THEN '["low_n"]'::jsonb ELSE coalesce(jsonb_agg(fl.flag ORDER BY fl.ord), '[]'::jsonb) END AS flags
          FROM (VALUES
                  (1, 'too_hard', r.p < 0.30),
                  (2, 'too_easy', r.p > 0.95),
                  (3, 'not_discriminating', r.n_disc >= 20 AND r.disc IS NOT NULL AND r.disc < 0.15),
                  (4, 'difficulty_mismatch', (q.difficulty = 1 AND r.p < 0.50) OR (q.difficulty = 3 AND r.p > 0.90)),
                  (5, 'low_n', r.responses < 10)) AS fl(ord, flag, hit)
          WHERE fl.hit IS TRUE
        ) f
      ) x), '[]'::jsonb),
    'engagement', jsonb_build_object(
      'rows', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
                 'activeLearners', CASE WHEN r.learners >= v_k THEN r.active_learners END,
                 'completions', CASE WHEN r.learners >= v_k THEN r.completions END,
                 'lessonsPerActiveWeek', CASE WHEN r.learners >= v_k THEN round(r.lpaw, 2) END,
                 'medianActiveWeeks', CASE WHEN r.learners >= v_k THEN round(r.med::numeric, 1) END,
                 'p25ActiveWeeks', CASE WHEN r.learners >= v_k THEN round(r.p25::numeric, 1) END,
                 'p75ActiveWeeks', CASE WHEN r.learners >= v_k THEN round(r.p75::numeric, 1) END)
               ORDER BY r.grp <> 'all', r.grp)
        FROM eng_rows r), '[]'::jsonb),
      'weeks', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'weekStart', to_char(w.wk, 'YYYY-MM-DD'),
                 'activeLearners', CASE WHEN w.active >= v_k THEN w.active END,
                 'completions', CASE WHEN w.active >= v_k THEN w.completions END,
                 'suppressed', w.active < v_k)
               ORDER BY w.wk)
        FROM eng_weeks w), '[]'::jsonb)),
    'retention', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'cohortStart', r.cohort_key,
               'week1', CASE WHEN r.learners >= v_k AND r.last_week + 13 < v_today THEN round(r.k1::numeric / r.learners, 3) END,
               'week2', CASE WHEN r.learners >= v_k AND r.last_week + 20 < v_today THEN round(r.k2::numeric / r.learners, 3) END,
               'week4', CASE WHEN r.learners >= v_k AND r.last_week + 34 < v_today THEN round(r.k4::numeric / r.learners, 3) END,
               'week8', CASE WHEN r.learners >= v_k AND r.last_week + 62 < v_today THEN round(r.k8::numeric / r.learners, 3) END,
               'week12', CASE WHEN r.learners >= v_k AND r.last_week + 90 < v_today THEN round(r.k12::numeric / r.learners, 3) END)
             ORDER BY r.grp <> 'all', r.grp, r.cohort_key)
      FROM ret_rows r), '[]'::jsonb),
    'pace', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'milestoneId', sb.id, 'subjectId', sb.subject_id, 'afterWeekNumber', sb.after_week_number,
               'expectedWeeks', sb.after_week_number,
               'medianWeeksToPass', CASE WHEN r.learners >= v_k THEN round(r.med::numeric, 1) END,
               'p25WeeksToPass', CASE WHEN r.learners >= v_k THEN round(r.p25::numeric, 1) END,
               'p75WeeksToPass', CASE WHEN r.learners >= v_k THEN round(r.p75::numeric, 1) END)
             ORDER BY r.grp <> 'all', r.grp, sb.subject_id, sb.after_week_number)
      FROM pace_rows r JOIN scope_bosses sb ON sb.id = r.milestone_id), '[]'::jsonb),
    'placement', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'group', r.grp, 'learners', CASE WHEN r.learners >= v_k THEN r.learners END, 'suppressed', r.learners < v_k,
               'subjectId', r.subject_id,
               'startedPath', CASE WHEN r.learners >= v_k THEN r.learners END,
               'placementsCompleted', CASE WHEN r.learners >= v_k THEN r.placed END,
               'validBaselines', CASE WHEN r.learners >= v_k THEN r.valid END,
               'lateBaselines', CASE WHEN r.learners >= v_k THEN r.late END)
             ORDER BY r.grp <> 'all', r.grp, r.subject_id)
      FROM pc_rows r), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Who sees which learners (impact scopes), and measurement_impact (ImpactReport)
-- -----------------------------------------------------------------------------
-- The learners in a scope for an actor, by the class / school rule
-- (the same rule as can_view_learner_progress):
--   'all'          admin: every learner (learners NULL = no filter); otherwise the
--                  learners of the actor's classes and of their schools' classes;
--   'school:<id>'  an approved admin, or an approved admin of that school;
--   'class:<id>'   an approved admin, an approved teacher of that class, or an admin of its school.
-- Only approved, active members count. Raises impact_forbidden / invalid_query.
CREATE OR REPLACE FUNCTION public.measurement_scope_learners(p_actor uuid, p_scope text,
  OUT kind text, OUT scope_id uuid, OUT label text, OUT learners uuid[])
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_admin   boolean := false;
  v_teacher boolean := false;
  v_schools uuid[];
  v_scope   text := coalesce(nullif(btrim(p_scope), ''), 'all');
  v_id      uuid;
BEGIN
  SELECT coalesce(p.role::text = 'admin' AND p.is_approved, false), coalesce(p.role::text = 'teacher' AND p.is_approved, false)
    INTO v_admin, v_teacher FROM public.profiles p WHERE p.id = p_actor;
  v_admin := coalesce(v_admin, false);
  v_teacher := coalesce(v_teacher, false);
  v_schools := ARRAY(SELECT sa.school_id FROM public.school_admins sa JOIN public.schools s ON s.id = sa.school_id AND s.is_active
                     WHERE sa.profile_id = p_actor AND sa.approved ORDER BY sa.school_id);
  IF p_actor IS NULL OR NOT (v_admin OR v_teacher OR cardinality(v_schools) > 0) THEN
    RAISE EXCEPTION 'impact_forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_scope = 'all' THEN
    IF v_admin THEN
      kind := 'all'; label := 'All learners'; learners := NULL;
      RETURN;
    END IF;
    kind := CASE WHEN v_teacher THEN 'class' ELSE 'school' END;
    label := CASE WHEN v_teacher AND cardinality(v_schools) = 0 THEN 'My classes'
                  WHEN v_teacher THEN 'My classes and schools' ELSE 'My schools' END;
    learners := ARRAY(
      SELECT DISTINCT cs.student_id FROM public.cohort_students cs JOIN public.cohorts c ON c.id = cs.cohort_id
      WHERE cs.is_active AND cs.status = 'approved'
        AND ((v_teacher AND EXISTS (SELECT 1 FROM public.cohort_teachers ct WHERE ct.cohort_id = c.id AND ct.teacher_id = p_actor))
             OR c.school_id = ANY (v_schools)));
    RETURN;
  END IF;

  IF v_scope !~ '^(school|class):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;
  v_id := split_part(v_scope, ':', 2)::uuid;
  IF v_scope LIKE 'school:%' THEN
    SELECT 'school', s.id, coalesce(s.name_en, s.name_ar) INTO kind, scope_id, label FROM public.schools s WHERE s.id = v_id;
    IF NOT FOUND OR NOT (v_admin OR v_id = ANY (v_schools)) THEN
      RAISE EXCEPTION 'impact_forbidden' USING ERRCODE = '42501';
    END IF;
    learners := ARRAY(
      SELECT DISTINCT cs.student_id FROM public.cohort_students cs JOIN public.cohorts c ON c.id = cs.cohort_id
      WHERE cs.is_active AND cs.status = 'approved' AND c.school_id = v_id);
    RETURN;
  END IF;
  SELECT 'class', c.id, c.name INTO kind, scope_id, label FROM public.cohorts c WHERE c.id = v_id;
  IF NOT FOUND OR NOT (v_admin
                       OR (v_teacher AND EXISTS (SELECT 1 FROM public.cohort_teachers ct WHERE ct.cohort_id = v_id AND ct.teacher_id = p_actor))
                       OR EXISTS (SELECT 1 FROM public.cohorts c WHERE c.id = v_id AND c.school_id = ANY (v_schools))) THEN
    RAISE EXCEPTION 'impact_forbidden' USING ERRCODE = '42501';
  END IF;
  learners := ARRAY(SELECT cs.student_id FROM public.cohort_students cs WHERE cs.cohort_id = v_id AND cs.is_active AND cs.status = 'approved');
END;
$$;

-- What a viewer may switch the impact page between (ImpactScopesResponse).
CREATE OR REPLACE FUNCTION public.measurement_scope_options(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label text;
  v_admin boolean;
BEGIN
  SELECT x.label INTO v_label FROM public.measurement_scope_learners(p_actor, 'all') x;
  SELECT coalesce(p.role::text = 'admin' AND p.is_approved, false) INTO v_admin FROM public.profiles p WHERE p.id = p_actor;
  v_admin := coalesce(v_admin, false);
  RETURN jsonb_build_object('options',
    jsonb_build_array(jsonb_build_object('kind', 'all', 'id', NULL, 'label', v_label))
    || coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'school', 'id', s.id, 'label', coalesce(s.name_en, s.name_ar)) ORDER BY coalesce(s.name_en, s.name_ar), s.id)
      FROM public.schools s
      WHERE s.is_active AND (v_admin
            OR EXISTS (SELECT 1 FROM public.school_admins sa WHERE sa.school_id = s.id AND sa.profile_id = p_actor AND sa.approved))), '[]'::jsonb)
    || coalesce((
      SELECT jsonb_agg(jsonb_build_object('kind', 'class', 'id', c.id, 'label', c.name) ORDER BY c.name, c.id)
      FROM public.cohorts c
      WHERE c.is_active AND (v_admin
            OR EXISTS (SELECT 1 FROM public.cohort_teachers ct JOIN public.profiles t ON t.id = ct.teacher_id AND t.is_approved
                       AND t.role::text IN ('teacher', 'admin')
                       WHERE ct.cohort_id = c.id AND ct.teacher_id = p_actor)
            OR EXISTS (SELECT 1 FROM public.school_admins sa JOIN public.schools s ON s.id = sa.school_id AND s.is_active
                       WHERE sa.school_id = c.school_id AND sa.profile_id = p_actor AND sa.approved))), '[]'::jsonb));
END;
$$;

DROP FUNCTION IF EXISTS public.measurement_impact(uuid, date, date, uuid, uuid, text, int);
CREATE OR REPLACE FUNCTION public.measurement_impact(
  p_actor uuid, p_from date, p_to date, p_subject_id uuid, p_path_id uuid, p_split text, p_min_cell int DEFAULT 5,
  p_scope text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_paths    uuid[];
  v_k        int := greatest(5, coalesce(p_min_cell, 5));
  v_split    text := coalesce(p_split, 'none');
  v_kind     text;
  v_id       uuid;
  v_label    text;
  v_learners uuid[];
  v_data     jsonb;
BEGIN
  -- impact_forbidden first: an unknown / unapproved actor learns nothing else.
  SELECT x.kind, x.scope_id, x.label, x.learners INTO v_kind, v_id, v_label, v_learners
  FROM public.measurement_scope_learners(p_actor, p_scope) x;
  IF p_from IS NULL OR p_to IS NULL OR p_to > (now() AT TIME ZONE 'UTC')::date OR p_from > p_to OR p_to - p_from + 1 > 366
     OR v_split NOT IN ('none', 'grade_band', 'age_band', 'subject', 'mode') THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;

  -- Every path (filters only narrow); the scope limits the learners.
  v_paths := ARRAY(
    SELECT lp.id FROM public.learning_paths lp
    WHERE (p_path_id IS NULL OR lp.id = p_path_id) AND (p_subject_id IS NULL OR lp.subject_id = p_subject_id)
    ORDER BY lp.id);

  v_data := public.measurement_impact_data(v_paths, p_from, p_to, v_split, v_k, false,
                                           CASE WHEN v_kind = 'all' THEN NULL ELSE coalesce(v_learners, '{}'::uuid[]) END);
  RETURN jsonb_build_object(
    'generatedAt', now(),
    'query', jsonb_build_object('from', to_char(p_from, 'YYYY-MM-DD'), 'to', to_char(p_to, 'YYYY-MM-DD'),
                                'subjectId', p_subject_id, 'pathId', p_path_id, 'split', v_split),
    'scope', jsonb_build_object('kind', v_kind, 'pathIds', to_jsonb(v_paths), 'id', v_id, 'label', v_label),
    'minCellSize', v_k) || v_data;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3b. One class's progress (ClassProgressResponse): its approved teachers, its
--     school's admins, approved admins. The named roster is the teacher's own
--     class (approved, active members only); whole-class figures are null under 5.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.measurement_class_progress(p_actor uuid, p_cohort uuid, p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now      timestamptz := coalesce(p_now, now());
  v_k        int := 5;
  v_learners uuid[];
  v_ids      uuid[];
  v_sum      jsonb;
  v_cohort   jsonb;
  v_n        int;
  v_result   jsonb;
BEGIN
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'schoolName', coalesce(s.name_en, s.name_ar)) INTO v_cohort
  FROM public.cohorts c LEFT JOIN public.schools s ON s.id = c.school_id WHERE c.id = p_cohort;
  IF v_cohort IS NULL THEN
    -- unknown class: say "forbidden" unless the actor may see classes at all
    PERFORM public.measurement_scope_learners(p_actor, 'all');
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT x.learners INTO v_learners FROM public.measurement_scope_learners(p_actor, 'class:' || p_cohort::text) x;
  v_ids := coalesce((SELECT array_agg(u) FROM (SELECT unnest(v_learners) AS u LIMIT 2000) y), '{}'::uuid[]);
  v_n := cardinality(v_ids);
  v_sum := public.measurement_learner_summaries(v_ids, v_now);

  WITH
  summ AS (SELECT e AS s, (e ->> 'learnerId')::uuid AS learner_id FROM jsonb_array_elements(v_sum) e),
  last_active AS (
    SELECT x.learner_id, max(x.ts) AS ts FROM (
      SELECT lp.student_id AS learner_id, greatest(lp.updated_at, lp.created_at, lp.completed_at) AS ts
      FROM public.lesson_progress lp WHERE lp.student_id = ANY (v_ids)
      UNION ALL
      SELECT ha.student_id, ha.submitted_at FROM public.homework_attempts ha WHERE ha.student_id = ANY (v_ids)
      UNION ALL
      SELECT b.learner_id, coalesce(b.last_answer_at, b.started_at) FROM public.milestone_battles b
      WHERE b.learner_id = ANY (v_ids) AND NOT b.is_preview
    ) x WHERE x.ts <= v_now GROUP BY x.learner_id
  ),
  kids AS (
    SELECT p.id, coalesce(nullif(btrim(p.learner_name), ''), nullif(btrim(p.full_name), ''), 'Learner') AS name, p.learner_avatar,
           su.s, la.ts AS last_active
    FROM unnest(v_ids) AS u(id) JOIN public.profiles p ON p.id = u.id
    LEFT JOIN summ su ON su.learner_id = p.id
    LEFT JOIN last_active la ON la.learner_id = p.id
  ),
  bands AS (
    SELECT (sub ->> 'subjectId')::uuid AS subject_id, sub -> 'current' ->> 'band' AS band
    FROM kids k CROSS JOIN LATERAL jsonb_array_elements(coalesce(k.s -> 'subjects', '[]'::jsonb)) sub
  ),
  band_rows AS (
    SELECT b.subject_id, count(*) FILTER (WHERE b.band IS NOT NULL) AS n,
           count(*) FILTER (WHERE b.band = 'getting_started') AS gs, count(*) FILTER (WHERE b.band = 'on_the_way') AS otw,
           count(*) FILTER (WHERE b.band = 'confident') AS conf
    FROM bands b GROUP BY b.subject_id
  )
  SELECT jsonb_build_object(
    'cohort', v_cohort,
    'aggregates', jsonb_build_object(
      'learners', v_n,
      'activeThisMonth', CASE WHEN v_n >= v_k THEN (SELECT count(*) FROM kids WHERE last_active >= v_now - interval '30 days') END,
      'skillsLearnedThisMonth', CASE WHEN v_n >= v_k THEN (SELECT coalesce(sum(jsonb_array_length(coalesce(s -> 'skillsLearned', '[]'::jsonb))), 0) FROM kids) END,
      'subjects', coalesce((
        SELECT jsonb_agg(jsonb_build_object('subjectId', br.subject_id, 'nameEn', sj.name_en, 'nameAr', sj.name_ar,
                                            'bands', CASE WHEN br.n >= v_k THEN jsonb_build_object('getting_started', br.gs, 'on_the_way', br.otw, 'confident', br.conf) END)
                         ORDER BY sj.name_en NULLS LAST, br.subject_id)
        FROM band_rows br JOIN public.subjects sj ON sj.id = br.subject_id), '[]'::jsonb)),
    'children', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'learnerId', k.id, 'name', k.name, 'avatar', k.learner_avatar,
               'subjects', coalesce((SELECT jsonb_agg(jsonb_build_object('subjectId', sub -> 'subjectId', 'nameEn', sub -> 'subjectNameEn',
                                                                         'nameAr', sub -> 'subjectNameAr',
                                                                         'baseline', sub -> 'baseline' -> 'band', 'current', sub -> 'current' -> 'band'))
                                     FROM jsonb_array_elements(coalesce(k.s -> 'subjects', '[]'::jsonb)) sub), '[]'::jsonb),
               'skillsLearnedThisMonth', jsonb_array_length(coalesce(k.s -> 'skillsLearned', '[]'::jsonb)),
               'lastActiveAt', k.last_active) ORDER BY k.name, k.id)
      FROM kids k), '[]'::jsonb),
    'pending', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'requestId', cs.id, 'learnerId', cs.student_id,
               'childName', coalesce(nullif(btrim(l.learner_name), ''), nullif(btrim(l.full_name), ''), 'Learner'),
               'parentName', nullif(btrim(o.full_name), ''), 'requestedAt', cs.enrolled_at) ORDER BY cs.enrolled_at, cs.id)
      FROM public.cohort_students cs JOIN public.profiles l ON l.id = cs.student_id LEFT JOIN public.profiles o ON o.id = l.parent_account_id
      WHERE cs.cohort_id = p_cohort AND cs.is_active AND cs.status = 'pending'), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3c. A school's overview (SchoolOverviewResponse): its approved school admins,
--     approved admins. Class figures are null under 5 children.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.measurement_school_overview(p_actor uuid, p_school uuid DEFAULT NULL, p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_school uuid := p_school;
  v_admin  boolean;
  v_now    timestamptz := coalesce(p_now, now());
  v_k      int := 5;
  v_result jsonb;
BEGIN
  SELECT coalesce(p.role::text = 'admin' AND p.is_approved, false) INTO v_admin FROM public.profiles p WHERE p.id = p_actor;
  v_admin := coalesce(v_admin, false);
  IF v_school IS NULL THEN
    SELECT sa.school_id INTO v_school FROM public.school_admins sa JOIN public.schools s ON s.id = sa.school_id AND s.is_active
    WHERE sa.profile_id = p_actor AND sa.approved ORDER BY coalesce(s.name_en, s.name_ar), s.id LIMIT 1;
    IF v_school IS NULL AND v_admin THEN
      SELECT s.id INTO v_school FROM public.schools s WHERE s.is_active ORDER BY coalesce(s.name_en, s.name_ar), s.id LIMIT 1;
      IF v_school IS NULL THEN
        RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'impact_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- the same rule as the impact scope (raises impact_forbidden)
  PERFORM public.measurement_scope_learners(p_actor, 'school:' || v_school::text);

  WITH
  classes AS (SELECT c.id, c.name FROM public.cohorts c WHERE c.school_id = v_school AND c.is_active),
  members AS (
    SELECT cs.cohort_id, cs.student_id AS learner_id FROM public.cohort_students cs JOIN classes c ON c.id = cs.cohort_id
    WHERE cs.is_active AND cs.status = 'approved'
  ),
  active AS (
    SELECT DISTINCT x.learner_id FROM (
      SELECT lp.student_id AS learner_id, greatest(lp.updated_at, lp.created_at, lp.completed_at) AS ts FROM public.lesson_progress lp
      WHERE lp.student_id IN (SELECT learner_id FROM members)
      UNION ALL
      SELECT ha.student_id, ha.submitted_at FROM public.homework_attempts ha WHERE ha.student_id IN (SELECT learner_id FROM members)
      UNION ALL
      SELECT b.learner_id, coalesce(b.last_answer_at, b.started_at) FROM public.milestone_battles b
      WHERE b.learner_id IN (SELECT learner_id FROM members) AND NOT b.is_preview
    ) x WHERE x.ts >= v_now - interval '30 days' AND x.ts <= v_now
  ),
  base AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.level_score, o.finished_at
    FROM public.measurement_occasions o
    WHERE o.kind = 'placement' AND o.baseline_valid AND o.level_score IS NOT NULL
      AND o.learner_id IN (SELECT learner_id FROM members) AND o.finished_at <= v_now
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  latest AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.level_score, o.finished_at
    FROM public.measurement_occasions o
    WHERE o.kind = 'milestone' AND o.level_score IS NOT NULL
      AND o.learner_id IN (SELECT learner_id FROM members) AND o.finished_at <= v_now
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  growth AS (
    SELECT l.learner_id, l.level_score - b.level_score AS delta
    FROM latest l JOIN base b ON b.learner_id = l.learner_id AND b.subject_id = l.subject_id AND b.finished_at < l.finished_at
  ),
  class_rows AS (
    SELECT c.id, c.name,
           (SELECT count(DISTINCT m.learner_id) FROM members m WHERE m.cohort_id = c.id) AS learners,
           (SELECT count(DISTINCT m.learner_id) FROM members m WHERE m.cohort_id = c.id AND m.learner_id IN (SELECT learner_id FROM active)) AS active,
           (SELECT count(*) FROM growth g WHERE g.learner_id IN (SELECT m.learner_id FROM members m WHERE m.cohort_id = c.id)) AS n_growth,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY g.delta) FROM growth g
             WHERE g.learner_id IN (SELECT m.learner_id FROM members m WHERE m.cohort_id = c.id)) AS med
    FROM classes c
  ),
  totals AS (
    SELECT (SELECT count(*) FROM classes) AS classes,
           (SELECT count(DISTINCT learner_id) FROM members) AS learners,
           (SELECT count(DISTINCT learner_id) FROM members WHERE learner_id IN (SELECT learner_id FROM active)) AS active
  )
  SELECT jsonb_build_object(
    'school', (SELECT jsonb_build_object('id', s.id, 'name', coalesce(s.name_en, s.name_ar)) FROM public.schools s WHERE s.id = v_school),
    'totals', (SELECT jsonb_build_object('classes', t.classes,
                                         'learners', CASE WHEN t.learners >= v_k THEN t.learners END,
                                         'activeThisMonth', CASE WHEN t.learners >= v_k THEN t.active END,
                                         'suppressed', t.learners < v_k) FROM totals t),
    'classes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'cohortId', r.id, 'name', r.name,
               'teacherNames', coalesce((SELECT jsonb_agg(coalesce(nullif(btrim(tp.full_name), ''), 'Teacher') ORDER BY ct.is_primary DESC, tp.full_name)
                                         FROM public.cohort_teachers ct JOIN public.profiles tp ON tp.id = ct.teacher_id WHERE ct.cohort_id = r.id), '[]'::jsonb),
               'learners', CASE WHEN r.learners >= v_k THEN r.learners END,
               'activeThisMonth', CASE WHEN r.learners >= v_k THEN r.active END,
               'medianGrowth', CASE WHEN r.learners >= v_k AND r.n_growth >= v_k THEN round(r.med::numeric, 1) END,
               'suppressed', r.learners < v_k) ORDER BY r.name, r.id)
      FROM class_rows r), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. measurement_funder_export: anonymised tables for funders (FunderExport)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.measurement_funder_export(p_actor uuid, p_from date, p_to date, p_min_cell int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_k        int := greatest(5, coalesce(p_min_cell, 5));
  v_paths    uuid[];
  v_subject  jsonb;
  v_mode     jsonb;
  v_grade    jsonb;
  v_none     jsonb;
  v_names    jsonb;
  v_marker   text;
  v_tables   jsonb := '[]'::jsonb;
  v_rows     jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_actor AND p.role::text = 'admin' AND p.is_approved = true) THEN
    RAISE EXCEPTION 'impact_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to > (now() AT TIME ZONE 'UTC')::date OR p_from > p_to OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;

  v_paths := ARRAY(SELECT lp.id FROM public.learning_paths lp ORDER BY lp.id);
  v_subject := public.measurement_impact_data(v_paths, p_from, p_to, 'subject', v_k, false);
  v_mode    := public.measurement_impact_data(v_paths, p_from, p_to, 'mode', v_k, false);
  v_grade   := public.measurement_impact_data(v_paths, p_from, p_to, 'grade_band', v_k, false);
  v_none    := public.measurement_impact_data(v_paths, p_from, p_to, 'none', v_k, true);
  -- Subject names only (no ids leave this function).
  v_names := coalesce((SELECT jsonb_object_agg(s ->> 'id', coalesce(s ->> 'nameEn', s ->> 'nameAr', 'Subject'))
                       FROM jsonb_array_elements(v_subject -> 'subjects') s), '{}'::jsonb);

  -- reach: learners active and lessons completed, by subject
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', CASE WHEN r ->> 'group' = 'all' THEN 'All subjects' ELSE coalesce(v_names ->> (r ->> 'group'), 'Subject') END,
             'subject', CASE WHEN r ->> 'group' = 'all' THEN 'All subjects' ELSE coalesce(v_names ->> (r ->> 'group'), 'Subject') END,
             'learners', r -> 'learners', 'learners_active', r -> 'learners', 'lessons_completed', r -> 'completions',
             'suppressed', r -> 'suppressed', '_part', 'subject', '_total', r ->> 'group' = 'all') ORDER BY ord)
    FROM jsonb_array_elements(v_subject -> 'engagement' -> 'rows') WITH ORDINALITY e(r, ord)), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'reach', 'title', 'Reach: children learning and lessons completed',
    'columns', jsonb_build_array(jsonb_build_object('key', 'subject', 'label', 'Subject'),
                                 jsonb_build_object('key', 'learners_active', 'label', 'Children active'),
                                 jsonb_build_object('key', 'lessons_completed', 'label', 'Lessons completed')),
    'rows', public.measurement_secondary_suppress(v_rows, ARRAY['learners_active', 'lessons_completed']),
    'footnotes', jsonb_build_array('Active: at least one learning day in the period (lessons, Practice or Big Challenges).',
                                   'A child learning two subjects counts once in each subject and once in the total.')));

  -- engagement: lessons per active week and active weeks, by subject and by mode
  v_rows := coalesce((
    SELECT jsonb_agg(x.row ORDER BY x.dim, x.ord) FROM (
      SELECT 1 AS dim, ord, jsonb_build_object(
               'group', CASE WHEN r ->> 'group' = 'all' THEN 'All' ELSE 'Subject: ' || coalesce(v_names ->> (r ->> 'group'), 'Subject') END,
               'dimension', 'subject',
               'band', CASE WHEN r ->> 'group' = 'all' THEN 'All' ELSE coalesce(v_names ->> (r ->> 'group'), 'Subject') END,
               'learners', r -> 'learners', 'lessons_per_active_week', r -> 'lessonsPerActiveWeek',
               'median_active_weeks', r -> 'medianActiveWeeks', 'suppressed', r -> 'suppressed',
               '_part', 'subject', '_total', r ->> 'group' = 'all') AS row
      FROM jsonb_array_elements(v_subject -> 'engagement' -> 'rows') WITH ORDINALITY e(r, ord)
      UNION ALL
      SELECT 2, ord, jsonb_build_object(
               'group', 'Mode: ' || (r ->> 'group'), 'dimension', 'mode', 'band', r ->> 'group',
               'learners', r -> 'learners', 'lessons_per_active_week', r -> 'lessonsPerActiveWeek',
               'median_active_weeks', r -> 'medianActiveWeeks', 'suppressed', r -> 'suppressed',
               '_part', 'mode', '_total', false)
      FROM jsonb_array_elements(v_mode -> 'engagement' -> 'rows') WITH ORDINALITY e(r, ord)
      WHERE r ->> 'group' <> 'all'
      UNION ALL
      -- the mode partition's total is the same "All" row, repeated as a hidden helper below
      SELECT 3, ord, jsonb_build_object('group', 'All', 'dimension', 'mode', 'band', 'All', 'learners', r -> 'learners',
               'lessons_per_active_week', r -> 'lessonsPerActiveWeek', 'median_active_weeks', r -> 'medianActiveWeeks',
               'suppressed', r -> 'suppressed', '_part', 'mode', '_total', true, '_helper', true)
      FROM jsonb_array_elements(v_mode -> 'engagement' -> 'rows') WITH ORDINALITY e(r, ord)
      WHERE r ->> 'group' = 'all'
    ) x), '[]'::jsonb);
  v_rows := public.measurement_secondary_suppress(v_rows, ARRAY['lessons_per_active_week', 'median_active_weeks']);
  v_rows := coalesce((SELECT jsonb_agg(r ORDER BY ord) FROM jsonb_array_elements(v_rows) WITH ORDINALITY e(r, ord)
                      WHERE NOT (r ? '_helper')), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'engagement', 'title', 'Engagement: lessons per active week and weeks active',
    'columns', jsonb_build_array(jsonb_build_object('key', 'dimension', 'label', 'Split'),
                                 jsonb_build_object('key', 'band', 'label', 'Group'),
                                 jsonb_build_object('key', 'lessons_per_active_week', 'label', 'Lessons per active week'),
                                 jsonb_build_object('key', 'median_active_weeks', 'label', 'Median weeks active')),
    'rows', v_rows,
    'footnotes', jsonb_build_array('Lessons per active week: lessons completed divided by child-weeks with at least one completed lesson.',
                                   'Mode: share of a child''s completions synced from offline use (offline_heavy = at least half).')));

  -- growth_subject: baseline -> latest level, by subject x grade band
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject') || ' · ' || CASE WHEN r ->> 'group' = 'all' THEN 'All grades' ELSE 'Grade ' || (r ->> 'group') END,
             'subject', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject'),
             'grade_band', CASE WHEN r ->> 'group' = 'all' THEN 'All' ELSE r ->> 'group' END,
             'learners', r -> 'learners', 'median_baseline', r -> 'medianBaselineScore', 'median_latest', r -> 'medianLatestScore',
             'median_growth', r -> 'medianGrowth', 'improved_share', r -> 'improvedShare', 'suppressed', r -> 'suppressed',
             '_part', 'subject:' || (r ->> 'subjectId'), '_total', r ->> 'group' = 'all') ORDER BY r ->> 'subjectId', r ->> 'group' <> 'all', r ->> 'group')
    FROM jsonb_array_elements(v_grade -> 'growth' -> 'subjects') r), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'growth_subject', 'title', 'Growth from the starting boss to the latest Big Challenge, by subject and grade',
    'columns', jsonb_build_array(jsonb_build_object('key', 'subject', 'label', 'Subject'),
                                 jsonb_build_object('key', 'grade_band', 'label', 'Grade'),
                                 jsonb_build_object('key', 'learners', 'label', 'Children'),
                                 jsonb_build_object('key', 'median_baseline', 'label', 'Median starting level (0-100)'),
                                 jsonb_build_object('key', 'median_latest', 'label', 'Median latest level (0-100)'),
                                 jsonb_build_object('key', 'median_growth', 'label', 'Median growth (points)'),
                                 jsonb_build_object('key', 'improved_share', 'label', 'Share who improved')),
    'rows', public.measurement_secondary_suppress(v_rows, ARRAY['median_baseline', 'median_latest', 'median_growth', 'improved_share']),
    'footnotes', jsonb_build_array('Children with a valid starting boss (at most 3 lessons done before it) and a later first try at a Big Challenge in the same subject.',
                                   'Level: difficulty-weighted share of first-try answers right (0-100).')));

  -- growth_skill: per skill, by subject
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject') || ' · ' || coalesce(r ->> 'labelEn', r ->> 'skillKey'),
             'subject', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject'),
             'skill', coalesce(r ->> 'labelEn', r ->> 'skillKey'),
             'learners', r -> 'learners', 'baseline_rate', r -> 'baselineRate', 'latest_rate', r -> 'latestRate',
             'growth_pp', r -> 'growthPp', 'matched_growth_pp', r -> 'matchedGrowthPp', 'suppressed', r -> 'suppressed')
           ORDER BY r ->> 'subjectId', r ->> 'skillKey')
    FROM jsonb_array_elements(v_none -> 'growth' -> 'skills') r WHERE r ->> 'group' = 'all'), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'growth_skill', 'title', 'Growth per skill (first try after teaching vs. starting boss)',
    'columns', jsonb_build_array(jsonb_build_object('key', 'subject', 'label', 'Subject'),
                                 jsonb_build_object('key', 'skill', 'label', 'Skill'),
                                 jsonb_build_object('key', 'learners', 'label', 'Children'),
                                 jsonb_build_object('key', 'baseline_rate', 'label', 'Right at start (share)'),
                                 jsonb_build_object('key', 'latest_rate', 'label', 'Right at latest first try (share)'),
                                 jsonb_build_object('key', 'growth_pp', 'label', 'Growth (points)'),
                                 jsonb_build_object('key', 'matched_growth_pp', 'label', 'Growth at matched difficulty (points)')),
    'rows', v_rows,
    'footnotes', jsonb_build_array('Matched growth compares items of the same tagged difficulty only.')));

  -- bosses: first-try and eventual pass rate, by subject x boss level
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject') || ' · Boss ' || ((r ->> 'afterWeekNumber')::int / 4),
             'subject', coalesce(v_names ->> (r ->> 'subjectId'), 'Subject'),
             'boss_level', (r ->> 'afterWeekNumber')::int / 4,
             'learners', r -> 'learners', 'first_try_pass_rate', r -> 'firstTryPassRate', 'eventual_pass_rate', r -> 'eventualPassRate',
             'suppressed', r -> 'suppressed')
           ORDER BY r ->> 'subjectId', (r ->> 'afterWeekNumber')::int)
    FROM jsonb_array_elements(v_none -> 'bosses') r WHERE r ->> 'group' = 'all'), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'bosses', 'title', 'Big Challenges: first-try and eventual pass rate',
    'columns', jsonb_build_array(jsonb_build_object('key', 'subject', 'label', 'Subject'),
                                 jsonb_build_object('key', 'boss_level', 'label', 'Boss level'),
                                 jsonb_build_object('key', 'learners', 'label', 'Children'),
                                 jsonb_build_object('key', 'first_try_pass_rate', 'label', 'First-try pass rate'),
                                 jsonb_build_object('key', 'eventual_pass_rate', 'label', 'Eventual pass rate')),
    'rows', v_rows,
    'footnotes', jsonb_build_array('Boss level n covers weeks 4n-3 to 4n of the learning path. A pass needs 75% right.')));

  -- retention: monthly cohorts (month of first learning day), weeks 4 / 8 / 12
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', r ->> 'cohortStart', 'cohort_month', r ->> 'cohortStart', 'learners', r -> 'learners',
             'week4', r -> 'week4', 'week8', r -> 'week8', 'week12', r -> 'week12', 'suppressed', r -> 'suppressed')
           ORDER BY r ->> 'cohortStart')
    FROM jsonb_array_elements(v_none -> 'retention') r WHERE r ->> 'group' = 'all'), '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'retention', 'title', 'Retention: share of each month''s new children still learning',
    'columns', jsonb_build_array(jsonb_build_object('key', 'cohort_month', 'label', 'First month'),
                                 jsonb_build_object('key', 'learners', 'label', 'Children'),
                                 jsonb_build_object('key', 'week4', 'label', 'Week 4'),
                                 jsonb_build_object('key', 'week8', 'label', 'Week 8'),
                                 jsonb_build_object('key', 'week12', 'label', 'Week 12')),
    'rows', v_rows,
    'footnotes', jsonb_build_array('Week k: learned at least once in the k-th week after their first week. Blank until that week has ended for the whole cohort.')));

  -- mode: online vs offline-heavy vs mixed
  v_rows := coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'group', CASE WHEN e.r ->> 'group' = 'all' THEN 'All' ELSE e.r ->> 'group' END,
             'mode', CASE WHEN e.r ->> 'group' = 'all' THEN 'All' ELSE e.r ->> 'group' END,
             'learners', e.r -> 'learners', 'active_learners', e.r -> 'activeLearners',
             'lessons_per_active_week', e.r -> 'lessonsPerActiveWeek',
             'first_try_pass_rate', CASE WHEN coalesce((e.r ->> 'suppressed')::boolean, false) THEN NULL ELSE b.r -> 'firstTryPassRate' END,
             'suppressed', e.r -> 'suppressed',
             '_part', 'mode', '_total', e.r ->> 'group' = 'all') ORDER BY e.ord)
    FROM jsonb_array_elements(v_mode -> 'engagement' -> 'rows') WITH ORDINALITY e(r, ord)
    LEFT JOIN LATERAL (SELECT x AS r FROM jsonb_array_elements(v_mode -> 'bossesOverall') x WHERE x ->> 'group' = e.r ->> 'group' LIMIT 1) b ON true),
    '[]'::jsonb);
  v_tables := v_tables || jsonb_build_array(jsonb_build_object(
    'id', 'mode', 'title', 'Online and offline learning',
    'columns', jsonb_build_array(jsonb_build_object('key', 'mode', 'label', 'Mode'),
                                 jsonb_build_object('key', 'active_learners', 'label', 'Children completing lessons'),
                                 jsonb_build_object('key', 'lessons_per_active_week', 'label', 'Lessons per active week'),
                                 jsonb_build_object('key', 'first_try_pass_rate', 'label', 'First-try pass rate (all bosses)')),
    'rows', public.measurement_secondary_suppress(v_rows, ARRAY['active_learners', 'lessons_per_active_week', 'first_try_pass_rate']),
    'footnotes', jsonb_build_array('unknown: fewer than two completions with a recorded source.')));

  SELECT to_char(min(completed_at) AT TIME ZONE 'UTC', 'FMMonth YYYY') INTO v_marker
  FROM public.lesson_progress WHERE completion_source IS NOT NULL;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'period', jsonb_build_object('from', to_char(p_from, 'YYYY-MM-DD'), 'to', to_char(p_to, 'YYYY-MM-DD')),
    'minCellSize', v_k,
    'definitionsVersion', 'measurement-v1',
    'tables', v_tables,
    'notes', jsonb_build_array(
      'Metric definitions: measurement-v1.',
      'Groups with fewer than ' || v_k || ' children are not shown, and where one hidden group could be worked out from a total, a second group is hidden too.',
      'Bosses stop early (win or out of tries), so a boss''s first try sees 9-12 items, and skill rates use the items actually answered.',
      'A placement covers weeks 1-12, partly before teaching. Growth is "before teaching -> first try after teaching" on the same skills, not a controlled study.',
      'Each child answers about 12 items per occasion. Individual skill results are rough; group results with at least ' || v_k || ' children are reported.',
      'The offline mode uses a server-side marker that started ' || coalesce('in ' || v_marker, 'with this release') || '. Earlier completions count as unknown.',
      'Ages are the ages given at signup.',
      'No names, ids, exact dates, question text or answers are included. Sensitive signup answers are never used.'));
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. measurement_learner_summaries: the parent card and the weekly digest
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.measurement_learner_summaries(p_learner_ids uuid[], p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now    timestamptz := coalesce(p_now, now());
  v_start  timestamptz := coalesce(p_now, now()) - interval '30 days';
  v_result jsonb;
BEGIN
  IF p_learner_ids IS NULL OR coalesce(cardinality(p_learner_ids), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  IF cardinality(p_learner_ids) > 2000 THEN
    RAISE EXCEPTION 'invalid_query: at most 2000 learners per call' USING ERRCODE = '22023';
  END IF;

  WITH
  ids AS (
    SELECT DISTINCT ON (u.id) u.id, u.ord FROM unnest(p_learner_ids) WITH ORDINALITY AS u(id, ord)
    WHERE u.id IS NOT NULL ORDER BY u.id, u.ord
  ),
  skills AS (SELECT * FROM public.curriculum_skills WHERE is_active),
  -- (a) a Big Challenge first try with >= 2 scored items of X, at least 75% right
  ev_a AS (
    SELECT o.learner_id, i.skill_key, o.subject_id, o.finished_at
    FROM public.measurement_occasions o
    JOIN ids ON ids.id = o.learner_id
    JOIN public.measurement_item_results i ON i.battle_id = o.battle_id
    WHERE o.kind = 'milestone' AND NOT i.hinted AND i.skill_key IS NOT NULL AND o.finished_at <= v_now
    GROUP BY o.learner_id, i.skill_key, o.subject_id, o.battle_id, o.finished_at
    HAVING count(*) >= 2 AND count(*) FILTER (WHERE i.is_correct) >= 0.75 * count(*)
  ),
  -- (b) a passing graded Practice of a lesson that maps to X
  ev_b AS (
    SELECT ha.student_id AS learner_id, s.skill_key, l.subject_id, ha.submitted_at AS finished_at
    FROM public.homework_attempts ha
    JOIN ids ON ids.id = ha.student_id
    JOIN public.homework_assignments a ON a.id = ha.assignment_id AND a.is_practice = true
    JOIN public.lessons l ON l.id = a.lesson_id
    JOIN skills s ON s.skill_key = public.measurement_lesson_skill(l.curriculum_topic) AND s.assessable
    WHERE ha.score IS NOT NULL AND coalesce(a.total_points, 0) > 0
      AND ha.score >= (coalesce(a.passing_score, 75) / 100.0) * a.total_points
      AND ha.submitted_at <= v_now AND l.subject_id IS NOT NULL
  ),
  evidence AS (
    SELECT e.* FROM (SELECT * FROM ev_a UNION ALL SELECT * FROM ev_b) e JOIN skills s ON s.skill_key = e.skill_key
  ),
  learned AS (
    SELECT DISTINCT ON (e.learner_id, e.skill_key) e.learner_id, e.skill_key, e.subject_id
    FROM evidence e WHERE e.finished_at >= v_start
    ORDER BY e.learner_id, e.skill_key, e.finished_at DESC
  ),
  learned_ever AS (
    SELECT e.learner_id, e.subject_id, count(DISTINCT e.skill_key) AS n FROM evidence e GROUP BY e.learner_id, e.subject_id
  ),
  practised AS (
    SELECT DISTINCT ON (lp.student_id, sk.skill_key) lp.student_id AS learner_id, sk.skill_key, l.subject_id
    FROM public.lesson_progress lp
    JOIN ids ON ids.id = lp.student_id
    JOIN public.lessons l ON l.id = lp.lesson_id AND l.subject_id IS NOT NULL
    LEFT JOIN public.subjects sj ON sj.id = l.subject_id
    CROSS JOIN LATERAL (
      SELECT coalesce(
        (SELECT s.skill_key FROM skills s WHERE s.skill_key = public.measurement_lesson_skill(l.curriculum_topic)),
        (SELECT s.skill_key FROM skills s WHERE s.skill_key = public.measurement_subject_key(sj.name_en, sj.name_ar) || '.general')
      ) AS skill_key
    ) sk
    WHERE lp.completed AND lp.completed_at >= v_start AND lp.completed_at <= v_now AND sk.skill_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM learned ld WHERE ld.learner_id = lp.student_id AND ld.skill_key = sk.skill_key)
    ORDER BY lp.student_id, sk.skill_key, lp.completed_at DESC
  ),
  subj_activity AS (
    SELECT lp.student_id AS learner_id, l.subject_id
    FROM public.lesson_progress lp JOIN ids ON ids.id = lp.student_id JOIN public.lessons l ON l.id = lp.lesson_id
    WHERE l.subject_id IS NOT NULL
    UNION
    SELECT b.learner_id, p.subject_id
    FROM public.milestone_battles b
    JOIN ids ON ids.id = b.learner_id
    JOIN public.learning_path_milestones ml ON ml.id = b.milestone_id
    JOIN public.learning_paths p ON p.id = ml.path_id
    WHERE NOT b.is_preview
  ),
  baseline AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.level_score, o.finished_at, o.baseline_valid
    FROM public.measurement_occasions o JOIN ids ON ids.id = o.learner_id
    WHERE o.kind = 'placement' AND o.level_score IS NOT NULL AND o.finished_at <= v_now
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  latest AS (
    SELECT DISTINCT ON (o.learner_id, o.subject_id) o.learner_id, o.subject_id, o.level_score, o.finished_at, o.after_week_number
    FROM public.measurement_occasions o JOIN ids ON ids.id = o.learner_id
    WHERE o.kind = 'milestone' AND o.level_score IS NOT NULL AND o.finished_at <= v_now
    ORDER BY o.learner_id, o.subject_id, o.finished_at DESC
  ),
  open_placement AS (
    SELECT DISTINCT ON (ids.id, p.subject_id) ids.id AS learner_id, p.subject_id, ml.id AS milestone_id
    FROM ids
    CROSS JOIN public.learning_path_milestones ml
    JOIN public.learning_paths p ON p.id = ml.path_id AND p.is_published = true
    WHERE ml.kind = 'placement' AND ml.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM public.milestone_battles b
                      WHERE b.learner_id = ids.id AND b.milestone_id = ml.id AND NOT b.is_preview
                        AND b.status = 'completed' AND b.superseded_at IS NULL)
    ORDER BY ids.id, p.subject_id, ml.created_at
  ),
  chips AS (
    SELECT x.learner_id, x.kind,
           jsonb_agg(jsonb_build_object('skillKey', s.skill_key, 'subjectId', x.subject_id,
                                        'familyLabelEn', s.family_label_en, 'familyLabelAr', s.family_label_ar)
                     ORDER BY s.subject_key, s.sort_order, s.skill_key) AS list
    FROM (SELECT learner_id, skill_key, subject_id, 'learned'::text AS kind FROM learned
          UNION ALL SELECT learner_id, skill_key, subject_id, 'practised' FROM practised) x
    JOIN skills s ON s.skill_key = x.skill_key
    GROUP BY x.learner_id, x.kind
  ),
  subj AS (
    SELECT a.learner_id,
           jsonb_agg(jsonb_build_object(
             'subjectId', a.subject_id, 'subjectNameAr', sj.name_ar, 'subjectNameEn', sj.name_en,
             'baseline', CASE WHEN b.learner_id IS NULL THEN NULL ELSE jsonb_build_object(
                           'band', CASE WHEN b.level_score >= 70 THEN 'confident' WHEN b.level_score >= 40 THEN 'on_the_way' ELSE 'getting_started' END,
                           'measuredAt', b.finished_at, 'valid', b.baseline_valid) END,
             'current', CASE WHEN l.learner_id IS NULL THEN NULL ELSE jsonb_build_object(
                           'band', CASE WHEN l.level_score >= 70 THEN 'confident' WHEN l.level_score >= 40 THEN 'on_the_way' ELSE 'getting_started' END,
                           'measuredAt', l.finished_at, 'afterWeekNumber', l.after_week_number) END,
             'placementMilestoneId', op.milestone_id,
             'skillsLearnedSinceStart', coalesce(le.n, 0))
             ORDER BY sj.name_en NULLS LAST, a.subject_id) AS list
    FROM (SELECT DISTINCT learner_id, subject_id FROM subj_activity) a
    JOIN public.subjects sj ON sj.id = a.subject_id
    LEFT JOIN baseline b ON b.learner_id = a.learner_id AND b.subject_id = a.subject_id
    LEFT JOIN latest l ON l.learner_id = a.learner_id AND l.subject_id = a.subject_id
    LEFT JOIN open_placement op ON op.learner_id = a.learner_id AND op.subject_id = a.subject_id
    LEFT JOIN learned_ever le ON le.learner_id = a.learner_id AND le.subject_id = a.subject_id
    GROUP BY a.learner_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'learnerId', ids.id,
           'windowStart', v_start,
           'windowEnd', v_now,
           'skillsLearned', coalesce(cl.list, '[]'::jsonb),
           'skillsPractised', coalesce(cp.list, '[]'::jsonb),
           'subjects', coalesce(su.list, '[]'::jsonb)) ORDER BY ids.ord), '[]'::jsonb)
    INTO v_result
  FROM ids
  LEFT JOIN chips cl ON cl.learner_id = ids.id AND cl.kind = 'learned'
  LEFT JOIN chips cp ON cp.learner_id = ids.id AND cp.kind = 'practised'
  LEFT JOIN subj su ON su.learner_id = ids.id;
  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Privileges: service_role only
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.measurement_band(text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_subject_key(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_secondary_suppress(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_impact_data(uuid[], date, date, text, int, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_impact(uuid, date, date, uuid, uuid, text, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_scope_learners(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_scope_options(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_class_progress(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_school_overview(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_funder_export(uuid, date, date, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.measurement_learner_summaries(uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_band(text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_subject_key(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_secondary_suppress(jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_impact_data(uuid[], date, date, text, int, boolean, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_impact(uuid, date, date, uuid, uuid, text, int, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_scope_learners(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_scope_options(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_class_progress(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_school_overview(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_funder_export(uuid, date, date, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.measurement_learner_summaries(uuid[], timestamptz) TO service_role;

-- -----------------------------------------------------------------------------
-- 7. Fail-closed postcheck
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad   text;
  names text[] := ARRAY['measurement_impact', 'measurement_funder_export', 'measurement_learner_summaries',
                        'measurement_impact_data', 'measurement_band', 'measurement_subject_key', 'measurement_secondary_suppress',
                        'measurement_scope_learners', 'measurement_scope_options', 'measurement_class_progress', 'measurement_school_overview'];
  v_raised boolean := false;
BEGIN
  SELECT string_agg(x.proname || '=' || x.n, ', ') INTO bad FROM (
    SELECT f.proname, (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
                       WHERE p.proname = f.proname) AS n
    FROM unnest(names) AS f(proname)) x
  WHERE x.n <> 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement reports migration aborted: expected exactly one of each report function: %', bad;
  END IF;
  SELECT string_agg(DISTINCT p.oid::regprocedure::text, '; ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = ANY (names)
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         OR p.prosecdef);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement reports migration aborted: callable by clients or SECURITY DEFINER: %', bad;
  END IF;

  BEGIN
    PERFORM public.measurement_impact(NULL, current_date - 7, current_date - 1, NULL, NULL, 'none', 5, 'all');
  EXCEPTION WHEN OTHERS THEN
    v_raised := SQLERRM LIKE '%impact_forbidden%';
  END;
  IF NOT v_raised THEN
    RAISE EXCEPTION 'measurement reports migration aborted: measurement_impact(NULL, ...) did not raise impact_forbidden';
  END IF;
  IF public.measurement_learner_summaries('{}'::uuid[]) IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'measurement reports migration aborted: measurement_learner_summaries(''{}'') is not []';
  END IF;
  IF public.measurement_subject_key('Maths', NULL) <> 'math' OR public.measurement_subject_key(NULL, 'اللغة الإنجليزية') <> 'english'
     OR public.measurement_subject_key('Cooking', NULL) <> 'general' THEN
    RAISE EXCEPTION 'measurement reports migration aborted: measurement_subject_key gives the wrong answer';
  END IF;
END;
$$;
