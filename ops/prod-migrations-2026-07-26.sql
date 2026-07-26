-- ============================================================================
-- Amal School — production migration bundle (2026-07-26)
-- Run this ONCE in the Supabase dashboard SQL editor for project
-- iibreuwewlaepbfonaov (or let the CLI apply it via `supabase db push`).
--
-- 1. Backfills the migration ledger so future `supabase db push` works
--    (this project's schema predates CLI-managed migrations).
-- 2. Applies the three 2026-07-26 migrations: sign-up application tables +
--    cohort-less Practice assignments; feedback table under version control
--    (no-op if it already exists); legacy task_type enum values.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);

-- Ledger backfill: every migration that shipped before today is already live
-- on this database (the app has been running against it).
INSERT INTO supabase_migrations.schema_migrations (version) VALUES
  ('20260101000000'),
  ('20260216171100'),
  ('20260216191200'),
  ('2026021800000'),
  ('2026022700000'),
  ('20260303000000'),
  ('20260303102000'),
  ('20260315000000'),
  ('20260315100000'),
  ('20260322000000'),
  ('20260329000000'),
  ('20260329010000'),
  ('20260329194500'),
  ('20260329200000'),
  ('20260329223000'),
  ('20260329234500'),
  ('20260401110000'),
  ('20260403140000'),
  ('20260403183000'),
  ('20260403183100'),
  ('20260403233000'),
  ('20260404121000'),
  ('20260404173000'),
  ('20260405000000'),
  ('20260405152116'),
  ('20260405160000'),
  ('20260405203635'),
  ('20260406000000'),
  ('20260406100000'),
  ('20260407000000'),
  ('20260407120000'),
  ('20260407130000'),
  ('20260407140000'),
  ('20260409120000'),
  ('20260411120000'),
  ('20260430000000'),
  ('20260610000000'),
  ('20260611000000'),
  ('20260611100000'),
  ('20260611200000'),
  ('20260712090000'),
  ('20260712091000')
ON CONFLICT (version) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 20260726100000_applications_and_practice.sql
-- ────────────────────────────────────────────────────────────────────────────
-- =============================================================================
-- 1) Sign-up application tables (parents + volunteers)
-- 2) Per-lesson "Practice" assignments for the independent learning-path track
-- =============================================================================

-- ── 1a. Parent sign-up applications ──────────────────────────────────────────
-- Filled by parents at /join/parent. The row is the ops record (reviewed by the
-- team over WhatsApp); an auth account is created alongside it so the parent
-- can log in later. Inserts happen through the API route with the service
-- role, so no INSERT policy is granted to clients.
CREATE TABLE IF NOT EXISTS public.parent_applications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  auth_user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Parent information
  parent_name            text NOT NULL,
  profession             text,
  whatsapp               text NOT NULL,
  email                  text,
  -- Eligibility questions
  sudanese_descent       boolean,
  child_war_affected     boolean,
  missed_schooling       boolean,
  out_of_school          boolean,
  out_of_school_duration text,
  out_of_school_details  text,
  -- Children
  children_count         int NOT NULL DEFAULT 1 CHECK (children_count BETWEEN 1 AND 12),
  children_ages          int[] NOT NULL DEFAULT '{}',
  -- Access & logistics
  can_access_website     boolean,
  can_access_zoom        boolean,
  device_type            text CHECK (device_type IN ('phone','tablet','computer','shared','none')),
  access_notes           text,
  country                text,
  city                   text,
  preferred_language     text NOT NULL DEFAULT 'ar' CHECK (preferred_language IN ('ar','en')),
  -- Consent
  terms_accepted_at      timestamptz,
  -- Ops workflow
  status                 text NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','contacted','enrolled','declined')),
  admin_notes            text
);

CREATE INDEX IF NOT EXISTS idx_parent_applications_status
  ON public.parent_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_applications_auth_user
  ON public.parent_applications (auth_user_id);

ALTER TABLE public.parent_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage parent applications" ON public.parent_applications;
CREATE POLICY "Admins can manage parent applications"
  ON public.parent_applications
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Parents can view their own application" ON public.parent_applications;
CREATE POLICY "Parents can view their own application"
  ON public.parent_applications
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- ── 1b. Volunteer / teacher sign-up applications ─────────────────────────────
-- Pure application record (no auth account) filled at /join/volunteer; the team
-- follows up and invites accepted teaching volunteers to create an account.
CREATE TABLE IF NOT EXISTS public.volunteer_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  name                 text NOT NULL,
  whatsapp             text NOT NULL,
  email                text NOT NULL,
  location_city        text,
  location_country     text,
  education_background text,
  -- teaching / tech / content / operations / outreach / other
  areas                text[] NOT NULL DEFAULT '{}',
  other_area           text,
  hours_per_week       text,
  preferred_language   text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('ar','en')),
  status               text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','contacted','onboarded','declined')),
  admin_notes          text
);

