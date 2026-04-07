-- Add the `status` column to cohort_students.
-- The column is referenced by the cohort join/browse UI but was never created.
-- Values: 'approved' (enrolled), 'pending' (awaiting approval), 'rejected'.

ALTER TABLE cohort_students
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
