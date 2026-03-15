-- =============================================================================
-- BASE SCHEMA MIGRATION
-- =============================================================================
-- Creates all foundational tables, enums, RLS policies, and indexes for the
-- Madrassa Sudan learning platform.
--
-- Tables created here:
--   profiles, subjects, organizations, organization_members, cohorts,
--   cohort_students, cohort_teachers, lessons, lesson_content_blocks,
--   lesson_chunk_embeddings, lesson_questions, lesson_question_responses,
--   lesson_progress, homework_assignments, homework_questions,
--   homework_submissions, homework_responses, ai_conversations, ai_messages,
--   student_streaks
--
-- Tables NOT created here (created by later migrations):
--   diagnostic_questions, diagnostic_attempts, diagnostic_responses,
--   student_placements       (20260216171100_diagnostic_assessments.sql)
--   guardian_students, guardian_invites  (2026021800000_parent_portal.sql)
--
-- Columns NOT created here (added by later migrations):
--   lesson_questions.question_type      (2026022700000_enhanced_in_lesson_quizzes.sql)
--   lessons.quiz_settings               (2026022700000_enhanced_in_lesson_quizzes.sql)
--   lesson_question_responses.attempt_number, .attempts_history
--   lesson_progress.quiz_passed, .quiz_attempts
--   homework_questions.rubric, .instructions
--   homework_responses.response_file_urls
--   homework_submissions.started_at, .time_spent_seconds, .overall_feedback
-- =============================================================================

-- Enable pgvector extension for embeddings (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- =============================================================================
-- 1. ENUM TYPES
-- =============================================================================

-- User roles
CREATE TYPE user_role AS ENUM ('student', 'teacher', 'parent', 'admin');

-- Homework question types
CREATE TYPE homework_question_type AS ENUM (
  'multiple_choice',
  'short_answer',
  'long_answer',
  'file_upload'
);
-- NOTE: 'true_false' is added to this enum by 20260216191200_homework_system_complete.sql

-- Submission status
CREATE TYPE submission_status AS ENUM (
  'not_started',
  'in_progress',
  'submitted',
  'graded',
  'returned'
);

-- NOTE: question_type enum is created by 2026022700000_enhanced_in_lesson_quizzes.sql

-- =============================================================================
-- 2. TABLES (in dependency order)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2a. profiles - extends Supabase auth.users
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  avatar_url TEXT,
  phone TEXT,
  date_of_birth DATE,
  grade_level INTEGER,
  preferred_language TEXT NOT NULL DEFAULT 'ar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2b. subjects
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2c. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2d. organization_members
-- ---------------------------------------------------------------------------
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 2e. cohorts
-- ---------------------------------------------------------------------------
CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  grade_level INTEGER NOT NULL,
  join_code TEXT NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  is_active BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(join_code)
);

-- ---------------------------------------------------------------------------
-- 2f. cohort_students
-- ---------------------------------------------------------------------------
CREATE TABLE cohort_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cohort_id, student_id)
);

-- ---------------------------------------------------------------------------
-- 2g. cohort_teachers
-- ---------------------------------------------------------------------------
CREATE TABLE cohort_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cohort_id, teacher_id)
);

-- ---------------------------------------------------------------------------
-- 2h. lessons
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  grade_level INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  thumbnail_url TEXT,
  video_url_360p TEXT,
  video_url_480p TEXT,
  video_url_720p TEXT,
  video_duration_seconds INTEGER,
  captions_ar_url TEXT,
  captions_en_url TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: quiz_settings JSONB column is added by 2026022700000_enhanced_in_lesson_quizzes.sql

-- ---------------------------------------------------------------------------
-- 2i. lesson_content_blocks
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'ar',
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2j. lesson_chunk_embeddings
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'ar',
  source_type TEXT NOT NULL DEFAULT 'manual',
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2k. lesson_questions
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question_text_ar TEXT NOT NULL,
  question_text_en TEXT,
  correct_answer TEXT NOT NULL,
  options JSONB,
  explanation_ar TEXT,
  explanation_en TEXT,
  timestamp_seconds INTEGER NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  allow_retry BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: question_type column added by 2026022700000_enhanced_in_lesson_quizzes.sql

-- ---------------------------------------------------------------------------
-- 2l. lesson_question_responses
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES lesson_questions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: attempt_number, attempts_history columns added by enhanced_in_lesson_quizzes migration

