-- =============================================================================
-- Version history for lesson sim recordings
-- =============================================================================
-- Every write to lesson_sims used to be destructive: re-recording replaced the
-- row AND deleted the old audio object, and splicing a patch rewrote the event
-- timeline in place. A tutor who made things worse had no way back.
--
-- This adds an append-only history. A trigger snapshots the PREVIOUS state of a
-- sim on every UPDATE and on DELETE, so `lesson_sims` always holds the live
-- version and `lesson_sim_versions` holds every state it had before. The
-- trigger is SECURITY DEFINER so no code path (route handler, service client,
-- SQL console) can bypass it.
--
-- Audio is referenced, not copied: the routes must stop removing audio objects
-- that a version still points at (see audio_retained).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_sim_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id         uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  -- The sim this state belonged to. Nulled rather than deleted when the sim is
  -- removed, so the history of a deleted recording survives.
  sim_id            uuid REFERENCES public.lesson_sims(id) ON DELETE SET NULL,
  version_number    int NOT NULL,
  -- Snapshot of the sim as it was.
  duration_ms       int NOT NULL,
  deck_snapshot     jsonb NOT NULL,
  events            jsonb NOT NULL,
  audio_path        text,
  audio_duration_ms int,
  audio_mime        text,
  clip_segments     jsonb,
  -- Why this state was superseded: recorded | patched | edited | restored |
  -- replaced | deleted. Free text so new flows don't need a migration.
  reason            text NOT NULL DEFAULT 'edited',
  -- False once the audio object has been pruned for storage; the row remains as
  -- an audit record but can no longer be restored.
  audio_retained    boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_lesson_sim_versions_lesson
  ON public.lesson_sim_versions (lesson_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_sim_versions_sim
  ON public.lesson_sim_versions (sim_id);

-- ── Snapshot trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_lesson_sim_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number int;
  snapshot_reason text;
BEGIN
  -- Only snapshot when something worth keeping actually changed.
  IF TG_OP = 'UPDATE'
     AND OLD.events IS NOT DISTINCT FROM NEW.events
     AND OLD.audio_path IS NOT DISTINCT FROM NEW.audio_path
     AND OLD.duration_ms IS NOT DISTINCT FROM NEW.duration_ms
     AND OLD.clip_segments IS NOT DISTINCT FROM NEW.clip_segments
     AND OLD.deck_snapshot IS NOT DISTINCT FROM NEW.deck_snapshot THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_number
    FROM public.lesson_sim_versions
   WHERE lesson_id = OLD.lesson_id;

  -- A caller can name the reason for the current transaction
  -- (SET LOCAL app.sim_change_reason = 'restored'); otherwise infer it.
  snapshot_reason := NULLIF(current_setting('app.sim_change_reason', true), '');
  IF snapshot_reason IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      snapshot_reason := 'deleted';
    ELSIF OLD.audio_path IS DISTINCT FROM NEW.audio_path THEN
      snapshot_reason := 'patched';
    ELSE
      snapshot_reason := 'edited';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    snapshot_reason := 'deleted';
  END IF;

  INSERT INTO public.lesson_sim_versions (
    lesson_id, sim_id, version_number, duration_ms, deck_snapshot, events,
    audio_path, audio_duration_ms, audio_mime, clip_segments, reason, created_by
  ) VALUES (
    OLD.lesson_id, OLD.id, next_number, OLD.duration_ms, OLD.deck_snapshot, OLD.events,
    OLD.audio_path, OLD.audio_duration_ms, OLD.audio_mime, OLD.clip_segments,
    snapshot_reason, OLD.recorded_by
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_sims_snapshot_update ON public.lesson_sims;
CREATE TRIGGER trg_lesson_sims_snapshot_update
  BEFORE UPDATE ON public.lesson_sims
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_lesson_sim_version();

-- BEFORE DELETE so the snapshot's sim_id FK still resolves; the ON DELETE SET
-- NULL then clears it as the row goes.
DROP TRIGGER IF EXISTS trg_lesson_sims_snapshot_delete ON public.lesson_sims;
CREATE TRIGGER trg_lesson_sims_snapshot_delete
  BEFORE DELETE ON public.lesson_sims
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_lesson_sim_version();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.lesson_sim_versions ENABLE ROW LEVEL SECURITY;

-- Staff can read the history of lessons they can manage. Writes only ever come
-- from the SECURITY DEFINER trigger, so no INSERT/UPDATE policy is granted.
DROP POLICY IF EXISTS "Staff can view sim history" ON public.lesson_sim_versions;
CREATE POLICY "Staff can view sim history"
  ON public.lesson_sim_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- Admins can prune history rows (and flip audio_retained) if needed.
DROP POLICY IF EXISTS "Admins can manage sim history" ON public.lesson_sim_versions;
CREATE POLICY "Admins can manage sim history"
  ON public.lesson_sim_versions
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Restore ──────────────────────────────────────────────────────────────────
-- Restoring must be atomic: label the snapshot the trigger is about to take,
-- then overwrite the live sim from the chosen version, in ONE transaction.
-- (A separate "set the reason" round trip cannot work — PostgREST gives every
-- request its own transaction, so SET LOCAL would not survive to the UPDATE.)
--
-- SECURITY DEFINER: callers are authorized in the route handler
-- (assertCanManageLesson + draft-only), matching the other sim write paths.
CREATE OR REPLACE FUNCTION public.restore_lesson_sim_version(
  p_lesson_id uuid,
  p_version_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  target_sim uuid;
BEGIN
  SELECT * INTO v
    FROM public.lesson_sim_versions
   WHERE id = p_version_id AND lesson_id = p_lesson_id;

  IF v IS NULL THEN
    RAISE EXCEPTION 'Version not found for this lesson' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v.audio_retained THEN
    RAISE EXCEPTION 'This version''s audio has been pruned and cannot be restored'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT id INTO target_sim FROM public.lesson_sims WHERE lesson_id = p_lesson_id;
  IF target_sim IS NULL THEN
    RAISE EXCEPTION 'This lesson has no recording to restore into'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.sim_change_reason', 'restored', true);

  UPDATE public.lesson_sims SET
    duration_ms       = v.duration_ms,
    deck_snapshot     = v.deck_snapshot,
    events            = v.events,
    audio_path        = v.audio_path,
    audio_duration_ms = v.audio_duration_ms,
    audio_mime        = v.audio_mime,
    clip_segments     = v.clip_segments,
    updated_at        = now()
  WHERE id = target_sim;

  RETURN target_sim;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_lesson_sim_version(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.restore_lesson_sim_version(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.restore_lesson_sim_version(uuid, uuid) FROM authenticated;
