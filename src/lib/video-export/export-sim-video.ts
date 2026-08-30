'use client';

/**
 * Client-side sim → MP4 exporter.
 *
 * Renders a lesson sim to an MP4 entirely in the browser — no server, no
 * storage. Deterministic and faster than real time:
 *
 *   1. Rasterize the current slide's visual state once per state change
 *      (slide change / bullet reveal / answer change) via the real SlideCard
 *      component (slide-rasterizer.tsx).
 *   2. For each output frame (30fps over the clipped timeline), composite
 *      slide bitmap + whiteboard strokes + laser + spotlight + entrance
 *      animation onto a 1280x720 canvas — the same projection SimPlayer and
 *      the Remotion pipeline use, driven by the shared clip math and
 *      event-replay in sim.types.
 *   3. Encode with the browser's hardware H.264 encoder (WebCodecs) and mux
 *      to MP4 with mp4-muxer. Audio comes from the sim's recorded track:
 *      decoded, cut to the clip segments sample-accurately, then encoded
 *      AAC. MP4 export fails when the browser cannot encode compatible
 *      audio instead of silently producing a video-only file.
 *
 * Requires WebCodecs (Chrome/Edge, Safari 16.4+, Firefox 130+) — gate on
 * `isVideoExportSupported()`.
 */

import { renderStrokeToCtx } from '@/hooks/useWhiteboard';
import {
  applySimEvent,
  clipDurationMs,
  createInitialSimSurface,
  filterClippedEvents,
  normalizeClips,
  simStrokeToStroke,
  virtualToRealMs,
  type SimClipSegment,
  type SimEvent,
  type SimPayload,
  type SimSurfaceState,
} from '@/lib/sim.types';
import type { Slide, SlideEntranceAnimation } from '@/lib/slides.types';
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import {
  createSlideRasterizer,
  visualStateKey,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type SlideVisualState,
} from './slide-rasterizer';

const FPS = 30;
const VIDEO_BITRATE = 2_500_000;
const AUDIO_BITRATE = 96_000;
const AUDIO_SAMPLE_RATE = 48_000;
const KEYFRAME_INTERVAL_FRAMES = FPS * 3;
const LASER_FADE_MS = 300;

// Try higher H.264 profiles first; fall back to constrained baseline.
const H264_CODEC_CANDIDATES = [
  'avc1.640028', // High L4.0
  'avc1.4d0028', // Main L4.0
  'avc1.42e01f', // Constrained Baseline L3.1
  'avc1.42001f', // Baseline L3.1
];

export type ExportPhase = 'preparing' | 'rendering' | 'finalizing';

export interface ExportProgress {
  phase: ExportPhase;
  /** Overall progress 0–100. */
  percent: number;
}

export interface ExportSimVideoOptions {
  language: 'ar' | 'en';
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportSimVideoResult {
  blob: Blob;
  durationMs: number;
  width: number;
  height: number;
}

/** Synchronous capability gate for showing/hiding the export button. */
export function isVideoExportSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof createImageBitmap === 'function'
  );
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('Export cancelled', 'AbortError');
  }
}

async function pickVideoCodec(): Promise<string | null> {
  for (const codec of H264_CODEC_CANDIDATES) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        bitrate: VIDEO_BITRATE,
        framerate: FPS,
        avc: { format: 'avc' },
      });
      if (supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

async function pickAudioCodec(
  numberOfChannels: number
): Promise<{ webCodec: string; muxCodec: 'aac' } | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  // Do not put Opus in an MP4 fallback. Although browsers may encode it,
  // native Android/iOS and desktop players commonly expose the result as a
  // silent video. AAC is the interoperable audio codec for our MP4 downloads.
  const candidates: { webCodec: string; muxCodec: 'aac' }[] = [
    { webCodec: 'mp4a.40.2', muxCodec: 'aac' },
  ];
  for (const candidate of candidates) {
    try {
      const { supported } = await AudioEncoder.isConfigSupported({
        codec: candidate.webCodec,
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfChannels,
        bitrate: AUDIO_BITRATE,
      });
      if (supported) return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/** Un-cut ranges of the raw timeline, in ms. */
function keptSegments(
  clips: SimClipSegment[],
  rawTotalMs: number
): { startMs: number; endMs: number }[] {
  const out: { startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const c of clips) {
    const startMs = c.start * 1000;
    const endMs = c.end * 1000;
    if (startMs > cursor) out.push({ startMs: cursor, endMs: Math.min(startMs, rawTotalMs) });
    cursor = Math.max(cursor, endMs);
    if (cursor >= rawTotalMs) break;
  }
  if (cursor < rawTotalMs) out.push({ startMs: cursor, endMs: rawTotalMs });
  return out.filter((k) => k.endMs - k.startMs > 10);
}

/**
 * Fetch + decode the sim audio and cut the clip ranges out, sample-accurately,
 * producing planar f32 PCM on the virtual (clipped) timeline.
 */
async function loadClippedAudio(
  audioUrl: string,
  clips: SimClipSegment[],
  rawTotalMs: number,
  signal: AbortSignal | undefined
): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  const res = await fetch(audioUrl, { signal });
  if (!res.ok) throw new Error(`Audio download failed (HTTP ${res.status})`);
  const encoded = await res.arrayBuffer();
  throwIfAborted(signal);

  // Decode at a fixed 48kHz so both AAC and Opus (which requires 48k) work.
  const ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(encoded);
  } finally {
    void ctx.close();
  }
  throwIfAborted(signal);

  const channelCount = Math.min(decoded.numberOfChannels, 2) || 1;
  const segments = keptSegments(clips, rawTotalMs);
  const sampleRate = decoded.sampleRate;
  const totalSamples = segments.reduce((sum, seg) => {
    const start = Math.min(Math.floor((seg.startMs / 1000) * sampleRate), decoded.length);
    const end = Math.min(Math.floor((seg.endMs / 1000) * sampleRate), decoded.length);
    return sum + Math.max(0, end - start);
  }, 0);
  if (totalSamples === 0) return null;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    const src = decoded.getChannelData(ch);
    const dst = new Float32Array(totalSamples);
    let offset = 0;
    for (const seg of segments) {
      const start = Math.min(Math.floor((seg.startMs / 1000) * sampleRate), decoded.length);
      const end = Math.min(Math.floor((seg.endMs / 1000) * sampleRate), decoded.length);
      if (end > start) {
        dst.set(src.subarray(start, end), offset);
        offset += end - start;
      }
    }
    channels.push(dst);
  }
  return { channels, sampleRate };
}

