-- Unapproved teacher/admin accounts get no access to stored files.
--
-- Anyone can sign up asking for the teacher role, and the storage policies
-- check only the role: "Students can view their own homework files" lets any
-- teacher or admin list and download every student's homework uploads, and
-- "Teachers can upload lesson files" lets them put files in the public
-- lessons bucket. 20261016120000 shut unapproved staff out of the app's
-- tables with a RESTRICTIVE policy; this does the same for storage.objects.
--
-- Public buckets (lessons, avatars, lesson-videos, practice-audio) are still
-- readable by everyone through their public URLs, which don't go through
-- these policies. Approved staff, students, parents and the service role
-- (server routes, the render worker) are unaffected.
--
-- Needs public.is_unapproved_staff() from 20261016120000.

DROP POLICY IF EXISTS "Unapproved staff have no storage access" ON storage.objects;
CREATE POLICY "Unapproved staff have no storage access"
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT (SELECT public.is_unapproved_staff()))
  WITH CHECK (NOT (SELECT public.is_unapproved_staff()));
