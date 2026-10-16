-- =============================================================================
-- Learning measurement (phase 1), 1/6: skills and item tags
-- =============================================================================
-- curriculum_skills: the stable skill keys ("math.counting-sequences") that
-- battle items are tagged with, with staff and family wording in EN + AR.
-- The framework rows mirror the topic ids of src/lib/curriculum.ts. The seed
-- only upserts (labels, assessable, sort order): it never deletes or renames.
--
-- homework_questions gains nullable tag columns (skill_key, difficulty,
-- tag_source, tagged_at). Every other homework row is untouched; the old app
-- never selects or writes them. Existing milestone pool rows are backfilled
-- deterministically from their source lesson's curriculum topic
-- (tag_source = 'backfill_lesson'); difficulty stays NULL until the model
-- retag route fills it, so no model call runs inside a migration.
--
-- Difficulty scale: 1 = recall, 2 = apply, 3 = stretch.
--
-- Idempotent; run as ONE transaction (psql -1 / SQL editor). Safe with the old
-- app code. The DO block at the end fails closed and rolls everything back.
-- =============================================================================
SET LOCAL lock_timeout = '3s';

-- -----------------------------------------------------------------------------
-- 1. curriculum_skills
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_skills (
  skill_key        text PRIMARY KEY CHECK (skill_key ~ '^[a-z]+\.[a-z0-9-]+$'),
  subject_key      text NOT NULL CHECK (subject_key IN ('math','english','arabic','science','islamic','social','general')),
  framework_key    text,
  topic_id         text,
  label_en         text NOT NULL,
  label_ar         text NOT NULL,
  family_label_en  text NOT NULL,
  family_label_ar  text NOT NULL,
  assessable       boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_key, topic_id)
);

INSERT INTO public.curriculum_skills
  (skill_key, subject_key, framework_key, topic_id, label_en, label_ar, family_label_en, family_label_ar, assessable, sort_order)
