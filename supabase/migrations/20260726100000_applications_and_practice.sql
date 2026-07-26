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
