-- MS-007: Enhanced In-Lesson Quizzes Migration
-- Add question types, quiz settings, and retry tracking

-- 1. Create question_type enum
CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'fill_in_blank');

-- 2. Add question_type column to lesson_questions (default to existing behavior)
ALTER TABLE lesson_questions
ADD COLUMN question_type question_type NOT NULL DEFAULT 'multiple_choice';

-- 3. Add quiz_settings to lessons table
ALTER TABLE lessons
ADD COLUMN quiz_settings JSONB DEFAULT '{
  "require_pass_to_continue": false,
  "min_pass_questions": 1,
  "allow_retries": true,
  "max_attempts": null,
  "show_explanation": true
}'::jsonb;

-- 4. Update lesson_question_responses for retry tracking
ALTER TABLE lesson_question_responses
ADD COLUMN attempt_number INTEGER DEFAULT 1,
ADD COLUMN attempts_history JSONB DEFAULT '[]'::jsonb;

-- 5. Add index for faster lookups on question type
CREATE INDEX idx_lesson_questions_type ON lesson_questions(question_type);

-- 6. Add index for lesson quiz lookups
CREATE INDEX idx_lesson_questions_lesson_id_timestamp 
ON lesson_questions(lesson_id, timestamp_seconds);

-- 7. Update RLS policies to allow teacher quiz management
-- Teachers can manage questions for their own lessons
CREATE POLICY "Teachers can insert questions for their lessons"
ON lesson_questions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_questions.lesson_id
    AND lessons.created_by = auth.uid()
  )
);

CREATE POLICY "Teachers can update questions for their lessons"
ON lesson_questions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_questions.lesson_id
    AND lessons.created_by = auth.uid()
  )
);

CREATE POLICY "Teachers can delete questions for their lessons"
ON lesson_questions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM lessons
    WHERE lessons.id = lesson_questions.lesson_id
    AND lessons.created_by = auth.uid()
  )
);

-- 8. Add helper function to track quiz progress
CREATE OR REPLACE FUNCTION update_lesson_quiz_progress(
  p_lesson_id UUID,
  p_student_id UUID,
  p_quiz_passed BOOLEAN,
  p_quiz_attempts INTEGER
) RETURNS VOID AS $$
BEGIN
  UPDATE lesson_progress
  SET 
    metadata = COALESCE(metadata, '{}'::jsonb) || 
      jsonb_build_object(
        'quiz_passed', p_quiz_passed,
        'quiz_attempts', p_quiz_attempts,
        'last_quiz_attempt', NOW()
      )
  WHERE lesson_id = p_lesson_id
    AND student_id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Add comment for documentation
COMMENT ON COLUMN lessons.quiz_settings IS 'Quiz configuration: require_pass_to_continue, min_pass_questions, allow_retries, max_attempts, show_explanation';
COMMENT ON COLUMN lesson_question_responses.attempt_number IS 'Current attempt number (1-indexed)';
COMMENT ON COLUMN lesson_question_responses.attempts_history IS 'Array of previous answer attempts with timestamps';
