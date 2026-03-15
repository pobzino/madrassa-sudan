-- MS-003: Teacher Homework Creation & Grading System Migration
-- Adds rubric support, file upload questions, and submission answers table

-- Add rubric column to homework_questions for detailed grading criteria
ALTER TABLE homework_questions 
ADD COLUMN IF NOT EXISTS rubric JSONB DEFAULT NULL;

-- Add instructions for file upload questions
ALTER TABLE homework_questions 
ADD COLUMN IF NOT EXISTS instructions TEXT DEFAULT NULL;

-- Ensure homework_responses supports multiple file uploads (in addition to single file_url)
-- The existing response_file_url supports single file, we'll use JSON array for multiple files
ALTER TABLE homework_responses 
ADD COLUMN IF NOT EXISTS response_file_urls JSONB DEFAULT NULL;

-- Add started_at and time_spent tracking to homework_submissions
ALTER TABLE homework_submissions 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE homework_submissions 
ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0;

-- Add overall_feedback as alternative to feedback field
ALTER TABLE homework_submissions 
ADD COLUMN IF NOT EXISTS overall_feedback TEXT DEFAULT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_homework_submissions_status ON homework_submissions(status);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_graded_by ON homework_submissions(graded_by);
CREATE INDEX IF NOT EXISTS idx_homework_responses_question_id ON homework_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_homework_responses_points_earned ON homework_responses(points_earned) WHERE points_earned IS NOT NULL;

-- Add true_false to homework_question_type enum (if not exists)
-- Note: PostgreSQL doesn't support IF NOT EXISTS for ENUM values, so we handle this gracefully
DO $$
BEGIN
    -- Check if true_false exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'true_false' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'homework_question_type')
    ) THEN
        -- Add true_false to the enum
        ALTER TYPE homework_question_type ADD VALUE 'true_false';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Value already exists, ignore
        NULL;
END $$;

-- Update RLS policies for homework_responses to ensure teachers can grade
-- First, drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Students can manage their own responses" ON homework_responses;
DROP POLICY IF EXISTS "Teachers can view responses for their assignments" ON homework_responses;
DROP POLICY IF EXISTS "Teachers can update responses for grading" ON homework_responses;

-- Create comprehensive RLS policies
CREATE POLICY "Students can manage their own responses" ON homework_responses
FOR ALL USING (
  submission_id IN (
    SELECT id FROM homework_submissions WHERE student_id = auth.uid()
  )
);

CREATE POLICY "Teachers can view responses for their assignments" ON homework_responses
FOR SELECT USING (
  submission_id IN (
    SELECT hs.id FROM homework_submissions hs
    JOIN homework_assignments ha ON hs.assignment_id = ha.id
    JOIN cohort_teachers ct ON ha.cohort_id = ct.cohort_id
    WHERE ct.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can update responses for grading" ON homework_responses
FOR UPDATE USING (
  submission_id IN (
    SELECT hs.id FROM homework_submissions hs
    JOIN homework_assignments ha ON hs.assignment_id = ha.id
    JOIN cohort_teachers ct ON ha.cohort_id = ct.cohort_id
    WHERE ct.teacher_id = auth.uid()
  )
);

-- Add function to get pending grading count for teacher dashboard
CREATE OR REPLACE FUNCTION get_teacher_pending_grading_count(teacher_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  pending_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pending_count
  FROM homework_submissions hs
  JOIN homework_assignments ha ON hs.assignment_id = ha.id
  JOIN cohort_teachers ct ON ha.cohort_id = ct.cohort_id
  WHERE ct.teacher_id = teacher_uuid
  AND hs.status = 'submitted';
  
  RETURN pending_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function to get student submission stats for an assignment
CREATE OR REPLACE FUNCTION get_assignment_submission_stats(assignment_uuid UUID)
RETURNS TABLE (
  total_students INTEGER,
  submitted_count INTEGER,
  graded_count INTEGER,
  pending_count INTEGER,
  average_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE hs.id IS NOT NULL) as total,
      COUNT(*) FILTER (WHERE hs.status = 'submitted') as submitted,
      COUNT(*) FILTER (WHERE hs.status IN ('graded', 'returned')) as graded,
      COUNT(*) FILTER (WHERE hs.status = 'submitted') as pending,
      AVG(hs.score) FILTER (WHERE hs.score IS NOT NULL) as avg_score
    FROM homework_assignments ha
    JOIN cohort_students cs ON ha.cohort_id = cs.cohort_id AND cs.is_active = true
    LEFT JOIN homework_submissions hs ON ha.id = hs.assignment_id AND cs.student_id = hs.student_id
    WHERE ha.id = assignment_uuid
  )
  SELECT 
    total::INTEGER,
    submitted::INTEGER,
    graded::INTEGER,
    pending::INTEGER,
    COALESCE(avg_score, 0)::NUMERIC
  FROM stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update submission started_at when first response is created
CREATE OR REPLACE FUNCTION update_submission_started_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE homework_submissions
  SET started_at = COALESCE(started_at, NOW()),
      status = CASE 
        WHEN status = 'not_started' THEN 'in_progress'
        ELSE status
      END,
      updated_at = NOW()
  WHERE id = NEW.submission_id
  AND (started_at IS NULL OR status = 'not_started');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trigger_update_started_at ON homework_responses;

-- Create trigger
CREATE TRIGGER trigger_update_started_at
AFTER INSERT ON homework_responses
FOR EACH ROW
EXECUTE FUNCTION update_submission_started_at();

-- Add comment for documentation
COMMENT ON TABLE homework_responses IS 'Stores individual question responses for homework submissions with teacher grading';
COMMENT ON COLUMN homework_questions.rubric IS 'JSON array of {criterion: string, description: string, points: number} for detailed grading';
COMMENT ON COLUMN homework_submissions.time_spent_seconds IS 'Total time student spent on the assignment in seconds';
