-- Add AI generation tracking columns to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS ai_transcript text;
