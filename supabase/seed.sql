-- =============================================================================
-- Seed data for local development
-- =============================================================================

-- ── Subjects ─────────────────────────────────────────────────────────────────
INSERT INTO subjects (id, name_ar, name_en, icon, display_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'الرياضيات', 'Mathematics', 'calculator', 1),
  ('a0000000-0000-0000-0000-000000000002', 'اللغة العربية', 'Arabic Language', 'book-open', 2),
  ('a0000000-0000-0000-0000-000000000003', 'اللغة الإنجليزية', 'English Language', 'languages', 3),
  ('a0000000-0000-0000-0000-000000000004', 'العلوم', 'Science', 'flask-conical', 4),
  ('a0000000-0000-0000-0000-000000000005', 'التربية الإسلامية', 'Islamic Studies', 'moon', 5),
  ('a0000000-0000-0000-0000-000000000006', 'الدراسات الاجتماعية', 'Social Studies', 'globe', 6)
ON CONFLICT (id) DO NOTHING;

-- ── Dev teacher account ──────────────────────────────────────────────────────
-- Create auth user for teacher (email: teacher@test.com / password: password123)
-- The profile trigger auto-creates the profile row.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'teacher@test.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dev Teacher","role":"teacher"}',
  now(), now(), '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'email', 'teacher@test.com'),
  'email', 'b0000000-0000-0000-0000-000000000001', now(), now(), now()
) ON CONFLICT DO NOTHING;

-- Ensure profile has teacher role (trigger may have already created it)
UPDATE profiles SET role = 'teacher', full_name = 'Dev Teacher'
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- ── Dev student account ──────────────────────────────────────────────────────
-- Create auth user for student (email: student@test.com / password: password123)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'student@test.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dev Student","role":"student"}',
  now(), now(), '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'email', 'student@test.com'),
  'email', 'b0000000-0000-0000-0000-000000000002', now(), now(), now()
) ON CONFLICT DO NOTHING;

UPDATE profiles SET role = 'student', full_name = 'Dev Student'
WHERE id = 'b0000000-0000-0000-0000-000000000002';

-- ── Dev admin account ────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token
) VALUES (
  'b0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@test.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dev Admin","role":"admin"}',
  now(), now(), '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  'b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000003', 'email', 'admin@test.com'),
  'email', 'b0000000-0000-0000-0000-000000000003', now(), now(), now()
) ON CONFLICT DO NOTHING;

UPDATE profiles SET role = 'admin', full_name = 'Dev Admin'
WHERE id = 'b0000000-0000-0000-0000-000000000003';

-- ── Cohort with teacher + student ────────────────────────────────────────────
INSERT INTO cohorts (id, name, grade_level, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'Grade 3 - Section A', 3, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cohort_teachers (cohort_id, teacher_id, is_primary) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', true)
ON CONFLICT DO NOTHING;

INSERT INTO cohort_students (cohort_id, student_id, is_active, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', true, 'approved')
ON CONFLICT DO NOTHING;

-- Second cohort
INSERT INTO cohorts (id, name, grade_level, is_active) VALUES
  ('c0000000-0000-0000-0000-000000000002', 'Grade 1 - Section A', 1, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cohort_teachers (cohort_id, teacher_id, is_primary) VALUES
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', true)
ON CONFLICT DO NOTHING;

INSERT INTO cohort_students (cohort_id, student_id, is_active, status) VALUES
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', true, 'approved')
ON CONFLICT DO NOTHING;

-- ── Sample lesson ────────────────────────────────────────────────────────────
INSERT INTO lessons (
  id, title_ar, title_en, subject_id, grade_level,
  created_by, is_published
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'جمع الأعداد حتى 100',
  'Addition up to 100',
  'a0000000-0000-0000-0000-000000000001',
  3,
  'b0000000-0000-0000-0000-000000000001',
  true
) ON CONFLICT (id) DO NOTHING;
