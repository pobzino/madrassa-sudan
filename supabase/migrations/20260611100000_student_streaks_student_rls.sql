-- =============================================================================
-- student_streaks: let students read (and maintain) their OWN streak row
-- =============================================================================
-- The only SELECT policy on student_streaks was for guardians, so a student
-- could not read their own row. The Dashboard, Progress and Achievements pages
-- query student_streaks client-side, so they always saw 0 lessons / 0 points /
-- no achievements even though the data (written by the SECURITY DEFINER
-- completion trigger) was correct. Add own-row policies so the data is visible,
-- and so the homework submit path (which updates the row via the user's client)
-- can write it too.
-- =============================================================================

DROP POLICY IF EXISTS "Students can view their own streak" ON public.student_streaks;
CREATE POLICY "Students can view their own streak"
  ON public.student_streaks
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can insert their own streak" ON public.student_streaks;
CREATE POLICY "Students can insert their own streak"
  ON public.student_streaks
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can update their own streak" ON public.student_streaks;
CREATE POLICY "Students can update their own streak"
  ON public.student_streaks
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
