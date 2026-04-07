-- =============================================================================
-- USER APPROVAL SYSTEM
-- =============================================================================
-- Adds an is_approved column to profiles so that new teacher and student
-- accounts require admin approval before accessing the platform.
-- Admins are auto-approved. Parents inherit existing behaviour.
-- =============================================================================

-- 1. Add the column (default false — new signups need approval)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- 2. Auto-approve all existing users (they were already using the platform)
UPDATE profiles SET is_approved = true WHERE is_approved = false;

-- 3. Update the handle_new_user trigger to auto-approve admins only
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role public.user_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student');

  INSERT INTO public.profiles (id, full_name, role, preferred_language, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    _role,
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ar'),
    -- Only admins are auto-approved; teachers, students, parents must wait
    _role = 'admin'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Allow admins to update any profile (needed for approval)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Admins can update any profile'
  ) THEN
    CREATE POLICY "Admins can update any profile"
      ON profiles FOR UPDATE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved = true)
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_approved = true)
      );
  END IF;
END $$;

-- 5. Allow admins full select on profiles (already covered by existing policy, but explicit)
-- The existing "Profiles are viewable by authenticated users" policy already allows SELECT for all.

-- 6. Index for quick lookup of pending approvals
CREATE INDEX IF NOT EXISTS idx_profiles_approval_pending
  ON profiles (is_approved, role) WHERE is_approved = false;
