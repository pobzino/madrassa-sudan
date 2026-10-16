-- Child profiles have no corresponding auth.users row. The consent trigger
-- must treat that missing row as an explicit opt-out rather than NULL.
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

  NEW.email_updates_opt_in := COALESCE(opted_in, false);
  NEW.email_updates_opt_in_at := CASE WHEN COALESCE(opted_in, false) THEN now() ELSE NULL END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_email_updates_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_email_updates_consent() TO supabase_auth_admin;