VALUES
  ('math.counting-sequences', 'math', 'cambridge-primary-mathematics-0096', 'counting-sequences',
   'Counting and sequences', 'العدّ وأنماط الأعداد', 'Counting and number patterns', 'العدّ وأنماط الأعداد', true, 10),
  ('math.integers-and-powers', 'math', 'cambridge-primary-mathematics-0096', 'integers-and-powers',
   'Integers and powers', 'الجمع والطرح وجدول الضرب', 'Adding, taking away and times tables', 'الجمع والطرح وجدول الضرب', true, 20),
  ('math.money', 'math', 'cambridge-primary-mathematics-0096', 'money',
   'Money', 'النقود', 'Money', 'النقود', true, 30),
  ('math.place-value-ordering-rounding', 'math', 'cambridge-primary-mathematics-0096', 'place-value-ordering-rounding',
   'Place value, ordering and rounding', 'القيمة المكانية ومقارنة الأعداد', 'Place value and comparing numbers', 'القيمة المكانية ومقارنة الأعداد', true, 40),
  ('math.fractions-decimals-percentages-ratio-proportion', 'math', 'cambridge-primary-mathematics-0096', 'fractions-decimals-percentages-ratio-proportion',
   'Fractions, decimals, percentages, ratio and proportion', 'الأنصاف والأرباع والكسور', 'Halves, quarters and fractions', 'الأنصاف والأرباع والكسور', true, 50),
  ('math.time', 'math', 'cambridge-primary-mathematics-0096', 'time',
   'Time', 'قراءة الوقت', 'Telling the time', 'قراءة الوقت', true, 60),
  ('math.geometrical-reasoning-shapes-measurements', 'math', 'cambridge-primary-mathematics-0096', 'geometrical-reasoning-shapes-measurements',
   'Geometrical reasoning, shapes and measurements', 'الأشكال والقياس', 'Shapes and measuring', 'الأشكال والقياس', true, 70),
  ('math.position-and-transformation', 'math', 'cambridge-primary-mathematics-0096', 'position-and-transformation',
   'Position and transformation', 'الموقع والاتجاه', 'Position and direction', 'الموقع والاتجاه', true, 80),
  ('math.statistics', 'math', 'cambridge-primary-mathematics-0096', 'statistics',
   'Statistics', 'الجداول والرسوم البيانية', 'Charts and tables', 'الجداول والرسوم البيانية', true, 90),
  ('math.probability', 'math', 'cambridge-primary-mathematics-0096', 'probability',
   'Probability', 'الاحتمال', 'Chance', 'الاحتمال', true, 100),
  ('math.general', 'math', NULL, NULL,
   'Maths', 'الرياضيات', 'Maths', 'الرياضيات', true, 990),

  ('english.reading-global-meaning', 'english', 'cambridge-primary-esl-0057', 'reading-global-meaning',
   'Reading for global meaning', 'فهم الفكرة العامة', 'Reading for the main idea', 'فهم الفكرة العامة', true, 10),
  ('english.reading-detail', 'english', 'cambridge-primary-esl-0057', 'reading-detail',
   'Reading for detail', 'فهم التفاصيل عند القراءة', 'Reading for details', 'فهم التفاصيل عند القراءة', true, 20),
  ('english.reading-opinion', 'english', 'cambridge-primary-esl-0057', 'reading-opinion',
   'Reading for opinion', 'فهم المشاعر والآراء', 'Understanding feelings and opinions', 'فهم المشاعر والآراء', true, 30),
  ('english.use-of-english-grammatical-forms', 'english', 'cambridge-primary-esl-0057', 'use-of-english-grammatical-forms',
   'Grammatical forms', 'القواعد', 'Grammar', 'القواعد', true, 40),
  ('english.use-of-english-vocabulary', 'english', 'cambridge-primary-esl-0057', 'use-of-english-vocabulary',
   'Vocabulary', 'المفردات', 'Words (vocabulary)', 'المفردات', true, 50),
  ('english.use-of-english-sentence-structure', 'english', 'cambridge-primary-esl-0057', 'use-of-english-sentence-structure',
   'Sentence structure', 'بناء الجمل', 'Building sentences', 'بناء الجمل', true, 60),
  ('english.letters-and-sounds', 'english', NULL, NULL,
   'Letters and sounds', 'الحروف وأصواتها', 'Letters and sounds', 'الحروف وأصواتها', true, 70),
  ('english.listening-global-meaning', 'english', 'cambridge-primary-esl-0057', 'listening-global-meaning',
   'Listening for global meaning', 'الاستماع', 'Listening', 'الاستماع', false, 110),
  ('english.listening-detail', 'english', 'cambridge-primary-esl-0057', 'listening-detail',
   'Listening for detail', 'الاستماع', 'Listening', 'الاستماع', false, 120),
  ('english.listening-opinion', 'english', 'cambridge-primary-esl-0057', 'listening-opinion',
   'Listening for opinion', 'الاستماع', 'Listening', 'الاستماع', false, 130),
  ('english.speaking-communication', 'english', 'cambridge-primary-esl-0057', 'speaking-communication',
   'Communication', 'التحدّث', 'Speaking', 'التحدّث', false, 140),
  ('english.speaking-express-opinion', 'english', 'cambridge-primary-esl-0057', 'speaking-express-opinion',
   'Express opinion', 'التحدّث', 'Speaking', 'التحدّث', false, 150),
  ('english.speaking-organisation', 'english', 'cambridge-primary-esl-0057', 'speaking-organisation',
   'Organisation', 'التحدّث', 'Speaking', 'التحدّث', false, 160),
  ('english.writing-communicative-achievement', 'english', 'cambridge-primary-esl-0057', 'writing-communicative-achievement',
   'Communicative achievement', 'الكتابة', 'Writing', 'الكتابة', false, 170),
  ('english.writing-organisation', 'english', 'cambridge-primary-esl-0057', 'writing-organisation',
   'Organisation', 'الكتابة', 'Writing', 'الكتابة', false, 180),
  ('english.writing-content', 'english', 'cambridge-primary-esl-0057', 'writing-content',
   'Content', 'الكتابة', 'Writing', 'الكتابة', false, 190),
  ('english.general', 'english', NULL, NULL,
   'English', 'اللغة الإنجليزية', 'English', 'اللغة الإنجليزية', true, 990),

  ('arabic.letters-and-sounds', 'arabic', NULL, NULL, 'Letters and sounds', 'الحروف وأصواتها', 'Letters and sounds', 'الحروف وأصواتها', true, 10),
  ('arabic.reading', 'arabic', NULL, NULL, 'Reading', 'القراءة', 'Reading', 'القراءة', true, 20),
  ('arabic.vocabulary', 'arabic', NULL, NULL, 'Words', 'المفردات', 'Words', 'المفردات', true, 30),
  ('arabic.writing', 'arabic', NULL, NULL, 'Writing', 'الكتابة', 'Writing', 'الكتابة', false, 40),
  ('arabic.grammar', 'arabic', NULL, NULL, 'Grammar', 'القواعد', 'Grammar', 'القواعد', true, 50),
  ('arabic.general', 'arabic', NULL, NULL, 'Arabic', 'اللغة العربية', 'Arabic', 'اللغة العربية', true, 990),

  ('science.general', 'science', NULL, NULL, 'Science', 'العلوم', 'Science', 'العلوم', true, 990),
  ('islamic.general', 'islamic', NULL, NULL, 'Islamic studies', 'التربية الإسلامية', 'Islamic studies', 'التربية الإسلامية', true, 990),
  ('social.general', 'social', NULL, NULL, 'Social studies', 'الدراسات الاجتماعية', 'Social studies', 'الدراسات الاجتماعية', true, 990),
  ('general.general', 'general', NULL, NULL, 'General', 'عام', 'Learning', 'التعلّم', true, 990)