-- ---------------------------------------------------------------------------
-- 2m. lesson_progress
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  last_position_seconds INTEGER NOT NULL DEFAULT 0,
  total_watch_time_seconds INTEGER NOT NULL DEFAULT 0,
  questions_answered INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, student_id)
);
-- NOTE: quiz_passed, quiz_attempts columns added by enhanced_in_lesson_quizzes migration

-- ---------------------------------------------------------------------------
-- 2n. homework_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE homework_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  instructions_ar TEXT,
  instructions_en TEXT,
  total_points INTEGER NOT NULL DEFAULT 100,
  due_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_published BOOLEAN NOT NULL DEFAULT false,
  allow_late_submission BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2o. homework_questions
-- ---------------------------------------------------------------------------
CREATE TABLE homework_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  question_text_ar TEXT NOT NULL,
  question_text_en TEXT,
  question_type homework_question_type NOT NULL,
  options JSONB,
  correct_answer TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: rubric, instructions columns added by 20260216191200_homework_system_complete.sql

-- ---------------------------------------------------------------------------
-- 2p. homework_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status submission_status NOT NULL DEFAULT 'not_started',
  score NUMERIC,
  feedback TEXT,
  graded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);
-- NOTE: started_at, time_spent_seconds, overall_feedback columns added by
--       20260216191200_homework_system_complete.sql

-- ---------------------------------------------------------------------------
-- 2q. homework_responses
-- ---------------------------------------------------------------------------
CREATE TABLE homework_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES homework_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES homework_questions(id) ON DELETE CASCADE,
  response_text TEXT,
  response_file_url TEXT,
  points_earned NUMERIC,
  teacher_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: response_file_urls column added by 20260216191200_homework_system_complete.sql

-- ---------------------------------------------------------------------------
-- 2r. ai_conversations
-- ---------------------------------------------------------------------------
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  homework_id UUID REFERENCES homework_assignments(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2s. ai_messages
-- ---------------------------------------------------------------------------
CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2t. student_streaks
-- ---------------------------------------------------------------------------
CREATE TABLE student_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  total_lessons_completed INTEGER NOT NULL DEFAULT 0,
  total_homework_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id)
);


-- =============================================================================
-- 3. INDEXES
-- =============================================================================

-- profiles
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_grade_level ON profiles(grade_level);

-- subjects
CREATE INDEX idx_subjects_display_order ON subjects(display_order);

-- organization_members
CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);

-- cohorts
CREATE INDEX idx_cohorts_org_id ON cohorts(organization_id);
CREATE INDEX idx_cohorts_join_code ON cohorts(join_code);

-- cohort_students
CREATE INDEX idx_cohort_students_cohort_id ON cohort_students(cohort_id);
CREATE INDEX idx_cohort_students_student_id ON cohort_students(student_id);

-- cohort_teachers
CREATE INDEX idx_cohort_teachers_cohort_id ON cohort_teachers(cohort_id);
CREATE INDEX idx_cohort_teachers_teacher_id ON cohort_teachers(teacher_id);

-- lessons
CREATE INDEX idx_lessons_subject_id ON lessons(subject_id);
CREATE INDEX idx_lessons_grade_level ON lessons(grade_level);
CREATE INDEX idx_lessons_display_order ON lessons(subject_id, grade_level, display_order);
CREATE INDEX idx_lessons_created_by ON lessons(created_by);

-- lesson_content_blocks
CREATE INDEX idx_lesson_content_blocks_lesson_id ON lesson_content_blocks(lesson_id);
CREATE INDEX idx_lesson_content_blocks_language ON lesson_content_blocks(lesson_id, language);

-- lesson_chunk_embeddings
CREATE INDEX idx_lesson_chunk_embeddings_lesson_id ON lesson_chunk_embeddings(lesson_id);
CREATE INDEX idx_lesson_chunk_embeddings_language ON lesson_chunk_embeddings(lesson_id, language);

-- lesson_questions
CREATE INDEX idx_lesson_questions_lesson_id ON lesson_questions(lesson_id);
CREATE INDEX idx_lesson_questions_timestamp ON lesson_questions(lesson_id, timestamp_seconds);

-- lesson_question_responses
CREATE INDEX idx_lesson_question_responses_question_id ON lesson_question_responses(question_id);
CREATE INDEX idx_lesson_question_responses_student_id ON lesson_question_responses(student_id);

-- lesson_progress
CREATE INDEX idx_lesson_progress_lesson_id ON lesson_progress(lesson_id);
CREATE INDEX idx_lesson_progress_student_id ON lesson_progress(student_id);

