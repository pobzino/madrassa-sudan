-- Fix: students cannot look up a cohort by join_code before they are enrolled.
-- The existing SELECT policy only allows members who are already in cohort_students/cohort_teachers.
-- Add a policy that lets any authenticated user read active cohorts (needed for join-by-code flow).

CREATE POLICY "Authenticated users can view active cohorts"
  ON cohorts FOR SELECT TO authenticated
  USING (is_active = true);

-- Fix: students who were previously removed (is_active = false) cannot rejoin
-- because there is no UPDATE policy on cohort_students for students.

CREATE POLICY "Students can reactivate own enrollment"
  ON cohort_students FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
