-- Event-sourced "sim" recordings for lessons.
--
-- A sim replaces video files with:
--   deck_snapshot: frozen copy of the slide deck at record time
--   events:        ordered array of timestamped UI events (strokes, slide changes, reveals, ...)
--   audio_path:    key into the sim-audio storage bucket
--
-- Playback reconstructs state from events at any `t`, so the student UI is
-- fully interactive and bandwidth is a fraction of the equivalent MP4.

-- =============================================================================
-- 1. Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.lesson_sims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  deck_snapshot JSONB NOT NULL,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_path TEXT,
  audio_duration_ms INTEGER,
  audio_mime TEXT,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, version)
);

CREATE INDEX IF NOT EXISTS idx_lesson_sims_lesson_published
  ON public.lesson_sims(lesson_id, published);

CREATE INDEX IF NOT EXISTS idx_lesson_sims_recorded_by
  ON public.lesson_sims(recorded_by);

-- Keep updated_at fresh on UPDATE. The `update_updated_at_column` function is
-- defined in the base schema.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_lesson_sims_updated_at'
  ) THEN
    CREATE TRIGGER update_lesson_sims_updated_at
      BEFORE UPDATE ON public.lesson_sims
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- 2. Row Level Security
-- =============================================================================

ALTER TABLE public.lesson_sims ENABLE ROW LEVEL SECURITY;

-- Students can read published sims for lessons they're allowed to see. The
-- same permissive rule the app uses for other lesson-scoped reads: if the
-- lesson is published OR they created it OR they're an admin.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_sims'
      AND policyname = 'Students can view published sims'
  ) THEN
    CREATE POLICY "Students can view published sims"
      ON public.lesson_sims FOR SELECT
      USING (
        published = true AND EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id = lesson_sims.lesson_id
            AND (
              l.is_published = true
              OR l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

-- Teachers who own the lesson (and admins) can do anything with its sims.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_sims'
      AND policyname = 'Teachers manage their lesson sims'
  ) THEN
    CREATE POLICY "Teachers manage their lesson sims"
      ON public.lesson_sims FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id = lesson_sims.lesson_id
            AND (
              l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id = lesson_sims.lesson_id
            AND (
              l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 3. playback_mode on lessons
-- =============================================================================

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS playback_mode TEXT NOT NULL DEFAULT 'video';

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_playback_mode_check;

ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_playback_mode_check
  CHECK (playback_mode IN ('video', 'sim'));

-- =============================================================================
-- 4. Storage bucket: sim-audio (private)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('sim-audio', 'sim-audio', false)
  ON CONFLICT (id) DO NOTHING;

-- Teachers (owners of a lesson) can upload audio for that lesson. Path
-- convention: <lesson_id>/<sim_id>.webm, so the first folder segment is
-- the lesson_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Teachers upload sim audio for their lessons'
  ) THEN
    CREATE POLICY "Teachers upload sim audio for their lessons"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'sim-audio'
        AND EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id::text = (storage.foldername(name))[1]
            AND (
              l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Teachers update sim audio for their lessons'
  ) THEN
    CREATE POLICY "Teachers update sim audio for their lessons"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'sim-audio'
        AND EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id::text = (storage.foldername(name))[1]
            AND (
              l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Teachers delete sim audio for their lessons'
  ) THEN
    CREATE POLICY "Teachers delete sim audio for their lessons"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'sim-audio'
        AND EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id::text = (storage.foldername(name))[1]
            AND (
              l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

-- Reads go through signed URLs minted by the server (service role), so there
-- is deliberately no SELECT policy for anonymous or authenticated clients.

-- =============================================================================
-- 5. Widen lesson_slide_responses.interaction_type to cover all activity kinds
-- =============================================================================

-- Today only {choose_correct, true_false, tap_to_count} are accepted. Sim
-- playback uses the same table to persist answers for every interactive kind
-- that may gate a pause during playback.
ALTER TABLE public.lesson_slide_responses
  DROP CONSTRAINT IF EXISTS lesson_slide_responses_interaction_type_check;

ALTER TABLE public.lesson_slide_responses
  ADD CONSTRAINT lesson_slide_responses_interaction_type_check
  CHECK (interaction_type IN (
    'free_response',
    'choose_correct',
    'true_false',
    'tap_to_count',
    'match_pairs',
    'sequence_order',
    'sort_groups',
    'fill_missing_word'
  ));
