CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  safe_role public.user_role;
  parent_details jsonb;
  volunteer_details jsonb;
  child_ages int[] := '{}';
  volunteer_areas text[] := '{}';
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  safe_role := CASE
    WHEN requested_role IN ('student', 'teacher', 'parent')
      THEN requested_role::public.user_role
    ELSE 'student'::public.user_role
  END;

  INSERT INTO public.profiles (
    id,
    full_name,
    role,
    preferred_language,
    phone,
    is_approved
  )
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email),
    safe_role,
    CASE WHEN NEW.raw_user_meta_data->>'preferred_language' = 'en' THEN 'en' ELSE 'ar' END,
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  -- Application persistence must never prevent creation of the auth account.
  BEGIN
    parent_details := NEW.raw_user_meta_data #> '{signup_details,parent}';
    IF safe_role = 'parent' AND jsonb_typeof(parent_details) = 'object' THEN
      SELECT COALESCE(array_agg(age), '{}')
      INTO child_ages
      FROM (
        SELECT value::int AS age
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(parent_details->'children_ages') = 'array'
              THEN parent_details->'children_ages'
            ELSE '[]'::jsonb
          END
        ) AS values_list(value)
        WHERE CASE WHEN value ~ '^\d{1,2}$' THEN value::int BETWEEN 3 AND 19 ELSE false END
        LIMIT 12
      ) valid_ages;

      INSERT INTO public.parent_applications (
        auth_user_id,
        parent_name,
        profession,
        whatsapp,
        email,
        sudanese_descent,
        child_war_affected,
        missed_schooling,
        out_of_school,
        out_of_school_duration,
        out_of_school_details,
        children_count,
        children_ages,
        can_access_website,
        can_access_zoom,
        device_type,
        access_notes,
        country,
        city,
        preferred_language,
        terms_accepted_at
      )
      VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Parent'),
        NULLIF(parent_details->>'profession', ''),
        COALESCE(NULLIF(parent_details->>'whatsapp_number', ''), NULLIF(NEW.raw_user_meta_data->>'phone', '')),
        CASE WHEN NEW.email LIKE 'wa-%@parents.amalschool.app' THEN NULL ELSE NEW.email END,
        CASE parent_details #>> '{eligibility,sudanese_descent}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        CASE parent_details #>> '{eligibility,child_affected_by_war}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        CASE parent_details #>> '{eligibility,child_missed_significant_schooling}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        CASE parent_details #>> '{eligibility,out_of_school}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        NULLIF(parent_details #>> '{eligibility,out_of_school_duration}', ''),
        NULLIF(parent_details #>> '{eligibility,out_of_school_details}', ''),
        CASE
          WHEN parent_details->>'children_count' ~ '^\d{1,2}$'
            THEN LEAST(GREATEST((parent_details->>'children_count')::int, 1), 12)
          ELSE 1
        END,
        child_ages,
        CASE parent_details #>> '{access,can_access_website}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        CASE parent_details #>> '{access,can_access_zoom}' WHEN 'yes' THEN true WHEN 'no' THEN false ELSE NULL END,
        CASE
          WHEN parent_details #>> '{access,device_type}' IN ('phone', 'tablet', 'computer', 'shared', 'none')
            THEN parent_details #>> '{access,device_type}'
          ELSE NULL
        END,
        NULLIF(parent_details #>> '{access,notes}', ''),
        NULLIF(parent_details->>'country', ''),
        NULLIF(parent_details->>'city', ''),
        CASE WHEN NEW.raw_user_meta_data->>'preferred_language' = 'en' THEN 'en' ELSE 'ar' END,
        COALESCE(NEW.created_at, now())
      )
      ON CONFLICT (auth_user_id) WHERE auth_user_id IS NOT NULL DO NOTHING;
    END IF;

    volunteer_details := NEW.raw_user_meta_data #> '{signup_details,teacher_volunteer}';
    IF safe_role = 'teacher' AND jsonb_typeof(volunteer_details) = 'object' THEN
      SELECT COALESCE(array_agg(area), '{}')
      INTO volunteer_areas
      FROM (
        SELECT value AS area
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(volunteer_details->'involvement_areas') = 'array'
              THEN volunteer_details->'involvement_areas'
            ELSE '[]'::jsonb
          END
        ) AS values_list(value)
        WHERE value IN ('teaching', 'tech_platform', 'content_video', 'operations', 'outreach', 'other')
      ) valid_areas;

      INSERT INTO public.volunteer_applications (
        auth_user_id,
        name,
        whatsapp,
        email,
        location_city,
        education_background,
        areas,
        hours_per_week,
        preferred_language
      )
      VALUES (
        NEW.id,
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email),
        COALESCE(NULLIF(volunteer_details->>'whatsapp_number', ''), NULLIF(NEW.raw_user_meta_data->>'phone', '')),
        NEW.email,
        NULLIF(volunteer_details->>'location', ''),
        NULLIF(volunteer_details->>'educational_background', ''),
        volunteer_areas,
        NULLIF(volunteer_details->>'weekly_hours', ''),
        CASE WHEN NEW.raw_user_meta_data->>'preferred_language' = 'ar' THEN 'ar' ELSE 'en' END
      )
      ON CONFLICT (auth_user_id) WHERE auth_user_id IS NOT NULL DO NOTHING;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not persist signup application for auth user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- Expand learner-owned session policies to directly owned child learners while
