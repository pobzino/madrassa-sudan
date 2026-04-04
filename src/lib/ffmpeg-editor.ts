import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

const CORE_VERSION = '0.12.6';
const CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
const WASM_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.wasm`;

export interface CutRegion {
  start: number; // seconds
  end: number;   // seconds
}

type ProgressCallback = (progress: number) => void;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    const coreURL = await toBlobURL(CORE_URL, 'text/javascript');
    const wasmURL = await toBlobURL(WASM_URL, 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

/**
 * Compute the kept segments given trimStart, trimEnd, and cut regions.
 * Returns sorted, non-overlapping segments to keep.
 */
function computeKeptSegments(
  trimStart: number,
  trimEnd: number,
  cutRegions: CutRegion[]
): { start: number; end: number }[] {
  // Start with the full trimmed range
  let segments = [{ start: trimStart, end: trimEnd }];

  // Sort cut regions by start time
  const sorted = [...cutRegions].sort((a, b) => a.start - b.start);

  for (const cut of sorted) {
    const next: { start: number; end: number }[] = [];
    for (const seg of segments) {
      // Cut region completely outside this segment — keep segment as-is
      if (cut.end <= seg.start || cut.start >= seg.end) {
        next.push(seg);
        continue;
      }
      // Left portion before cut
      if (cut.start > seg.start) {
        next.push({ start: seg.start, end: cut.start });
      }
      // Right portion after cut
      if (cut.end < seg.end) {
        next.push({ start: cut.end, end: seg.end });
      }
    }
    segments = next;
  }

  return segments.filter((s) => s.end - s.start > 0.05);
}

/**
 * Trim and cut a video blob using ffmpeg.wasm.
 * Returns a new WebM blob with only the kept segments.
 */
export async function trimAndCut(
  blob: Blob,
  trimStart: number,
  trimEnd: number,
  cutRegions: CutRegion[],
  onProgress?: ProgressCallback
): Promise<Blob> {
  const segments = computeKeptSegments(trimStart, trimEnd, cutRegions);

  if (segments.length === 0) {
    throw new Error('No video content remains after edits.');
  }

  const ffmpeg = await getFFmpeg();

  // Report loading as 10%
  onProgress?.(0.1);

  // Write input file
  const inputData = await fetchFile(blob);
  await ffmpeg.writeFile('input.webm', inputData);
  onProgress?.(0.15);

  // Set up progress handler
  const progressHandler = ({ progress }: { progress: number }) => {
    // Map ffmpeg progress (0-1) to our range (0.2 - 0.95)
    onProgress?.(0.2 + progress * 0.75);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    if (segments.length === 1) {
      // Simple trim — single segment
      const seg = segments[0];
      await ffmpeg.exec([
        '-i', 'input.webm',
        '-ss', seg.start.toFixed(3),
        '-to', seg.end.toFixed(3),
        '-c:v', 'libvpx',
        '-b:v', '4M',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-y', 'output.webm',
      ]);
    } else {
      // Multiple segments — extract each, then concatenate
      const concatLines: string[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segFile = `seg${i}.webm`;
        await ffmpeg.exec([
          '-i', 'input.webm',
          '-ss', seg.start.toFixed(3),
          '-to', seg.end.toFixed(3),
          '-c:v', 'libvpx',
          '-b:v', '4M',
          '-c:a', 'libopus',
          '-b:a', '128k',
          '-y', segFile,
        ]);
        concatLines.push(`file '${segFile}'`);
      }

      // Write concat list
      const concatContent = concatLines.join('\n');
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));

      // Concatenate segments
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c', 'copy',
        '-y', 'output.webm',
      ]);

      // Cleanup segment files
      for (let i = 0; i < segments.length; i++) {
        try { await ffmpeg.deleteFile(`seg${i}.webm`); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('concat.txt'); } catch { /* ignore */ }
    }

    // Read output
    const outputData = await ffmpeg.readFile('output.webm');
    onProgress?.(0.98);

    // Cleanup
    try { await ffmpeg.deleteFile('input.webm'); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile('output.webm'); } catch { /* ignore */ }

    // readFile returns Uint8Array | string
    const outputBlob = new Blob(
      [typeof outputData === 'string' ? outputData : (outputData as BlobPart)],
      { type: 'video/webm' }
    );
    if (outputBlob.size === 0) {
      throw new Error('Video processing produced an empty file.');
    }

    onProgress?.(1);
    return outputBlob;
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

export { computeKeptSegments };
