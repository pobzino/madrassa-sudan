-- Add GDPR consent tracking columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_version text;

-- Backfill existing users with their creation date
UPDATE profiles
SET privacy_consent_at = created_at,
    privacy_consent_version = '2026-02-24'
WHERE privacy_consent_at IS NULL;
