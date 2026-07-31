-- =============================================================================
-- Error log tracking
-- =============================================================================
-- Errors currently disappear: ~170 console.error calls go to the hosting
-- provider's function logs (server) or nowhere at all (browser). Nobody can
-- answer "is anything broken for tutors in the camps right now?", and the
-- people hitting the failures — children on phones, volunteer tutors — cannot
-- report them usefully.
--
-- This stores errors where the team can query them. Deliberately NOT a
-- general-purpose event log: no lesson content, no answers, no message bodies.
-- The platform serves children under a GDPR privacy policy, so what lands here
-- is limited to diagnostics (what broke, where, which release) plus the user id
-- needed to tell "one tutor is stuck" from "everyone is stuck".
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  -- 'server' (API route / server action) or 'client' (browser).
  source       text NOT NULL CHECK (source IN ('server', 'client')),
  level        text NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'fatal')),
  -- Stable hash of (message + top stack frame), so repeats group together.
  fingerprint  text NOT NULL,
  message      text NOT NULL,
  stack        text,
  -- Where it happened: API route path or browser pathname.
  route        text,
  http_method  text,
  status_code  int,
  -- Which deploy, so a spike can be tied to a release (NEXT_PUBLIC_RUNTIME_VERSION).
  release      text,
  user_agent   text,
  -- Nulled rather than deleted with the user: the diagnosis outlives the account.
  user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_role    text,
  -- Small sanitised bag of ids/flags. Never free text from users.
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Ops workflow, so the team can triage without a separate tracker.
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_error_logs_recent ON public.error_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON public.error_logs (fingerprint, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved
  ON public.error_logs (occurred_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Writes only ever come from the server (service role), so no INSERT policy is
-- granted to clients: a browser reports errors through /api/errors, which
-- sanitises and rate-limits first. Reading is admin-only — these rows name
-- which user hit which failure.
DROP POLICY IF EXISTS "Admins can read error logs" ON public.error_logs;
CREATE POLICY "Admins can read error logs"
  ON public.error_logs
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can triage error logs" ON public.error_logs;
CREATE POLICY "Admins can triage error logs"
  ON public.error_logs
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Grouped view for triage ──────────────────────────────────────────────────
-- "What is broken, how often, since when" without scrolling raw rows.
CREATE OR REPLACE VIEW public.error_log_groups
WITH (security_invoker = true) AS
SELECT
  fingerprint,
  min(occurred_at)                                   AS first_seen,
  max(occurred_at)                                   AS last_seen,
  count(*)                                           AS occurrences,
  count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS affected_users,
  (array_agg(message ORDER BY occurred_at DESC))[1]  AS latest_message,
  (array_agg(route ORDER BY occurred_at DESC))[1]    AS latest_route,
  (array_agg(source ORDER BY occurred_at DESC))[1]   AS source,
  (array_agg(release ORDER BY occurred_at DESC))[1]  AS latest_release,
  bool_and(resolved_at IS NOT NULL)                  AS resolved
FROM public.error_logs
GROUP BY fingerprint;

-- ── Retention ────────────────────────────────────────────────────────────────
-- Diagnostics age out fast; keeping them forever grows a table nobody reads and
-- retains user ids longer than needed. Resolved rows go sooner.
CREATE OR REPLACE FUNCTION public.prune_error_logs(
  keep_days int DEFAULT 30,
  keep_resolved_days int DEFAULT 7
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed int;
BEGIN
  DELETE FROM public.error_logs
   WHERE occurred_at < now() - make_interval(days => keep_days)
      OR (resolved_at IS NOT NULL AND resolved_at < now() - make_interval(days => keep_resolved_days));
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_error_logs(int, int) FROM public, anon, authenticated;