CREATE INDEX IF NOT EXISTS idx_volunteer_applications_status
  ON public.volunteer_applications (status, created_at DESC);

ALTER TABLE public.volunteer_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage volunteer applications" ON public.volunteer_applications;
CREATE POLICY "Admins can manage volunteer applications"
  ON public.volunteer_applications
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 2. Practice assignments (independent track) ──────────────────────────────
-- A "practice" is a cohort-less auto-markable homework assignment attached to a
-- learning-path step. Passing it (>= passing_score %) completes the step for
-- independent-track students. Cohort ("camp") homework is unaffected.

ALTER TABLE public.homework_assignments
  ALTER COLUMN cohort_id DROP NOT NULL;

ALTER TABLE public.homework_assignments
  ADD COLUMN IF NOT EXISTS is_practice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE;

-- A practice must not belong to a cohort; ordinary homework must.
ALTER TABLE public.homework_assignments
  DROP CONSTRAINT IF EXISTS homework_assignments_practice_cohort_check;
ALTER TABLE public.homework_assignments
  ADD CONSTRAINT homework_assignments_practice_cohort_check
  CHECK (is_practice = false OR cohort_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_homework_assignments_practice_lesson
  ON public.homework_assignments (lesson_id) WHERE is_practice = true;

ALTER TABLE public.learning_path_steps
  ADD COLUMN IF NOT EXISTS practice_assignment_id uuid
    REFERENCES public.homework_assignments(id) ON DELETE SET NULL;

-- Any signed-in student can see published practices (they are global content,
-- gated by path unlocking in the app, not by enrollment).
DROP POLICY IF EXISTS "Published practices are viewable" ON public.homework_assignments;
CREATE POLICY "Published practices are viewable"
  ON public.homework_assignments
  FOR SELECT
  TO authenticated
  USING (is_practice = true AND cohort_id IS NULL AND is_published = true);

DROP POLICY IF EXISTS "Published practice questions are viewable" ON public.homework_questions;
CREATE POLICY "Published practice questions are viewable"
  ON public.homework_questions
  FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM homework_assignments
      WHERE is_practice = true AND cohort_id IS NULL AND is_published = true
    )
  );

-- Teachers (any, they are volunteers vetting shared content) and admins can
-- create and edit practices; ordinary cohort homework keeps its existing
-- creator/cohort-scoped policies.
DROP POLICY IF EXISTS "Teachers can create practice assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can create practice assignments"
  ON public.homework_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_practice = true AND cohort_id IS NULL AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Teachers can update practice assignments" ON public.homework_assignments;
CREATE POLICY "Teachers can update practice assignments"
  ON public.homework_assignments
  FOR UPDATE
  TO authenticated
  USING (
    is_practice = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  )
  WITH CHECK (
    is_practice = true
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Teachers can manage practice questions" ON public.homework_questions;
CREATE POLICY "Teachers can manage practice questions"
  ON public.homework_questions
  FOR ALL
  TO authenticated
  USING (
    assignment_id IN (SELECT id FROM homework_assignments WHERE is_practice = true)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  )
  WITH CHECK (
    assignment_id IN (SELECT id FROM homework_assignments WHERE is_practice = true)
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260726100000') ON CONFLICT (version) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 20260726101000_feedback_table.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Staff feedback reports (bug/idea/content), optionally mirrored to GitHub
-- issues by /api/admin/feedback. The table already exists in production (it was
-- created from the dashboard); this migration brings it under version control.
CREATE TABLE IF NOT EXISTS public.feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  user_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category            text NOT NULL,
  title               text NOT NULL,
  description         text NOT NULL,
  page_url            text,
  screenshot_url      text,
  github_issue_number int,
  github_issue_url    text,
  status              text NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Staff can file feedback as themselves.
DROP POLICY IF EXISTS "Staff can insert their own feedback" ON public.feedback;
CREATE POLICY "Staff can insert their own feedback"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- Teachers see their own reports; admins see everything (and can update).
DROP POLICY IF EXISTS "Staff can view feedback" ON public.feedback;
CREATE POLICY "Staff can view feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Reporters and admins can update feedback" ON public.feedback;
CREATE POLICY "Reporters and admins can update feedback"
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260726101000') ON CONFLICT (version) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 20260726102000_task_type_legacy_values.sql
-- ────────────────────────────────────────────────────────────────────────────
-- Legacy task_type values that still exist in production data (and in
-- src/lib/tasks.types.ts LegacyTaskType) but were never added by a migration.
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'matching_pairs';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'sorting_order';

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260726102000') ON CONFLICT (version) DO NOTHING;