-- preserving each table's established action limits and staff/guardian paths.
SET LOCAL lock_timeout = '3s';

-- Lesson content access is checked for the selected learner, not the parent
-- account. Cohort rules still use that learner's own approved enrollment.
DROP POLICY IF EXISTS "Students can view their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can view their own lesson progress" ON public.lesson_progress
FOR SELECT TO authenticated USING (
  public.can_access_learner(student_id)
  AND public.can_user_access_published_lesson(student_id, lesson_id)
);
DROP POLICY IF EXISTS "Students can create their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can create their own lesson progress" ON public.lesson_progress
FOR INSERT TO authenticated WITH CHECK (
  public.can_access_learner(student_id)
  AND public.can_user_access_published_lesson(student_id, lesson_id)
);
DROP POLICY IF EXISTS "Students can update their own lesson progress" ON public.lesson_progress;
CREATE POLICY "Students can update their own lesson progress" ON public.lesson_progress
FOR UPDATE TO authenticated USING (
  public.can_access_learner(student_id)
  AND public.can_user_access_published_lesson(student_id, lesson_id)
) WITH CHECK (
  public.can_access_learner(student_id)
  AND public.can_user_access_published_lesson(student_id, lesson_id)
);

-- Existing unrestricted response actions for the signed-in learner now apply
-- to a directly owned child row. The guard below keeps quiz outcome fields
-- server-derived.
DROP POLICY IF EXISTS "Students can manage their own question responses" ON public.lesson_question_responses;
CREATE POLICY "Students can manage their own question responses" ON public.lesson_question_responses
FOR ALL TO authenticated USING (public.can_access_learner(student_id))
WITH CHECK (public.can_access_learner(student_id));

DROP POLICY IF EXISTS "Students manage own slide responses" ON public.lesson_slide_responses;
CREATE POLICY "Students manage own slide responses" ON public.lesson_slide_responses
FOR ALL TO authenticated USING (public.can_access_learner(student_id))
WITH CHECK (public.can_access_learner(student_id));

DROP POLICY IF EXISTS "Students can view their own homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can view their own homework submissions" ON public.homework_submissions
FOR SELECT TO authenticated USING (public.can_access_learner(student_id));
DROP POLICY IF EXISTS "Students can start their own homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can start their own homework submissions" ON public.homework_submissions
FOR INSERT TO authenticated WITH CHECK (
  public.can_access_learner(student_id) AND status IN ('not_started','in_progress')
);
DROP POLICY IF EXISTS "Students can update their own open homework submissions" ON public.homework_submissions;
CREATE POLICY "Students can update their own open homework submissions" ON public.homework_submissions
FOR UPDATE TO authenticated USING (
  public.can_access_learner(student_id) AND status IN ('not_started','in_progress')
) WITH CHECK (
  public.can_access_learner(student_id) AND status IN ('not_started','in_progress')
);

