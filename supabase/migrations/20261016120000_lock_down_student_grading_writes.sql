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
--   * lesson_task_responses — FOR ALL "Students manage own task responses"
--     (20260329234500): write a teacher_review of "accepted" and full credit on
--     a free-response activity, or any completion_score; lesson_progress task
--     counters (tasks_total_score ...) were writable the same way.
-- and, through other accounts and tables:
--   * any self-registered 'teacher' (handle_new_user honours the role in the
--     signup metadata, with is_approved=false) got teacher rights in the
--     database before an admin approved it: change a Practice's pass mark or a
--     lesson's Practice gate, add itself to any class and grade its homework,
--     read every student's attempts and AI chats. Approval was only checked by
--     the Next.js middleware, which direct PostgREST calls never pass through.
--   * a student could join any class directly (an 'approved' cohort_students
--     row, self-approve a pending request, or move their row to another class)
--     and see its homework and answer keys; a pending request already counted.
--   * any signed-in user could link itself as an approved guardian of any
--     student (guardian_students INSERT checked nothing) and read their scores,
--     progress, streak and AI chats; unexpired invite codes were public.
--
-- After this migration:
--   * Grading happens only on the server. /api/homework/[id]/submit and
--     /retake perform score / status / points / attempts / streak writes with
--     the service role. A student's own session may still create and edit an
--     OPEN submission (not_started / in_progress) and its answers (drafts), but
--     never grading fields, and nothing once it is submitted.
--   * lesson_progress keeps working from the lesson page and the offline sync
--     (watch position, watch time, quiz counters). A BEFORE trigger, not a
--     policy, polices completion so those clients never see an error:
--       - completed=true on a lesson whose published learning-path step has a
--         Practice is silently dropped unless the student has a passing graded
--         submission for that Practice;
--       - a completed lesson stays completed and keeps its first completed_at;
--       - completed_at is clamped to now() (never in the future) and cleared
--         while the lesson is not completed;
--       - the task counters keep their server-computed values (they are
--         recalculated with the service role by the task-responses routes).
--     Completing an ungated lesson (the player's existing behaviour) is allowed.
--   * student_streaks is read-only for students. It is written by the SECURITY
--     DEFINER completion trigger (bump_lesson_streak_on_completion) and by the
--     submit route with the service role.
--   * lesson_task_responses is read-only for students; /api/lessons/[id]/
--     task-responses scores and saves answers with the service role.
--   * Students can no longer DELETE homework submissions, lesson progress or
--     streaks (account deletion uses the service role / FK cascades), nor
--     answers on a submitted homework.
--   * A teacher or admin account has no row access at all until it is
--     approved (RESTRICTIVE policies, section 7). Teachers may add themselves
--     only to a class that has no teacher yet (the one they just created), and
--     nobody but an approved admin can move an enrolment or a teaching
--     assignment to another class, or a graded row to another student.
--   * Class membership counts only once a teacher approves it: students may
--     only ask to join (status 'pending'), leave, or ask again (section 8).
--   * Guardian links are made only by redeeming a student's invite code through
--     redeem_guardian_invite(); invites are private to their student (section 9).
--
-- How a "student's own session" is recognised: the guard functions below are
-- SECURITY INVOKER, so current_user is 'authenticated' (or 'anon') only for
-- writes that come straight from PostgREST with a user JWT. The service role
-- ('service_role'), SECURITY DEFINER functions/triggers (run as their owner)
-- and migrations are trusted and pass through untouched. Teachers and admins
-- writing someone else's row are governed by their existing RLS policies.
--
-- DEPLOY ORDER: ship the app code that moves grading writes to the service
-- role FIRST, then apply this migration (the old submit and task-responses
-- routes wrote grading fields with the student's session and would fail
-- against it).
--
-- Existing data: pending / rejected class requests lose homework and lesson
-- access until a teacher approves them (rows default to 'approved', so current
-- members are unaffected), and guardian links that no redeemed invite backs
-- are set to is_approved=false.
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

    -- Task counters are recalculated from lesson_task_responses by the server
    -- (service role); a client write keeps the stored values.
    NEW.tasks_completed := OLD.tasks_completed;
    NEW.required_tasks_completed := OLD.required_tasks_completed;
    NEW.tasks_skipped := OLD.tasks_skipped;
    NEW.tasks_total_score := OLD.tasks_total_score;
  ELSE
    NEW.tasks_completed := 0;
    NEW.required_tasks_completed := 0;
    NEW.tasks_skipped := 0;
    NEW.tasks_total_score := 0;
  END IF;

  IF TG_OP = 'UPDATE' THEN
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
  -- teacher or admin grading someone else's row is governed by RLS, but may
  -- never hand the row (and its grade) to another student or assignment.
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    IF TG_OP = 'UPDATE'
       AND (NEW.student_id IS DISTINCT FROM OLD.student_id
            OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id) THEN
      RAISE EXCEPTION 'homework_submissions: student_id and assignment_id cannot be changed'
        USING ERRCODE = '42501';
    END IF;
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

-- Whether a question belongs to the assignment of one of the CALLER's own
-- submissions (false for anyone else's submission). The response guard only
-- calls it for the caller's own submission; authenticated keeps EXECUTE
-- because that guard is SECURITY INVOKER.
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
      AND hs.student_id = auth.uid()
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

  -- Not the caller's own submission (e.g. a teacher grading): RLS decides,
  -- but marks cannot be moved to another submission or question.
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid() THEN
    IF TG_OP = 'UPDATE'
       AND (NEW.submission_id IS DISTINCT FROM OLD.submission_id
            OR NEW.question_id IS DISTINCT FROM OLD.question_id) THEN
      RAISE EXCEPTION 'homework_responses: submission_id and question_id cannot be changed'
        USING ERRCODE = '42501';
    END IF;
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


-- ── 6. lesson_task_responses ─────────────────────────────────────────────────
-- Students used to write their own rows (FOR ALL), including the teacher_review
-- a teacher stores in response_data and completion_score. The student route
-- (/api/lessons/[id]/task-responses) now checks lesson access itself and scores
-- and saves answers with the service role, like teacher review and AI grading
-- already did. Students keep read access to their own rows.

DROP POLICY IF EXISTS "Students manage own task responses" ON public.lesson_task_responses;

DROP POLICY IF EXISTS "Students view own task responses" ON public.lesson_task_responses;
CREATE POLICY "Students view own task responses"
  ON public.lesson_task_responses
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.lesson_tasks
      WHERE lesson_tasks.id = lesson_task_responses.task_id
        AND public.can_user_access_published_lesson(auth.uid(), lesson_tasks.lesson_id)
    )
  );


