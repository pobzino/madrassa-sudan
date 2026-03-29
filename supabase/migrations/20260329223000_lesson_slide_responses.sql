-- Student responses for interactive slide checkpoints during lesson playback

CREATE TABLE IF NOT EXISTS lesson_slide_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  slide_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('choose_correct', 'true_false', 'tap_to_count')),
  response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completion_score REAL NOT NULL DEFAULT 0,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, slide_id, student_id)
);

ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS interactive_slides_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS interactive_slides_correct INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lesson_slide_responses_lesson_student
  ON lesson_slide_responses(lesson_id, student_id);

CREATE INDEX IF NOT EXISTS idx_lesson_slide_responses_student
  ON lesson_slide_responses(student_id);

ALTER TABLE lesson_slide_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_slides'
      AND policyname = 'Students can view published lesson slides'
  ) THEN
    CREATE POLICY "Students can view published lesson slides"
      ON lesson_slides FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_slides.lesson_id
            AND (
              lessons.is_published = true
              OR lessons.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_slide_responses'
      AND policyname = 'Students manage own slide responses'
  ) THEN
    CREATE POLICY "Students manage own slide responses"
      ON lesson_slide_responses FOR ALL
      USING (student_id = auth.uid())
      WITH CHECK (student_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_slide_responses'
      AND policyname = 'Teachers view slide responses for owned lessons'
  ) THEN
    CREATE POLICY "Teachers view slide responses for owned lessons"
      ON lesson_slide_responses FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_slide_responses.lesson_id
            AND (
              lessons.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM profiles
                WHERE profiles.id = auth.uid()
                  AND profiles.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lesson_slide_responses_updated_at') THEN
    CREATE TRIGGER update_lesson_slide_responses_updated_at
      BEFORE UPDATE ON lesson_slide_responses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