-- Answer policies remain limited to an owned open submission. Teachers keep
-- their separate grading policies; the trigger below applies the draft rules
-- to parents as well as students.
DROP POLICY IF EXISTS "Students can view their own responses" ON public.homework_responses;
CREATE POLICY "Students can view their own responses" ON public.homework_responses
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id)
));
DROP POLICY IF EXISTS "Students can add answers to their own submissions" ON public.homework_responses;
CREATE POLICY "Students can add answers to their own submissions" ON public.homework_responses
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id)
));
DROP POLICY IF EXISTS "Students can edit answers on their own submissions" ON public.homework_responses;
CREATE POLICY "Students can edit answers on their own submissions" ON public.homework_responses
FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id)
));
DROP POLICY IF EXISTS "Students can remove answers on their open submissions" ON public.homework_responses;
CREATE POLICY "Students can remove answers on their open submissions" ON public.homework_responses
FOR DELETE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id) AND hs.status IN ('not_started','in_progress')
));

-- Diagnostics keep the original attempt/response CRUD pathway, but only for
-- the current account's self learner or a child it directly owns.
DROP POLICY IF EXISTS "Students can manage own attempts" ON public.diagnostic_attempts;
CREATE POLICY "Students can manage own attempts" ON public.diagnostic_attempts
FOR ALL TO authenticated USING (public.can_access_learner(student_id))
WITH CHECK (public.can_access_learner(student_id));
DROP POLICY IF EXISTS "Students can manage own responses" ON public.diagnostic_responses;
CREATE POLICY "Students can manage own responses" ON public.diagnostic_responses
FOR ALL TO authenticated USING (EXISTS (
  SELECT 1 FROM public.diagnostic_attempts da WHERE da.id=diagnostic_responses.attempt_id
    AND public.can_access_learner(da.student_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.diagnostic_attempts da WHERE da.id=diagnostic_responses.attempt_id
    AND public.can_access_learner(da.student_id)
));
DROP POLICY IF EXISTS "Students can view their own attempts" ON public.homework_attempts;
CREATE POLICY "Students can view their own attempts" ON public.homework_attempts
FOR SELECT TO authenticated USING (public.can_access_learner(student_id));

DROP POLICY IF EXISTS "Students can manage their own AI conversations" ON public.ai_conversations;
CREATE POLICY "Students can manage their own AI conversations" ON public.ai_conversations
FOR ALL TO authenticated USING (public.can_access_learner(student_id))
WITH CHECK (public.can_access_learner(student_id));
DROP POLICY IF EXISTS "Users can manage messages in their conversations" ON public.ai_messages;
CREATE POLICY "Users can manage messages in their conversations" ON public.ai_messages
FOR ALL TO authenticated USING (EXISTS (
  SELECT 1 FROM public.ai_conversations c WHERE c.id=ai_messages.conversation_id
    AND public.can_access_learner(c.student_id)
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.ai_conversations c WHERE c.id=ai_messages.conversation_id
    AND public.can_access_learner(c.student_id)
));

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
      AND public.can_access_learner(hs.student_id)
      AND q.id = p_question_id
  );
$$;

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
  IF auth.uid() IS NULL OR NOT public.can_access_learner(v_owner) THEN
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
  IF auth.uid() IS NULL OR NOT public.can_access_learner(v_owner) THEN
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

-- Authenticated learner sessions may write answers and watch progress, but
-- cannot provide quiz marks, correctness, diagnostic grades or placement.
CREATE OR REPLACE FUNCTION public.consume_suggested_children()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_parent uuid := auth.uid();
DECLARE v_role public.user_role;
DECLARE v_app public.parent_applications%ROWTYPE;
DECLARE v_ids uuid[] := '{}';
DECLARE v_ages integer[] := '{}';
DECLARE v_existing_ids uuid[] := '{}';
DECLARE v_age integer;
DECLARE v_id uuid;
DECLARE v_index integer := 0;
DECLARE v_count integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id=v_parent AND parent_account_id IS NULL FOR UPDATE;
  IF v_role IS DISTINCT FROM 'parent' THEN RAISE EXCEPTION 'parent account required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_app FROM public.parent_applications WHERE auth_user_id=v_parent FOR UPDATE;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  IF v_app.learner_intake_consumed_at IS NULL THEN
    SELECT COALESCE(array_agg(id ORDER BY created_at,id),'{}') INTO v_existing_ids
    FROM public.profiles WHERE parent_account_id=v_parent;
    v_count := cardinality(v_existing_ids);
    FOREACH v_age IN ARRAY COALESCE(v_app.children_ages, '{}') LOOP
      IF v_age BETWEEN 3 AND 19 THEN
        v_index := v_index+1;
        IF v_index <= cardinality(v_existing_ids) THEN
          -- Covers accounts created during a rolling migration, when the
          -- earlier signup trigger may already have made these pending rows.
          v_id := v_existing_ids[v_index];
        ELSIF v_count < 8 THEN
          v_id := gen_random_uuid();
          INSERT INTO public.profiles(id,full_name,learner_name,role,parent_account_id,grade_level,learner_avatar,preferred_language)
          VALUES(v_id,'Learner',NULL,'student',v_parent,LEAST(12,GREATEST(1,round(v_age)::integer-5)),NULL,v_app.preferred_language);
          v_count := v_count+1;
        ELSE
          EXIT;
        END IF;
        v_ids := array_append(v_ids,v_id);
        v_ages := array_append(v_ages,v_age);
      END IF;
    END LOOP;
    UPDATE public.parent_applications SET learner_profile_ids=v_ids, learner_profile_ages=v_ages,
      learner_intake_consumed_at=now() WHERE id=v_app.id;
  ELSE
    v_ids := v_app.learner_profile_ids; v_ages := v_app.learner_profile_ages;
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.learner_name,'age',a.age,'gradeLevel',p.grade_level)
           ORDER BY ord)
    FROM unnest(v_ids) WITH ORDINALITY AS ids(id,ord)
    JOIN public.profiles p ON p.id=ids.id AND p.parent_account_id=v_parent
    LEFT JOIN LATERAL (SELECT v_ages[ids.ord::integer] AS age) a ON true), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_suggested_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_suggested_children() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_signup_child_learners()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_role text;
