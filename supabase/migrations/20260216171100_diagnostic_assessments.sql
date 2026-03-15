-- Diagnostic assessments schema for student placement
-- Created: 2026-02-16

-- Diagnostic questions pool (seeded by teachers/admins)
CREATE TABLE IF NOT EXISTS diagnostic_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  question_text_ar TEXT NOT NULL,
  question_text_en TEXT,
  question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false')),
  options JSONB, -- Array of {id, text_ar, text_en}
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3), -- 1=easy, 2=medium, 3=hard
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student diagnostic attempts
CREATE TABLE IF NOT EXISTS diagnostic_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  questions_answered INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  recommended_grade INTEGER,
  is_complete BOOLEAN DEFAULT FALSE
);

-- Individual responses within an attempt
CREATE TABLE IF NOT EXISTS diagnostic_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID REFERENCES diagnostic_attempts(id) ON DELETE CASCADE NOT NULL,
  question_id UUID REFERENCES diagnostic_questions(id) NOT NULL,
  selected_answer TEXT,
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Student placement results (one per subject)
CREATE TABLE IF NOT EXISTS student_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES profiles(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  placed_grade INTEGER NOT NULL,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  attempt_id UUID REFERENCES diagnostic_attempts(id),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, subject_id)
);

-- Enable RLS
ALTER TABLE diagnostic_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_placements ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can read diagnostic questions" ON diagnostic_questions FOR SELECT USING (true);
CREATE POLICY "Students can manage own attempts" ON diagnostic_attempts FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Students can manage own responses" ON diagnostic_responses FOR ALL USING (
  attempt_id IN (SELECT id FROM diagnostic_attempts WHERE student_id = auth.uid())
);
CREATE POLICY "Students can read own placements" ON student_placements FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "System can insert placements" ON student_placements FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_diagnostic_questions_subject ON diagnostic_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_questions_grade ON diagnostic_questions(grade_level);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_student ON diagnostic_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_attempts_subject ON diagnostic_attempts(subject_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_responses_attempt ON diagnostic_responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_student_placements_student ON student_placements(student_id);
CREATE INDEX IF NOT EXISTS idx_student_placements_subject ON student_placements(subject_id);
