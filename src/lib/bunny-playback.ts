export interface BunnyPlaybackUrls {
  video_url_1080p: string;
  video_url_360p: string;
  video_url_480p: string;
  video_url_720p: string;
}

const EMPTY_PLAYBACK_URLS: BunnyPlaybackUrls = {
  video_url_1080p: "",
  video_url_360p: "",
  video_url_480p: "",
  video_url_720p: "",
};

const RESOLUTION_TO_FIELD: Record<string, keyof BunnyPlaybackUrls> = {
  "1080p": "video_url_1080p",
  "720p": "video_url_720p",
  "480p": "video_url_480p",
  "360p": "video_url_360p",
};

const PLAYBACK_PATH_PATTERN = /^\/[0-9a-f-]+\/(?:play_(?:360|480|720|1080)p\.mp4|playlist\.m3u8)$/i;

export function parseAvailableResolutions(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((resolution) => resolution.trim())
    .filter((resolution) => resolution in RESOLUTION_TO_FIELD);
}

export function buildBunnyPlaybackUrls(
  videoId: string,
  cdnHostname: string,
  availableResolutions: string | null | undefined
): BunnyPlaybackUrls {
  const urls = { ...EMPTY_PLAYBACK_URLS };

  for (const resolution of parseAvailableResolutions(availableResolutions)) {
    const field = RESOLUTION_TO_FIELD[resolution];
    urls[field] = `https://${cdnHostname}/${videoId}/play_${resolution}.mp4`;
  }

  return urls;
}

export function isBunnyPlaybackUrl(url: string, cdnHostname: string): boolean {
  if (!url || !cdnHostname) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === cdnHostname &&
      PLAYBACK_PATH_PATTERN.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function toPlayableVideoUrl(url: string): string {
  const cdnHostname = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || "";

  if (!isBunnyPlaybackUrl(url, cdnHostname)) {
    return url;
  }

  return `/api/bunny/media?url=${encodeURIComponent(url)}`;
}
