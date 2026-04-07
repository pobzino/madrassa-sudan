-- Feature flag: gate sim access per user.
-- Default false — manually enable for testers via:
--   UPDATE profiles SET can_access_sims = true WHERE id = '<user-id>';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_access_sims BOOLEAN NOT NULL DEFAULT false;
