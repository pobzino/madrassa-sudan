-- MS-007: Enhanced In-Lesson Quizzes Migration (idempotent re-run)
-- Add question types, quiz settings, retry capability, and progress gating

-- 1. Create question_type enum if not exists
DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'fill_in_blank');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add question_type column to lesson_questions if not exists
DO $$ BEGIN
  ALTER TABLE lesson_questions ADD COLUMN question_type question_type NOT NULL DEFAULT 'multiple_choice';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Add quiz_settings to lessons table (JSONB) if not exists
DO $$ BEGIN
  ALTER TABLE lessons ADD COLUMN quiz_settings JSONB DEFAULT '{
    "require_pass_to_continue": false,
    "min_pass_questions": 1,
    "allow_retries": true,
    "max_attempts": null,
    "show_explanation": true
  }'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Update lesson_question_responses for retry tracking
DO $$ BEGIN
  ALTER TABLE lesson_question_responses ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE lesson_question_responses ADD COLUMN attempts_history JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Add index for question type filtering
CREATE INDEX IF NOT EXISTS idx_lesson_questions_type ON lesson_questions(question_type);

-- 6. Add index for attempts tracking
CREATE INDEX IF NOT EXISTS idx_lesson_question_responses_attempts ON lesson_question_responses(question_id, student_id, attempt_number);

-- 7. Add quiz_passed and quiz_attempts to lesson_progress
DO $$ BEGIN
  ALTER TABLE lesson_progress ADD COLUMN quiz_passed BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE lesson_progress ADD COLUMN quiz_attempts INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Comment on new columns
COMMENT ON COLUMN lesson_questions.question_type IS 'Type of question: multiple_choice, true_false, or fill_in_blank';
COMMENT ON COLUMN lessons.quiz_settings IS 'Quiz behavior settings: require_pass_to_continue, min_pass_questions, allow_retries, max_attempts, show_explanation';
COMMENT ON COLUMN lesson_question_responses.attempt_number IS 'Current attempt number for this question (1-indexed)';
COMMENT ON COLUMN lesson_question_responses.attempts_history IS 'Array of previous answer attempts with timestamps';
COMMENT ON COLUMN lesson_progress.quiz_passed IS 'Whether student has passed the quiz requirements for this lesson';
COMMENT ON COLUMN lesson_progress.quiz_attempts IS 'Total number of quiz attempts for this lesson';
