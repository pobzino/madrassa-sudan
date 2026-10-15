-- =============================================================================
-- Deleting an account deletes that person's own data, and nothing else
-- =============================================================================
-- Two foreign keys made account deletion go wrong:
--   * diagnostic_attempts.student_id and student_placements.student_id
--     (20260216171100, the Level Test) reference profiles with no ON DELETE
--     clause (NO ACTION). Deleting the auth user of anyone who ever started the
--     Level Test failed with 23503, from Settings > Delete account and from the
--     Supabase dashboard alike, so the deletion was never honoured and the
--     profile's personal details stayed. Now the Level Test rows go with the
--     account (diagnostic_responses already cascade from the attempt).
--   * homework_assignments.created_by (base schema) is ON DELETE CASCADE. When
--     a teacher deleted their account (or an admin deleted a teacher), every
--     class homework and shared Practice they had written was deleted, and
--     with it every student's submissions, marked answers and attempts on it,
--     and the Practice gates of the learning path (learning_path_steps /
--     learning_path_weeks SET NULL). Now the homework stays, with no owner,
--     like lessons and learning paths already do: students keep their work,
--     and approved admins can still edit or remove it. (Both teacher INSERT
--     policies still require created_by = the caller, so a teacher can never
--     create homework without an owner.)
--
-- Separate from 20261016120000 (the grading lockdown) and safe to paste after
-- it. Idempotent. Each foreign key is found by its column, not by its name, so
-- a constraint named differently in production is still replaced instead of
-- being left in place beside the new one.
-- =============================================================================

-- These ALTERs lock homework_assignments, the Level Test tables and profiles
-- until the end; give up after 3s (nothing is applied) instead of making
-- logins queue behind a slow query. Just paste it again.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT con.conrelid::regclass AS tbl, con.conname
    FROM pg_constraint con
    JOIN (VALUES
      ('public.diagnostic_attempts', 'student_id'),
      ('public.student_placements', 'student_id'),
      ('public.student_placements', 'attempt_id'),
      ('public.homework_assignments', 'created_by')
    ) AS v(tbl, col) ON con.conrelid = to_regclass(v.tbl)
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attname = v.col
    WHERE con.contype = 'f'
      AND con.conkey = ARRAY[a.attnum]
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.diagnostic_attempts
  ADD CONSTRAINT diagnostic_attempts_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.student_placements
  ADD CONSTRAINT student_placements_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT student_placements_attempt_id_fkey
  FOREIGN KEY (attempt_id) REFERENCES public.diagnostic_attempts(id) ON DELETE SET NULL;

ALTER TABLE public.homework_assignments ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.homework_assignments
  ADD CONSTRAINT homework_assignments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
