/**
 * Lesson MP4 export.
 *
 * POST — kick off a render of the lesson's sim to MP4. The actual rendering
 *   happens in a detached worker process (scripts/render-lesson-video.mjs)
 *   because it bundles a Remotion composition and drives headless Chrome —
 *   far too heavy for a request handler. Progress is tracked on the lessons
 *   row via video_processing_status ('pending' -> 'processing' -> 'ready' |
 *   'error'), so the job survives page reloads and can be polled from any
 *   session.
 *
 *   NOTE: spawning a worker requires a Node server (next dev / next start /
 *   self-hosted). On serverless hosts the route returns 501 — run the script
 *   manually or from a worker box instead.
 *
 * GET — current export status + download URL for the toolbar button poll.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient, hasServiceRoleConfig } from '@/lib/supabase/service';
import { assertCanManageLesson } from '@/lib/server/sim-storage';

const ExportRequestSchema = z.object({
  language: z.enum(['ar', 'en']).optional(),
  /** Re-trigger even if a previous export still reports pending/processing. */
  force: z.boolean().optional(),
});

const ACTIVE_STATUSES = new Set(['pending', 'processing']);
// An export whose claim timestamp is older than this (or missing) is assumed
// dead — the worker crashed, the host restarted, or the row is a legacy
// 'pending' backfill — so a new export may reclaim it without `force`. Set
// well above a realistic worst-case render (a 45-min sim renders in ~20 min)
// so live long renders are never falsely reclaimed; the generation token
// makes an occasional false reclaim harmless anyway.
const STALE_EXPORT_MS = 30 * 60 * 1000;

function isStaleExport(status: string, startedAt: string | null): boolean {
  if (!ACTIVE_STATUSES.has(status)) return false;
  if (!startedAt) return true;
  const startedMs = Date.parse(startedAt);
  return !Number.isFinite(startedMs) || Date.now() - startedMs > STALE_EXPORT_MS;
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

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { error: 'Server is missing Supabase service role credentials for video export.' },
        { status: 500 }
      );
    }

    // Parse text first so an empty body means "use defaults" while genuinely
    // malformed JSON is a 400 (matching the sims route), instead of silently
    // degrading a force/language request to defaults.
    let body: z.infer<typeof ExportRequestSchema> = {};
    const rawBody = (await request.text()).trim();
    if (rawBody.length > 0) {
      let json: unknown;
      try {
        json = JSON.parse(rawBody);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const parsed = ExportRequestSchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.issues },
          { status: 400 }
        );
      }
      body = parsed.data;
    }
    const language = body.language ?? 'ar';

    const dataClient = createServiceClient();

    const { data: sim, error: simError } = await dataClient
      .from('lesson_sims')
      .select('id, duration_ms, audio_duration_ms')
      .eq('lesson_id', lessonId)
      .maybeSingle();
    if (simError) {
      return NextResponse.json({ error: simError.message }, { status: 500 });
    }
    if (!sim || !(sim.duration_ms || sim.audio_duration_ms)) {
      return NextResponse.json(
        { error: 'Record a sim for this lesson before exporting a video.' },
        { status: 409 }
      );
    }

    const { data: lesson, error: lessonError } = await dataClient
      .from('lessons')
      .select('video_processing_status, video_processing_started_at')
      .eq('id', lessonId)
      .single();
    if (lessonError || !lesson) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const active = ACTIVE_STATUSES.has(lesson.video_processing_status);
    const stale = isStaleExport(
      lesson.video_processing_status,
      lesson.video_processing_started_at
    );
    if (active && !stale && !body.force) {
      return NextResponse.json(
        {
          error: 'An export is already in progress for this lesson.',
          status: lesson.video_processing_status,
        },
        { status: 409 }
      );
    }

    // Atomically claim the job: the claim only lands if the row's generation
    // token is still the one we just read (compare-and-set). Two concurrent
    // requests race here and exactly one wins — the loser gets 0 rows and a
    // 409 — so we never spawn two workers for the same read state. The new
    // token (claim time) also supersedes any still-running worker, whose
    // subsequent writes are guarded by the old token.
    const startedAt = new Date().toISOString();
    const priorToken = lesson.video_processing_started_at;
    let claim = dataClient
      .from('lessons')
      .update({
        video_processing_status: 'pending',
        video_processing_started_at: startedAt,
        video_processing_error: null,
      })
      .eq('id', lessonId);
    claim =
      priorToken == null
        ? claim.is('video_processing_started_at', null)
        : claim.eq('video_processing_started_at', priorToken);
    const { data: claimed, error: claimError } = await claim.select('id');
    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: 'Another export was just started for this lesson.' },
        { status: 409 }
      );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'render-lesson-video.mjs');
    const logPath = path.join(os.tmpdir(), `amal-lesson-export-${lessonId}.log`);
    try {
      const logFd = fs.openSync(logPath, 'a');
      const child = spawn(
        process.execPath,
        [
          scriptPath,
          lessonId,
          `--language=${language}`,
          `--started-at=${startedAt}`,
        ],
        {
          cwd: process.cwd(),
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: process.env,
        }
      );
      child.unref();
      fs.closeSync(logFd);
    } catch (spawnError) {
      const message =
        spawnError instanceof Error ? spawnError.message : 'Failed to start render worker';
      await dataClient
        .from('lessons')
        .update({
          video_processing_status: 'error',
          video_processing_error: `Could not start render worker: ${message}`.slice(0, 500),
        })
        .eq('id', lessonId)
        .eq('video_processing_started_at', startedAt);
      return NextResponse.json(
        { error: 'Could not start the render worker (serverless host?).' },
        { status: 501 }
      );
    }

    return NextResponse.json({ status: 'pending' }, { status: 202 });
  } catch (error) {
    console.error('Export video error:', error);
    return NextResponse.json({ error: 'Failed to start video export' }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
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

    const access = await assertCanManageLesson(lessonId, user.id, supabase);
    if (!access.ok) return access.response;

    const dataClient = hasServiceRoleConfig() ? createServiceClient() : supabase;
    const { data: lesson, error } = await dataClient
      .from('lessons')
      .select(
        'video_processing_status, video_processing_error, video_processing_started_at, video_url_720p, video_processed_at, video_duration_seconds'
      )
      .eq('id', lessonId)
      .single();
    if (error || !lesson) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Report a dead export (crashed worker, host restart, legacy 'pending'
    // backfill) as an error so the client offers a retry instead of polling a
    // spinner forever. The row is left as-is; the next export reclaims it.
    const stale = isStaleExport(
      lesson.video_processing_status,
      lesson.video_processing_started_at
    );

    return NextResponse.json({
      status: stale ? 'error' : lesson.video_processing_status,
      error: stale
        ? 'The previous export did not finish. Please try again.'
        : lesson.video_processing_error,
      video_url_720p: lesson.video_url_720p,
      video_processed_at: lesson.video_processed_at,
      video_duration_seconds: lesson.video_duration_seconds,
    });
  } catch (error) {
    console.error('Export video status error:', error);
    return NextResponse.json({ error: 'Failed to load export status' }, { status: 500 });
  }
}