-- ── 7. Unapproved staff accounts ─────────────────────────────────────────────
-- handle_new_user gives a public signup that asked for role 'teacher' that role
-- at once, with is_approved=false; approval was only enforced by the Next.js
-- middleware. The RESTRICTIVE policies below deny every row of these tables to
-- a teacher/admin account until it is approved, so none of the role-only
-- permissive policies (Practice and path editing, joining classes, grading,
-- reading attempts or AI chats, ...) apply to it. Students and parents are not
-- affected, and profiles (read by the pending-approval screen) is not covered.

CREATE OR REPLACE FUNCTION public.is_unapproved_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
      AND is_approved IS NOT TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_approved_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_approved = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_unapproved_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_unapproved_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_unapproved_staff() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_approved_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_approved_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved_admin() TO authenticated, service_role;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_conversations', 'ai_messages',
    'cohorts', 'cohort_lessons', 'cohort_students', 'cohort_teachers',
    'feedback',
    'homework_assignments', 'homework_attempts', 'homework_questions',
    'homework_responses', 'homework_submissions',
    'learning_paths', 'learning_path_weeks', 'learning_path_steps',
    'lessons', 'lesson_chunk_embeddings', 'lesson_content_blocks',
    'lesson_progress', 'lesson_question_responses', 'lesson_questions',
    'lesson_sims', 'lesson_sim_versions', 'lesson_slide_responses',
    'lesson_slides', 'lesson_task_responses', 'lesson_tasks',
    'organizations', 'organization_members',
    'parent_applications', 'volunteer_applications',
    'sim_save_attempts', 'student_streaks'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Unapproved staff have no staff access" ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT (SELECT public.is_unapproved_staff())) '
      || 'WITH CHECK (NOT (SELECT public.is_unapproved_staff()))',
      t
    );
  END LOOP;
