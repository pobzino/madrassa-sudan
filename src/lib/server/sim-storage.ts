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

export function isAudioPathForLesson(lessonId: string, audioPath: string | null | undefined): audioPath is string {
  return Boolean(audioPath && audioPath.startsWith(`${lessonId}/`));
}

export async function probeSignedAudioUrl(
  audioUrl: string,
  audioPath: string
): Promise<{ ok: true; bytesRead: number } | { ok: false; reason: string; bytesRead?: number; status?: number }> {
  try {
    const response = await fetch(audioUrl, {
      cache: 'no-store',
      headers: { Range: 'bytes=0-63' },
      signal: AbortSignal.timeout(15_000),
    });

    if (![200, 206].includes(response.status)) {
      return { ok: false, reason: 'audio_url_not_readable', status: response.status };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const bytesRead = bytes.byteLength;
    if (bytesRead === 0) return { ok: false, reason: 'empty_audio_object', bytesRead };

    const lowerPath = audioPath.toLowerCase();
    if (lowerPath.endsWith('.webm')) {
      const isWebm = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
      return isWebm ? { ok: true, bytesRead } : { ok: false, reason: 'invalid_webm_header', bytesRead };
    }

    if (lowerPath.endsWith('.mp4') || lowerPath.endsWith('.m4a')) {
      const isMp4 = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      return isMp4 ? { ok: true, bytesRead } : { ok: false, reason: 'invalid_mp4_header', bytesRead };
    }

    if (lowerPath.endsWith('.wav')) {
      const isWav =
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
      return isWav ? { ok: true, bytesRead } : { ok: false, reason: 'invalid_wav_header', bytesRead };
    }

    return { ok: true, bytesRead };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'audio_probe_failed',
    };
  }
}

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
  if (!isAudioPathForLesson(lessonId, audioPath)) return null;
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
