-- Automated emails: a log so each email goes to each person once per period,
-- and per-kind unsubscribes from the recurring summaries. Only the service
-- role (server code) reads or writes these tables.

CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('welcome', 'weekly_progress', 'volunteer_impact')),
  -- "once" for welcomes, "week:2026-10-11" or "month:2026-09" for summaries.
  period_key text NOT NULL,
  resend_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, period_key)
);

CREATE INDEX IF NOT EXISTS idx_email_log_kind_period
  ON public.email_log (kind, period_key);

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('weekly_progress', 'volunteer_impact')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_log, public.email_suppressions FROM anon, authenticated;
GRANT ALL ON TABLE public.email_log, public.email_suppressions TO service_role;
