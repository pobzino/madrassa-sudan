import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import {
  SIM_AUDIO_BUCKET,
  SIM_AUDIO_MAX_BYTES,
  assertCanManageLesson,
  assertSimFeatureAccess,
  isAudioPathForLesson,
  probeSignedAudioUrl,
  signAudioUrl,
} from '@/lib/server/sim-storage';

const PrepareAudioUploadSchema = z.object({
  audio_mime: z.string().nullable().optional(),
  size_bytes: z.number().int().positive().max(SIM_AUDIO_MAX_BYTES).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simAccess = await assertSimFeatureAccess(user.id, supabase);
    if (!simAccess.ok) return simAccess.response;

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    if (access.lessonPublished) {
      return NextResponse.json(
        { error: 'Cannot replace sim while the lesson is published. Unpublish first.' },
        { status: 409 }
      );
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials for storage upload.' },
        { status: 500 }
      );
    }

    const parsed = PrepareAudioUploadSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const mime = parsed.data.audio_mime || 'audio/webm';
    const extFromMime = mime.includes('mp4') ? 'mp4' : 'webm';
    const simId = randomUUID();
    const audioPath = `${lessonId}/${simId}.${extFromMime}`;

    const service = createServiceClient();
    const { data: signedUpload, error: signedUploadError } = await service.storage
      .from(SIM_AUDIO_BUCKET)
      .createSignedUploadUrl(audioPath, { upsert: true });

    if (signedUploadError || !signedUpload?.token || !signedUpload?.signedUrl) {
      return NextResponse.json(
        { error: signedUploadError?.message || 'Failed to prepare audio upload' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sim_id: simId,
      bucket: SIM_AUDIO_BUCKET,
      path: audioPath,
      token: signedUpload.token,
      signed_url: signedUpload.signedUrl,
      content_type: mime,
    });
  } catch (error) {
    console.error('Prepare sim audio upload error:', error);
    return NextResponse.json({ error: 'Failed to prepare audio upload' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const simAccess = await assertSimFeatureAccess(user.id, supabase);
    if (!simAccess.ok) return simAccess.response;

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    const audioPath = request.nextUrl.searchParams.get('path');
    if (!isAudioPathForLesson(lessonId, audioPath)) {
      return NextResponse.json({ error: 'Invalid audio upload path' }, { status: 400 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials for storage validation.' },
        { status: 500 }
      );
    }

    const service = createServiceClient();
    const { data: objectExists, error: existsError } = await service.storage
      .from(SIM_AUDIO_BUCKET)
      .exists(audioPath);

    if (existsError || !objectExists) {
      return NextResponse.json(
        { error: existsError?.message || 'Uploaded audio object was not found.' },
        { status: 404 }
      );
    }

    const audioUrl = await signAudioUrl(lessonId, audioPath);
    if (!audioUrl) {
      return NextResponse.json({ error: 'Failed to sign uploaded audio for playback.' }, { status: 500 });
    }

    const probe = await probeSignedAudioUrl(audioUrl, audioPath);
    if (!probe.ok) {
      return NextResponse.json(
        {
          error: 'Uploaded audio is not a valid playable media file. Please retake before saving.',
          probe,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ audio_url: audioUrl, probe });
  } catch (error) {
    console.error('Validate sim audio upload error:', error);
    return NextResponse.json({ error: 'Failed to validate audio upload' }, { status: 500 });
  }
}
