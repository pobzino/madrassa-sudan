-- =============================================================================
-- Big Challenge / starting boss generation as a server background job
-- =============================================================================
-- Generating a boss's question pool takes one to two minutes of AI calls. It
-- used to run from the teacher's browser tab in short steps; leaving the page
-- (a phone switching apps) killed it. Now the teacher's tap creates a row here,
-- a Netlify background function (15-minute budget) does the work and writes
-- progress and the outcome back, and the page just polls.
--
-- Server-only table: no client privilege at all; the status route reads it
-- with the service client after its own staff check (the requester, or an
-- approved admin). One active job per (path, kind, week).
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.milestone_generation_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id            uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('milestone','placement')),
  after_week_number  integer NOT NULL CHECK (after_week_number >= 0),
  pool_size          integer NOT NULL CHECK (pool_size BETWEEN 12 AND 32),
  requested_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  progress_done      integer NOT NULL DEFAULT 0 CHECK (progress_done >= 0),
  progress_total     integer NOT NULL DEFAULT 0 CHECK (progress_total >= 0),
  message            text,
  warnings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  milestone_id       uuid REFERENCES public.learning_path_milestones(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  CHECK ((status IN ('done','failed')) = (finished_at IS NOT NULL)),
  CHECK (char_length(coalesce(message, '')) <= 1000)
);
-- One job at a time per boss (a second tap while one runs is refused).
CREATE UNIQUE INDEX IF NOT EXISTS milestone_generation_jobs_one_active
  ON public.milestone_generation_jobs(path_id, kind, after_week_number)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_milestone_generation_jobs_requester
  ON public.milestone_generation_jobs(requested_by, created_at DESC);

ALTER TABLE public.milestone_generation_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.milestone_generation_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.milestone_generation_jobs TO service_role;
DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.milestone_generation_jobs;
CREATE POLICY "Unapproved staff have no staff access" ON public.milestone_generation_jobs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.is_unapproved_staff()))
  WITH CHECK (NOT (SELECT public.is_unapproved_staff()));

-- Fail-closed postcheck
DO $$
DECLARE
  bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                 WHERE c.relname = 'milestone_generation_jobs' AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'milestone_generation_jobs'
                    AND policyname = 'Unapproved staff have no staff access' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'milestone generation jobs migration aborted: RLS / RESTRICTIVE policy missing';
  END IF;
  SELECT string_agg(format('%s can %s', r, priv), '; ') INTO bad
  FROM unnest(ARRAY['authenticated', 'anon']) AS r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS priv
  WHERE has_table_privilege(r, 'public.milestone_generation_jobs', priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'milestone generation jobs migration aborted: client privileges remain: %', bad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'milestone_generation_jobs'
                 AND indexname = 'milestone_generation_jobs_one_active' AND indexdef ~ 'UNIQUE' AND indexdef ~ 'WHERE') THEN
    RAISE EXCEPTION 'milestone generation jobs migration aborted: the one-active-job index is missing';
  END IF;
END;
$$;
