-- =============================================================================
-- GDPR: Teacher content isolation & published content deletion protection
-- =============================================================================
--
-- Fixes:
-- 1. Teachers could see ALL other teachers' lessons (SELECT policy too wide)
-- 2. Teachers could delete their own published lessons (no publish guard)
-- 3. Any teacher could manage any lesson's content blocks (not scoped to owner)
--
-- After this migration:
-- - Teachers only see their own lessons + published lessons they have access to
-- - Published lessons can only be deleted by admins
-- - Content blocks are scoped to lesson owner or admin
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tighten lessons SELECT policy
--    Was: role IN ('teacher', 'admin') → sees everything
--    Now: created_by = self OR admin → teachers only see own + published
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Published lessons are viewable by authorized users" ON public.lessons;
DROP POLICY IF EXISTS "Published lessons are viewable by authenticated users" ON public.lessons;
DROP POLICY IF EXISTS "Lessons viewable by authorized users" ON public.lessons;

CREATE POLICY "Lessons viewable by authorized users"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), id)
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Tighten lesson_content_blocks SELECT policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lesson content blocks follow lesson visibility" ON public.lesson_content_blocks;

CREATE POLICY "Lesson content blocks follow lesson visibility"
  ON public.lesson_content_blocks FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = lesson_content_blocks.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Tighten lesson_content_blocks manage (ALL) policy — owner or admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can manage lesson content blocks" ON public.lesson_content_blocks;

CREATE POLICY "Teachers can manage lesson content blocks"
  ON public.lesson_content_blocks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = lesson_content_blocks.lesson_id
        AND (
          lessons.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Tighten lesson_questions SELECT policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lesson questions are viewable for published lessons" ON public.lesson_questions;

CREATE POLICY "Lesson questions are viewable for published lessons"
  ON public.lesson_questions FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = lesson_questions.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Tighten lesson_tasks SELECT policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tasks viewable for published lessons" ON public.lesson_tasks;

CREATE POLICY "Tasks viewable for published lessons"
  ON public.lesson_tasks FOR SELECT
  TO authenticated
  USING (
    public.can_user_access_published_lesson(auth.uid(), lesson_id)
    OR EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = lesson_tasks.lesson_id
        AND lessons.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Guard lessons DELETE — published lessons require admin
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers can delete their own lessons" ON public.lessons;
DROP POLICY IF EXISTS "Owners can delete draft lessons; admins can delete any" ON public.lessons;

CREATE POLICY "Owners can delete draft lessons; admins can delete any"
  ON public.lessons FOR DELETE
  TO authenticated
  USING (
    (created_by = auth.uid() AND is_published = false)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
    )
  );
