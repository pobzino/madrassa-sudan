-- Interactive lesson tasks triggered at video timestamps
-- Supports: matching_pairs, sorting_order, fill_in_blank_enhanced,
--           drag_drop_label, drawing_tracing, audio_recording

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'matching_pairs',
      'sorting_order',
      'fill_in_blank_enhanced',
      'drag_drop_label',
      'drawing_tracing',
      'audio_recording'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS lesson_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  task_type task_type NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  instruction_ar TEXT NOT NULL,
  instruction_en TEXT,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  task_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  timeout_seconds INTEGER,
  is_skippable BOOLEAN NOT NULL DEFAULT true,
  points INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lesson_task_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES lesson_tasks(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completion_score REAL NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, student_id)
);

-- Extend lesson_progress to track task completion
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS tasks_completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS tasks_total_score REAL NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lesson_tasks_lesson ON lesson_tasks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_tasks_timestamp ON lesson_tasks(lesson_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_task_responses_task ON lesson_task_responses(task_id);
CREATE INDEX IF NOT EXISTS idx_task_responses_student ON lesson_task_responses(student_id);

-- RLS
ALTER TABLE lesson_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_task_responses ENABLE ROW LEVEL SECURITY;

-- Students can view tasks for published lessons; teachers/admins can manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_tasks'
      AND policyname = 'Tasks viewable for published lessons'
  ) THEN
    CREATE POLICY "Tasks viewable for published lessons"
      ON lesson_tasks FOR SELECT
      USING (
        lesson_id IN (SELECT id FROM lessons WHERE is_published = true)
        OR EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_tasks.lesson_id
            AND (lessons.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
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
      AND tablename = 'lesson_tasks'
      AND policyname = 'Teachers can manage their lesson tasks'
  ) THEN
    CREATE POLICY "Teachers can manage their lesson tasks"
      ON lesson_tasks FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_tasks.lesson_id
            AND (lessons.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM lessons
          WHERE lessons.id = lesson_tasks.lesson_id
            AND (lessons.created_by = auth.uid()
              OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        )
      );
  END IF;
END $$;

-- Students manage own responses; teachers can view all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_task_responses'
      AND policyname = 'Students manage own task responses'
  ) THEN
    CREATE POLICY "Students manage own task responses"
      ON lesson_task_responses FOR ALL
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
      AND tablename = 'lesson_task_responses'
      AND policyname = 'Teachers view all task responses'
  ) THEN
    CREATE POLICY "Teachers view all task responses"
      ON lesson_task_responses FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role))
      );
  END IF;
END $$;

-- Updated_at triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lesson_tasks_updated_at') THEN
    CREATE TRIGGER update_lesson_tasks_updated_at
      BEFORE UPDATE ON lesson_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_lesson_task_responses_updated_at') THEN
    CREATE TRIGGER update_lesson_task_responses_updated_at
      BEFORE UPDATE ON lesson_task_responses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
