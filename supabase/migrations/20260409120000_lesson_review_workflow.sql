-- Add lesson review workflow columns
ALTER TABLE lessons
  ADD COLUMN submitted_for_review boolean NOT NULL DEFAULT false,
  ADD COLUMN submitted_for_review_at timestamptz;

-- Index for admin review queue: pending reviews that aren't published yet
CREATE INDEX idx_lessons_pending_review
  ON lessons (submitted_for_review, is_published)
  WHERE submitted_for_review = true AND is_published = false;
