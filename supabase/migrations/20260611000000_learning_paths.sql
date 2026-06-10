-- =============================================================================
-- Track B — Duolingo-style gated lesson tree
-- =============================================================================
-- Global, per-subject learning paths: one ordered sequence of weeks per subject,
-- the same for every student. A week groups ~2 lessons (steps) and optionally a
-- "test" homework assignment the student must pass (>= passing_score%) to unlock
-- the next week. Unlock state is computed from the existing lesson_progress and
-- homework_submissions — no per-student path-progress table is needed.
--
-- The test reuses the existing (cohort-scoped) homework system: a week references
-- its test via test_assignment_id, and homework_assignments gains is_test +
-- passing_score. Nothing about existing homework behaviour changes.
-- =============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.learning_paths (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title_ar     TEXT NOT NULL,
  title_en     TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one PUBLISHED path per subject (a draft may coexist briefly).
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_published_path_per_subject
  ON public.learning_paths(subject_id) WHERE is_published = true;

CREATE TABLE IF NOT EXISTS public.learning_path_weeks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id            UUID NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  week_number        INTEGER NOT NULL,
  title_ar           TEXT NOT NULL,
  title_en           TEXT,
  test_assignment_id UUID REFERENCES public.homework_assignments(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (path_id, week_number)
);

CREATE TABLE IF NOT EXISTS public.learning_path_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id    UUID NOT NULL REFERENCES public.learning_path_weeks(id) ON DELETE CASCADE,
  lesson_id  UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  sequence   INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_id, lesson_id),
  UNIQUE (week_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_lpw_path_id ON public.learning_path_weeks(path_id);
CREATE INDEX IF NOT EXISTS idx_lpw_test_assignment ON public.learning_path_weeks(test_assignment_id);
CREATE INDEX IF NOT EXISTS idx_lps_week_id ON public.learning_path_steps(week_id);
CREATE INDEX IF NOT EXISTS idx_lps_lesson_id ON public.learning_path_steps(lesson_id);

-- ── Homework-as-test columns ─────────────────────────────────────────────────

ALTER TABLE public.homework_assignments
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passing_score NUMERIC NOT NULL DEFAULT 80;  -- percent (0–100)

ALTER TABLE public.homework_submissions
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_homework_assignments_is_test
  ON public.homework_assignments(is_test) WHERE is_test = true;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Students read only published paths; teachers/admins manage the global tree.

ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_path_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published learning paths are viewable" ON public.learning_paths;
CREATE POLICY "Published learning paths are viewable"
  ON public.learning_paths
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Teachers can manage learning paths" ON public.learning_paths;
CREATE POLICY "Teachers can manage learning paths"
  ON public.learning_paths
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Learning path weeks follow path visibility" ON public.learning_path_weeks;
CREATE POLICY "Learning path weeks follow path visibility"
  ON public.learning_path_weeks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_paths p
      WHERE p.id = learning_path_weeks.path_id
        AND (
          p.is_published = true
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
          )
        )
    )
  );

DROP POLICY IF EXISTS "Teachers can manage learning path weeks" ON public.learning_path_weeks;
CREATE POLICY "Teachers can manage learning path weeks"
  ON public.learning_path_weeks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "Learning path steps follow path visibility" ON public.learning_path_steps;
CREATE POLICY "Learning path steps follow path visibility"
  ON public.learning_path_steps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_path_weeks w
      JOIN public.learning_paths p ON p.id = w.path_id
      WHERE w.id = learning_path_steps.week_id
        AND (
          p.is_published = true
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
          )
        )
    )
  );

DROP POLICY IF EXISTS "Teachers can manage learning path steps" ON public.learning_path_steps;
CREATE POLICY "Teachers can manage learning path steps"
  ON public.learning_path_steps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- ── updated_at triggers (function defined in base schema) ─────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_learning_paths_updated_at') THEN
    CREATE TRIGGER update_learning_paths_updated_at
      BEFORE UPDATE ON public.learning_paths
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_learning_path_weeks_updated_at') THEN
    CREATE TRIGGER update_learning_path_weeks_updated_at
      BEFORE UPDATE ON public.learning_path_weeks
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
