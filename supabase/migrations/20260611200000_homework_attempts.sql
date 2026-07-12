-- =============================================================================
-- homework_attempts: an immutable log of every homework attempt a student makes
-- =============================================================================
-- Product change (cohort-1): homework feedback is no longer instant (it became a
-- guessing game). Students now answer everything, submit, and may retry the
-- whole assignment as many times as they like until they reach 100%. Every
-- submitted attempt is snapshotted here — with the answers they picked and how
-- they scored — so teachers can see the full progression (e.g. attempt 1 chose
-- "Circle" ✗, attempt 2 chose "Triangle" ✓). The live working state still lives
-- in homework_submissions / homework_responses (which get reset on each retry);
-- this table is the permanent record.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.homework_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES public.homework_assignments(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submission_id   uuid REFERENCES public.homework_submissions(id) ON DELETE SET NULL,
  attempt_number  int  NOT NULL,
  score           int,
  max_score       int,
  correct_count   int,
  total_questions int,
  -- [{ question_id, response_text, response_file_urls, is_correct, points_earned }]
  answers         jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homework_attempts_assignment_student
  ON public.homework_attempts (assignment_id, student_id);
CREATE INDEX IF NOT EXISTS idx_homework_attempts_submission
  ON public.homework_attempts (submission_id);

ALTER TABLE public.homework_attempts ENABLE ROW LEVEL SECURITY;

-- Students can read and create their own attempts (the submit route runs under
-- the student's own session).
DROP POLICY IF EXISTS "Students can view their own attempts" ON public.homework_attempts;
CREATE POLICY "Students can view their own attempts"
  ON public.homework_attempts
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can insert their own attempts" ON public.homework_attempts;
CREATE POLICY "Students can insert their own attempts"
  ON public.homework_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Teachers and admins can read every attempt (for the grading / submissions view).
DROP POLICY IF EXISTS "Staff can view all attempts" ON public.homework_attempts;
CREATE POLICY "Staff can view all attempts"
  ON public.homework_attempts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
    )
  );
