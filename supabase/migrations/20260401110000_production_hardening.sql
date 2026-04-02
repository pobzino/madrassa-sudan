-- Restore missing RLS policies on production and pin search_path on mutable functions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Organization members can view their organization'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Organization members can view their organization"
        ON public.organizations
        FOR SELECT
        TO authenticated
        USING (
          id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Admins can manage organizations'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can manage organizations"
        ON public.organizations
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Members can view organization members'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Members can view organization members"
        ON public.organization_members
        FOR SELECT
        TO authenticated
        USING (
          organization_id IN (
            SELECT organization_id
            FROM public.organization_members
            WHERE user_id = (SELECT auth.uid())
          )
        )
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND policyname = 'Admins can manage organization members'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can manage organization members"
        ON public.organization_members
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cohort_students'
      AND policyname = 'Students can view own enrollments'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Students can view own enrollments"
        ON public.cohort_students
        FOR SELECT
        TO authenticated
        USING (
          student_id = (SELECT auth.uid())
          OR cohort_id IN (
            SELECT cohort_id
            FROM public.cohort_teachers
            WHERE teacher_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cohort_students'
      AND policyname = 'Students can join cohorts'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Students can join cohorts"
        ON public.cohort_students
        FOR INSERT
        TO authenticated
        WITH CHECK (student_id = (SELECT auth.uid()))
    $policy$;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cohort_students'
      AND policyname = 'Teachers and admins can manage cohort students'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Teachers and admins can manage cohort students"
        ON public.cohort_students
        FOR ALL
        TO authenticated
        USING (
          cohort_id IN (
            SELECT cohort_id
            FROM public.cohort_teachers
            WHERE teacher_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
        WITH CHECK (
          cohort_id IN (
            SELECT cohort_id
            FROM public.cohort_teachers
            WHERE teacher_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
          )
        )
    $policy$;
  END IF;
END
$$;

ALTER FUNCTION public.match_lesson_chunks(vector, integer, uuid, integer, text)
  SET search_path = public;

ALTER FUNCTION public.get_teacher_pending_grading_count(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_assignment_submission_stats(uuid)
  SET search_path = public;

ALTER FUNCTION public.update_submission_started_at()
  SET search_path = public;

ALTER FUNCTION public.get_guardian_students(uuid)
  SET search_path = public;

ALTER FUNCTION public.update_guardian_students_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_lesson_quiz_progress(uuid, uuid, boolean, integer)
  SET search_path = public;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public.update_updated_at()
  SET search_path = public;
