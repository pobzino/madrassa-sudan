-- Persistent audit trail for sim recordings that do not make it into
-- lesson_sims. This captures browser review sessions, upload failures,
-- finalization failures, and abandoned/retaken recordings.

CREATE TABLE IF NOT EXISTS public.sim_save_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_attempt_id UUID NOT NULL UNIQUE,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  sim_id UUID,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'review_opened',
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  audio_duration_ms INTEGER CHECK (audio_duration_ms IS NULL OR audio_duration_ms >= 0),
  audio_size_bytes BIGINT CHECK (audio_size_bytes IS NULL OR audio_size_bytes >= 0),
  audio_mime TEXT,
  audio_path TEXT,
  events_count INTEGER CHECK (events_count IS NULL OR events_count >= 0),
  deck_slide_count INTEGER CHECK (deck_slide_count IS NULL OR deck_slide_count >= 0),
  clip_segments_count INTEGER CHECK (clip_segments_count IS NULL OR clip_segments_count >= 0),
  error_message TEXT,
  error_status INTEGER,
  error_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  browser_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_version TEXT,
  page_url TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sim_save_attempts_status_check CHECK (
    status IN (
      'review_opened',
      'save_started',
      'audio_upload_preparing',
      'audio_upload_prepare_failed',
      'audio_upload_prepared',
      'audio_upload_failed',
      'audio_upload_succeeded',
      'finalize_started',
      'finalize_failed',
      'saved',
      'discarded',
      'retake',
      'abandoned',
      'failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sim_save_attempts_lesson_created
  ON public.sim_save_attempts(lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_save_attempts_user_created
  ON public.sim_save_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sim_save_attempts_status_created
  ON public.sim_save_attempts(status, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_sim_save_attempts_updated_at'
  ) THEN
    CREATE TRIGGER update_sim_save_attempts_updated_at
      BEFORE UPDATE ON public.sim_save_attempts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.sim_save_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sim_save_attempts'
      AND policyname = 'Teachers insert their sim save attempts'
  ) THEN
    CREATE POLICY "Teachers insert their sim save attempts"
      ON public.sim_save_attempts FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role IN ('teacher'::user_role, 'admin'::user_role)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sim_save_attempts'
      AND policyname = 'Teachers update their sim save attempts'
  ) THEN
    CREATE POLICY "Teachers update their sim save attempts"
      ON public.sim_save_attempts FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sim_save_attempts'
      AND policyname = 'Teachers and admins view sim save attempts'
  ) THEN
    CREATE POLICY "Teachers and admins view sim save attempts"
      ON public.sim_save_attempts FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'::user_role
        )
      );
  END IF;
END $$;