// Matches globals.css slide-entrance-* keyframes; CSS ease-out ≈ this cubic.
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2.2);
}

function entranceTransform(
  ctx: CanvasRenderingContext2D,
  anim: SlideEntranceAnimation | null | undefined,
  ageMs: number
): number {
  if (!anim || anim === 'none') return 1;
  const durationMs = anim === 'slide_up' ? 400 : 350;
  const p = easeOut(Math.min(1, Math.max(0, ageMs / durationMs)));
  if (anim === 'slide_up') {
    ctx.translate(0, 24 * (1 - p));
  } else if (anim === 'pop') {
    const scale = 0.96 + 0.04 * p;
    ctx.translate((DESIGN_WIDTH * (1 - scale)) / 2, (DESIGN_HEIGHT * (1 - scale)) / 2);
    ctx.scale(scale, scale);
  }
  return p; // alpha for all three animations
}

function drawLaser(ctx: CanvasRenderingContext2D, x: number, y: number, age: number) {
  const opacity = Math.max(0, 1 - age / LASER_FADE_MS);
  if (opacity <= 0) return;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 12);
  glow.addColorStop(0, `rgba(255,80,80,${opacity * 0.9})`);
  glow.addColorStop(0.4, `rgba(255,40,40,${opacity * 0.5})`);
  glow.addColorStop(0.7, 'rgba(255,40,40,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${opacity * 0.95})`;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpotlight(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, 260);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(140 / 260, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
}

