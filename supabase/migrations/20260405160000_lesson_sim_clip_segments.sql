-- Non-destructive clip editing for lesson sims.
--
-- Teachers can mark ranges of an existing sim as "cut" without touching the
-- original audio file or events array. The player honors `clip_segments` by
-- seeking the audio past each range and filtering events whose `t` falls
-- inside one of them.
--
-- Shape: null for unclipped sims, otherwise an array of {start, end} objects
-- where start/end are seconds measured against the original timeline, e.g.
--   [{"start": 0, "end": 2.5}, {"start": 18.2, "end": 22.0}]

ALTER TABLE public.lesson_sims
  ADD COLUMN IF NOT EXISTS clip_segments JSONB;