ON CONFLICT (skill_key) DO UPDATE SET
  label_en        = EXCLUDED.label_en,
  label_ar        = EXCLUDED.label_ar,
  family_label_en = EXCLUDED.family_label_en,
  family_label_ar = EXCLUDED.family_label_ar,
  assessable      = EXCLUDED.assessable,
  sort_order      = EXCLUDED.sort_order;

-- -----------------------------------------------------------------------------
-- 2. Item tags on homework_questions (all nullable; only milestone pools use them)
-- -----------------------------------------------------------------------------
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS skill_key text
  REFERENCES public.curriculum_skills(skill_key) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS difficulty smallint;
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS tag_source text;
ALTER TABLE public.homework_questions ADD COLUMN IF NOT EXISTS tagged_at timestamptz;
ALTER TABLE public.homework_questions DROP CONSTRAINT IF EXISTS homework_questions_difficulty_check;
ALTER TABLE public.homework_questions ADD CONSTRAINT homework_questions_difficulty_check
  CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3);
ALTER TABLE public.homework_questions DROP CONSTRAINT IF EXISTS homework_questions_tag_source_check;
ALTER TABLE public.homework_questions ADD CONSTRAINT homework_questions_tag_source_check
  CHECK (tag_source IS NULL OR tag_source IN ('model','model_disputed','teacher','backfill_lesson'));
