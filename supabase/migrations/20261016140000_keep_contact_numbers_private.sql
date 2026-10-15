-- =============================================================================
-- WhatsApp / phone numbers are no longer readable by every signed-in user
-- =============================================================================
-- "Profiles are viewable by authenticated users" (base schema) is USING (true),
-- and handle_new_user stores the number each parent and volunteer gives at
-- signup in profiles.phone. Any account, including a parent account anyone can
-- create and that is approved at once (20260922000000), could list every
-- family's and volunteer's number through /rest/v1/profiles.
--
-- Names stay in profiles (the app shows them everywhere); the number moves to
-- profile_contacts, which only its owner and approved admins can read. Every
-- write of profiles.phone (handle_new_user at signup, the Settings page's own
-- UPDATE) is moved there by a trigger, so profiles.phone always stays NULL and
-- the existing writers need no change.
--
-- DEPLOY ORDER: ship the app code first (Settings, the admin users list and the
-- data export read profile_contacts, falling back to profiles.phone while this
-- table does not exist), then paste this file. Idempotent.
-- =============================================================================

-- Creating the trigger locks profiles until the end; give up after 3s (nothing
-- is applied) instead of making logins queue behind a slow query.
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.profile_contacts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_contacts ENABLE ROW LEVEL SECURITY;
-- Read-only for clients: numbers are written by the trigger below only.
REVOKE ALL ON TABLE public.profile_contacts FROM anon, authenticated;
GRANT SELECT ON TABLE public.profile_contacts TO authenticated;
GRANT ALL ON TABLE public.profile_contacts TO service_role;

DROP POLICY IF EXISTS "Users read their own contact number" ON public.profile_contacts;
CREATE POLICY "Users read their own contact number"
  ON public.profile_contacts
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Approved admins read contact numbers" ON public.profile_contacts;
CREATE POLICY "Approved admins read contact numbers"
  ON public.profile_contacts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'admin'
        AND p.is_approved = true
    )
  );

-- SECURITY DEFINER: a user saving their own number has no write access to
-- profile_contacts. It only ever writes the row of the profile being saved.
CREATE OR REPLACE FUNCTION public.move_profile_phone_to_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(NEW.phone), '') IS NOT NULL THEN
    INSERT INTO public.profile_contacts (user_id, phone, updated_at)
    VALUES (NEW.id, btrim(NEW.phone), now())
    ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Clearing the number in Settings removes it.
    DELETE FROM public.profile_contacts WHERE user_id = NEW.id;
  END IF;
  NEW.phone := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.move_profile_phone_to_contacts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS move_profile_phone_to_contacts ON public.profiles;
CREATE TRIGGER move_profile_phone_to_contacts
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.move_profile_phone_to_contacts();

-- Backfill: "SET phone = phone" goes through the trigger above, which copies
-- each number into profile_contacts and clears profiles.phone. (Setting it to
-- NULL directly would instead delete the copy.)
UPDATE public.profiles SET phone = phone WHERE phone IS NOT NULL;
