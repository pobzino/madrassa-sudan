/**
 * Browser-side audio surgery for sim patches: replace the audio between two
 * timestamps with a freshly recorded take, producing one new audio file so the
 * rest of the stack (SimPlayer, MP4 export, offline downloads) keeps its
 * single-audio-file assumption.
 *
 * Pairs with the pure timeline maths in `@/lib/sim-splice`. Runs in ffmpeg.wasm
 * — the same instance `trimAndCut` uses.
 */

import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '@/lib/ffmpeg-editor';

const OUTPUT_MIME = 'audio/webm';
// Opus at 96k is transparent enough for speech and keeps lessons small on the
// slow connections students are on.
const ENCODE_ARGS = ['-vn', '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '1'];

export interface SpliceAudioParams {
  /** The sim's current audio. */
  original: Blob;
  /** Newly recorded replacement take. */
  patch: Blob;
  /** Start of the range to replace, seconds. */
  startSec: number;
  /** End of the range to replace, seconds. */
  endSec: number;
  /** Total length of `original`, seconds — decides whether a tail exists. */
  durationSec: number;
  onProgress?: (progress: number) => void;
}

export interface SpliceAudioResult {
  blob: Blob;
  mime: string;
  durationMs: number;
}

/** Measure a blob's real duration. WebM from MediaRecorder often lies, so decode it. */
export async function measureAudioDurationMs(blob: Blob): Promise<number> {
  const AudioCtx: typeof AudioContext | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx) {
    const ctx = new AudioCtx();
    try {
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      return Math.round(buffer.duration * 1000);
    } catch {
      // Fall through to the element-based probe.
    } finally {
      void ctx.close();
    }
  }

  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      fn();
    };
    audio.addEventListener('loadedmetadata', () => {
      const seconds = audio.duration;
      if (Number.isFinite(seconds) && seconds > 0) {
        done(() => resolve(Math.round(seconds * 1000)));
      } else {
        done(() => reject(new Error('Could not determine audio duration')));
      }
    });
    audio.addEventListener('error', () => done(() => reject(new Error('Could not read audio'))));
    audio.src = url;
  });
}

/**
 * Rebuild the sim audio as head + patch + tail. Any of head/tail may be empty
 * (replacing from the very start, or through to the end).
 */
export async function spliceSimAudio({
  original,
  patch,
  startSec,
  endSec,
  durationSec,
  onProgress,
}: SpliceAudioParams): Promise<SpliceAudioResult> {
  if (endSec <= startSec) throw new Error('The selected range is empty.');
  if (patch.size === 0) throw new Error('The new recording is empty.');

  const ffmpeg = await getFFmpeg();
  onProgress?.(0.1);

  const hasHead = startSec > 0.05;
  const hasTail = endSec < durationSec - 0.05;

  const written: string[] = [];
  const write = async (name: string, blob: Blob) => {
    await ffmpeg.writeFile(name, await fetchFile(blob));
    written.push(name);
  };

  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(0.2 + Math.min(Math.max(progress, 0), 1) * 0.7);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await write('splice-src.webm', original);
    await write('splice-patch-src.webm', patch);

    const parts: string[] = [];

    if (hasHead) {
      await ffmpeg.exec([
        '-i', 'splice-src.webm',
        '-ss', '0',
        '-to', startSec.toFixed(3),
        ...ENCODE_ARGS,
        '-y', 'splice-head.webm',
      ]);
      written.push('splice-head.webm');
      parts.push('splice-head.webm');
    }

    // Always re-encode the patch so every part shares codec parameters and the
    // concat demuxer can stream-copy them together.
    await ffmpeg.exec([
      '-i', 'splice-patch-src.webm',
      ...ENCODE_ARGS,
      '-y', 'splice-mid.webm',
    ]);
    written.push('splice-mid.webm');
    parts.push('splice-mid.webm');

    if (hasTail) {
      await ffmpeg.exec([
        '-i', 'splice-src.webm',
        '-ss', endSec.toFixed(3),
        ...ENCODE_ARGS,
        '-y', 'splice-tail.webm',
      ]);
      written.push('splice-tail.webm');
      parts.push('splice-tail.webm');
    }

    let outputName: string;
    if (parts.length === 1) {
      outputName = parts[0];
    } else {
      await ffmpeg.writeFile(
        'splice-concat.txt',
        new TextEncoder().encode(parts.map((p) => `file '${p}'`).join('\n'))
      );
      written.push('splice-concat.txt');
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'splice-concat.txt',
        '-c', 'copy',
        '-y', 'splice-out.webm',
      ]);
      written.push('splice-out.webm');
      outputName = 'splice-out.webm';
    }

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], {
      type: OUTPUT_MIME,
    });
    if (blob.size === 0) throw new Error('Splicing produced an empty audio file.');

    onProgress?.(0.95);
    const durationMs = await measureAudioDurationMs(blob).catch(() => 0);
    onProgress?.(1);

    return { blob, mime: OUTPUT_MIME, durationMs };
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const name of written) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        /* best effort */
      }
    }
  }
}
