-- Fix: cohorts and cohort_teachers only had SELECT policies,
-- blocking teachers from creating cohorts.

-- Teachers and admins can create cohorts
CREATE POLICY "Teachers can create cohorts"
  ON cohorts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- Teachers and admins can update their own cohorts
CREATE POLICY "Teachers can update own cohorts"
  ON cohorts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM cohort_teachers
      WHERE cohort_teachers.cohort_id = cohorts.id
        AND cohort_teachers.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM cohort_teachers
      WHERE cohort_teachers.cohort_id = cohorts.id
        AND cohort_teachers.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

-- Teachers and admins can delete their own cohorts
CREATE POLICY "Teachers can delete own cohorts"
  ON cohorts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM cohort_teachers
      WHERE cohort_teachers.cohort_id = cohorts.id
        AND cohort_teachers.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

-- Teachers can insert themselves into cohort_teachers
CREATE POLICY "Teachers can add themselves to cohorts"
  ON cohort_teachers FOR INSERT
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- Teachers can update their own cohort_teachers rows, admins can update any
CREATE POLICY "Teachers can update own cohort teacher rows"
  ON cohort_teachers FOR UPDATE
  USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

-- Teachers can remove themselves, admins can remove any
CREATE POLICY "Teachers can delete own cohort teacher rows"
  ON cohort_teachers FOR DELETE
  USING (
    teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );
