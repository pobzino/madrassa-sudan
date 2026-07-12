-- Generation token + staleness timestamp for lesson MP4 exports.
--
-- Set to the claim time each time an export is (re)started. Doubles as:
--   1. Staleness detector — an export whose started_at is older than a
--      ceiling (or null, e.g. legacy rows backfilled to 'pending' by
--      20260404173000) is treated as dead so the UI can offer a retry
--      instead of a permanent spinner.
--   2. Generation token — the render worker guards every status write with
--      `.eq(video_processing_started_at, <claim time>)`, so a superseded
--      worker (from a forced re-export) cannot clobber the newer run's
--      status or published URL.
alter table public.lessons
  add column if not exists video_processing_started_at timestamptz;
