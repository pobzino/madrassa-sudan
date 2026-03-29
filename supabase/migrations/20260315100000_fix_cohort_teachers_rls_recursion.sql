-- Fix infinite recursion in cohort_teachers RLS policy
-- The old policy referenced cohort_teachers within its own SELECT policy,
-- causing PostgreSQL error 42P17 (infinite recursion) for all authenticated queries
-- that touch cohort_teachers (including JOINs from lesson_progress, student_streaks, etc.)

-- Step 1: Create a SECURITY DEFINER function to safely get a teacher's cohort IDs
-- This bypasses RLS, breaking the recursion cycle
CREATE OR REPLACE FUNCTION public.get_teacher_cohort_ids(p_teacher_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cohort_id FROM cohort_teachers WHERE teacher_id = p_teacher_id;
$$;

-- Step 2: Drop the recursive policy
DROP POLICY IF EXISTS "Teachers can view cohort teacher assignments" ON cohort_teachers;

-- Step 3: Re-create the policy using the helper function instead of self-referencing subquery
-- Teachers can see their own assignments + other teachers in their cohorts + admins see all
CREATE POLICY "Teachers can view cohort teacher assignments"
  ON cohort_teachers FOR SELECT
  TO authenticated
  USING (
    teacher_id = auth.uid()
    OR cohort_id IN (SELECT get_teacher_cohort_ids(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
