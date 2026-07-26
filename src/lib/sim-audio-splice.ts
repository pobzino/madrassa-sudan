/**
 * Browser-side audio surgery for sim patches: replace the audio between two
 * timestamps with a freshly recorded take, producing one new audio file so the
 * rest of the stack (SimPlayer, MP4 export, offline downloads) keeps its
 * single-audio-file assumption.
 *
 * Pairs with the pure timeline maths in `@/lib/sim-splice`. Runs in ffmpeg.wasm
 * — the same instance `trimAndCut` uses.
 *
 * Implementation note: the head/patch/tail are joined in ONE filter_complex
 * pass rather than encoded separately and stitched with the concat demuxer.
 * Concatenating separately-encoded Opus streams leaves each part's pre-skip in
 * place, which adds ~17ms of drift per join and can click audibly; a single
 * decode→concat→encode pass measured exact (45.008s where stream-copy concat
 * gave 45.051s) and re-encodes only once.
 */

import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '@/lib/ffmpeg-editor';

const OUTPUT_MIME = 'audio/webm';
// Opus at 96k mono is transparent for speech and keeps lessons small on the
// slow connections students are on.
const ENCODE_ARGS = ['-vn', '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '1'];
/** Ignore sub-frame slivers of head/tail so we don't emit empty filter inputs. */
const EDGE_EPSILON_SEC = 0.05;

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

export interface SpliceFilterGraph {
  /** filter_complex expression, or null when the patch replaces everything. */
  filter: string | null;
  /** Label to -map, or null when the output is just the re-encoded patch. */
  mapLabel: string | null;
  keepsHead: boolean;
  keepsTail: boolean;
}

/**
 * Build the filter graph joining [original head] + [patch] + [original tail].
 * Input 0 is the original, input 1 the patch. Exported for unit tests — a
 * wrong graph string is otherwise only discoverable by ear.
 */
export function buildSpliceFilterGraph(
  startSec: number,
  endSec: number,
  durationSec: number
): SpliceFilterGraph {
  const keepsHead = startSec > EDGE_EPSILON_SEC;
  const keepsTail = endSec < durationSec - EDGE_EPSILON_SEC;

  // The retake replaces the entire recording: no graph needed.
  if (!keepsHead && !keepsTail) {
    return { filter: null, mapLabel: null, keepsHead, keepsTail };
  }

  const parts: string[] = [];
  const segments: string[] = [];

  if (keepsHead && keepsTail) {
    // The original is consumed twice, so it must be split first.
    parts.push('[0:a]asplit=2[s0][s1]');
    parts.push(`[s0]atrim=start=0:end=${startSec.toFixed(3)},asetpts=PTS-STARTPTS[head]`);
    parts.push(`[s1]atrim=start=${endSec.toFixed(3)},asetpts=PTS-STARTPTS[tail]`);
    parts.push('[1:a]asetpts=PTS-STARTPTS[mid]');
    segments.push('[head]', '[mid]', '[tail]');
  } else if (keepsHead) {
    parts.push(`[0:a]atrim=start=0:end=${startSec.toFixed(3)},asetpts=PTS-STARTPTS[head]`);
    parts.push('[1:a]asetpts=PTS-STARTPTS[mid]');
    segments.push('[head]', '[mid]');
  } else {
    parts.push('[1:a]asetpts=PTS-STARTPTS[mid]');
    parts.push(`[0:a]atrim=start=${endSec.toFixed(3)},asetpts=PTS-STARTPTS[tail]`);
    segments.push('[mid]', '[tail]');
  }

  parts.push(`${segments.join('')}concat=n=${segments.length}:v=0:a=1[out]`);
  return { filter: parts.join(';'), mapLabel: '[out]', keepsHead, keepsTail };
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

/** Rebuild the sim audio as head + patch + tail in a single ffmpeg pass. */
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

  const graph = buildSpliceFilterGraph(startSec, endSec, durationSec);
  const written: string[] = [];
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress?.(0.2 + Math.min(Math.max(progress, 0), 1) * 0.7);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    await ffmpeg.writeFile('splice-src.webm', await fetchFile(original));
    written.push('splice-src.webm');
    await ffmpeg.writeFile('splice-patch.webm', await fetchFile(patch));
    written.push('splice-patch.webm');

    const args = graph.filter
      ? [
          '-i', 'splice-src.webm',
          '-i', 'splice-patch.webm',
          '-filter_complex', graph.filter,
          '-map', graph.mapLabel as string,
          ...ENCODE_ARGS,
          '-y', 'splice-out.webm',
        ]
      : ['-i', 'splice-patch.webm', ...ENCODE_ARGS, '-y', 'splice-out.webm'];

    await ffmpeg.exec(args);
    written.push('splice-out.webm');

    const data = await ffmpeg.readFile('splice-out.webm');
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
