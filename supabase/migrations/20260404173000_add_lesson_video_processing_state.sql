alter table public.lessons
  add column if not exists video_processing_status text not null default 'idle',
  add column if not exists video_processing_error text,
  add column if not exists video_processed_at timestamptz;

alter table public.lessons
  drop constraint if exists lessons_video_processing_status_check;

alter table public.lessons
  add constraint lessons_video_processing_status_check
  check (
    video_processing_status = any (
      array['idle'::text, 'pending'::text, 'processing'::text, 'ready'::text, 'error'::text]
    )
  );

update public.lessons
set
  video_processing_status = case
    when coalesce(nullif(video_url_360p, ''), nullif(video_url_480p, ''), nullif(video_url_720p, ''), nullif(video_url_1080p, '')) is null
      then 'idle'
    when ai_transcript is not null and btrim(ai_transcript) <> ''
      then 'ready'
    else 'pending'
  end,
  video_processed_at = case
    when ai_transcript is not null and btrim(ai_transcript) <> '' and video_processed_at is null
      then now()
    else video_processed_at
  end;
