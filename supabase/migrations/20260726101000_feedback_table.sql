-- Staff feedback reports (bug/idea/content), optionally mirrored to GitHub
-- issues by /api/admin/feedback. The table already exists in production (it was
-- created from the dashboard); this migration brings it under version control.
CREATE TABLE IF NOT EXISTS public.feedback (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  user_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category            text NOT NULL,
  title               text NOT NULL,
  description         text NOT NULL,
  page_url            text,
  screenshot_url      text,
  github_issue_number int,
  github_issue_url    text,
  status              text NOT NULL DEFAULT 'open'
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Staff can file feedback as themselves.
DROP POLICY IF EXISTS "Staff can insert their own feedback" ON public.feedback;
CREATE POLICY "Staff can insert their own feedback"
  ON public.feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('teacher'::user_role, 'admin'::user_role)
    )
  );

-- Teachers see their own reports; admins see everything (and can update).
DROP POLICY IF EXISTS "Staff can view feedback" ON public.feedback;
CREATE POLICY "Staff can view feedback"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Reporters and admins can update feedback" ON public.feedback;
CREATE POLICY "Reporters and admins can update feedback"
  ON public.feedback
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
