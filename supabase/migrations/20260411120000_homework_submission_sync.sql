-- Keep homework submissions in sync with published assignments and active
-- cohort enrollments so late-added students don't miss assignments.

CREATE OR REPLACE FUNCTION public.sync_homework_submissions_for_assignment_row(
  assignment_row public.homework_assignments
)
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
  ON CONFLICT (assignment_id, student_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_homework_submissions_for_cohort_student_row(
  cohort_student_row public.cohort_students
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT cohort_student_row.is_active THEN
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

CREATE OR REPLACE FUNCTION public.handle_homework_assignment_submission_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_homework_submissions_for_assignment_row(NEW);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_cohort_student_submission_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_homework_submissions_for_cohort_student_row(NEW);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_homework_submissions_for_assignment_trigger ON public.homework_assignments;
CREATE TRIGGER sync_homework_submissions_for_assignment_trigger
AFTER INSERT OR UPDATE OF is_published, cohort_id
ON public.homework_assignments
FOR EACH ROW
WHEN (NEW.is_published = true)
EXECUTE FUNCTION public.handle_homework_assignment_submission_sync();

DROP TRIGGER IF EXISTS sync_homework_submissions_for_cohort_student_trigger ON public.cohort_students;
CREATE TRIGGER sync_homework_submissions_for_cohort_student_trigger
AFTER INSERT OR UPDATE OF is_active, cohort_id
ON public.cohort_students
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.handle_cohort_student_submission_sync();

-- Backfill any existing active students who should already have submissions.
INSERT INTO public.homework_submissions (assignment_id, student_id, status)
SELECT ha.id, cs.student_id, 'not_started'
FROM public.homework_assignments ha
JOIN public.cohort_students cs
  ON cs.cohort_id = ha.cohort_id
WHERE ha.is_published = true
  AND cs.is_active = true
ON CONFLICT (assignment_id, student_id) DO NOTHING;