END;
$$;

-- Whether a class already has a teacher. SECURITY DEFINER so the policy below
-- sees every teaching row, not only the caller's.
CREATE OR REPLACE FUNCTION public.cohort_has_teachers(p_cohort_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cohort_teachers WHERE cohort_id = p_cohort_id
  );
$$;

REVOKE ALL ON FUNCTION public.cohort_has_teachers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cohort_has_teachers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cohort_has_teachers(uuid) TO authenticated, service_role;

-- A teacher could add themselves to ANY class, and then see and grade its
-- students' work. Now an approved teacher may add themselves only to a class
-- with no teacher yet, i.e. the one they just created (teacher/cohorts
-- "Create class"); "Admins can manage cohort teachers" covers everything else.
DROP POLICY IF EXISTS "Teachers can add themselves to cohorts" ON public.cohort_teachers;
CREATE POLICY "Teachers can add themselves to cohorts"
  ON public.cohort_teachers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher', 'admin')
        AND profiles.is_approved = true
    )
    AND NOT public.cohort_has_teachers(cohort_id)
  );

-- "Teachers can update own cohort teacher rows" let a teacher re-point their
-- own row at another class. Only an approved admin may change who teaches
-- which class; others may still edit the rest of their row (is_primary).
CREATE OR REPLACE FUNCTION public.guard_cohort_teacher_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF (NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
      OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id)
     AND NOT public.is_approved_admin() THEN
    RAISE EXCEPTION 'cohort_teachers: only an admin can move a teacher to another class'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_cohort_teacher_client_update ON public.cohort_teachers;
CREATE TRIGGER guard_cohort_teacher_client_update
  BEFORE UPDATE ON public.cohort_teachers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_cohort_teacher_client_update();


-- ── 8. Class membership needs a teacher's approval ───────────────────────────
-- Students could INSERT an enrolment with any status (the column defaults to
-- 'approved'), set a pending or rejected row back to approved, or move their
-- row to another class, and every student gate only looked at is_active, so
-- even the app's own pending "Request to join" row opened the class's homework
-- and answer keys. Now a student may only ask to join (pending), leave
-- (is_active=false) or ask again, and only an approved, active enrolment
-- counts. Teachers approve with "Teachers and admins can manage cohort
-- students" as before.

ALTER TABLE public.cohort_students DROP CONSTRAINT IF EXISTS cohort_students_status_check;
ALTER TABLE public.cohort_students
  ADD CONSTRAINT cohort_students_status_check
  CHECK (status IN ('pending', 'approved', 'rejected')) NOT VALID;

-- Lessons (can_user_access_published_lesson), cohort lessons and the homework
-- policies below all go through this.
CREATE OR REPLACE FUNCTION public.get_active_student_cohort_ids(p_student_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cohort_id
  FROM public.cohort_students
  WHERE student_id = p_student_id
    AND is_active = true
    AND status = 'approved';
$$;

DROP POLICY IF EXISTS "Students can join cohorts" ON public.cohort_students;
CREATE POLICY "Students can join cohorts"
  ON public.cohort_students
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Students can reactivate own enrollment" ON public.cohort_students;
DROP POLICY IF EXISTS "Students can leave or re-request own enrollment" ON public.cohort_students;
CREATE POLICY "Students can leave or re-request own enrollment"
  ON public.cohort_students
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND (status = 'pending' OR is_active = false)
  );