DECLARE v_parent uuid := NEW.id;
DECLARE v_age integer;
DECLARE v_ages jsonb;
DECLARE v_id uuid;
DECLARE v_ids uuid[] := '{}';
DECLARE v_saved_ages integer[] := '{}';
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id=v_parent;
  IF v_role <> 'parent' THEN RETURN NEW; END IF;
  -- A repeat trigger invocation must not create another set of learners.
  IF EXISTS(SELECT 1 FROM public.profiles WHERE parent_account_id=v_parent) THEN RETURN NEW; END IF;
  v_ages := NEW.raw_user_meta_data #> '{signup_details,parent,children_ages}';
  IF jsonb_typeof(v_ages) <> 'array' THEN RETURN NEW; END IF;
  FOR v_age IN
    SELECT value::integer FROM jsonb_array_elements_text(v_ages) e(value)
    WHERE CASE WHEN value ~ '^\d{1,2}$' THEN value::integer BETWEEN 3 AND 19 ELSE false END
    LIMIT 8
  LOOP
    INSERT INTO public.profiles(id,full_name,learner_name,role,parent_account_id,grade_level,preferred_language)
    SELECT gen_random_uuid(),'Learner',NULL,'student',v_parent,
      LEAST(12,GREATEST(1,round(v_age)::integer-5)),p.preferred_language
    FROM public.profiles p WHERE p.id=v_parent
    RETURNING id INTO v_id;
    v_ids := array_append(v_ids,v_id);
    v_saved_ages := array_append(v_saved_ages,v_age);
  END LOOP;
  -- Signup-created rows and the intake-consumption marker share this trigger
  -- transaction. The first later create RPC will name these rows without
  -- importing the same signup ages a second time.
  UPDATE public.parent_applications
  SET learner_profile_ids=v_ids, learner_profile_ages=v_saved_ages,
      learner_intake_consumed_at=now()
  WHERE auth_user_id=v_parent AND learner_intake_consumed_at IS NULL;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not create pending child learners for auth user %: %',v_parent,SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_parent_child_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND OLD.id=auth.uid()
     AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
          OR NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id) THEN
    RAISE EXCEPTION 'account profile identity cannot be changed' USING ERRCODE='42501';
  END IF;
  IF current_user IN ('authenticated','anon') AND OLD.parent_account_id=auth.uid() THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved OR NEW.can_access_sims IS DISTINCT FROM OLD.can_access_sims
       OR NEW.email_updates_opt_in IS DISTINCT FROM OLD.email_updates_opt_in
       OR NEW.email_updates_opt_in_at IS DISTINCT FROM OLD.email_updates_opt_in_at
       OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth
       OR NEW.preferred_language IS DISTINCT FROM OLD.preferred_language
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.privacy_consent_at IS DISTINCT FROM OLD.privacy_consent_at
       OR NEW.privacy_consent_version IS DISTINCT FROM OLD.privacy_consent_version THEN
      RAISE EXCEPTION 'parents may update only child learner fields' USING ERRCODE='42501';
    END IF;
    IF NEW.learner_name IS NULL OR NEW.learner_name <> btrim(NEW.learner_name)
       OR length(NEW.learner_name) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'child learner name is required and must be 1-60 characters' USING ERRCODE='22023';
    END IF;
    IF NEW.grade_level IS NOT NULL AND NEW.grade_level NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'child grade is invalid' USING ERRCODE='22023';
    END IF;
    IF NEW.full_name IS DISTINCT FROM NEW.learner_name THEN
      RAISE EXCEPTION 'child full_name must match learner_name' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_lesson_progress_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id THEN
      RAISE EXCEPTION 'lesson_progress: student_id and lesson_id cannot be changed' USING ERRCODE='42501';
    END IF;
    NEW.questions_correct := OLD.questions_correct;
    NEW.quiz_passed := OLD.quiz_passed;
    NEW.quiz_attempts := OLD.quiz_attempts;
    NEW.interactive_slides_correct := OLD.interactive_slides_correct;
    NEW.tasks_completed := OLD.tasks_completed;
    NEW.required_tasks_completed := OLD.required_tasks_completed;
    NEW.tasks_skipped := OLD.tasks_skipped;
    NEW.tasks_total_score := OLD.tasks_total_score;
  ELSE
    NEW.questions_correct := 0;
    NEW.quiz_passed := false;
    NEW.quiz_attempts := 0;
    NEW.interactive_slides_correct := 0;
    NEW.tasks_completed := 0;
    NEW.required_tasks_completed := 0;
    NEW.tasks_skipped := 0;
    NEW.tasks_total_score := 0;
  END IF;
  IF TG_OP='UPDATE' AND OLD.completed IS TRUE THEN
    NEW.completed := true;
    NEW.completed_at := COALESCE(OLD.completed_at,LEAST(COALESCE(NEW.completed_at,now()),now()));
    RETURN NEW;
  END IF;
  IF NEW.completed IS TRUE THEN
    IF public.lesson_practice_gate_satisfied(NEW.lesson_id,NEW.student_id) THEN
      NEW.completed_at := LEAST(COALESCE(NEW.completed_at,now()),now());
    ELSE
      NEW.completed := false; NEW.completed_at := NULL;
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_lesson_question_response_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    NEW.is_correct := false;
    NEW.attempts := 1;
    NEW.attempt_number := 1;
    NEW.attempts_history := '[]'::jsonb;
  ELSE
    IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.question_id IS DISTINCT FROM OLD.question_id THEN
      RAISE EXCEPTION 'lesson_question_responses: learner and question cannot be changed' USING ERRCODE='42501';
    END IF;
    NEW.is_correct := OLD.is_correct;
    NEW.attempts := OLD.attempts+1;
    NEW.attempt_number := COALESCE(OLD.attempt_number,1)+1;
    NEW.attempts_history := COALESCE(OLD.attempts_history,'[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('attempt_number',OLD.attempt_number,'answer',OLD.answer,
        'is_correct',OLD.is_correct,'timestamp',now())
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_lesson_question_response_client_write ON public.lesson_question_responses;
CREATE TRIGGER guard_lesson_question_response_client_write BEFORE INSERT OR UPDATE ON public.lesson_question_responses
FOR EACH ROW EXECUTE FUNCTION public.guard_lesson_question_response_client_write();

