import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVideoExportSupported } from '@/lib/video-export/export-sim-video';

function stubVideoExportGlobals({ audio = true }: { audio?: boolean } = {}) {
  vi.stubGlobal('window', {});
  vi.stubGlobal('VideoEncoder', class VideoEncoder {});
  vi.stubGlobal('VideoFrame', class VideoFrame {});
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({}));
  vi.stubGlobal('AudioEncoder', audio ? class AudioEncoder {} : undefined);
  vi.stubGlobal('AudioData', audio ? class AudioData {} : undefined);
  vi.stubGlobal('AudioContext', audio ? class AudioContext {} : undefined);
}

describe('video export capability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires both video and audio encoding support', () => {
    stubVideoExportGlobals({ audio: false });
    expect(isVideoExportSupported()).toBe(false);
  });

  it('allows export when the complete media stack is present', () => {
    stubVideoExportGlobals();
    expect(isVideoExportSupported()).toBe(true);
  });
});
