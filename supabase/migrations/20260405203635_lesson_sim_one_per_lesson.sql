-- Collapse lesson_sims to one row per lesson and drop the `published` column.
--
-- Context: sims now mirror the video model — exactly one playable artifact per
-- lesson, with `lessons.is_published` as the sole gate for students. The old
-- versioning + per-row publish toggle is gone, replaced by a review-before-
-- upload flow that delete-then-inserts on re-record.

-- Keep only the newest sim per lesson (by recorded_at) so the new unique
-- constraint is satisfiable on existing dev data.
DELETE FROM public.lesson_sims s
USING public.lesson_sims s2
WHERE s.lesson_id = s2.lesson_id
  AND s.recorded_at < s2.recorded_at;

-- Drop composite unique + version column.
ALTER TABLE public.lesson_sims
  DROP CONSTRAINT IF EXISTS lesson_sims_lesson_id_version_key;
ALTER TABLE public.lesson_sims
  DROP COLUMN IF EXISTS version;

-- Drop the old published flag and everything that references it.
DROP INDEX IF EXISTS public.idx_lesson_sims_lesson_published;
DROP POLICY IF EXISTS "Students can view published sims" ON public.lesson_sims;
ALTER TABLE public.lesson_sims
  DROP COLUMN IF EXISTS published;

-- One row per lesson.
ALTER TABLE public.lesson_sims
  ADD CONSTRAINT lesson_sims_lesson_id_key UNIQUE (lesson_id);

-- Replacement student SELECT policy — gated on lessons.is_published, mirroring
-- the video visibility model.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lesson_sims'
      AND policyname = 'Students can view sims for published lessons'
  ) THEN
    CREATE POLICY "Students can view sims for published lessons"
      ON public.lesson_sims FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.id = lesson_sims.lesson_id
            AND (
              l.is_published = true
              OR l.created_by = auth.uid()
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.role = 'admin'::user_role
              )
            )
        )
      );
  END IF;
END $$;