CREATE OR REPLACE FUNCTION public.guard_lesson_slide_response_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    NEW.completion_score := 0;
    NEW.is_correct := false;
    NEW.attempts := 1;
  ELSE
    IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
       OR NEW.slide_id IS DISTINCT FROM OLD.slide_id THEN
      RAISE EXCEPTION 'lesson_slide_responses: learner and slide cannot be changed' USING ERRCODE='42501';
    END IF;
    NEW.completion_score := OLD.completion_score;
    NEW.is_correct := OLD.is_correct;
    NEW.attempts := OLD.attempts+1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_lesson_slide_response_client_write ON public.lesson_slide_responses;
CREATE TRIGGER guard_lesson_slide_response_client_write BEFORE INSERT OR UPDATE ON public.lesson_slide_responses
FOR EACH ROW EXECUTE FUNCTION public.guard_lesson_slide_response_client_write();

CREATE OR REPLACE FUNCTION public.guard_diagnostic_attempt_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    NEW.questions_answered := 0; NEW.questions_correct := 0; NEW.recommended_grade := NULL;
    NEW.completed_at := NULL; NEW.is_complete := false;
  ELSE
    IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
      RAISE EXCEPTION 'diagnostic_attempts: learner and subject cannot be changed' USING ERRCODE='42501';
    END IF;
    NEW.questions_answered := OLD.questions_answered;
    NEW.questions_correct := OLD.questions_correct;
    NEW.recommended_grade := OLD.recommended_grade;
    NEW.completed_at := OLD.completed_at;
    NEW.is_complete := OLD.is_complete;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_diagnostic_attempt_client_write ON public.diagnostic_attempts;
