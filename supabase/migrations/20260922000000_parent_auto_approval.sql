-- Parents can access Amal immediately after registration. Volunteer accounts
-- continue to be created with is_approved = false and require admin review.

CREATE OR REPLACE FUNCTION public.auto_approve_parent_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'parent' THEN
    NEW.is_approved := true;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_approve_parent_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_parent_profile() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS auto_approve_parent_profile ON public.profiles;
CREATE TRIGGER auto_approve_parent_profile
  BEFORE INSERT OR UPDATE OF role, is_approved ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_parent_profile();

CREATE OR REPLACE FUNCTION public.prevent_self_profile_access_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.id
    AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved) THEN
    RAISE EXCEPTION 'Users cannot change their own role or approval status';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_self_profile_access_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_self_profile_access_changes() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS prevent_self_profile_access_changes ON public.profiles;
CREATE TRIGGER prevent_self_profile_access_changes
  BEFORE UPDATE OF role, is_approved ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_profile_access_changes();

-- Existing parent profiles should follow the same access policy.
UPDATE public.profiles
SET is_approved = true
WHERE role = 'parent' AND is_approved = false;

-- Synthetic WhatsApp login identifiers cannot receive confirmation emails.
-- Confirm old accounts so parents can sign in immediately, too.
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE raw_user_meta_data->>'role' = 'parent'
  AND email LIKE 'wa-%@parents.amalschool.app'
  AND email_confirmed_at IS NULL;
