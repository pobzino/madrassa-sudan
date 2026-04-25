/**
 * Shared server-side helpers for the teacher sim API routes.
 *
 * Both `/api/teacher/lessons/[id]/sims` and
 * `/api/teacher/lessons/[id]/sims/[simId]` need the same constants, zod
 * schemas, and signed-URL + access-check logic. Keep them in one place so
 * the constraints (bucket name, signed URL TTL, clip segment shape, draft
 * gating) can't drift between the two endpoints.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import { canEditAssignedLesson, getTeacherRole } from '@/lib/server/teacher-lesson-access';

export const SIM_AUDIO_BUCKET = 'sim-audio';
export const SIM_AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 6; // 6h — long enough for a review session

export const ClipSegmentSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .refine((s) => s.end > s.start, 'end must be greater than start');

/** Sign a sim-audio object path for browser playback. */
export async function signAudioUrl(
  lessonId: string,
  audioPath: string | null
): Promise<string | null> {
  if (!audioPath || !hasServiceRoleConfig()) return null;
  // Defense-in-depth: make sure the path is actually inside this lesson.
  if (!audioPath.startsWith(`${lessonId}/`)) return null;
  try {
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(SIM_AUDIO_BUCKET)
      .createSignedUrl(audioPath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's role + the lesson's publish state, 404-ing as a single
 * opaque error when either access check fails. Assigned teachers can edit sims
 * for lessons shared through their cohorts, matching the slide editor.
 */
export async function assertCanManageLesson(
  lessonId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
  | { ok: true; lessonPublished: boolean }
  | { ok: false; response: NextResponse }
> {
  const role = await getTeacherRole(supabase, userId);
  if (!role) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, created_by, is_published')
    .eq('id', lessonId)
    .single();

  const canEdit = lesson
    ? await canEditAssignedLesson({
        supabase,
        role,
        userId,
        lessonId,
        lessonCreatedBy: lesson.created_by,
      })
    : false;

  if (!lesson || !canEdit) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  return { ok: true, lessonPublished: lesson.is_published === true };
}

/**
 * Sim recording is now available to all authenticated teachers. This helper
 * is kept for API compatibility with existing route handlers.
 */
export async function assertSimFeatureAccess(
  _userId: string,
  _supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  return { ok: true };
}