async function waitForQueue(encoder: VideoEncoder | AudioEncoder, max: number) {
  while (encoder.encodeQueueSize > max) {
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
}

/**
 * Export a sim to an MP4 blob. Throws DOMException('AbortError') when
 * cancelled via `signal`; other failures throw Error with a user-relevant
 * message.
 */
export async function exportSimVideo(
  payload: SimPayload,
  options: ExportSimVideoOptions
): Promise<ExportSimVideoResult> {
  const { language, onProgress, signal } = options;
  const { sim, audio_url } = payload;
  const deck = sim.deck_snapshot;
  if (!Array.isArray(deck) || deck.length === 0) {
    throw new Error('This recording has no slides.');
  }
  const rawTotalMs = sim.duration_ms || sim.audio_duration_ms || 0;
  if (rawTotalMs <= 0) throw new Error('This recording has no duration.');

  const report = (phase: ExportPhase, percent: number) =>
    onProgress?.({ phase, percent: Math.round(percent) });

  report('preparing', 0);
  throwIfAborted(signal);

  const clips = normalizeClips(sim.clip_segments);
  const events = filterClippedEvents(sim.events ?? [], clips);
  const virtualTotalMs = Math.max(0, rawTotalMs - clipDurationMs(clips));
  const totalFrames = Math.max(1, Math.ceil((virtualTotalMs / 1000) * FPS));
  const usPerFrame = 1_000_000 / FPS;

  const videoCodec = await pickVideoCodec();
  if (!videoCodec) {
    throw new Error('This browser cannot encode H.264 video. Try Chrome or Edge.');
  }

  // Audio is mandatory for lesson downloads. A successful silent export is
  // worse than a clear compatibility error because it looks like lost work.
  report('preparing', 2);
  if (!audio_url) {
    throw new Error('This lesson recording has no audio track.');
  }
  const audio = await loadClippedAudio(audio_url, clips, rawTotalMs, signal);
  if (!audio) {
    throw new Error('The lesson audio track is empty.');
  }
  const audioCodec = await pickAudioCodec(audio.channels.length);
  if (!audioCodec) {
    throw new Error(
      'This browser cannot create a compatible MP4 with audio. Try Download again later or use Chrome or Edge on a computer.'
    );
  }

  report('preparing', 5);
  const rasterizer = await createSlideRasterizer(language);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      frameRate: FPS,
    },
    audio: {
      codec: audioCodec.muxCodec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels.length,
    },
    fastStart: 'in-memory',
  });

  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure({
    codec: videoCodec,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    bitrate: VIDEO_BITRATE,
    framerate: FPS,
    avc: { format: 'avc' },
  });

  const canvas = document.createElement('canvas');
  canvas.width = DESIGN_WIDTH;
  canvas.height = DESIGN_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a drawing canvas.');

  let currentBitmap: ImageBitmap | null = null;

  try {
    // ── Audio encode (fast, do it first) ─────────────────────────────────
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure({
      codec: audioCodec.webCodec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels.length,
      bitrate: AUDIO_BITRATE,
    });

    const { channels, sampleRate } = audio;
    const totalSamples = channels[0].length;
    const chunkSamples = sampleRate / 10; // 100ms per AudioData
    for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
      throwIfAborted(signal);
      if (encoderError) throw encoderError;
      const frames = Math.min(chunkSamples, totalSamples - offset);
      const planar = new Float32Array(frames * channels.length);
      for (let ch = 0; ch < channels.length; ch++) {
        planar.set(channels[ch].subarray(offset, offset + frames), ch * frames);
      }
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: frames,
        numberOfChannels: channels.length,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: planar,
      });
      audioEncoder.encode(data);
      data.close();
      await waitForQueue(audioEncoder, 16);
    }
    await audioEncoder.flush();
    audioEncoder.close();
    if (encoderError) throw encoderError;
    report('rendering', 10);

    // ── Video frames over the virtual timeline ───────────────────────────
    let state: SimSurfaceState = createInitialSimSurface(deck);
    let eventPtr = 0;
    let lastSlideChangeT = 0;
    let lastLaser: { t: number; x: number; y: number } | null = null;
    let currentKey = '';

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      if (encoderError) throw encoderError;

      const virtualMs = (frame / FPS) * 1000;
      const realMs = virtualToRealMs(virtualMs, clips);

      while (eventPtr < events.length && events[eventPtr].t <= realMs) {
        const event: SimEvent = events[eventPtr];
        state = applySimEvent(state, event);
        if (event.type === 'slide_change') lastSlideChangeT = event.t;
        if (event.type === 'laser') lastLaser = { t: event.t, x: event.x, y: event.y };
        eventPtr++;
      }

      const currentSlide: Slide =
        deck.find((s) => s.id === state.current_slide_id) ?? deck[0];
      const surface = state.slides[currentSlide.id];

      const visual: SlideVisualState = {
        slide: currentSlide,
        revealedBullets: surface?.revealed_bullets ?? 0,
        answerRevealed: surface?.answer_revealed ?? false,
        activityAnswer: surface?.activity_answer ?? null,
      };
      const key = visualStateKey(visual);
      if (key !== currentKey || !currentBitmap) {
        currentKey = key;
        currentBitmap?.close();
        currentBitmap = await rasterizer.rasterize(visual);
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.save();
      ctx.globalAlpha = entranceTransform(
        ctx,
        currentSlide.entrance_animation,
        realMs - lastSlideChangeT
      );
      ctx.drawImage(currentBitmap, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();

      if (surface && surface.strokes.length > 0) {
        for (const stroke of surface.strokes) {
          renderStrokeToCtx(ctx, simStrokeToStroke(stroke), 1, 1);
        }
      }
      if (lastLaser && realMs - lastLaser.t <= LASER_FADE_MS) {
        drawLaser(ctx, lastLaser.x, lastLaser.y, realMs - lastLaser.t);
      }
      if (surface?.spotlight) {
        drawSpotlight(ctx, surface.spotlight.x, surface.spotlight.y);
      }

      const videoFrame = new VideoFrame(canvas, {
        timestamp: Math.round(frame * usPerFrame),
        duration: Math.round(usPerFrame),
      });
      videoEncoder.encode(videoFrame, {
        keyFrame: frame % KEYFRAME_INTERVAL_FRAMES === 0,
      });
      videoFrame.close();
      await waitForQueue(videoEncoder, 8);

      if (frame % 15 === 0) {
        report('rendering', 10 + (frame / totalFrames) * 85);
      }
    }

    report('finalizing', 95);
    await videoEncoder.flush();
    videoEncoder.close();
    if (encoderError) throw encoderError;

    muxer.finalize();
    const { buffer } = muxer.target as ArrayBufferTarget;
    report('finalizing', 100);
    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      durationMs: virtualTotalMs,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    };
  } finally {
    currentBitmap?.close();
    rasterizer.dispose();
    if (videoEncoder.state !== 'closed') {
      try {
        videoEncoder.close();
      } catch {
        /* already closed */
      }
    }
  }
}

/** Trigger a browser download of an exported blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