CREATE TRIGGER guard_diagnostic_attempt_client_write BEFORE INSERT OR UPDATE ON public.diagnostic_attempts
FOR EACH ROW EXECUTE FUNCTION public.guard_diagnostic_attempt_client_write();

CREATE OR REPLACE FUNCTION public.guard_diagnostic_response_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.question_id IS DISTINCT FROM OLD.question_id) THEN
    RAISE EXCEPTION 'diagnostic_responses: attempt and question cannot be changed' USING ERRCODE='42501';
  END IF;
  NEW.is_correct := false;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_diagnostic_response_client_write ON public.diagnostic_responses;
CREATE TRIGGER guard_diagnostic_response_client_write BEFORE INSERT OR UPDATE ON public.diagnostic_responses
FOR EACH ROW EXECUTE FUNCTION public.guard_diagnostic_response_client_write();

-- Placement grades are computed by the diagnostic completion route with its
-- trusted server role. No user session (parent or student) may set a placement.
CREATE OR REPLACE FUNCTION public.guard_student_placement_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND public.can_access_learner(COALESCE(NEW.student_id,OLD.student_id)) THEN
    RAISE EXCEPTION 'student_placements: placement is set by the server' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_student_placement_client_write ON public.student_placements;
CREATE TRIGGER guard_student_placement_client_write BEFORE INSERT OR UPDATE OR DELETE ON public.student_placements
FOR EACH ROW EXECUTE FUNCTION public.guard_student_placement_client_write();

-- Recreate only missing learner data cascades. Keep each original constraint
-- name and ON UPDATE behavior; deleting a child removes its student_id rows.
DO $$
DECLARE fk record;
DECLARE update_action text;
DECLARE timing text;
BEGIN
  FOR fk IN
    SELECT con.conrelid::regclass AS child_table, con.conname,
           array_agg(a.attname ORDER BY key_col.ordinality) AS columns,
           conf.relname AS target_table,
           array_agg(ra.attname ORDER BY key_col.ordinality) AS target_columns,
           con.confupdtype, con.condeferrable, con.condeferred
    FROM pg_constraint con
    JOIN pg_class conf ON conf.oid=con.confrelid
    JOIN pg_namespace ns ON ns.oid=conf.relnamespace AND ns.nspname='public'
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY key_col(attnum, ordinality) ON true
    JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=key_col.attnum
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY ref_col(attnum, ordinality) ON ref_col.ordinality=key_col.ordinality
    JOIN pg_attribute ra ON ra.attrelid=con.confrelid AND ra.attnum=ref_col.attnum
    WHERE con.contype='f' AND con.confrelid='public.profiles'::regclass
      AND a.attname='student_id' AND con.confdeltype<>'c'
    GROUP BY con.conrelid, con.conname, conf.relname, con.confupdtype, con.condeferrable, con.condeferred
  LOOP
    update_action := CASE fk.confupdtype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT' WHEN 'r' THEN 'RESTRICT' ELSE 'NO ACTION' END;
    timing := CASE WHEN fk.condeferrable THEN ' DEFERRABLE INITIALLY ' || CASE WHEN fk.condeferred THEN 'DEFERRED' ELSE 'IMMEDIATE' END ELSE '' END;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.child_table,fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s) ON UPDATE %s ON DELETE CASCADE%s',
      fk.child_table,fk.conname,
      (SELECT string_agg(format('%I',c),',') FROM unnest(fk.columns) c),
      fk.target_table,
      (SELECT string_agg(format('%I',c),',') FROM unnest(fk.target_columns) c),
      update_action,timing);
  END LOOP;
END;
$$;