-- homework_assignments
CREATE INDEX idx_homework_assignments_cohort_id ON homework_assignments(cohort_id);
CREATE INDEX idx_homework_assignments_subject_id ON homework_assignments(subject_id);
CREATE INDEX idx_homework_assignments_lesson_id ON homework_assignments(lesson_id);
CREATE INDEX idx_homework_assignments_created_by ON homework_assignments(created_by);

-- homework_questions
CREATE INDEX idx_homework_questions_assignment_id ON homework_questions(assignment_id);

-- homework_submissions
CREATE INDEX idx_homework_submissions_assignment_id ON homework_submissions(assignment_id);
CREATE INDEX idx_homework_submissions_student_id ON homework_submissions(student_id);

-- homework_responses
CREATE INDEX idx_homework_responses_submission_id ON homework_responses(submission_id);
CREATE INDEX idx_homework_responses_question_id_base ON homework_responses(question_id);

-- ai_conversations
CREATE INDEX idx_ai_conversations_student_id ON ai_conversations(student_id);
CREATE INDEX idx_ai_conversations_subject_id ON ai_conversations(subject_id);
CREATE INDEX idx_ai_conversations_lesson_id ON ai_conversations(lesson_id);
CREATE INDEX idx_ai_conversations_homework_id ON ai_conversations(homework_id);

-- ai_messages
CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_created_at ON ai_messages(conversation_id, created_at);

-- student_streaks
CREATE INDEX idx_student_streaks_student_id ON student_streaks(student_id);
CREATE INDEX idx_student_streaks_last_activity ON student_streaks(last_activity_date);


-- =============================================================================
-- 4. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE cohort_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_question_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_streaks ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 5. RLS POLICIES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5a. profiles
-- ---------------------------------------------------------------------------
-- Everyone can read profiles (needed for displaying names, avatars, etc.)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (on sign-up)
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 5b. subjects
-- ---------------------------------------------------------------------------
-- Subjects are publicly readable
CREATE POLICY "Subjects are viewable by everyone"
  ON subjects FOR SELECT
  USING (true);

-- Only admins can manage subjects
CREATE POLICY "Admins can manage subjects"
  ON subjects FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 5c. organizations
-- ---------------------------------------------------------------------------
-- Organization members and admins can view organizations
CREATE POLICY "Organization members can view their organization"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can manage organizations
CREATE POLICY "Admins can manage organizations"
  ON organizations FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5d. organization_members
-- ---------------------------------------------------------------------------
-- Members can view fellow members
CREATE POLICY "Members can view organization members"
  ON organization_members FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Admins can manage membership
CREATE POLICY "Admins can manage organization members"
  ON organization_members FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5e. cohorts
-- ---------------------------------------------------------------------------
-- Cohort members (students and teachers) can view their cohorts
CREATE POLICY "Cohort members can view cohorts"
  ON cohorts FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT cohort_id FROM cohort_students WHERE student_id = auth.uid())
    OR id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers and admins can create cohorts
CREATE POLICY "Teachers and admins can create cohorts"
  ON cohorts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Teachers assigned to cohort and admins can update cohorts
CREATE POLICY "Teachers and admins can update cohorts"
  ON cohorts FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5f. cohort_students
-- ---------------------------------------------------------------------------
-- Students can view their own enrollment; teachers can view their cohorts
CREATE POLICY "Students can view own enrollments"
  ON cohort_students FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid()
    OR cohort_id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Students can join cohorts (insert themselves)
CREATE POLICY "Students can join cohorts"
  ON cohort_students FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Teachers and admins can manage cohort students
