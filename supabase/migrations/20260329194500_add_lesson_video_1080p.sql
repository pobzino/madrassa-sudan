ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS video_url_1080p TEXT;

ALTER TABLE public.lessons
DROP CONSTRAINT IF EXISTS lessons_video_urls_no_youtube;

ALTER TABLE public.lessons
DROP CONSTRAINT IF EXISTS lessons_no_youtube_video_urls_chk;

ALTER TABLE public.lessons
ADD CONSTRAINT lessons_no_youtube_video_urls_chk CHECK (
  (video_url_1080p IS NULL OR video_url_1080p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
  AND (video_url_360p IS NULL OR video_url_360p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
  AND (video_url_480p IS NULL OR video_url_480p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
  AND (video_url_720p IS NULL OR video_url_720p !~* '(^|://|[./])(www\\.|m\\.)?(youtube\\.com|youtu\\.be|youtube-nocookie\\.com)(/|\\?|$)')
) NOT VALID;
