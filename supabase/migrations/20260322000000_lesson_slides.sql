-- Presentation slides for lessons (one deck per lesson, slides as JSONB array)
CREATE TABLE IF NOT EXISTS lesson_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  language_mode TEXT NOT NULL DEFAULT 'ar',
  generated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lesson_id)
);

ALTER TABLE lesson_slides ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_slides'
      AND policyname = 'Teachers can manage their lesson slides'
  ) THEN
    CREATE POLICY "Teachers can manage their lesson slides"
      ON lesson_slides FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_slides.lesson_id
            AND (lessons.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_slides.lesson_id
            AND (lessons.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        )
      );
  END IF;
END $$;
