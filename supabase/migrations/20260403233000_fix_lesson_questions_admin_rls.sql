DROP POLICY IF EXISTS "Teachers can insert questions for their lessons" ON public.lesson_questions;
DROP POLICY IF EXISTS "Teachers can update questions for their lessons" ON public.lesson_questions;
DROP POLICY IF EXISTS "Teachers can delete questions for their lessons" ON public.lesson_questions;
DROP POLICY IF EXISTS "Teachers can manage lesson questions" ON public.lesson_questions;
DROP POLICY IF EXISTS "Teachers can manage their lesson tasks" ON public.lesson_tasks;
DROP POLICY IF EXISTS "Teachers can manage their lesson slides" ON public.lesson_slides;

CREATE POLICY "Teachers can manage lesson questions"
  ON public.lesson_questions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_questions.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_questions.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  );

CREATE POLICY "Teachers can manage their lesson tasks"
  ON public.lesson_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_tasks.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_tasks.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  );

CREATE POLICY "Teachers can manage their lesson slides"
  ON public.lesson_slides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_slides.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lessons
      WHERE lessons.id = lesson_slides.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'::user_role
          )
          OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
        )
    )
  );
