-- Keep the learning material separate from the language used to explain it.
-- This prevents English words, letters, and answer choices from being
-- substituted with Arabic transliterations when the interface is Arabic.
ALTER TABLE public.homework_questions
  ADD COLUMN IF NOT EXISTS instruction_ar text,
  ADD COLUMN IF NOT EXISTS instruction_en text,
  ADD COLUMN IF NOT EXISTS question_content text,
  ADD COLUMN IF NOT EXISTS question_content_language text,
  ADD COLUMN IF NOT EXISTS answer_language text;

ALTER TABLE public.homework_questions
  DROP CONSTRAINT IF EXISTS homework_questions_content_language_check,
  DROP CONSTRAINT IF EXISTS homework_questions_answer_language_check;

ALTER TABLE public.homework_questions
  ADD CONSTRAINT homework_questions_content_language_check
    CHECK (question_content_language IS NULL OR question_content_language IN ('ar', 'en')),
  ADD CONSTRAINT homework_questions_answer_language_check
    CHECK (answer_language IS NULL OR answer_language IN ('ar', 'en'));

COMMENT ON COLUMN public.homework_questions.instruction_ar IS
  'Arabic instruction that explains the task without translating assessed material.';
COMMENT ON COLUMN public.homework_questions.instruction_en IS
  'English instruction that explains the task without translating assessed material.';
COMMENT ON COLUMN public.homework_questions.question_content IS
  'The exact word, number, expression, or sentence being assessed.';
COMMENT ON COLUMN public.homework_questions.question_content_language IS
  'Language of question_content: ar or en.';
COMMENT ON COLUMN public.homework_questions.answer_language IS
  'Language of the learner-facing answer choices: ar or en.';
