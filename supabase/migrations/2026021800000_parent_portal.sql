-- MS-004: Parent/Guardian Portal Migration
-- Adds tables and RLS policies for guardian access to student data

-- Create guardian_students table (many-to-many link between guardians and students)
CREATE TABLE IF NOT EXISTS guardian_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('parent', 'guardian', 'sibling', 'other')),
  is_approved BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(guardian_id, student_id)
);

-- Create guardian_invites table (invitation codes for linking)
CREATE TABLE IF NOT EXISTS guardian_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('parent', 'guardian', 'sibling', 'other')) DEFAULT 'parent',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  used_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_guardian_students_guardian_id ON guardian_students(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_students_student_id ON guardian_students(student_id);
CREATE INDEX IF NOT EXISTS idx_guardian_invites_code ON guardian_invites(code);
CREATE INDEX IF NOT EXISTS idx_guardian_invites_student_id ON guardian_invites(student_id);
CREATE INDEX IF NOT EXISTS idx_guardian_invites_expires_at ON guardian_invites(expires_at) WHERE used_at IS NULL;

-- Helper function: Get all students linked to a guardian
CREATE OR REPLACE FUNCTION get_guardian_students(guardian_uuid UUID)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  student_email TEXT,
  relationship_type TEXT,
  linked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    gs.relationship_type,
    gs.created_at
  FROM guardian_students gs
  JOIN profiles p ON p.id = gs.student_id
  WHERE gs.guardian_id = guardian_uuid AND gs.is_approved = true
  ORDER BY gs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for guardian_students table
ALTER TABLE guardian_students ENABLE ROW LEVEL SECURITY;

-- Guardians can view their own student links
CREATE POLICY "Guardians can view their student links"
  ON guardian_students FOR SELECT
  USING (auth.uid() = guardian_id);

-- Students can view their own guardian links
CREATE POLICY "Students can view their guardian links"
  ON guardian_students FOR SELECT
  USING (auth.uid() = student_id);

-- Guardians can create new links (after using invite code)
CREATE POLICY "Guardians can create student links"
  ON guardian_students FOR INSERT
  WITH CHECK (auth.uid() = guardian_id);

-- RLS Policies for guardian_invites table
ALTER TABLE guardian_invites ENABLE ROW LEVEL SECURITY;

-- Students can view/create their own invites
CREATE POLICY "Students can manage their invites"
  ON guardian_invites FOR ALL
  USING (auth.uid() = student_id OR auth.uid() = created_by);

-- Anyone can read unexpired invites (needed for code validation)
CREATE POLICY "Anyone can read unexpired invites"
  ON guardian_invites FOR SELECT
  USING (expires_at > now() AND used_at IS NULL);

-- RLS Policies for existing tables (guardian read access)

-- lesson_progress: guardians can view their linked students' progress
CREATE POLICY "Guardians can view linked student lesson progress"
  ON lesson_progress FOR SELECT
  USING (
    student_id IN (
      SELECT student_id FROM guardian_students
      WHERE guardian_id = auth.uid() AND is_approved = true
    )
  );

-- homework_submissions: guardians can view their linked students' submissions
CREATE POLICY "Guardians can view linked student homework submissions"
  ON homework_submissions FOR SELECT
  USING (
    student_id IN (
      SELECT student_id FROM guardian_students
      WHERE guardian_id = auth.uid() AND is_approved = true
    )
  );

-- ai_conversations: guardians can view their linked students' tutor chats
CREATE POLICY "Guardians can view linked student AI conversations"
  ON ai_conversations FOR SELECT
  USING (
    student_id IN (
      SELECT student_id FROM guardian_students
      WHERE guardian_id = auth.uid() AND is_approved = true
    )
  );

-- ai_messages: guardians can view messages from their linked students' conversations
CREATE POLICY "Guardians can view linked student AI messages"
  ON ai_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT c.id FROM ai_conversations c
      JOIN guardian_students gs ON gs.student_id = c.student_id
      WHERE gs.guardian_id = auth.uid() AND gs.is_approved = true
    )
  );

-- student_streaks: guardians can view their linked students' streaks
CREATE POLICY "Guardians can view linked student streaks"
  ON student_streaks FOR SELECT
  USING (
    student_id IN (
      SELECT student_id FROM guardian_students
      WHERE guardian_id = auth.uid() AND is_approved = true
    )
  );

-- Updated_at trigger for guardian_students
CREATE OR REPLACE FUNCTION update_guardian_students_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_guardian_students_updated_at_trigger
BEFORE UPDATE ON guardian_students
FOR EACH ROW
EXECUTE FUNCTION update_guardian_students_updated_at();