CREATE POLICY "Teachers and admins can manage cohort students"
  ON cohort_students FOR ALL
  TO authenticated
  USING (
    cohort_id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5g. cohort_teachers
-- ---------------------------------------------------------------------------
-- Teachers can view their own assignments; admins can view all
CREATE POLICY "Teachers can view cohort teacher assignments"
  ON cohort_teachers FOR SELECT
  TO authenticated
  USING (
    teacher_id = auth.uid()
    OR cohort_id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can manage teacher assignments
CREATE POLICY "Admins can manage cohort teachers"
  ON cohort_teachers FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5h. lessons
-- ---------------------------------------------------------------------------
-- Published lessons are readable by all authenticated users
CREATE POLICY "Published lessons are viewable by authenticated users"
  ON lessons FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- Teachers can create lessons
CREATE POLICY "Teachers can create lessons"
  ON lessons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Teachers can update their own lessons; admins can update any
CREATE POLICY "Teachers can update their own lessons"
  ON lessons FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers can delete their own lessons; admins can delete any
CREATE POLICY "Teachers can delete their own lessons"
  ON lessons FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5i. lesson_content_blocks
-- ---------------------------------------------------------------------------
-- Readable if the parent lesson is readable
CREATE POLICY "Lesson content blocks follow lesson visibility"
  ON lesson_content_blocks FOR SELECT
  TO authenticated
  USING (
    lesson_id IN (
      SELECT id FROM lessons WHERE is_published = true
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- Teachers and admins can manage content blocks
CREATE POLICY "Teachers can manage lesson content blocks"
  ON lesson_content_blocks FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- 5j. lesson_chunk_embeddings
-- ---------------------------------------------------------------------------
-- Readable by authenticated users (used for AI search)
CREATE POLICY "Embeddings are readable by authenticated users"
  ON lesson_chunk_embeddings FOR SELECT
  TO authenticated
  USING (true);

-- Teachers and admins can manage embeddings
CREATE POLICY "Teachers can manage lesson chunk embeddings"
  ON lesson_chunk_embeddings FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- 5k. lesson_questions
-- ---------------------------------------------------------------------------
-- Questions are readable for published lessons
CREATE POLICY "Lesson questions are viewable for published lessons"
  ON lesson_questions FOR SELECT
  TO authenticated
  USING (
    lesson_id IN (SELECT id FROM lessons WHERE is_published = true)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- NOTE: Teacher INSERT/UPDATE/DELETE policies for lesson_questions are created
-- by 2026022700000_enhanced_in_lesson_quizzes.sql

-- ---------------------------------------------------------------------------
-- 5l. lesson_question_responses
-- ---------------------------------------------------------------------------
-- Students can manage their own responses
CREATE POLICY "Students can manage their own question responses"
  ON lesson_question_responses FOR ALL
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers and admins can view all responses
CREATE POLICY "Teachers can view all question responses"
  ON lesson_question_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- 5m. lesson_progress
-- ---------------------------------------------------------------------------
-- Students can manage their own progress
CREATE POLICY "Students can manage their own lesson progress"
  ON lesson_progress FOR ALL
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers can view progress for their cohort students
CREATE POLICY "Teachers can view student lesson progress"
  ON lesson_progress FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT cs.student_id FROM cohort_students cs
      JOIN cohort_teachers ct ON cs.cohort_id = ct.cohort_id
      WHERE ct.teacher_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5n. homework_assignments
-- ---------------------------------------------------------------------------
-- Students in the cohort and teachers can view assignments
CREATE POLICY "Cohort members can view homework assignments"
  ON homework_assignments FOR SELECT
  TO authenticated
  USING (
    cohort_id IN (SELECT cohort_id FROM cohort_students WHERE student_id = auth.uid() AND is_active = true)
    OR cohort_id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers can create assignments for their cohorts
CREATE POLICY "Teachers can create homework assignments"
  ON homework_assignments FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND cohort_id IN (SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid())
  );

-- Teachers can update their own assignments
CREATE POLICY "Teachers can update their homework assignments"
  ON homework_assignments FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers can delete their own assignments
CREATE POLICY "Teachers can delete their homework assignments"
  ON homework_assignments FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5o. homework_questions
-- ---------------------------------------------------------------------------
-- Viewable by cohort members (via assignment)
CREATE POLICY "Homework questions are viewable by cohort members"
  ON homework_questions FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ha.id FROM homework_assignments ha
      WHERE ha.cohort_id IN (
        SELECT cohort_id FROM cohort_students WHERE student_id = auth.uid() AND is_active = true
      )
      OR ha.cohort_id IN (
        SELECT cohort_id FROM cohort_teachers WHERE teacher_id = auth.uid()
      )
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers can manage questions for their assignments
CREATE POLICY "Teachers can manage homework questions"
  ON homework_questions FOR ALL
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ha.id FROM homework_assignments ha
      WHERE ha.created_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5p. homework_submissions
-- ---------------------------------------------------------------------------
-- Students can manage their own submissions
CREATE POLICY "Students can manage their own homework submissions"
  ON homework_submissions FOR ALL
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers can view submissions for their assignments
CREATE POLICY "Teachers can view homework submissions"
  ON homework_submissions FOR SELECT
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ha.id FROM homework_assignments ha
      JOIN cohort_teachers ct ON ha.cohort_id = ct.cohort_id
      WHERE ct.teacher_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Teachers can update submissions (for grading)
CREATE POLICY "Teachers can grade homework submissions"
  ON homework_submissions FOR UPDATE
  TO authenticated
  USING (
    assignment_id IN (
      SELECT ha.id FROM homework_assignments ha
      JOIN cohort_teachers ct ON ha.cohort_id = ct.cohort_id
      WHERE ct.teacher_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- 5q. homework_responses
-- ---------------------------------------------------------------------------
-- NOTE: Comprehensive RLS policies for homework_responses are created/replaced
-- by 20260216191200_homework_system_complete.sql. We create basic ones here.

-- Students can manage their own responses
CREATE POLICY "Students can manage their own responses"
  ON homework_responses FOR ALL
  TO authenticated
  USING (
    submission_id IN (
      SELECT id FROM homework_submissions WHERE student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5r. ai_conversations
-- ---------------------------------------------------------------------------
-- Students can manage their own conversations
CREATE POLICY "Students can manage their own AI conversations"
  ON ai_conversations FOR ALL
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers and admins can view all conversations
CREATE POLICY "Teachers can view all AI conversations"
  ON ai_conversations FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- 5s. ai_messages
-- ---------------------------------------------------------------------------
-- Users can manage messages in their own conversations
CREATE POLICY "Users can manage messages in their conversations"
  ON ai_messages FOR ALL
  TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM ai_conversations WHERE student_id = auth.uid()
    )
  );

-- Teachers can view messages (for monitoring)
CREATE POLICY "Teachers can view all AI messages"
  ON ai_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- ---------------------------------------------------------------------------
-- 5t. student_streaks
-- ---------------------------------------------------------------------------
-- Students can manage their own streaks
CREATE POLICY "Students can manage their own streaks"
  ON student_streaks FOR ALL
  TO authenticated
  USING (student_id = auth.uid());

-- Teachers can view student streaks
CREATE POLICY "Teachers can view student streaks"
  ON student_streaks FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT cs.student_id FROM cohort_students cs
      JOIN cohort_teachers ct ON cs.cohort_id = ct.cohort_id
      WHERE ct.teacher_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- =============================================================================
-- 6. FUNCTIONS & TRIGGERS
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 6a. Auto-update updated_at timestamp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cohorts_updated_at
  BEFORE UPDATE ON cohorts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_progress_updated_at
  BEFORE UPDATE ON lesson_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_question_responses_updated_at
  BEFORE UPDATE ON lesson_question_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homework_assignments_updated_at
  BEFORE UPDATE ON homework_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homework_submissions_updated_at
  BEFORE UPDATE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homework_responses_updated_at
  BEFORE UPDATE ON homework_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_streaks_updated_at
  BEFORE UPDATE ON student_streaks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6b. Auto-create profile on user signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student'),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'ar')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- 6c. Semantic search function for lesson content
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_lesson_chunks(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 5,
  filter_subject_id UUID DEFAULT NULL,
  filter_grade_level INTEGER DEFAULT NULL,
  filter_language TEXT DEFAULT NULL
)
RETURNS TABLE (
  lesson_id UUID,
  content TEXT,
  similarity FLOAT,
  source_type TEXT,
  lesson_title_ar TEXT,
  lesson_title_en TEXT,
  subject_name_ar TEXT,
  subject_name_en TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lce.lesson_id,
    lce.content,
    1 - (lce.embedding <=> query_embedding) AS similarity,
    lce.source_type,
    l.title_ar AS lesson_title_ar,
    l.title_en AS lesson_title_en,
    s.name_ar AS subject_name_ar,
    s.name_en AS subject_name_en
  FROM lesson_chunk_embeddings lce
  JOIN lessons l ON l.id = lce.lesson_id
  JOIN subjects s ON s.id = l.subject_id
  WHERE
    (filter_subject_id IS NULL OR l.subject_id = filter_subject_id)
    AND (filter_grade_level IS NULL OR l.grade_level = filter_grade_level)
    AND (filter_language IS NULL OR lce.language = filter_language)
  ORDER BY lce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- =============================================================================
-- 7. STORAGE BUCKETS (optional, for file uploads)
-- =============================================================================

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('lessons', 'lessons', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('homework', 'homework', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policies for lessons (public read, teachers write)
CREATE POLICY "Lesson files are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lessons');

CREATE POLICY "Teachers can upload lesson files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lessons'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
  );

-- Storage policies for homework (private)
CREATE POLICY "Students can upload homework files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'homework'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Students can view their own homework files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'homework'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
    )
  );
