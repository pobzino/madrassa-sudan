-- Disallow YouTube-hosted lesson video URLs to keep playback ad-free and fully controlled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lessons_no_youtube_video_urls_chk'
      AND conrelid = 'public.lessons'::regclass
  ) THEN
    ALTER TABLE public.lessons
      ADD CONSTRAINT lessons_no_youtube_video_urls_chk
      CHECK (
        (video_url_360p IS NULL OR video_url_360p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
        AND (video_url_480p IS NULL OR video_url_480p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
        AND (video_url_720p IS NULL OR video_url_720p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
      ) NOT VALID;
  END IF;
END $$;
