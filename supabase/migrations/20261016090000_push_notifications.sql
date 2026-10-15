-- Web push reminders: each device a family turns reminders on for, and a log
-- so each reminder goes to each person once per period. Only the service
-- role (server code) reads or writes these tables.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.push_log (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('weekly_summary', 'streak_reminder')),
  -- "week:2026-10-11" or "day:2026-10-16".
  period_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, period_key)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions, public.push_log FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions, public.push_log TO service_role;
