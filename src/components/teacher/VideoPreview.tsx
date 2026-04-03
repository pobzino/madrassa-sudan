'use client';

import { useMemo, useState } from 'react';
import { toPlayableVideoUrl } from '@/lib/bunny-playback';

interface VideoPreviewProps {
  video_url_1080p: string;
  video_url_720p: string;
  video_url_480p: string;
  video_url_360p: string;
}

function VideoPreviewPlayer({ sources }: { sources: string[] }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const src = sources[sourceIndex] || '';

  if (!src) return null;

  return (
    <video
      key={src}
      src={src}
      controls
      preload="metadata"
      className="w-full max-h-[360px] block"
      aria-label="Lesson video preview"
      onError={() => {
        setSourceIndex((currentIndex) => {
          if (currentIndex >= sources.length - 1) {
            return currentIndex;
          }

          return currentIndex + 1;
        });
      }}
    />
  );
}

export default function VideoPreview({
  video_url_1080p,
  video_url_720p,
  video_url_480p,
  video_url_360p,
}: VideoPreviewProps) {
  const sources = useMemo(
    () =>
      [video_url_1080p, video_url_720p, video_url_480p, video_url_360p]
        .filter(Boolean)
        .map((url) => toPlayableVideoUrl(url)),
      [video_url_1080p, video_url_720p, video_url_480p, video_url_360p]
  );
  const sourceKey = sources.join('|');

  if (!sourceKey) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
      <VideoPreviewPlayer key={sourceKey} sources={sources} />
    </div>
  );
}
