-- =============================================================================
-- Homework Engagement: instant feedback toggle + hints system
-- =============================================================================

-- Teachers can enable instant feedback per assignment (MC & T/F auto-checked)
ALTER TABLE public.homework_assignments
  ADD COLUMN IF NOT EXISTS show_instant_feedback BOOLEAN NOT NULL DEFAULT false;

-- Per-question progressive hints (JSON array of strings)
ALTER TABLE public.homework_questions
  ADD COLUMN IF NOT EXISTS hints JSONB NOT NULL DEFAULT '[]'::jsonb;
