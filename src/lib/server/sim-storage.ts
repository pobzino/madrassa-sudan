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
import { canManageLesson, getTeacherRole } from '@/lib/server/teacher-lesson-access';

export const SIM_AUDIO_BUCKET = 'sim-audio';
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
 * opaque error when either access check fails. Returns either an ok result
 * (with `lessonPublished` for draft-only gating) or a NextResponse to return
 * directly from the handler.
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

  if (
    !lesson ||
    !canManageLesson({ role, userId, lessonCreatedBy: lesson.created_by })
  ) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  return { ok: true, lessonPublished: lesson.is_published === true };
}

/**
 * Check whether the current user has the `can_access_sims` flag enabled.
 * In development mode, the flag defaults to true if unset.
 */
export async function assertSimFeatureAccess(
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('can_access_sims')
    .eq('id', userId)
    .single();

  const canAccess = profile?.can_access_sims ?? (process.env.NODE_ENV === 'development');
  if (!canAccess) {
    return { ok: false, response: NextResponse.json({ error: 'Sim access not enabled for this account.' }, { status: 403 }) };
  }
  return { ok: true };
}
