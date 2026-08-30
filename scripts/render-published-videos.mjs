/**
 * Render mobile-safe H.264/AAC downloads for published lesson recordings.
 *
 * By default this processes published lessons whose video is missing or older
 * than the current sim recording. Each lesson is rendered by the canonical
 * render-lesson-video.mjs worker, which uploads the MP4 and updates the lesson.
 *
 * Usage:
 *   node scripts/render-published-videos.mjs
 *   node scripts/render-published-videos.mjs --concurrency=2 --limit=5
 *   node scripts/render-published-videos.mjs --lesson=<uuid> --force
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadDotEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function requiredEnv(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required env var (any of): ${names.join(', ')}`);
}

function parsePositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const args = {
    concurrency: 1,
    limit: Number.POSITIVE_INFINITY,
    force: false,
    language: 'ar',
    lessonId: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--concurrency=')) {
      args.concurrency = parsePositiveInteger(arg.slice('--concurrency='.length), 'concurrency');
    } else if (arg.startsWith('--limit=')) {
      args.limit = parsePositiveInteger(arg.slice('--limit='.length), 'limit');
    } else if (arg.startsWith('--language=')) {
      const language = arg.slice('--language='.length);
      if (language !== 'ar' && language !== 'en') throw new Error('language must be ar or en.');
      args.language = language;
    } else if (arg.startsWith('--lesson=')) {
      args.lessonId = arg.slice('--lesson='.length).trim() || null;
    } else if (arg === '--force') {
      args.force = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function needsRender(lesson, sim, force) {
  if (force) return true;
  if (!lesson.video_url_720p || !lesson.video_processed_at) return true;
  const videoTime = Date.parse(lesson.video_processed_at);
  const simTime = Date.parse(sim.updated_at);
  return !Number.isFinite(videoTime) || (Number.isFinite(simTime) && simTime > videoTime);
}

function runRenderer(lesson, language) {
  const script = path.join(projectRoot, 'scripts', 'render-lesson-video.mjs');
  return new Promise((resolve) => {
    console.log(`[render-published] START ${lesson.id} ${lesson.title_en}`);
    const child = spawn(process.execPath, [script, lesson.id, `--language=${language}`], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', (error) => resolve({ lesson, ok: false, error: error.message }));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        console.log(`[render-published] DONE  ${lesson.id} ${lesson.title_en}`);
        resolve({ lesson, ok: true });
      } else {
        resolve({
          lesson,
          ok: false,
          error: signal ? `terminated by ${signal}` : `renderer exited with code ${code}`,
        });
      }
    });
  });
}

async function main() {
  loadDotEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
    requiredEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } }
  );

  let lessonQuery = supabase
    .from('lessons')
    .select(
      'id, title_en, display_order, video_url_720p, video_processed_at, video_processing_status'
    )
    .eq('is_published', true)
    .order('display_order', { ascending: true });
  if (args.lessonId) lessonQuery = lessonQuery.eq('id', args.lessonId);

  const { data: lessons, error: lessonError } = await lessonQuery;
  if (lessonError) throw lessonError;
  if (!lessons?.length) {
    console.log('[render-published] No matching published lessons.');
    return;
  }

  const { data: sims, error: simError } = await supabase
    .from('lesson_sims')
    .select('lesson_id, audio_path, duration_ms, audio_duration_ms, updated_at')
    .in(
      'lesson_id',
      lessons.map((lesson) => lesson.id)
    );
  if (simError) throw simError;

  const simsByLesson = new Map((sims ?? []).map((sim) => [sim.lesson_id, sim]));
  const skippedWithoutAudio = [];
  const candidates = [];
  for (const lesson of lessons) {
    const sim = simsByLesson.get(lesson.id);
    if (!sim?.audio_path || !(sim.duration_ms || sim.audio_duration_ms)) {
      skippedWithoutAudio.push(lesson);
      continue;
    }
    if (needsRender(lesson, sim, args.force)) candidates.push(lesson);
  }

  if (skippedWithoutAudio.length > 0) {
    console.warn(
      `[render-published] Skipping ${skippedWithoutAudio.length} lesson(s) without usable audio.`
    );
  }

  const queue = candidates.slice(0, args.limit);
  console.log(
    `[render-published] ${queue.length} render(s) queued (${candidates.length} stale/missing, concurrency=${args.concurrency}).`
  );
  if (queue.length === 0) return;

  let nextIndex = 0;
  const results = [];
  const workers = Array.from(
    { length: Math.min(args.concurrency, queue.length) },
    async () => {
      while (nextIndex < queue.length) {
        const lesson = queue[nextIndex++];
        results.push(await runRenderer(lesson, args.language));
      }
    }
  );
  await Promise.all(workers);

  const failed = results.filter((result) => !result.ok);
  console.log(
    `[render-published] Complete: ${results.length - failed.length} succeeded, ${failed.length} failed.`
  );
  for (const result of failed) {
    console.error(`[render-published] FAIL ${result.lesson.id}: ${result.error}`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[render-published] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
