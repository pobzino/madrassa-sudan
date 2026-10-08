import { describe, expect, it } from 'vitest';
import { classifyMp4Audio } from '../../../scripts/media-audio.mjs';

describe('MP4 audio verification', () => {
  it('accepts an AAC audio stream alongside video', () => {
    expect(
      classifyMp4Audio({
        streams: [
          { codec_type: 'video', codec_name: 'h264' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      })
    ).toEqual({ status: 'valid' });
  });

  it('rejects silent MP4s and non-AAC audio', () => {
    expect(classifyMp4Audio({ streams: [{ codec_type: 'video', codec_name: 'h264' }] })).toMatchObject({
      status: 'missing',
    });
    expect(classifyMp4Audio({ streams: [{ codec_type: 'audio', codec_name: 'opus' }] })).toMatchObject({
      status: 'missing',
    });
  });
});
