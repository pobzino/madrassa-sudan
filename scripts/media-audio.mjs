import { spawn } from 'node:child_process';

/**
 * Classify the audio streams returned by ffprobe for an MP4.
 *
 * Lesson downloads must use AAC: it is the MP4 audio codec consistently
 * supported by Android, iOS, and desktop players.
 */
export function classifyMp4Audio(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const hasAac = streams.some(
    (stream) => stream?.codec_type === 'audio' && stream?.codec_name === 'aac'
  );

  return hasAac
    ? { status: 'valid' }
    : { status: 'missing', reason: 'No AAC audio stream was found.' };
}

/**
 * Read stream metadata without relying on the filename or MIME type. ffprobe
 * is available wherever Remotion renders (it depends on FFmpeg itself).
 */
export function inspectMp4Audio(input, { timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', input],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      finish({ status: 'unavailable', reason: error.message });
    });
    child.on('close', (code) => {
      if (timedOut) {
        finish({ status: 'unavailable', reason: 'ffprobe timed out.' });
        return;
      }
      if (code !== 0) {
        finish({
          status: 'unavailable',
          reason: (stderr || `ffprobe exited with code ${code}.`).trim(),
        });
        return;
      }
      try {
        finish(classifyMp4Audio(JSON.parse(stdout)));
      } catch {
        finish({ status: 'unavailable', reason: 'ffprobe returned invalid JSON.' });
      }
    });
  });
}
