'use client';

interface VideoPreviewProps {
  video_url_1080p: string;
  video_url_720p: string;
  video_url_480p: string;
  video_url_360p: string;
}

export default function VideoPreview({
  video_url_1080p,
  video_url_720p,
  video_url_480p,
  video_url_360p,
}: VideoPreviewProps) {
  const src =
    video_url_1080p || video_url_720p || video_url_480p || video_url_360p;

  if (!src) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
      <video
        key={src}
        src={src}
        controls
        preload="metadata"
        className="w-full max-h-[360px] block"
        aria-label="Lesson video preview"
      />
    </div>
  );
}
