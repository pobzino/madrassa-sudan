-- =============================================================================
-- Learning measurement (phase 1), 6/6: battle, answer and measurement reads follow
-- the class / school rule
-- HELD FOR THE OWNER'S GO: apply only after the owner says yes. Keep it last.
-- =============================================================================
-- Before: any approved teacher could read every child's milestone battles
-- ("Learners view their own battles" = can_access_learner OR is_approved_staff)
-- and every per-answer row ("Staff view battle answers" = is_approved_staff).
-- After (public.can_view_learner_progress, 20261018122500):
--   * battles: the family (owning parent / self account), approved admins, the
--     approved teachers of a class the child is an approved, active member of,
--     and the approved admins of that class's school;
--   * per-answer rows: the same staff, never the family (as before);
--   * measurement_occasions / measurement_item_results keep no client privilege
--     at all; their belt-and-braces policy follows the same rule.
-- A child in no class is visible to admins and the family only. Leaving a
-- class (or being removed) ends a teacher's access at once.
--
-- Safe for the app: every staff milestone page reads through the service client
-- (openStaffRequest), and the learner tree reads its own rows as the family.
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS "Learners view their own battles" ON public.milestone_battles;
CREATE POLICY "Learners view their own battles" ON public.milestone_battles FOR SELECT TO authenticated
  USING (public.can_view_learner_progress(auth.uid(), learner_id));

DROP POLICY IF EXISTS "Staff view battle answers" ON public.milestone_battle_answers;
CREATE POLICY "Staff view battle answers" ON public.milestone_battle_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.milestone_battles b
                 WHERE b.id = milestone_battle_answers.battle_id
                   AND public.can_view_learner_progress(auth.uid(), b.learner_id)
                   AND NOT public.can_access_learner(b.learner_id)));

DROP POLICY IF EXISTS "Own learner measurement" ON public.measurement_occasions;
CREATE POLICY "Own learner measurement" ON public.measurement_occasions FOR SELECT TO authenticated
  USING (public.can_view_learner_progress(auth.uid(), learner_id));
DROP POLICY IF EXISTS "Own learner measurement" ON public.measurement_item_results;
CREATE POLICY "Own learner measurement" ON public.measurement_item_results FOR SELECT TO authenticated
  USING (public.can_view_learner_progress(auth.uid(), learner_id));

DO $$
DECLARE
  q text;
BEGIN
  FOR q IN
    SELECT regexp_replace(coalesce(qual, ''), '\s+', ' ', 'g') FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('milestone_battles', 'milestone_battle_answers', 'measurement_occasions', 'measurement_item_results')
      AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
  LOOP
    IF q ~ 'is_approved_staff\(\)' OR q !~ 'can_view_learner_progress\((auth\.)?uid\(\)' THEN
      RAISE EXCEPTION 'measurement battle-read migration aborted: a read policy does not follow the class / school rule (unscoped staff branch?): %', q;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'milestone_battles'
      AND policyname = 'Learners view their own battles') <> 1
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'milestone_battle_answers'
         AND policyname = 'Staff view battle answers') <> 1 THEN
    RAISE EXCEPTION 'measurement battle-read migration aborted: a read policy is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['milestone_battles', 'milestone_battle_answers', 'measurement_occasions', 'measurement_item_results']) t
             WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t
                               AND p.policyname = 'Unapproved staff have no staff access' AND p.permissive = 'RESTRICTIVE')) THEN
    RAISE EXCEPTION 'measurement battle-read migration aborted: RESTRICTIVE unapproved-staff policy missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.measurement_occasions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.measurement_item_results', 'SELECT') THEN
    RAISE EXCEPTION 'measurement battle-read migration aborted: clients can read the measurement tables';
  END IF;
END;
$$;
