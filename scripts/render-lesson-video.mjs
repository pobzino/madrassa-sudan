/**
 * Render a lesson's sim to an MP4 and publish it.
 *
 * Usage:
 *   node scripts/render-lesson-video.mjs <lessonId> [--language=ar|en] [--out=path] [--skip-upload]
 *
 * Pipeline:
 *   1. Fetch the lesson + its sim (deck snapshot, events, clip segments)
 *      with the service-role client.
 *   2. Sign a 6h URL for the sim audio in the private `sim-audio` bucket.
 *   3. Bundle the Remotion composition (remotion/index.ts) and render
 *      1280x720 H.264/AAC via @remotion/renderer.
 *   4. Upload to the public `lesson-videos` bucket at
 *      `<lessonId>/video_720p.mp4` (the same path the student lesson page
 *      already probes for legacy videos) and update the lesson row:
 *      video_url_720p, video_duration_seconds, video_processed_at,
 *      video_processing_status ('processing' -> 'ready' | 'error').
 *
 * Runs standalone (invoked by the export API route as a detached process,
 * or manually from the CLI). Requires SUPABASE_SECRET_KEY (or
 * SUPABASE_SERVICE_ROLE_KEY) and NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 * — loaded from .env.local like the other scripts in this folder.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { webpackOverride } from '../remotion/webpack-override.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const VIDEO_BUCKET = 'lesson-videos';
const COMPOSITION_ID = 'LessonVideo';
const SIM_AUDIO_BUCKET = 'sim-audio';
const AUDIO_SIGNED_URL_TTL_SECONDS = 60 * 60 * 6;

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
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required env var (any of): ${names.join(', ')}`);
}

function parseArgs(argv) {
  const args = {
    lessonId: null,
    language: 'ar',
    out: null,
    skipUpload: false,
    startedAt: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--language=')) {
      const lang = arg.slice('--language='.length);
      if (lang !== 'ar' && lang !== 'en') {
        throw new Error(`Invalid --language: ${lang} (expected ar or en)`);
      }
      args.language = lang;
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
    } else if (arg.startsWith('--started-at=')) {
      // Generation token issued by the export API when it claimed the job.
      args.startedAt = arg.slice('--started-at='.length);
    } else if (arg === '--skip-upload') {
      args.skipUpload = true;
    } else if (!arg.startsWith('--') && !args.lessonId) {
      args.lessonId = arg;
    }
  }
  if (!args.lessonId) {
    throw new Error(
      'Usage: node scripts/render-lesson-video.mjs <lessonId> [--language=ar|en] [--out=path] [--skip-upload]'
    );
  }
  return args;
}

// Mirrors normalizeClips + clipDurationMs in src/lib/sim.types.ts (which is
// TypeScript and can't be imported from a plain .mjs script).
function totalClipMs(clipSegments) {
  if (!Array.isArray(clipSegments)) return 0;
  const valid = clipSegments
    .filter((c) => c && typeof c.start === 'number' && typeof c.end === 'number' && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  let sum = 0;
  let coveredUpTo = -Infinity;
  for (const c of valid) {
    const start = Math.max(c.start, coveredUpTo);
    if (c.end > start) sum += c.end - start;
    coveredUpTo = Math.max(coveredUpTo, c.end);
  }
  return sum * 1000;
}

function log(msg) {
  console.log(`[render-lesson-video] ${new Date().toISOString()} ${msg}`);
}

// Thrown by setLesson when the generation token no longer matches — a newer
// export claimed this lesson, so this worker should bow out silently.
class SupersededError extends Error {}

async function main() {
  loadDotEnvLocal();
  const { lessonId, language, out, skipUpload, startedAt: argStartedAt } = parseArgs(
    process.argv.slice(2)
  );
  // The generation token: passed by the API, or minted here for manual CLI
  // runs. Every status write after the first is guarded by it so a superseded
  // worker cannot clobber a newer run's status or published URL.
  const startedAt = argStartedAt || new Date().toISOString();

  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
  const serviceKey = requiredEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // API-spawned runs carry a token the export route already CAS-claimed, so
  // EVERY write is guarded by it — if a newer export superseded us between
  // spawn and our first write, that first write matches 0 rows and we bail.
  // Manual CLI runs mint their own token, so their first write is
  // unconditional (it establishes the token) and later writes are guarded.
  const externalToken = Boolean(argStartedAt);
  let tokenClaimed = externalToken;
  const setLesson = async (fields, { retries = 3 } = {}) => {
    for (let attempt = 0; ; attempt++) {
      let query = supabase.from('lessons').update(fields).eq('id', lessonId);
      if (tokenClaimed) query = query.eq('video_processing_started_at', startedAt);
      const { data, error } = await query.select('id');
      if (!error) {
        tokenClaimed = true;
        if (Array.isArray(data) && data.length === 0) {
          throw new SupersededError('A newer export superseded this render.');
        }
        return;
      }
      if (attempt >= retries) {
        log(`WARN: failed to update lesson row: ${error.message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  };

  const fail = async (message) => {
    log(`ERROR: ${message}`);
    try {
      await setLesson({
        video_processing_status: 'error',
        video_processing_error: String(message).slice(0, 500),
      });
    } catch (e) {
      if (!(e instanceof SupersededError)) throw e;
    }
    process.exit(1);
  };

  let outputLocation = null;
  try {
    log(`Rendering lesson ${lessonId} (language=${language})`);

    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .select('id, title_ar, title_en')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError) throw new Error(`Failed to load lesson: ${lessonError.message}`);
    if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

    const { data: sim, error: simError } = await supabase
      .from('lesson_sims')
      .select('*')
      .eq('lesson_id', lessonId)
      .maybeSingle();
    if (simError) throw new Error(`Failed to load sim: ${simError.message}`);
    if (!sim) throw new Error('This lesson has no sim recording yet');

    const deck = sim.deck_snapshot;
    if (!Array.isArray(deck) || deck.length === 0) {
      throw new Error('Sim deck snapshot is empty');
    }
    const durationMs = sim.duration_ms || sim.audio_duration_ms || 0;
    if (!durationMs || durationMs <= 0) {
      throw new Error('Sim has no duration');
    }

    // Claim the token (unconditional first write) and mark processing.
    await setLesson({
      video_processing_status: 'processing',
      video_processing_started_at: startedAt,
      video_processing_error: null,
    });

    let audioUrl = null;
    if (sim.audio_path) {
      const { data: signed, error: signError } = await supabase.storage
        .from(SIM_AUDIO_BUCKET)
        .createSignedUrl(sim.audio_path, AUDIO_SIGNED_URL_TTL_SECONDS);
      if (signError || !signed?.signedUrl) {
        throw new Error(
          `Failed to sign sim audio URL: ${signError?.message ?? 'no URL returned'}`
        );
      }
      audioUrl = signed.signedUrl;
    } else {
      log('Sim has no audio track — rendering silent video.');
    }

    const inputProps = {
      deck,
      events: Array.isArray(sim.events) ? sim.events : [],
      durationMs,
      clipSegments: sim.clip_segments ?? null,
      audioUrl,
      language,
    };

    log('Bundling Remotion composition...');
    const serveUrl = await bundle({
      entryPoint: path.join(projectRoot, 'remotion', 'index.ts'),
      webpackOverride,
    });

    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION_ID,
      inputProps,
    });
    log(
      `Composition ready: ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames`
    );

    // Unique per run (pid + token) so a superseded/concurrent worker can
    // never read a temp file another worker is mid-writing.
    outputLocation =
      out ??
      path.join(
        os.tmpdir(),
        `lesson-${lessonId}-${process.pid}-${startedAt.replace(/[:.]/g, '')}-video_720p.mp4`
      );

    let lastLoggedPct = -10;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: audioUrl ? 'aac' : null,
      outputLocation,
      inputProps,
      // Image preloading + font loading can exceed the 30s default on slow
      // networks and image-heavy decks.
      timeoutInMilliseconds: 180_000,
      onProgress: ({ progress }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= lastLoggedPct + 10) {
          lastLoggedPct = pct;
          log(`Render progress: ${pct}%`);
        }
      },
    });

    const stat = fs.statSync(outputLocation);
    log(`Rendered ${outputLocation} (${(stat.size / (1024 * 1024)).toFixed(1)} MB)`);

    const virtualMs = Math.max(0, durationMs - totalClipMs(sim.clip_segments));

    if (skipUpload) {
      log('Skipping upload (--skip-upload). Resetting status to idle.');
      await setLesson({
        video_processing_status: 'idle',
        video_processing_started_at: null,
      });
      return;
    }

    // Bail before uploading if a newer export has taken over — a guarded
    // no-op write throws SupersededError when the token no longer matches.
    await setLesson({ video_processing_status: 'processing' });

    // Idempotent bucket setup — a migration also creates this bucket, but
    // creating on demand keeps the script usable against environments that
    // haven't run it yet.
    const { data: bucket } = await supabase.storage.getBucket(VIDEO_BUCKET);
    if (!bucket) {
      const { error: bucketError } = await supabase.storage.createBucket(VIDEO_BUCKET, {
        public: true,
      });
      if (bucketError && !/already exists/i.test(bucketError.message)) {
        throw new Error(`Failed to create ${VIDEO_BUCKET} bucket: ${bucketError.message}`);
      }
    }

    const storagePath = `${lessonId}/video_720p.mp4`;
    log(`Uploading to ${VIDEO_BUCKET}/${storagePath}...`);
    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(storagePath, fs.readFileSync(outputLocation), {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: pub } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath);
    // Version param busts browser/CDN caches when a lesson is re-exported
    // to the same path.
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    await setLesson({
      video_url_720p: publicUrl,
      video_duration_seconds: Math.round(virtualMs / 1000),
      video_processed_at: new Date().toISOString(),
      video_processing_status: 'ready',
      video_processing_error: null,
    });

    log(`Done. Public URL: ${publicUrl}`);
  } catch (error) {
    if (error instanceof SupersededError) {
      log('Superseded by a newer export — exiting without changes.');
      return;
    }
    await fail(error instanceof Error ? error.message : String(error));
  } finally {
    // Remove the per-run temp render (unless the caller asked for a specific
    // --out path they want to keep).
    if (outputLocation && !out) {
      try {
        fs.rmSync(outputLocation, { force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

// Top-level guard so a throw before/around main()'s try (bad args, missing
// env, module init) surfaces as a logged non-zero exit instead of an
// unhandled rejection that dies silently.
main().catch((error) => {
  log(`FATAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
