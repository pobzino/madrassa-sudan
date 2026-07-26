/**
 * Apply a re-recorded "patch take" to a saved sim: splice the audio, rewrite
 * the event timeline, upload the new audio and persist the result.
 *
 * This is the post-recording fix path — a tutor who misspoke on one slide
 * re-performs that slide only, instead of re-recording the whole lesson.
 *
 * The upload dance (prepare → signed PUT → verify → persist) mirrors the
 * create-a-sim flow in `SimReviewModal`, which keeps its own private copy of
 * these helpers; if that file is ever refactored the two should converge on
 * this module.
 */

import { spliceSim, type SplicePlan } from '@/lib/sim-splice';
import { measureAudioDurationMs, spliceSimAudio } from '@/lib/sim-audio-splice';
import type { SimClipSegment, SimEvent } from '@/lib/sim.types';

const RETRY_BACKOFFS_MS = [400, 1200, 2500];
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface SimAudioUploadInstructions {
  sim_id: string;
  bucket: string;
  path: string;
  token: string;
  signed_url: string;
  content_type: string;
}

export interface SimPatchTake {
  audioBlob: Blob;
  /** Events from the patch recording, timestamped from 0. */
  events: SimEvent[];
  /** The recorder's logical duration; used only as a fallback. */
  durationMs: number;
}

export interface ApplySimPatchParams {
  lessonId: string;
  simId: string;
  /** Signed URL of the sim's current audio. */
  audioUrl: string;
  /** The sim's current timeline. */
  events: SimEvent[];
  clipSegments: SimClipSegment[] | null | undefined;
  durationMs: number;
  /** Range being replaced and the slide it belongs to. */
  replaceStartMs: number;
  replaceEndMs: number;
  slideId: string;
  take: SimPatchTake;
  onProgress?: (progress: number, label: string) => void;
}

export interface ApplySimPatchResult {
  durationMs: number;
  audioPath: string;
  eventCount: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries = RETRY_BACKOFFS_MS.length
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(input, init);
      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= retries) {
        return response;
      }
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await delay(RETRY_BACKOFFS_MS[Math.min(attempt, RETRY_BACKOFFS_MS.length - 1)]);
  }
}

async function uploadToSignedUrl(
  instructions: SimAudioUploadInstructions,
  blob: Blob
): Promise<void> {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', blob, instructions.content_type.includes('mp4') ? 'patch.mp4' : 'patch.webm');

  const headers = new Headers({ 'x-upsert': 'true' });
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (anonKey) headers.set('apikey', anonKey);

  const response = await fetchWithRetry(instructions.signed_url, { method: 'PUT', headers, body });
  if (!response.ok) {
    throw new Error(`Patch audio upload failed (${response.status})`);
  }
}

/**
 * Splice `take` over [replaceStartMs, replaceEndMs) and save the result.
 *
 * The original audio object is left in storage (the patch is written to a
 * versioned sibling path) so a failed save never destroys the only copy.
 */
export async function applySimPatch(
  params: ApplySimPatchParams
): Promise<ApplySimPatchResult> {
  const {
    lessonId,
    simId,
    audioUrl,
    events,
    clipSegments,
    durationMs,
    replaceStartMs,
    replaceEndMs,
    slideId,
    take,
    onProgress,
  } = params;

  if (replaceEndMs <= replaceStartMs) throw new Error('Nothing selected to replace.');
  if (!take.audioBlob || take.audioBlob.size === 0) throw new Error('The new recording is empty.');

  onProgress?.(0.05, 'Reading the original recording');
  const originalRes = await fetch(audioUrl, { cache: 'no-store' });
  if (!originalRes.ok) throw new Error('Could not load the original audio to edit.');
  const originalBlob = await originalRes.blob();

  // Trust the measured audio length over the recorder's logical clock: the
  // spliced timeline has to line up with the audio a student actually hears.
  const patchDurationMs =
    (await measureAudioDurationMs(take.audioBlob).catch(() => 0)) || take.durationMs;
  if (patchDurationMs <= 0) throw new Error('Could not measure the new recording.');

  onProgress?.(0.15, 'Splicing audio');
  const audio = await spliceSimAudio({
    original: originalBlob,
    patch: take.audioBlob,
    startSec: replaceStartMs / 1000,
    endSec: replaceEndMs / 1000,
    durationSec: durationMs / 1000,
    onProgress: (p) => onProgress?.(0.15 + p * 0.45, 'Splicing audio'),
  });

  const plan: SplicePlan = { replaceStartMs, replaceEndMs, patchDurationMs, slideId };
  const spliced = spliceSim(events, clipSegments, durationMs, plan, take.events);
  // Prefer the real length of the rebuilt file when we could measure it.
  const finalDurationMs = audio.durationMs > 0 ? audio.durationMs : spliced.durationMs;

  onProgress?.(0.65, 'Uploading');
  const prepareRes = await fetchWithRetry(
    `/api/teacher/lessons/${lessonId}/sims/audio-upload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        audio_mime: audio.mime,
        size_bytes: audio.blob.size,
        sim_id: simId,
      }),
    }
  );
  if (!prepareRes.ok) {
    const body = (await prepareRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not prepare the upload (${prepareRes.status})`);
  }
  const instructions = (await prepareRes.json()) as SimAudioUploadInstructions;

  await uploadToSignedUrl(instructions, audio.blob);

  onProgress?.(0.8, 'Verifying');
  const verifyRes = await fetchWithRetry(
    `/api/teacher/lessons/${lessonId}/sims/audio-upload?path=${encodeURIComponent(instructions.path)}`,
    { credentials: 'include', cache: 'no-store' }
  );
  const verification = (await verifyRes.json().catch(() => null)) as
    | { audio_url?: string; error?: string }
    | null;
  if (!verifyRes.ok || !verification?.audio_url) {
    throw new Error(verification?.error || 'The spliced audio failed verification.');
  }

  onProgress?.(0.9, 'Saving');
  const patchRes = await fetchWithRetry(
    `/api/teacher/lessons/${lessonId}/sims/${simId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        events: spliced.events,
        clip_segments: spliced.clipSegments,
        duration_ms: finalDurationMs,
        audio_upload_path: instructions.path,
        audio_mime: audio.mime,
        audio_duration_ms: audio.durationMs > 0 ? audio.durationMs : null,
      }),
    }
  );
  if (!patchRes.ok) {
    const body = (await patchRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Could not save the fix (${patchRes.status})`);
  }

  onProgress?.(1, 'Done');
  return {
    durationMs: finalDurationMs,
    audioPath: instructions.path,
    eventCount: spliced.events.length,
  };
}
