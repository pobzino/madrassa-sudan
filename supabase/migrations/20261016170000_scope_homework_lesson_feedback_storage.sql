-- Production's storage rules were made by hand, and let any signed-in account
-- read, overwrite or delete every homework upload and every lesson file, and
-- read every feedback screenshot. Replace them, and the base-schema rules they
-- stood in for, with scoped rules:
--   homework  learners (and the parent of a child learner) manage files under
--             their own learner folder; approved teachers of the learner's
--             class and approved admins can read them.
--   lessons   public read stays; approved teachers and admins upload; only the
--             uploader or an approved admin can change or delete a file.
--   feedback  only approved admins read screenshots (uploads were already
--             staff-only).
-- The RESTRICTIVE "Unapproved staff have no storage access" policy still applies.

CREATE OR REPLACE FUNCTION public.can_access_homework_object(p_name text, p_write boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_folder text := (storage.foldername(p_name))[1];
  v_learner uuid;
BEGIN
  IF auth.uid() IS NULL OR v_folder IS NULL
     OR v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_learner := v_folder::uuid;

  -- The learner themself, or the parent account that owns a child learner.
  IF public.can_access_learner(v_learner) THEN
    RETURN true;
  END IF;

  IF p_write THEN
    RETURN false;
  END IF;

  IF public.is_approved_admin() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cohort_students cs
    JOIN public.cohort_teachers ct ON ct.cohort_id = cs.cohort_id
    JOIN public.profiles teacher ON teacher.id = ct.teacher_id
    WHERE cs.student_id = v_learner
      AND cs.status = 'approved'
      AND ct.teacher_id = auth.uid()
      AND teacher.role IN ('teacher', 'admin')
      AND teacher.is_approved IS TRUE
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_homework_object(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_homework_object(text, boolean) TO authenticated, service_role;

-- Production's hand-made rules
DROP POLICY IF EXISTS "Authenticated users can upload homework files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read homework files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update homework files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete homework files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to lessons bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update in lessons bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete from lessons bucket" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view feedback screenshots" ON storage.objects;
-- Base-schema rules (repo copies)
DROP POLICY IF EXISTS "Students can upload homework files" ON storage.objects;
DROP POLICY IF EXISTS "Students can view their own homework files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can upload lesson files" ON storage.objects;
-- This migration's own rules, so it can be re-run
DROP POLICY IF EXISTS "Learners upload their own homework files" ON storage.objects;
DROP POLICY IF EXISTS "Learners and their teachers read homework files" ON storage.objects;
DROP POLICY IF EXISTS "Learners update their own homework files" ON storage.objects;
DROP POLICY IF EXISTS "Learners delete their own homework files" ON storage.objects;
DROP POLICY IF EXISTS "Staff upload lesson files" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or admin updates lesson files" ON storage.objects;
DROP POLICY IF EXISTS "Uploader or admin deletes lesson files" ON storage.objects;
DROP POLICY IF EXISTS "Admins read feedback screenshots" ON storage.objects;

CREATE POLICY "Learners upload their own homework files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homework' AND public.can_access_homework_object(name, true));

CREATE POLICY "Learners and their teachers read homework files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homework' AND public.can_access_homework_object(name, false));

CREATE POLICY "Learners update their own homework files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'homework' AND public.can_access_homework_object(name, true))
  WITH CHECK (bucket_id = 'homework' AND public.can_access_homework_object(name, true));

CREATE POLICY "Learners delete their own homework files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'homework' AND public.can_access_homework_object(name, true));

CREATE POLICY "Staff upload lesson files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lessons'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('teacher', 'admin') AND is_approved IS TRUE
    )
  );

CREATE POLICY "Uploader or admin updates lesson files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'lessons' AND (owner = auth.uid() OR public.is_approved_admin()))
  WITH CHECK (bucket_id = 'lessons' AND (owner = auth.uid() OR public.is_approved_admin()));

CREATE POLICY "Uploader or admin deletes lesson files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lessons' AND (owner = auth.uid() OR public.is_approved_admin()));

CREATE POLICY "Admins read feedback screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback' AND public.is_approved_admin());
