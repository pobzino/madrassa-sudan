ALTER TABLE public.homework_assignments
  ALTER COLUMN passing_score SET DEFAULT 75;

UPDATE public.homework_assignments
SET passing_score = 75
WHERE is_practice = true
  AND passing_score = 80;
