-- Unify lesson activities around lesson_tasks while keeping legacy task rows readable.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'matching_pairs'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'match_pairs'
  ) THEN
    ALTER TYPE task_type RENAME VALUE 'matching_pairs' TO 'match_pairs';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'sorting_order'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'sequence_order'
  ) THEN
    ALTER TYPE task_type RENAME VALUE 'sorting_order' TO 'sequence_order';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'choose_correct'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'choose_correct';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'true_false'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'true_false';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'fill_missing_word'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'fill_missing_word';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'tap_to_count'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'tap_to_count';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'task_type'::regtype
      AND enumlabel = 'sort_groups'
  ) THEN
    ALTER TYPE task_type ADD VALUE 'sort_groups';
  END IF;
END $$;

ALTER TABLE lesson_tasks
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS linked_slide_id TEXT;

ALTER TABLE lesson_task_responses
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lesson_task_responses_status_check'
  ) THEN
    ALTER TABLE lesson_task_responses
      ADD CONSTRAINT lesson_task_responses_status_check
      CHECK (status IN ('completed', 'skipped', 'timed_out'));
  END IF;
END $$;

ALTER TABLE lesson_progress
  ADD COLUMN IF NOT EXISTS required_tasks_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasks_skipped INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lesson_tasks_linked_slide
  ON lesson_tasks(lesson_id, linked_slide_id)
  WHERE linked_slide_id IS NOT NULL;

UPDATE lesson_task_responses
SET status = CASE WHEN is_completed THEN 'completed' ELSE 'skipped' END
WHERE status IS NULL OR status NOT IN ('completed', 'skipped', 'timed_out');
