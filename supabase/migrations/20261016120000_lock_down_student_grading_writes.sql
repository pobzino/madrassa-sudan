-- =============================================================================
-- Lock down student-side writes to grading, completion and streak data
-- =============================================================================
-- Until now a signed-in student could, straight from the browser with the
-- publishable key, write the columns that decide their results:
--   * homework_submissions — FOR ALL "Students can manage their own homework
--     submissions" (base schema): set score / status='graded' / graded_at /
--     attempt_count, reset a graded or passed attempt, or delete it.
--   * homework_responses — FOR ALL "Students can manage their own responses"
--     (20260216191200): set points_earned / teacher_comment, edit answers after
--     submitting.
--   * homework_attempts — "Students can insert their own attempts": forge the
--     attempt history teachers review.
--   * lesson_progress — FOR ALL "Students can manage their own lesson progress"
--     (20260329234500): set completed=true on a Practice-gated lesson, un- and
--     re-complete a lesson (each re-completion fires trg_lesson_progress_streak
--     again), delete + re-insert, or write any completed_at.
--   * student_streaks — FOR ALL "Students can manage their own streaks" (base
--     schema, never dropped) plus "Students can insert/update their own streak"
--     (20260611100000): write any streak / totals.
--
-- After this migration:
--   * Grading happens only on the server. /api/homework/[id]/submit and
--     /retake perform score / status / points / attempts / streak writes with
--     the service role. A student's own session may still create and edit an
--     OPEN submission (not_started / in_progress) and its answers (drafts), but
--     never grading fields, and nothing once it is submitted.
--   * lesson_progress keeps working from the lesson page and the offline sync
--     (watch position, watch time, quiz/task counters). A BEFORE trigger, not a
--     policy, polices completion so those clients never see an error:
--       - completed=true on a lesson whose published learning-path step has a
--         Practice is silently dropped unless the student has a passing graded
--         submission for that Practice;
--       - a completed lesson stays completed and keeps its first completed_at;
--       - completed_at is clamped to now() (never in the future) and cleared
--         while the lesson is not completed.
--     Completing an ungated lesson (the player's existing behaviour) is allowed.
--   * student_streaks is read-only for students. It is written by the SECURITY
--     DEFINER completion trigger (bump_lesson_streak_on_completion) and by the
--     submit route with the service role.
--   * Students can no longer DELETE homework submissions, lesson progress or
--     streaks (account deletion uses the service role / FK cascades), nor
--     answers on a submitted homework.
--
-- How a "student's own session" is recognised: the guard functions below are
-- SECURITY INVOKER, so current_user is 'authenticated' (or 'anon') only for
-- writes that come straight from PostgREST with a user JWT. The service role
-- ('service_role'), SECURITY DEFINER functions/triggers (run as their owner)
-- and migrations are trusted and pass through untouched. Teachers and admins
-- writing someone else's row are governed by their existing RLS policies.
--
-- DEPLOY ORDER: ship the app code that moves grading writes to the service
-- role FIRST, then apply this migration (the old submit route wrote grading
-- fields with the student's session and would fail against it).
-- =============================================================================


-- ── 1. lesson_progress ───────────────────────────────────────────────────────

-- True when the caller (auth.uid()) may complete p_lesson_id: either the lesson
-- has no Practice gate (no step in a PUBLISHED learning path with a
-- practice_assignment_id — exactly the gate students see on the lesson page,
-- since steps of unpublished paths are hidden from them by RLS), or the caller
-- has a graded submission at or above the pass mark for that lesson's Practice.
-- SECURITY DEFINER so the check does not depend on what RLS lets the student
-- read; it only ever reports on the caller's own results.
CREATE OR REPLACE FUNCTION public.lesson_practice_gate_satisfied(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM public.learning_path_steps s
      JOIN public.learning_path_weeks w ON w.id = s.week_id
      JOIN public.learning_paths p ON p.id = w.path_id
      WHERE s.lesson_id = p_lesson_id
        AND s.practice_assignment_id IS NOT NULL
        AND p.is_published = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.homework_submissions hs
      JOIN public.homework_assignments ha ON ha.id = hs.assignment_id
      WHERE hs.student_id = auth.uid()
        AND hs.status IN ('graded', 'returned')
        AND hs.score IS NOT NULL
        AND ha.total_points > 0
        AND hs.score >= (COALESCE(ha.passing_score, 75)::numeric / 100) * ha.total_points
        AND (
          ha.id IN (
            SELECT s2.practice_assignment_id
            FROM public.learning_path_steps s2
            WHERE s2.lesson_id = p_lesson_id
              AND s2.practice_assignment_id IS NOT NULL
          )
          OR (ha.is_practice = true AND ha.lesson_id = p_lesson_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.lesson_practice_gate_satisfied(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lesson_practice_gate_satisfied(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.lesson_practice_gate_satisfied(uuid) TO authenticated, service_role;

-- SECURITY INVOKER on purpose (see header): current_user identifies the caller.
CREATE OR REPLACE FUNCTION public.guard_lesson_progress_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id THEN
      RAISE EXCEPTION 'lesson_progress: student_id and lesson_id cannot be changed'
        USING ERRCODE = '42501';
    END IF;

    -- A completion, once earned, is permanent and keeps its original time.
    -- (Re-watching from the start used to write completed=false, and the
    -- re-completion fired the streak trigger a second time.)
    IF OLD.completed IS TRUE THEN
      NEW.completed := true;
      NEW.completed_at := COALESCE(OLD.completed_at, LEAST(COALESCE(NEW.completed_at, now()), now()));
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.completed IS TRUE THEN
    IF public.lesson_practice_gate_satisfied(NEW.lesson_id) THEN
      -- Offline sync may back-date a completion; never forward-date one.
      NEW.completed_at := LEAST(COALESCE(NEW.completed_at, now()), now());
    ELSE
      -- Practice-gated lesson without a passing Practice: keep the rest of the
      -- write (watch position etc.) but not the completion.
      NEW.completed := false;
      NEW.completed_at := NULL;
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_lesson_progress_client_write ON public.lesson_progress;
CREATE TRIGGER guard_lesson_progress_client_write
  BEFORE INSERT OR UPDATE ON public.lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_lesson_progress_client_write();

-- Same access as before, minus DELETE (delete + re-insert re-earned the
-- completion and the streak bump).
DROP POLICY IF EXISTS "Students can manage their own lesson progress" ON public.lesson_progress;

DROP POLICY IF EXISTS "Students can view their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can view their own lesson progress"
  ON public.lesson_progress
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  );

DROP POLICY IF EXISTS "Students can create their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can create their own lesson progress"
  ON public.lesson_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  );

DROP POLICY IF EXISTS "Students can update their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can update their own lesson progress"
  ON public.lesson_progress
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  )
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  );


-- ── 2. homework_submissions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_homework_submission_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_owner := OLD.student_id;
  ELSE
    v_owner := NEW.student_id;
  END IF;

  -- Only a student's writes to their OWN submission are limited here; a
  -- teacher or admin grading someone else's row is governed by RLS.
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('not_started', 'in_progress') THEN
      RAISE EXCEPTION 'homework_submissions: homework is submitted through the app, not directly'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.score IS NOT NULL
       OR NEW.graded_at IS NOT NULL
       OR NEW.graded_by IS NOT NULL
       OR NEW.feedback IS NOT NULL
       OR NEW.overall_feedback IS NOT NULL
       OR NEW.submitted_at IS NOT NULL
       OR COALESCE(NEW.attempt_count, 0) <> 0 THEN
      RAISE EXCEPTION 'homework_submissions: grading fields are set by the server only'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status NOT IN ('not_started', 'in_progress') THEN
    RAISE EXCEPTION 'homework_submissions: a submitted homework can only be changed by the server'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status NOT IN ('not_started', 'in_progress') THEN
    RAISE EXCEPTION 'homework_submissions: homework is submitted through the app, not directly'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.overall_feedback IS DISTINCT FROM OLD.overall_feedback
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
     OR NEW.attempt_count IS DISTINCT FROM OLD.attempt_count THEN
    RAISE EXCEPTION 'homework_submissions: grading fields are set by the server only'
      USING ERRCODE = '42501';
  END IF;

  -- Allowed: status between not_started / in_progress, started_at,
  -- time_spent_seconds, updated_at (drafts / autosave).
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_homework_submission_client_write ON public.homework_submissions;
CREATE TRIGGER guard_homework_submission_client_write
  BEFORE INSERT OR UPDATE ON public.homework_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_homework_submission_client_write();

DROP POLICY IF EXISTS "Students can manage their own homework submissions" ON public.homework_submissions;

DROP POLICY IF EXISTS "Students can view their own homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can view their own homework submissions"
  ON public.homework_submissions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students can start their own homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can start their own homework submissions"
  ON public.homework_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('not_started', 'in_progress')
  );

DROP POLICY IF EXISTS "Students can update their own open homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can update their own open homework submissions"
  ON public.homework_submissions
  FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid()
    AND status IN ('not_started', 'in_progress')
  )
  WITH CHECK (
    student_id = auth.uid()
    AND status IN ('not_started', 'in_progress')
  );


-- ── 3. homework_responses ────────────────────────────────────────────────────

-- Whether a question belongs to the submission's assignment. Returns only a
-- boolean about two ids the caller already holds.
CREATE OR REPLACE FUNCTION public.homework_question_in_submission(p_submission_id uuid, p_question_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.homework_submissions hs
    JOIN public.homework_questions q ON q.assignment_id = hs.assignment_id
    WHERE hs.id = p_submission_id
      AND q.id = p_question_id
  );
$$;

REVOKE ALL ON FUNCTION public.homework_question_in_submission(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.homework_question_in_submission(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.homework_question_in_submission(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_homework_response_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_submission uuid;
  v_owner uuid;
  v_status public.submission_status;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_submission := OLD.submission_id;
  ELSE
    v_submission := NEW.submission_id;
  END IF;

  -- Read under the caller's RLS: a student sees only their own submissions.
  SELECT hs.student_id, hs.status
    INTO v_owner, v_status
  FROM public.homework_submissions hs
  WHERE hs.id = v_submission;

  -- Not the caller's own submission (e.g. a teacher grading): RLS decides.
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  IF v_status NOT IN ('not_started', 'in_progress') THEN
    RAISE EXCEPTION 'homework_responses: answers are locked once the homework is submitted'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.points_earned IS NOT NULL OR NEW.teacher_comment IS NOT NULL THEN
      RAISE EXCEPTION 'homework_responses: points are set by the server or a teacher only'
        USING ERRCODE = '42501';
    END IF;
    IF NOT public.homework_question_in_submission(NEW.submission_id, NEW.question_id) THEN
      RAISE EXCEPTION 'homework_responses: that question is not part of this homework'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.submission_id IS DISTINCT FROM OLD.submission_id
       OR NEW.question_id IS DISTINCT FROM OLD.question_id THEN
      RAISE EXCEPTION 'homework_responses: submission_id and question_id cannot be changed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.points_earned IS DISTINCT FROM OLD.points_earned
       OR NEW.teacher_comment IS DISTINCT FROM OLD.teacher_comment THEN
      RAISE EXCEPTION 'homework_responses: points are set by the server or a teacher only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_homework_response_client_write ON public.homework_responses;
CREATE TRIGGER guard_homework_response_client_write
  BEFORE INSERT OR UPDATE ON public.homework_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_homework_response_client_write();

DROP POLICY IF EXISTS "Students can manage their own responses" ON public.homework_responses;

DROP POLICY IF EXISTS "Students can view their own responses" ON public.homework_responses;
CREATE POLICY "Students can view their own responses"
  ON public.homework_responses
  FOR SELECT
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.homework_submissions WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can add answers to their own submissions" ON public.homework_responses;
CREATE POLICY "Students can add answers to their own submissions"
  ON public.homework_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    submission_id IN (
      SELECT id FROM public.homework_submissions WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can edit answers on their own submissions" ON public.homework_responses;
CREATE POLICY "Students can edit answers on their own submissions"
  ON public.homework_responses
  FOR UPDATE
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.homework_submissions WHERE student_id = auth.uid()
    )
  )
  WITH CHECK (
    submission_id IN (
      SELECT id FROM public.homework_submissions WHERE student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can remove answers on their open submissions" ON public.homework_responses;
CREATE POLICY "Students can remove answers on their open submissions"
  ON public.homework_responses
  FOR DELETE
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM public.homework_submissions
      WHERE student_id = auth.uid()
        AND status IN ('not_started', 'in_progress')
    )
  );


-- ── 4. homework_attempts ─────────────────────────────────────────────────────
-- The attempt log is written by the submit route with the service role.
-- Students keep "Students can view their own attempts".

DROP POLICY IF EXISTS "Students can insert their own attempts" ON public.homework_attempts;


-- ── 5. student_streaks ───────────────────────────────────────────────────────
-- Read-only for students. Writers: bump_lesson_streak_on_completion (already
-- SECURITY DEFINER, 20260610000000, so it needs no student policy) and the
-- submit route (service role).

DROP POLICY IF EXISTS "Students can manage their own streaks" ON public.student_streaks;
DROP POLICY IF EXISTS "Students can insert their own streak" ON public.student_streaks;
DROP POLICY IF EXISTS "Students can update their own streak" ON public.student_streaks;

DROP POLICY IF EXISTS "Students can view their own streak" ON public.student_streaks;
CREATE POLICY "Students can view their own streak"
  ON public.student_streaks
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());
