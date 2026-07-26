-- =============================================================================
-- lessons.video_duration_seconds is a cache of the lesson's recording length.
-- It is what every "% watched" bar divides by, so when it drifts the progress
-- shown to students and teachers is simply wrong.
--
-- It was maintained by hand at each write site, which does not hold: the sim
-- POST route set it, the PATCH route did not (fixed in TypeScript, but only
-- that one path), and restore_lesson_sim_version writes lesson_sims.duration_ms
-- from inside SQL where no route can see it — so restoring an older take left
-- the cache at the newer take's length. Deleting a sim left a stale value too.
--
-- A trigger makes the sync happen no matter which path writes the recording,
-- the same way the lesson-completion streak trigger works. The TypeScript
-- sync blocks are removed alongside this migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_lesson_video_duration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- One sim per lesson, so removing it leaves no recording to measure.
    UPDATE public.lessons
       SET video_duration_seconds = NULL
     WHERE id = OLD.lesson_id;
    RETURN OLD;
  END IF;

  UPDATE public.lessons
     SET video_duration_seconds = CEIL(NEW.duration_ms::numeric / 1000)
   WHERE id = NEW.lesson_id
     AND video_duration_seconds IS DISTINCT FROM CEIL(NEW.duration_ms::numeric / 1000);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lesson_video_duration ON public.lesson_sims;
CREATE TRIGGER trg_sync_lesson_video_duration
  AFTER INSERT OR UPDATE OF duration_ms OR DELETE ON public.lesson_sims
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lesson_video_duration();

-- Repair rows that already drifted (edited or restored recordings).
UPDATE public.lessons l
   SET video_duration_seconds = CEIL(s.duration_ms::numeric / 1000)
  FROM public.lesson_sims s
 WHERE s.lesson_id = l.id
   AND l.video_duration_seconds IS DISTINCT FROM CEIL(s.duration_ms::numeric / 1000);
