-- Child learner profiles. Existing profile UUIDs and learning rows remain stable.
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid,
  ADD COLUMN IF NOT EXISTS parent_account_id uuid,
  ADD COLUMN IF NOT EXISTS learner_name text,
  ADD COLUMN IF NOT EXISTS learner_avatar text;

-- Preserve the historical auth/profile UUID identity while removing the hard
-- requirement that every profile have an auth.users row.
UPDATE public.profiles SET auth_user_id = id WHERE auth_user_id IS NULL;
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'f'
      AND confrelid = 'auth.users'::regclass
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.profiles'::regclass AND attname = 'id')]
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END;
$$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_auth_user_id_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_parent_account_id_fkey') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_parent_account_id_fkey
      FOREIGN KEY (parent_account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_learner_name_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_learner_name_check
      CHECK (learner_name IS NULL OR (length(btrim(learner_name)) BETWEEN 1 AND 60 AND learner_name = btrim(learner_name)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_learner_avatar_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_learner_avatar_check
      CHECK (learner_avatar IS NULL OR learner_avatar IN
        ('cat','dog','lion','elephant','camel','rabbit','turtle','fish','bird','monkey','bear','frog'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_child_shape_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_child_shape_check
      CHECK (parent_account_id IS NULL OR (role = 'student' AND auth_user_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_account_or_child_identity_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_or_child_identity_check
      CHECK (parent_account_id IS NOT NULL OR auth_user_id IS NOT NULL);
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_key ON public.profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_parent_account_id_idx ON public.profiles(parent_account_id, created_at, id);

-- Auth-created account profiles keep id=auth uid. Child profiles have no auth
-- row and therefore leave auth_user_id NULL.
CREATE OR REPLACE FUNCTION public.link_profile_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.parent_account_id IS NULL AND NEW.auth_user_id IS NULL
     AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id) THEN
    NEW.auth_user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.link_profile_auth_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS link_profile_auth_user ON public.profiles;
CREATE TRIGGER link_profile_auth_user BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.link_profile_auth_user();

CREATE OR REPLACE FUNCTION public.validate_child_profile_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_role public.user_role;
DECLARE child_count integer;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.role='parent' AND NEW.role<>'parent'
       AND EXISTS (SELECT 1 FROM public.profiles WHERE parent_account_id=OLD.id) THEN
      RAISE EXCEPTION 'a parent with child profiles must remain a parent' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id THEN
    RAISE EXCEPTION 'child owner cannot be changed' USING ERRCODE='42501';
  END IF;
  IF NEW.role <> 'student' OR NEW.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'child profiles must be non-authenticated students' USING ERRCODE='23514';
  END IF;
  -- Serializes simultaneous inserts for the same family before counting.
  SELECT role INTO owner_role FROM public.profiles WHERE id = NEW.parent_account_id FOR UPDATE;
  IF owner_role IS DISTINCT FROM 'parent' OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id=NEW.parent_account_id AND parent_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'child owner must be a parent account' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' OR OLD.parent_account_id IS DISTINCT FROM NEW.parent_account_id THEN
    SELECT count(*) INTO child_count FROM public.profiles WHERE parent_account_id=NEW.parent_account_id;
    IF child_count >= 8 THEN
      RAISE EXCEPTION 'child profile limit reached' USING ERRCODE='23514', DETAIL='MAX_CHILD_PROFILES_PER_ACCOUNT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_child_profile_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_child_profile_owner ON public.profiles;
CREATE TRIGGER validate_child_profile_owner BEFORE INSERT OR UPDATE
ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_child_profile_owner();

CREATE OR REPLACE FUNCTION public.owns_learner(p_learner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles learner
    WHERE learner.id = p_learner_id AND learner.parent_account_id = auth.uid()
      AND learner.role = 'student' AND learner.auth_user_id IS NULL
      AND EXISTS (SELECT 1 FROM public.profiles owner WHERE owner.id=auth.uid() AND owner.role='parent' AND owner.parent_account_id IS NULL)
  ) OR EXISTS (SELECT 1 FROM public.profiles self WHERE self.id=auth.uid() AND self.id=p_learner_id AND self.parent_account_id IS NULL)
$$;
CREATE OR REPLACE FUNCTION public.can_access_learner(p_learner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.owns_learner(p_learner_id)
$$;
REVOKE ALL ON FUNCTION public.owns_learner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_learner(uuid), public.can_access_learner(uuid) TO authenticated, service_role;

-- Parents may edit only their own learner display fields on child rows. API/RPC
-- is the sole child insert/delete path; protect sensitive columns even if a
-- future policy is accidentally widened.
CREATE OR REPLACE FUNCTION public.guard_parent_child_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND OLD.id=auth.uid()
     AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
          OR NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id) THEN
    RAISE EXCEPTION 'account profile identity cannot be changed' USING ERRCODE='42501';
  END IF;
  IF current_user IN ('authenticated','anon') AND OLD.parent_account_id = auth.uid() THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved OR NEW.can_access_sims IS DISTINCT FROM OLD.can_access_sims
       OR NEW.email_updates_opt_in IS DISTINCT FROM OLD.email_updates_opt_in
       OR NEW.email_updates_opt_in_at IS DISTINCT FROM OLD.email_updates_opt_in_at
       OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
       OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth OR NEW.preferred_language IS DISTINCT FROM OLD.preferred_language
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.privacy_consent_at IS DISTINCT FROM OLD.privacy_consent_at
       OR NEW.privacy_consent_version IS DISTINCT FROM OLD.privacy_consent_version THEN
      RAISE EXCEPTION 'parents may update only child learner fields' USING ERRCODE='42501';
    END IF;
    IF NEW.grade_level IS NOT NULL AND NEW.grade_level NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'child grade is invalid' USING ERRCODE='42501';
    END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name AND NEW.full_name IS DISTINCT FROM NEW.learner_name THEN
      RAISE EXCEPTION 'child full_name must match learner_name' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_parent_child_profile_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_parent_child_profile_update ON public.profiles;
CREATE TRIGGER guard_parent_child_profile_update BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_parent_child_profile_update();

-- Hide the historical globally-readable profile list. Preserve discoverability
-- for a user's own row, owned children, approved cohort teachers/guardians and
-- approved admins without exposing private profile fields across families.
CREATE OR REPLACE FUNCTION public.can_view_profile(p_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_profile_id AND p.parent_account_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id=auth.uid() AND me.role='admin' AND me.is_approved)
    OR EXISTS (SELECT 1 FROM public.profiles me JOIN public.cohort_teachers ct ON ct.teacher_id=me.id
               JOIN public.cohort_students cs ON cs.cohort_id=ct.cohort_id
               WHERE me.id=auth.uid() AND me.role='teacher' AND me.is_approved
                 AND cs.student_id=p_profile_id AND cs.is_active AND cs.status='approved')
    OR EXISTS (SELECT 1 FROM public.guardian_students gs WHERE gs.guardian_id=auth.uid()
               AND gs.student_id=p_profile_id AND gs.is_approved)
$$;
REVOKE ALL ON FUNCTION public.can_view_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles visible to self and verified relationships" ON public.profiles
FOR SELECT TO authenticated USING (public.can_view_profile(id));
DROP POLICY IF EXISTS "Parents can read directly owned child profiles" ON public.profiles;
CREATE POLICY "Parents can read directly owned child profiles" ON public.profiles
FOR SELECT TO authenticated USING (parent_account_id=auth.uid() AND public.owns_learner(id));
DROP POLICY IF EXISTS "Parents can update directly owned child display fields" ON public.profiles;
CREATE POLICY "Parents can update directly owned child display fields" ON public.profiles
FOR UPDATE TO authenticated USING (parent_account_id=auth.uid() AND public.owns_learner(id))
WITH CHECK (parent_account_id=auth.uid() AND public.owns_learner(id));
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (auth.uid()=id AND parent_account_id IS NULL AND auth_user_id=auth.uid());

-- Intake consumption ledger. IDs and ages are committed in the same transaction
-- as the pending child rows so concurrent/repeated first-run requests cannot
-- duplicate them.
ALTER TABLE public.parent_applications
  ADD COLUMN IF NOT EXISTS learner_intake_consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS learner_profile_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS learner_profile_ages integer[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.consume_suggested_children()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_parent uuid := auth.uid();
DECLARE v_role public.user_role;
DECLARE v_app public.parent_applications%ROWTYPE;
DECLARE v_ids uuid[] := '{}';
DECLARE v_ages integer[] := '{}';
DECLARE v_age integer;
DECLARE v_id uuid;
DECLARE v_count integer;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id=v_parent AND parent_account_id IS NULL FOR UPDATE;
  IF v_role IS DISTINCT FROM 'parent' THEN RAISE EXCEPTION 'parent account required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_app FROM public.parent_applications WHERE auth_user_id=v_parent FOR UPDATE;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  IF v_app.learner_intake_consumed_at IS NULL THEN
    SELECT count(*) INTO v_count FROM public.profiles WHERE parent_account_id=v_parent;
    FOREACH v_age IN ARRAY COALESCE(v_app.children_ages, '{}') LOOP
      EXIT WHEN v_count >= 8;
      IF v_age BETWEEN 3 AND 19 THEN
        v_id := gen_random_uuid();
        INSERT INTO public.profiles(id, full_name, learner_name, role, parent_account_id, grade_level, learner_avatar, preferred_language)
        VALUES(v_id, 'Learner', NULL, 'student', v_parent, LEAST(12,GREATEST(1,round(v_age)::integer-5)), NULL, v_app.preferred_language);
        v_ids := array_append(v_ids,v_id); v_ages := array_append(v_ages,v_age); v_count := v_count+1;
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

CREATE OR REPLACE FUNCTION public.create_child_profile(p_name text, p_age integer DEFAULT NULL, p_avatar text DEFAULT NULL)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_parent uuid := auth.uid();
DECLARE v_row public.profiles%ROWTYPE;
DECLARE v_name text := btrim(COALESCE(p_name,''));
BEGIN
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'invalid learner name' USING ERRCODE='22023'; END IF;
  IF p_age IS NOT NULL AND p_age NOT BETWEEN 3 AND 19 THEN RAISE EXCEPTION 'invalid learner age' USING ERRCODE='22023'; END IF;
  IF p_avatar IS NOT NULL AND p_avatar NOT IN ('cat','dog','lion','elephant','camel','rabbit','turtle','fish','bird','monkey','bear','frog') THEN
    RAISE EXCEPTION 'invalid learner avatar' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=v_parent AND role='parent' AND parent_account_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'parent account required' USING ERRCODE='42501'; END IF;
  -- Import legacy signup ages under the same lock, persisting their IDs before
  -- completing the first pending row requested by the parent.
  PERFORM public.consume_suggested_children();
  SELECT * INTO v_row FROM public.profiles WHERE parent_account_id=v_parent AND learner_name IS NULL
    ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.profiles SET learner_name=v_name, full_name=v_name, learner_avatar=p_avatar,
      grade_level=CASE WHEN p_age IS NOT NULL THEN LEAST(12,GREATEST(1,round(p_age)::integer-5)) ELSE grade_level END,
      updated_at=now()
    WHERE id=v_row.id RETURNING * INTO v_row;
    RETURN v_row;
  END IF;
  IF (SELECT count(*) FROM public.profiles WHERE parent_account_id=v_parent) >= 8 THEN
    RAISE EXCEPTION 'child profile limit reached' USING ERRCODE='23514', DETAIL='MAX_CHILD_PROFILES_PER_ACCOUNT';
  END IF;
  INSERT INTO public.profiles(id,full_name,learner_name,learner_avatar,role,parent_account_id,grade_level,preferred_language)
  SELECT gen_random_uuid(),v_name,v_name,p_avatar,'student',v_parent,
    CASE WHEN p_age IS NULL THEN NULL ELSE LEAST(12,GREATEST(1,round(p_age)::integer-5)) END,
    preferred_language FROM public.profiles WHERE id=v_parent
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_child_profile(text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_child_profile(text,integer,text) TO authenticated, service_role;

-- New signups create pending learner rows from validated intake ages. The
-- trigger is independent of handle_new_user so its existing application logic
-- remains intact; reruns are harmless.
CREATE OR REPLACE FUNCTION public.create_signup_child_learners()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_role text;
DECLARE v_parent uuid := NEW.id;
DECLARE v_age integer;
DECLARE v_count integer := 0;
DECLARE v_ages jsonb;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id=v_parent;
  IF v_role <> 'parent' OR EXISTS(SELECT 1 FROM public.profiles WHERE parent_account_id=v_parent) THEN RETURN NEW; END IF;
  v_ages := NEW.raw_user_meta_data #> '{signup_details,parent,children_ages}';
  IF jsonb_typeof(v_ages) <> 'array' THEN RETURN NEW; END IF;
  FOR v_age IN SELECT value::integer FROM jsonb_array_elements_text(v_ages) e(value)
    WHERE CASE WHEN value ~ '^\d{1,2}$' THEN value::integer BETWEEN 3 AND 19 ELSE false END LIMIT 8
  LOOP
    INSERT INTO public.profiles(id,full_name,learner_name,role,parent_account_id,grade_level,preferred_language)
    SELECT gen_random_uuid(),'Learner',NULL,'student',v_parent,LEAST(12,GREATEST(1,round(v_age)::integer-5)),p.preferred_language
    FROM public.profiles p WHERE p.id=v_parent;
    v_count := v_count+1;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not create pending child learners for auth user %: %',v_parent,SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_signup_child_learners() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_create_signup_child_learners ON auth.users;
CREATE TRIGGER zz_create_signup_child_learners AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_signup_child_learners();

-- Child activity is readable through its authenticated parent. These tables
-- are explicitly scoped; cohort membership, guardian invites and contact data
-- do not become visible merely because they also contain a student_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lesson_progress','lesson_question_responses','lesson_slide_responses',
    'lesson_task_responses','homework_submissions','homework_attempts',
    'diagnostic_attempts','student_placements','student_streaks','ai_conversations'
  ] LOOP
    IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','Parents can read owned learners',t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_access_learner(student_id))',
        'Parents can read owned learners',t);
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Parents can read owned diagnostic responses" ON public.diagnostic_responses;
CREATE POLICY "Parents can read owned diagnostic responses" ON public.diagnostic_responses
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.diagnostic_attempts da WHERE da.id=diagnostic_responses.attempt_id
    AND public.can_access_learner(da.student_id)
));
DROP POLICY IF EXISTS "Parents can read owned homework responses" ON public.homework_responses;
CREATE POLICY "Parents can read owned homework responses" ON public.homework_responses
FOR SELECT TO authenticated USING (EXISTS (
  SELECT 1 FROM public.homework_submissions hs WHERE hs.id=homework_responses.submission_id
    AND public.can_access_learner(hs.student_id)
));

-- Practice eligibility is evaluated for the learner on the progress row, never
-- for the parent's account or a sibling. Keep the one-argument function for
-- legacy callers (self learner) and use the explicit overload in the trigger.
CREATE OR REPLACE FUNCTION public.lesson_practice_gate_satisfied(p_lesson_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.learning_path_steps s JOIN public.learning_path_weeks w ON w.id=s.week_id
    JOIN public.learning_paths p ON p.id=w.path_id
    WHERE s.lesson_id=p_lesson_id AND s.practice_assignment_id IS NOT NULL AND p.is_published=true
  ) OR EXISTS (
    SELECT 1 FROM public.homework_submissions hs JOIN public.homework_assignments ha ON ha.id=hs.assignment_id
    WHERE (p_student_id=auth.uid() OR public.owns_learner(p_student_id))
      AND hs.student_id = p_student_id AND hs.status IN ('graded','returned')
      AND hs.score IS NOT NULL AND ha.total_points>0
      AND hs.score >= (COALESCE(ha.passing_score,75)::numeric/100)*ha.total_points
      AND (ha.id IN (SELECT practice_assignment_id FROM public.learning_path_steps WHERE lesson_id=p_lesson_id AND practice_assignment_id IS NOT NULL)
           OR (ha.is_practice=true AND ha.lesson_id=p_lesson_id))
  )
$$;
CREATE OR REPLACE FUNCTION public.lesson_practice_gate_satisfied(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.lesson_practice_gate_satisfied(p_lesson_id, auth.uid())
$$;
REVOKE ALL ON FUNCTION public.lesson_practice_gate_satisfied(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lesson_practice_gate_satisfied(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_practice_gate_satisfied(uuid), public.lesson_practice_gate_satisfied(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_lesson_progress_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id THEN
      RAISE EXCEPTION 'lesson_progress: student_id and lesson_id cannot be changed' USING ERRCODE='42501';
    END IF;
    NEW.tasks_completed := OLD.tasks_completed;
    NEW.required_tasks_completed := OLD.required_tasks_completed;
    NEW.tasks_skipped := OLD.tasks_skipped;
    NEW.tasks_total_score := OLD.tasks_total_score;
  ELSE
    NEW.tasks_completed := 0; NEW.required_tasks_completed := 0; NEW.tasks_skipped := 0; NEW.tasks_total_score := 0;
  END IF;
  IF TG_OP='UPDATE' AND OLD.completed IS TRUE THEN
    NEW.completed := true;
    NEW.completed_at := COALESCE(OLD.completed_at, LEAST(COALESCE(NEW.completed_at,now()),now()));
    RETURN NEW;
  END IF;
  IF NEW.completed IS TRUE THEN
    IF public.lesson_practice_gate_satisfied(NEW.lesson_id, NEW.student_id) THEN
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
DROP TRIGGER IF EXISTS guard_lesson_progress_client_write ON public.lesson_progress;
CREATE TRIGGER guard_lesson_progress_client_write BEFORE INSERT OR UPDATE ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.guard_lesson_progress_client_write();
