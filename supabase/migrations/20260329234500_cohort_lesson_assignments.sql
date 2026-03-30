-- Link lessons to cohorts and gate student lesson access by cohort assignment.
-- Backward-compatible rule:
--   - published lessons with no cohort assignments remain visible to all authenticated students
--   - published lessons with one or more active cohort assignments are only visible to students in those cohorts

CREATE TABLE IF NOT EXISTS public.cohort_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_lessons_cohort_id
  ON public.cohort_lessons(cohort_id);

CREATE INDEX IF NOT EXISTS idx_cohort_lessons_lesson_id
  ON public.cohort_lessons(lesson_id);

ALTER TABLE public.cohort_lessons ENABLE ROW LEVEL SECURITY;

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
    AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.can_user_access_published_lesson(p_user_id uuid, p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lessons lessons
    WHERE lessons.id = p_lesson_id
      AND lessons.is_published = true
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.cohort_lessons
          WHERE cohort_lessons.lesson_id = lessons.id
            AND cohort_lessons.is_active = true
        )
        OR EXISTS (
          SELECT 1
          FROM public.cohort_lessons
          WHERE cohort_lessons.lesson_id = lessons.id
            AND cohort_lessons.is_active = true
            AND cohort_lessons.cohort_id IN (
              SELECT public.get_active_student_cohort_ids(p_user_id)
            )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Teachers can manage cohort lesson assignments" ON public.cohort_lessons;
CREATE POLICY "Teachers can manage cohort lesson assignments"
  ON public.cohort_lessons
  FOR ALL
  TO authenticated
  USING (
    cohort_id IN (SELECT public.get_teacher_cohort_ids(auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    cohort_id IN (SELECT public.get_teacher_cohort_ids(auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

DROP POLICY IF EXISTS "Cohort members can view cohort lesson assignments" ON public.cohort_lessons;
CREATE POLICY "Cohort members can view cohort lesson assignments"
  ON public.cohort_lessons
  FOR SELECT
  TO authenticated
  USING (
    cohort_id IN (SELECT public.get_active_student_cohort_ids(auth.uid()))
    OR cohort_id IN (SELECT public.get_teacher_cohort_ids(auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'::user_role
    )
  );

DROP POLICY IF EXISTS "Published lessons are viewable by authenticated users" ON public.lessons;
CREATE POLICY "Published lessons are viewable by authorized users"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), id)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Lesson content blocks follow lesson visibility" ON public.lesson_content_blocks;
CREATE POLICY "Lesson content blocks follow lesson visibility"
  ON public.lesson_content_blocks
  FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_content_blocks.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Lesson questions are viewable for published lessons" ON public.lesson_questions;
CREATE POLICY "Lesson questions are viewable for published lessons"
  ON public.lesson_questions
  FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_questions.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Tasks viewable for published lessons" ON public.lesson_tasks;
CREATE POLICY "Tasks viewable for published lessons"
  ON public.lesson_tasks
  FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_tasks.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Students can view published lesson slides" ON public.lesson_slides;
CREATE POLICY "Students can view published lesson slides"
  ON public.lesson_slides
  FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_slides.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Students can manage their own question responses" ON public.lesson_question_responses;
CREATE POLICY "Students can manage their own question responses"
  ON public.lesson_question_responses
  FOR ALL
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.lesson_questions
      WHERE lesson_questions.id = lesson_question_responses.question_id
        AND public.can_user_access_published_lesson(auth.uid(), lesson_questions.lesson_id)
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.lesson_questions
      WHERE lesson_questions.id = lesson_question_responses.question_id
        AND public.can_user_access_published_lesson(auth.uid(), lesson_questions.lesson_id)
    )
  );

DROP POLICY IF EXISTS "Students can manage their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can manage their own lesson progress"
  ON public.lesson_progress
  FOR ALL
  TO authenticated
  USING (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  )
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  );

DROP POLICY IF EXISTS "Students manage own task responses" ON public.lesson_task_responses;
CREATE POLICY "Students manage own task responses"
  ON public.lesson_task_responses
  FOR ALL
  TO authenticated
  USING (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.lesson_tasks
      WHERE lesson_tasks.id = lesson_task_responses.task_id
        AND public.can_user_access_published_lesson(auth.uid(), lesson_tasks.lesson_id)
    )
  )
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.lesson_tasks
      WHERE lesson_tasks.id = lesson_task_responses.task_id
        AND public.can_user_access_published_lesson(auth.uid(), lesson_tasks.lesson_id)
    )
  );

DROP POLICY IF EXISTS "Students manage own slide responses" ON public.lesson_slide_responses;
CREATE POLICY "Students manage own slide responses"
  ON public.lesson_slide_responses
  FOR ALL
  TO authenticated
  USING (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  )
  WITH CHECK (
    student_id = auth.uid()
    AND public.can_user_access_published_lesson(auth.uid(), lesson_id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_cohort_lessons_updated_at'
  ) THEN
    CREATE TRIGGER update_cohort_lessons_updated_at
      BEFORE UPDATE ON public.cohort_lessons
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
