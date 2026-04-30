import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Database, Json } from '@/lib/database.types';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { getTeacherRole } from '@/lib/server/teacher-lesson-access';
import { SIM_AUDIO_BUCKET } from '@/lib/server/sim-storage';

export const maxDuration = 30;

const SaveAttemptStatusSchema = z.enum([
  'review_opened',
  'save_started',
  'audio_upload_preparing',
  'audio_upload_prepare_failed',
  'audio_upload_prepared',
  'audio_upload_failed',
  'audio_upload_succeeded',
  'finalize_started',
  'finalize_failed',
  'saved',
  'discarded',
  'retake',
  'abandoned',
  'failed',
]);

const JsonObjectSchema = z.record(z.string(), z.unknown());

const SaveAttemptSchema = z.object({
  attempt_id: z.string().uuid(),
  status: SaveAttemptStatusSchema,
  sim_id: z.string().uuid().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  audio_duration_ms: z.number().int().nonnegative().nullable().optional(),
  audio_size_bytes: z.number().int().nonnegative().nullable().optional(),
  audio_mime: z.string().max(200).nullable().optional(),
  audio_path: z.string().max(500).nullable().optional(),
  events_count: z.number().int().nonnegative().nullable().optional(),
  deck_slide_count: z.number().int().nonnegative().nullable().optional(),
  clip_segments_count: z.number().int().nonnegative().nullable().optional(),
  error_message: z.string().max(2000).nullable().optional(),
  error_status: z.number().int().min(100).max(599).nullable().optional(),
  error_details: JsonObjectSchema.optional(),
  browser_info: JsonObjectSchema.optional(),
  runtime_version: z.string().max(120).nullable().optional(),
  page_url: z.string().max(2000).nullable().optional(),
});

type SaveAttemptBody = z.infer<typeof SaveAttemptSchema>;
type SimSaveAttemptInsert = Database['public']['Tables']['sim_save_attempts']['Insert'];

async function parseRequestBody(request: NextRequest): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function setIfPresent<K extends keyof SimSaveAttemptInsert>(
  payload: SimSaveAttemptInsert,
  key: K,
  value: SimSaveAttemptInsert[K] | undefined
) {
  if (value !== undefined) {
    payload[key] = value;
  }
}

function toJson(value: Record<string, unknown> | undefined): Json | undefined {
  return value === undefined ? undefined : (value as Json);
}

async function writeStorageFallback(payload: SimSaveAttemptInsert) {
  const service = createServiceClient();
  const path = `_save-attempts/${payload.lesson_id || 'unknown-lesson'}/${payload.client_attempt_id}.json`;
  let existing: Record<string, unknown> = {};
  const { data: existingBlob } = await service.storage.from(SIM_AUDIO_BUCKET).download(path);
  if (existingBlob) {
    try {
      existing = JSON.parse(await existingBlob.text()) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const { error } = await service.storage.from(SIM_AUDIO_BUCKET).upload(
    path,
    JSON.stringify(
      {
        ...existing,
        ...payload,
        storage_fallback: true,
        stored_at: new Date().toISOString(),
      },
      null,
      2
    ),
    {
      contentType: 'application/json',
      upsert: true,
    }
  );

  if (error) throw error;

  return {
    client_attempt_id: payload.client_attempt_id,
    status: payload.status,
    storage_path: path,
  };
}

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

    const role = await getTeacherRole(supabase, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials.' },
        { status: 500 }
      );
    }

    let body: SaveAttemptBody;
    try {
      const parsed = SaveAttemptSchema.safeParse(await parseRequestBody(request));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.issues },
          { status: 400 }
        );
      }
      body = parsed.data;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const payload: SimSaveAttemptInsert = {
      client_attempt_id: body.attempt_id,
      lesson_id: lessonId,
      user_id: user.id,
      status: body.status,
      last_seen_at: now,
    };

    setIfPresent(payload, 'sim_id', body.sim_id ?? undefined);
    setIfPresent(payload, 'duration_ms', body.duration_ms ?? undefined);
    setIfPresent(payload, 'audio_duration_ms', body.audio_duration_ms ?? undefined);
    setIfPresent(payload, 'audio_size_bytes', body.audio_size_bytes ?? undefined);
    setIfPresent(payload, 'audio_mime', body.audio_mime ?? undefined);
    setIfPresent(payload, 'audio_path', body.audio_path ?? undefined);
    setIfPresent(payload, 'events_count', body.events_count ?? undefined);
    setIfPresent(payload, 'deck_slide_count', body.deck_slide_count ?? undefined);
    setIfPresent(payload, 'clip_segments_count', body.clip_segments_count ?? undefined);
    setIfPresent(payload, 'error_message', body.error_message ?? undefined);
    setIfPresent(payload, 'error_status', body.error_status ?? undefined);
    setIfPresent(payload, 'error_details', toJson(body.error_details));
    setIfPresent(payload, 'browser_info', toJson(body.browser_info));
    setIfPresent(payload, 'runtime_version', body.runtime_version ?? undefined);
    setIfPresent(payload, 'page_url', body.page_url ?? undefined);

    const service = createServiceClient();
    const { data, error } = await service
      .from('sim_save_attempts')
      .upsert(payload, { onConflict: 'client_attempt_id' })
      .select('id, client_attempt_id, status, created_at, updated_at')
      .single();

    if (error || !data) {
      if (error?.code === '42P01') {
        const fallback = await writeStorageFallback(payload);
        return NextResponse.json({ attempt: fallback, storage_fallback: true });
      }
      console.error('Track sim save attempt error:', error);
      return NextResponse.json(
        { error: error?.message || 'Failed to track sim save attempt' },
        { status: 500 }
      );
    }

    return NextResponse.json({ attempt: data });
  } catch (error) {
    console.error('Track sim save attempt error:', error);
    return NextResponse.json({ error: 'Failed to track sim save attempt' }, { status: 500 });
  }
}