-- An enrolment can't be moved to another class or student except by an
-- approved admin (teachers approve, remove and re-add in place).
CREATE OR REPLACE FUNCTION public.guard_cohort_student_client_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF (NEW.cohort_id IS DISTINCT FROM OLD.cohort_id
      OR NEW.student_id IS DISTINCT FROM OLD.student_id)
     AND NOT public.is_approved_admin() THEN
    RAISE EXCEPTION 'cohort_students: an enrolment cannot be moved to another class or student'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_cohort_student_client_update ON public.cohort_students;
CREATE TRIGGER guard_cohort_student_client_update
  BEFORE UPDATE ON public.cohort_students
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_cohort_student_client_update();

DROP POLICY IF EXISTS "Cohort members can view homework assignments" ON public.homework_assignments;
CREATE POLICY "Cohort members can view homework assignments"
  ON public.homework_assignments
  FOR SELECT
  TO authenticated
  USING (
    cohort_id IN (SELECT public.get_active_student_cohort_ids(auth.uid()))
    OR cohort_id IN (
      SELECT cohort_teachers.cohort_id
      FROM public.cohort_teachers
      WHERE cohort_teachers.teacher_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Homework questions are viewable by cohort members" ON public.homework_questions;
CREATE POLICY "Homework questions are viewable by cohort members"
  ON public.homework_questions
  FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ha.id
      FROM public.homework_assignments ha
      WHERE ha.cohort_id IN (SELECT public.get_active_student_cohort_ids(auth.uid()))
         OR ha.cohort_id IN (
           SELECT cohort_teachers.cohort_id
           FROM public.cohort_teachers
           WHERE cohort_teachers.teacher_id = auth.uid()
         )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Submission rows (20260411120000) are created only for approved members, and
-- also when a teacher approves a pending request.
CREATE OR REPLACE FUNCTION public.sync_homework_submissions_for_assignment_row(assignment_row public.homework_assignments)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT assignment_row.is_published THEN
    RETURN;
  END IF;

  INSERT INTO public.homework_submissions (assignment_id, student_id, status)
  SELECT assignment_row.id, cs.student_id, 'not_started'
  FROM public.cohort_students cs
  WHERE cs.cohort_id = assignment_row.cohort_id
    AND cs.is_active = true
    AND cs.status = 'approved'
  ON CONFLICT (assignment_id, student_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_homework_submissions_for_cohort_student_row(cohort_student_row public.cohort_students)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT cohort_student_row.is_active OR cohort_student_row.status IS DISTINCT FROM 'approved' THEN
    RETURN;
  END IF;

  INSERT INTO public.homework_submissions (assignment_id, student_id, status)
  SELECT ha.id, cohort_student_row.student_id, 'not_started'
  FROM public.homework_assignments ha
  WHERE ha.cohort_id = cohort_student_row.cohort_id
    AND ha.is_published = true
  ON CONFLICT (assignment_id, student_id) DO NOTHING;
END;
$$;

DROP TRIGGER IF EXISTS sync_homework_submissions_for_cohort_student_trigger ON public.cohort_students;
CREATE TRIGGER sync_homework_submissions_for_cohort_student_trigger
  AFTER INSERT OR UPDATE OF is_active, cohort_id, status ON public.cohort_students
  FOR EACH ROW
  WHEN (NEW.is_active = true AND NEW.status = 'approved')
  EXECUTE FUNCTION public.handle_cohort_student_submission_sync();


-- ── 9. Guardian links ────────────────────────────────────────────────────────
-- "Guardians can create student links" (2026021800000) only checked
-- guardian_id = auth.uid(), and is_approved defaulted to true, so any signed-in
-- user could link itself to any student and read their homework results,
-- lesson progress, streak and AI chats through the guardian SELECT policies.
-- Unexpired invite codes were readable by everyone, anon included. No app code
-- writes these tables yet; links are now made only by redeeming an invite.

DROP POLICY IF EXISTS "Guardians can create student links" ON public.guardian_students;
REVOKE INSERT, UPDATE, DELETE ON public.guardian_students FROM anon, authenticated;
ALTER TABLE public.guardian_students ALTER COLUMN is_approved SET DEFAULT false;

-- Links that no redeemed invite backs could only have been self-made.
UPDATE public.guardian_students gs
   SET is_approved = false
 WHERE gs.is_approved IS NOT FALSE
   AND NOT EXISTS (
     SELECT 1
     FROM public.guardian_invites gi
     WHERE gi.student_id = gs.student_id
       AND gi.used_by = gs.guardian_id
       AND gi.used_at IS NOT NULL
   );

-- Invites: private to their student; no client UPDATE (used_at / used_by are
-- set by redeem_guardian_invite only).
DROP POLICY IF EXISTS "Anyone can read unexpired invites" ON public.guardian_invites;
DROP POLICY IF EXISTS "Students can manage their invites" ON public.guardian_invites;
REVOKE ALL ON public.guardian_invites FROM anon;

DROP POLICY IF EXISTS "Students can view their invites" ON public.guardian_invites;
CREATE POLICY "Students can view their invites"
  ON public.guardian_invites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Students can create their invites" ON public.guardian_invites;
CREATE POLICY "Students can create their invites"
  ON public.guardian_invites
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND auth.uid() = created_by
    AND used_at IS NULL
    AND used_by IS NULL
    AND char_length(code) >= 8
  );

DROP POLICY IF EXISTS "Students can delete their invites" ON public.guardian_invites;
CREATE POLICY "Students can delete their invites"
  ON public.guardian_invites
  FOR DELETE
  TO authenticated
  USING (auth.uid() = student_id);

-- The only way to link: an approved parent redeems an unexpired, unused code
-- (used once; the row is locked while it is redeemed).
CREATE OR REPLACE FUNCTION public.redeem_guardian_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invite public.guardian_invites;
  v_link uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role = 'parent' AND is_approved = true
  ) THEN
    RAISE EXCEPTION 'only parent accounts can link to a student' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invite
  FROM public.guardian_invites
  WHERE code = p_code
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND OR v_invite.student_id = v_uid THEN
    RAISE EXCEPTION 'invalid or expired code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.guardian_invites
     SET used_at = now(), used_by = v_uid
   WHERE id = v_invite.id;

  INSERT INTO public.guardian_students (guardian_id, student_id, relationship_type, is_approved)
  VALUES (v_uid, v_invite.student_id, v_invite.relationship_type, true)
  ON CONFLICT (guardian_id, student_id) DO UPDATE
    SET is_approved = true, relationship_type = EXCLUDED.relationship_type
  RETURNING id INTO v_link;

  RETURN v_link;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_guardian_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_guardian_invite(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_guardian_invite(text) TO authenticated;

-- get_guardian_students took any guardian id (and anon could call it): now it
-- only answers for the caller. (It also read profiles.email, a column profiles
-- has never had, so every call failed; student_email is NULL until there is a
-- decision on sharing a child's login email with a guardian.)
CREATE OR REPLACE FUNCTION public.get_guardian_students(guardian_uuid uuid)
RETURNS TABLE (
  student_id uuid,
  student_name text,
  student_email text,
  relationship_type text,
  linked_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF guardian_uuid IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    NULL::text,
    gs.relationship_type,
    gs.created_at
  FROM public.guardian_students gs
  JOIN public.profiles p ON p.id = gs.student_id
  WHERE gs.guardian_id = guardian_uuid
    AND gs.is_approved = true
  ORDER BY gs.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_guardian_students(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_guardian_students(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_guardian_students(uuid) TO authenticated, service_role;
