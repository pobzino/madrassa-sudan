-- Marketing email consent is distinct from accepting the terms or privacy policy.
-- New accounts default to no optional email updates unless the adult opts in.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_updates_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_updates_opt_in_at timestamptz;

CREATE OR REPLACE FUNCTION public.apply_email_updates_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  opted_in boolean := false;
BEGIN
  SELECT COALESCE(raw_user_meta_data->>'email_updates_opt_in', '') = 'true'
  INTO opted_in
  FROM auth.users
  WHERE id = NEW.id;

  NEW.email_updates_opt_in := opted_in;
  NEW.email_updates_opt_in_at := CASE WHEN opted_in THEN now() ELSE NULL END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_email_updates_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_email_updates_consent() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS apply_email_updates_consent ON public.profiles;
CREATE TRIGGER apply_email_updates_consent
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_email_updates_consent();
