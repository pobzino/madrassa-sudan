-- Public bucket for exported lesson MP4s.
--
-- Path convention: <lesson_id>/video_720p.mp4 — the same path the student
-- lesson page already probes for legacy full-frame videos, so old uploads
-- and new sim exports resolve identically.
--
-- Objects are written exclusively by the render worker
-- (scripts/render-lesson-video.mjs) using the service-role client, which
-- bypasses RLS; no INSERT/UPDATE policies are granted to authenticated
-- users. Reads are anonymous via the public-bucket URL, matching the
-- existing 'lessons' bucket. Only published lessons get their URL surfaced
-- in the app, but note the file itself is publicly reachable by anyone who
-- has the link.
insert into storage.buckets (id, name, public)
values ('lesson-videos', 'lesson-videos', true)
on conflict (id) do nothing;
