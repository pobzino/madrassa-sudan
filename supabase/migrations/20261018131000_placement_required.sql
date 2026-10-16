-- =============================================================================
-- The starting boss can be required before lesson 1
-- =============================================================================
-- learning_path_milestones.required: for the path's placement ("Meet your
-- first boss"), whether a child who has done no lesson of the path yet must
-- meet the boss before week 1 opens. Default on. Children who already did
-- lessons are never gated (their baseline is just flagged late), and the app
-- never gates offline (the boss needs internet). Staff switch it per path.
-- Ignored for Big Challenges (kind 'milestone').
--
-- Idempotent; run as ONE transaction. The DO block at the end fails closed.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.learning_path_milestones ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'learning_path_milestones' AND column_name = 'required' AND data_type = 'boolean' AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'placement required migration aborted: the column is missing or nullable';
  END IF;
END;
$$;