CREATE INDEX IF NOT EXISTS idx_homework_questions_skill ON public.homework_questions(skill_key) WHERE skill_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. lesson -> skill: "<subjectKey>.<topicId>" for a math / English curriculum topic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.measurement_lesson_skill(p_topic jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_topic ->> 'subjectKey' IN ('math','english')
               AND coalesce(p_topic ->> 'topicId','') ~ '^[a-z0-9-]+$'
              THEN (p_topic ->> 'subjectKey') || '.' || (p_topic ->> 'topicId') END $$;
REVOKE ALL ON FUNCTION public.measurement_lesson_skill(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_lesson_skill(jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Backfill: untagged milestone pool rows take their source lesson's skill
-- -----------------------------------------------------------------------------
UPDATE public.homework_questions q
   SET skill_key = s.skill_key, tag_source = 'backfill_lesson', tagged_at = now()
  FROM public.homework_assignments a, public.lessons l, public.curriculum_skills s
 WHERE a.id = q.assignment_id AND a.is_milestone = true
   AND l.id = q.source_lesson_id
   AND s.skill_key = public.measurement_lesson_skill(l.curriculum_topic)
   AND s.assessable
   AND q.skill_key IS NULL;

-- -----------------------------------------------------------------------------
-- 5. RLS and privileges: labels are readable by signed-in users, writes are server-only
-- -----------------------------------------------------------------------------
ALTER TABLE public.curriculum_skills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_skills FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.curriculum_skills TO authenticated;
GRANT ALL ON public.curriculum_skills TO service_role;

DROP POLICY IF EXISTS "Skills are readable" ON public.curriculum_skills;
CREATE POLICY "Skills are readable" ON public.curriculum_skills FOR SELECT TO authenticated
  USING (is_active OR public.is_approved_staff());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['curriculum_skills']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Unapproved staff have no staff access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Unapproved staff have no staff access" ON public.%I '
      || 'AS RESTRICTIVE FOR ALL TO authenticated '
      || 'USING (NOT (SELECT public.is_unapproved_staff())) '
      || 'WITH CHECK (NOT (SELECT public.is_unapproved_staff()))', t);
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Fail-closed postcheck
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bad text;
  topics text[] := ARRAY[
    'math.counting-sequences','math.integers-and-powers','math.money','math.place-value-ordering-rounding',
    'math.fractions-decimals-percentages-ratio-proportion','math.time','math.geometrical-reasoning-shapes-measurements',
    'math.position-and-transformation','math.statistics','math.probability','math.general',
    'english.listening-global-meaning','english.listening-detail','english.listening-opinion',
    'english.speaking-communication','english.speaking-express-opinion','english.speaking-organisation',
    'english.writing-communicative-achievement','english.writing-organisation','english.writing-content',
    'english.reading-global-meaning','english.reading-detail','english.reading-opinion',
    'english.use-of-english-grammatical-forms','english.use-of-english-vocabulary','english.use-of-english-sentence-structure',
    'english.letters-and-sounds','english.general'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
                 WHERE c.relname = 'curriculum_skills' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'measurement skills migration aborted: curriculum_skills is missing or RLS is off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'curriculum_skills'
                 AND policyname = 'Unapproved staff have no staff access' AND permissive = 'RESTRICTIVE') THEN
    RAISE EXCEPTION 'measurement skills migration aborted: RESTRICTIVE unapproved-staff policy missing';
  END IF;

  SELECT string_agg(format('%s can %s', r, priv), '; ') INTO bad
  FROM unnest(ARRAY['authenticated', 'anon']) AS r, unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS priv
  WHERE has_table_privilege(r, 'public.curriculum_skills', priv);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement skills migration aborted: client write privileges: %', bad;
  END IF;
  IF has_table_privilege('anon', 'public.curriculum_skills', 'SELECT') THEN
    RAISE EXCEPTION 'measurement skills migration aborted: anon can read curriculum_skills';
  END IF;

  SELECT string_agg(policyname, ', ') INTO bad FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'curriculum_skills' AND permissive = 'PERMISSIVE'
    AND (btrim(coalesce(qual, '')) = 'true' OR btrim(coalesce(with_check, '')) = 'true');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement skills migration aborted: always-true policies: %', bad;
  END IF;

  IF (SELECT count(*) FROM public.curriculum_skills) < 30 THEN
    RAISE EXCEPTION 'measurement skills migration aborted: fewer than 30 skills seeded';
  END IF;
  SELECT string_agg(k, ', ') INTO bad FROM unnest(topics) AS k
  WHERE NOT EXISTS (SELECT 1 FROM public.curriculum_skills s WHERE s.skill_key = k);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'measurement skills migration aborted: missing skills: %', bad;
  END IF;
  IF (SELECT count(*) FROM public.curriculum_skills WHERE skill_key LIKE 'math.%') < 11
     OR (SELECT count(*) FROM public.curriculum_skills WHERE skill_key LIKE 'english.%') < 17 THEN
    RAISE EXCEPTION 'measurement skills migration aborted: framework skills incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.homework_questions'::regclass
                 AND conname = 'homework_questions_difficulty_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.homework_questions'::regclass
                    AND conname = 'homework_questions_tag_source_check')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.homework_questions'::regclass
                    AND contype = 'f' AND confrelid = 'public.curriculum_skills'::regclass) THEN
    RAISE EXCEPTION 'measurement skills migration aborted: a tag CHECK or the skill FK is missing';
  END IF;

  IF public.measurement_lesson_skill('{"subjectKey":"math","topicId":"money"}'::jsonb) IS DISTINCT FROM 'math.money'
     OR public.measurement_lesson_skill('{}'::jsonb) IS NOT NULL
     OR public.measurement_lesson_skill('{"subjectKey":"math","topicId":"Money; drop"}'::jsonb) IS NOT NULL THEN
    RAISE EXCEPTION 'measurement skills migration aborted: measurement_lesson_skill gives the wrong answer';
  END IF;
  IF has_function_privilege('authenticated', 'public.measurement_lesson_skill(jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.measurement_lesson_skill(jsonb)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = 'public.measurement_lesson_skill(jsonb)'::regprocedure
                  AND a.grantee = 0 AND a.privilege_type = 'EXECUTE')
     OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.measurement_lesson_skill(jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'measurement skills migration aborted: measurement_lesson_skill is callable by clients or SECURITY DEFINER';
  END IF;
END;
$$;
