-- Rate-limit and audit log for teacher AI slide image generation.
-- Written to only by the service role from
-- src/app/api/teacher/slides/generate-image/route.ts. No client policies.
CREATE TABLE IF NOT EXISTS ai_image_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  slide_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('scene', 'owl')),
  prompt TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_image_generations_user_created_idx
  ON ai_image_generations (user_id, created_at DESC);

ALTER TABLE ai_image_generations ENABLE ROW LEVEL SECURITY;
-- No client policies: only the service role (API route) reads/writes this table.
