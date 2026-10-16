-- =============================================================================
-- Learning measurement (phase 1), 4/6: schools, classes and who may see a child's progress
-- =============================================================================
-- Owner rule (progress visibility is school / class based). A viewer may see a
-- learner's progress when the viewer is:
--   1. the owning parent account, or the learner themself (adult / self account);
--   2. an approved admin;
--   3. an approved teacher of a CLASS the learner is an approved, active member of;
--   4. an approved school admin of a SCHOOL that contains such a class.
-- Learners in no class are visible to admins and their family only.
-- public.can_view_learner_progress(viewer, learner) is that rule, in one place.
--
-- Classes are the existing cohorts (cohort_students / cohort_teachers, join
-- codes, teacher approval). New here:
--   * schools, school_admins (server-only tables) and cohorts.school_id;
--   * only a child's FAMILY enrols a child in a class (join code, pending until
--     the teacher approves), through enrol_learner_in_class (server route);
--     teachers can approve, decline or remove, never add a child or bring a
--     child back; a family can leave any time and access stops at once;
--   * only an approved admin assigns a class to a school.
-- Self-service (adult) students and teacher-managed adult enrolments behave as before.
--
-- Inert until used: no school exists until an admin creates one, and every
-- current enrolment keeps working. The read policies of battles / answers move
-- to this rule in 20261018124000 (held for the owner's go).
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar     text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 120),
  name_en     text CHECK (name_en IS NULL OR char_length(btrim(name_en)) BETWEEN 1 AND 120),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_admins (
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approved    boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_school_admins_profile ON public.school_admins(profile_id) WHERE approved;

ALTER TABLE public.cohorts ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cohorts_school ON public.cohorts(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cohort_students_member ON public.cohort_students(student_id, cohort_id) WHERE is_active AND status = 'approved';

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schools, public.school_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.schools, public.school_admins TO service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schools', 'school_admins']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Unapproved staff have no staff access" ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT (SELECT public.is_unapproved_staff())) '
      || 'WITH CHECK (NOT (SELECT public.is_unapproved_staff()))', t);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. The access rule
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so read policies can use it (the caller cannot read the
-- class tables it consults). A signed-in caller may only ask about themself.
CREATE OR REPLACE FUNCTION public.can_view_learner_progress(p_viewer uuid, p_learner uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_viewer IS NULL OR p_learner IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND p_viewer IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    -- 1. the family: the owning parent account, or the learner's own (self) account
    SELECT 1 FROM public.profiles l
    WHERE l.id = p_learner
      AND ((l.parent_account_id = p_viewer
            AND EXISTS (SELECT 1 FROM public.profiles o WHERE o.id = p_viewer AND o.role::text = 'parent' AND o.parent_account_id IS NULL))
           OR (l.id = p_viewer AND l.parent_account_id IS NULL))
  ) OR EXISTS (
    -- 2. an approved admin
    SELECT 1 FROM public.profiles a WHERE a.id = p_viewer AND a.role::text = 'admin' AND a.is_approved = true
  ) OR EXISTS (
    -- 3. an approved teacher of a class the learner is an approved, active member of
    SELECT 1
    FROM public.cohort_students cs
    JOIN public.cohort_teachers ct ON ct.cohort_id = cs.cohort_id AND ct.teacher_id = p_viewer
    JOIN public.profiles t ON t.id = p_viewer AND t.role::text IN ('teacher', 'admin') AND t.is_approved = true
    WHERE cs.student_id = p_learner AND cs.is_active = true AND cs.status = 'approved'
  ) OR EXISTS (
    -- 4. an approved school admin of a school that contains such a class
    SELECT 1
    FROM public.cohort_students cs
    JOIN public.cohorts c ON c.id = cs.cohort_id AND c.school_id IS NOT NULL
    JOIN public.school_admins sa ON sa.school_id = c.school_id AND sa.profile_id = p_viewer AND sa.approved = true
    JOIN public.schools s ON s.id = c.school_id AND s.is_active
    WHERE cs.student_id = p_learner AND cs.is_active = true AND cs.status = 'approved'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_view_learner_progress(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_learner_progress(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Consent: only a child's family enrols a child; teachers approve
-- -----------------------------------------------------------------------------
-- Client writes (a teacher's cohort page, any policy present or future) on a
-- CHILD profile's enrolment: no insert, no bringing a removed / left child back,
-- and approval only of a pending request. The family's join (server, service
-- role) and SECURITY DEFINER paths are not client writes.
-- Whether a profile is a child (family-owned) learner. SECURITY DEFINER because
-- the guard below runs as the client, who usually cannot read that profile; it
-- reveals one bit and nothing else.
CREATE OR REPLACE FUNCTION public.is_child_learner(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_profile AND p.parent_account_id IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.is_child_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_child_learner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_cohort_student_child_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_child_learner(NEW.student_id) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'cohort_students: only the child''s family can enrol a child in a class (join code)' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_active IS TRUE AND OLD.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'cohort_students: a child who left or was removed can only come back when the family asks again' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' AND OLD.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'cohort_students: only a pending request from the family can be approved' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_cohort_student_child_consent() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_cohort_student_child_consent ON public.cohort_students;
CREATE TRIGGER guard_cohort_student_child_consent
  BEFORE INSERT OR UPDATE ON public.cohort_students
  FOR EACH ROW EXECUTE FUNCTION public.guard_cohort_student_child_consent();

-- Only an approved admin puts a class in a school (it gives that school's admins access).
CREATE OR REPLACE FUNCTION public.guard_cohort_school_client_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_approved_admin() THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.school_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.school_id IS DISTINCT FROM OLD.school_id) THEN
    RAISE EXCEPTION 'cohorts: only an approved admin can put a class in a school' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_cohort_school_client_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_cohort_school_client_write ON public.cohorts;
CREATE TRIGGER guard_cohort_school_client_write
  BEFORE INSERT OR UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.guard_cohort_school_client_write();

-- -----------------------------------------------------------------------------
-- 4. Server functions (SECURITY INVOKER, service_role only; the server passes
--    the signed-in account as p_actor). Error tokens:
--    learner_forbidden | invalid_code | already_member | not_found | class_forbidden | invalid_query
-- -----------------------------------------------------------------------------
-- The account that may enrol / withdraw a learner: the owning parent, or the learner's own self account.
CREATE OR REPLACE FUNCTION public.measurement_is_family(p_actor uuid, p_learner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles l
    WHERE l.id = p_learner AND l.role::text = 'student'
      AND ((l.parent_account_id = p_actor
            AND EXISTS (SELECT 1 FROM public.profiles o WHERE o.id = p_actor AND o.role::text = 'parent' AND o.parent_account_id IS NULL))
           OR (l.id = p_actor AND l.parent_account_id IS NULL)));
$$;

-- A learner's classes, for the family (pending requests and active memberships).
CREATE OR REPLACE FUNCTION public.learner_classes(p_actor uuid, p_learner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.measurement_is_family(p_actor, p_learner) THEN
    RAISE EXCEPTION 'learner_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('classes', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'cohortId', c.id, 'name', c.name, 'schoolName', coalesce(s.name_en, s.name_ar),
             'teacherNames', coalesce((SELECT jsonb_agg(coalesce(nullif(btrim(tp.full_name), ''), 'Teacher') ORDER BY ct.is_primary DESC, tp.full_name)
                                       FROM public.cohort_teachers ct JOIN public.profiles tp ON tp.id = ct.teacher_id
                                       WHERE ct.cohort_id = c.id), '[]'::jsonb),
             'status', CASE WHEN cs.status = 'approved' THEN 'active' ELSE 'pending' END,
             'joinedAt', CASE WHEN cs.status = 'approved' THEN cs.enrolled_at END)
           ORDER BY cs.status = 'pending', c.name)
    FROM public.cohort_students cs
    JOIN public.cohorts c ON c.id = cs.cohort_id
    LEFT JOIN public.schools s ON s.id = c.school_id
    WHERE cs.student_id = p_learner AND cs.is_active = true AND cs.status IN ('pending', 'approved')), '[]'::jsonb));
END;
$$;

-- The family asks to join a class by its join code: a pending request the teacher approves.
CREATE OR REPLACE FUNCTION public.enrol_learner_in_class(p_actor uuid, p_learner uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cohort public.cohorts%ROWTYPE;
  v_row    public.cohort_students%ROWTYPE;
  v_code   text := lower(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));
BEGIN
  IF NOT public.measurement_is_family(p_actor, p_learner) THEN
    RAISE EXCEPTION 'learner_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_code !~ '^[a-z0-9-]{4,32}$' THEN
    RAISE EXCEPTION 'invalid_code' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_cohort FROM public.cohorts WHERE lower(join_code) = v_code AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_code' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('enrol:' || p_learner::text || ':' || v_cohort.id::text, 0));

  SELECT * INTO v_row FROM public.cohort_students WHERE cohort_id = v_cohort.id AND student_id = p_learner FOR UPDATE;
  IF FOUND AND v_row.is_active AND v_row.status IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'already_member' USING ERRCODE = '23505';
  END IF;
  IF FOUND THEN
    -- left, removed or declined before: the family asks again
    UPDATE public.cohort_students SET status = 'pending', is_active = true, enrolled_at = now()
     WHERE id = v_row.id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.cohort_students (cohort_id, student_id, status, is_active)
    VALUES (v_cohort.id, p_learner, 'pending', true) RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('cohortId', v_cohort.id, 'name', v_cohort.name, 'status', 'pending', 'requestId', v_row.id);
END;
$$;

-- The family leaves a class (a pending request or an active membership): access stops at once.
CREATE OR REPLACE FUNCTION public.leave_class(p_actor uuid, p_learner uuid, p_cohort uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.measurement_is_family(p_actor, p_learner) THEN
    RAISE EXCEPTION 'learner_forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.cohort_students SET is_active = false
   WHERE cohort_id = p_cohort AND student_id = p_learner AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- A class teacher (approved) or an approved admin approves or declines a pending join request.
CREATE OR REPLACE FUNCTION public.decide_class_request(p_actor uuid, p_cohort uuid, p_request uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.cohort_students%ROWTYPE;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'invalid_query' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = p_actor AND a.is_approved = true
                   AND (a.role::text = 'admin'
                        OR (a.role::text = 'teacher' AND EXISTS (SELECT 1 FROM public.cohort_teachers ct
                                                                 WHERE ct.cohort_id = p_cohort AND ct.teacher_id = p_actor)))) THEN
    RAISE EXCEPTION 'class_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.cohort_students WHERE id = p_request AND cohort_id = p_cohort FOR UPDATE;
  IF NOT FOUND OR NOT v_row.is_active OR v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_decision = 'approve' THEN
    UPDATE public.cohort_students SET status = 'approved' WHERE id = v_row.id RETURNING * INTO v_row;
  ELSE
    UPDATE public.cohort_students SET status = 'rejected', is_active = false WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('requestId', v_row.id, 'status', CASE WHEN v_row.status = 'approved' THEN 'active' ELSE 'declined' END);
END;
$$;

REVOKE ALL ON FUNCTION public.measurement_is_family(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.learner_classes(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enrol_learner_in_class(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leave_class(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_class_request(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_is_family(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.learner_classes(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enrol_learner_in_class(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.leave_class(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.decide_class_request(uuid, uuid, uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Fail-closed postcheck
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(t, ', ') INTO bad FROM unnest(ARRAY['schools', 'school_admins']) AS t
  WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                    WHERE c.relname = t AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t
                    AND p.policyname = 'Unapproved staff have no staff access' AND p.permissive = 'RESTRICTIVE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement schools migration aborted: RLS / RESTRICTIVE policy missing on: %', bad;
  END IF;
  SELECT string_agg(format('%s can %s %s', r, priv, t), '; ') INTO bad
  FROM unnest(ARRAY['schools', 'school_admins']) AS t, unnest(ARRAY['authenticated', 'anon']) AS r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS priv
  WHERE has_table_privilege(r, format('public.%I', t), priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement schools migration aborted: client privileges remain: %', bad;
  END IF;

  SELECT string_agg(DISTINCT p.oid::regprocedure::text, '; ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname IN ('measurement_is_family', 'learner_classes', 'enrol_learner_in_class', 'leave_class', 'decide_class_request',
                      'guard_cohort_student_child_consent', 'guard_cohort_school_client_write')
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR has_function_privilege('anon', p.oid, 'EXECUTE')
         OR EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
         OR p.prosecdef);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement schools migration aborted: callable by clients or SECURITY DEFINER: %', bad;
  END IF;
  -- The one SECURITY DEFINER function: signed-in callers (policies) may use it, anon / PUBLIC may not.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = 'can_view_learner_progress') <> 1
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.can_view_learner_progress(uuid, uuid)'::regprocedure)
     OR has_function_privilege('anon', 'public.can_view_learner_progress(uuid, uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = 'public.can_view_learner_progress(uuid, uuid)'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'measurement schools migration aborted: can_view_learner_progress is missing, not SECURITY DEFINER, or open to anon / PUBLIC';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cohort_students'::regclass AND tgname = 'guard_cohort_student_child_consent' AND tgenabled <> 'D')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cohorts'::regclass AND tgname = 'guard_cohort_school_client_write' AND tgenabled <> 'D') THEN
    RAISE EXCEPTION 'measurement schools migration aborted: a consent / school guard trigger is missing or disabled';
  END IF;
  IF has_function_privilege('anon', 'public.is_child_learner(uuid)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = 'public.is_child_learner(uuid)'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'measurement schools migration aborted: is_child_learner is open to anon / PUBLIC';
  END IF;
  IF public.can_view_learner_progress(NULL, NULL) THEN
    RAISE EXCEPTION 'measurement schools migration aborted: can_view_learner_progress(NULL, NULL) is true';
  END IF;
END;
$$;
