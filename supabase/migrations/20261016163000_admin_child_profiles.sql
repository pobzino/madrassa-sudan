-- Approved admins may exercise child learner profiles under their own account.
-- Ownership is still derived from auth.uid(); no cross-family access is added.

CREATE OR REPLACE FUNCTION public.validate_child_profile_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_role public.user_role;
DECLARE owner_approved boolean;
DECLARE child_count integer;
BEGIN
  IF NEW.parent_account_id IS NULL THEN
    IF TG_OP='UPDATE' AND OLD.role IN ('parent','admin')
       AND (NEW.role NOT IN ('parent','admin') OR (NEW.role='admin' AND NEW.is_approved IS NOT TRUE))
       AND EXISTS (SELECT 1 FROM public.profiles WHERE parent_account_id=OLD.id) THEN
      RAISE EXCEPTION 'an account with child profiles must remain an approved child-profile owner' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_account_id IS DISTINCT FROM OLD.parent_account_id THEN
    RAISE EXCEPTION 'child owner cannot be changed' USING ERRCODE='42501';
  END IF;
  IF NEW.role <> 'student' OR NEW.auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'child profiles must be non-authenticated students' USING ERRCODE='23514';
  END IF;
  SELECT role, is_approved INTO owner_role, owner_approved
    FROM public.profiles WHERE id = NEW.parent_account_id FOR UPDATE;
  IF NOT (owner_role = 'parent' OR (owner_role = 'admin' AND owner_approved IS TRUE)) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id=NEW.parent_account_id AND parent_account_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'child owner must be a parent or approved admin account' USING ERRCODE='23514';
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

CREATE OR REPLACE FUNCTION public.owns_learner(p_learner_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles learner
    WHERE learner.id = p_learner_id AND learner.parent_account_id = auth.uid()
      AND learner.role = 'student' AND learner.auth_user_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles owner WHERE owner.id=auth.uid() AND owner.parent_account_id IS NULL
          AND (owner.role='parent' OR (owner.role='admin' AND owner.is_approved IS TRUE))
      )
  ) OR EXISTS (
    SELECT 1 FROM public.profiles self WHERE self.id=auth.uid() AND self.id=p_learner_id AND self.parent_account_id IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.consume_suggested_children()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_parent uuid := auth.uid();
DECLARE v_role public.user_role;
DECLARE v_approved boolean;
DECLARE v_app public.parent_applications%ROWTYPE;
DECLARE v_ids uuid[] := '{}';
DECLARE v_ages integer[] := '{}';
DECLARE v_existing_ids uuid[] := '{}';
DECLARE v_age integer;
DECLARE v_id uuid;
DECLARE v_index integer := 0;
DECLARE v_count integer;
BEGIN
  SELECT role, is_approved INTO v_role, v_approved FROM public.profiles
    WHERE id=v_parent AND parent_account_id IS NULL FOR UPDATE;
  IF NOT (v_role='parent' OR (v_role='admin' AND v_approved IS TRUE)) THEN
    RAISE EXCEPTION 'parent or approved admin account required' USING ERRCODE='42501';
  END IF;
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

CREATE OR REPLACE FUNCTION public.create_child_profile(p_name text, p_age integer DEFAULT NULL, p_avatar text DEFAULT NULL)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_parent uuid := auth.uid();
DECLARE v_row public.profiles%ROWTYPE;
DECLARE v_role public.user_role;
DECLARE v_approved boolean;
DECLARE v_name text := btrim(COALESCE(p_name,''));
BEGIN
  IF length(v_name) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'invalid learner name' USING ERRCODE='22023'; END IF;
  IF p_age IS NOT NULL AND p_age NOT BETWEEN 3 AND 19 THEN RAISE EXCEPTION 'invalid learner age' USING ERRCODE='22023'; END IF;
  IF p_avatar IS NOT NULL AND p_avatar NOT IN ('cat','dog','lion','elephant','camel','rabbit','turtle','fish','bird','monkey','bear','frog') THEN
    RAISE EXCEPTION 'invalid learner avatar' USING ERRCODE='22023';
  END IF;
  SELECT role, is_approved INTO v_role, v_approved FROM public.profiles
    WHERE id=v_parent AND parent_account_id IS NULL FOR UPDATE;
  IF NOT (v_role='parent' OR (v_role='admin' AND v_approved IS TRUE)) THEN
    RAISE EXCEPTION 'parent or approved admin account required' USING ERRCODE='42501';
  END IF;
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

REVOKE ALL ON FUNCTION public.consume_suggested_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_suggested_children() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_child_profile(text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_child_profile(text,integer,text) TO authenticated, service_role;
