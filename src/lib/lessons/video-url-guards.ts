const DISALLOWED_VIDEO_HOST_PATTERN = /(^|\.)((www|m)\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const DISALLOWED_VIDEO_TEXT_PATTERN = /(youtube\.com|youtu\.be|youtube-nocookie\.com)/i;

export function isDisallowedLessonVideoUrl(input: string | null | undefined): boolean {
  const value = (input || "").trim();
  if (!value) return false;

  try {
    const normalized = value.includes("://") ? value : `https://${value}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return DISALLOWED_VIDEO_HOST_PATTERN.test(hostname);
  } catch {
    return DISALLOWED_VIDEO_TEXT_PATTERN.test(value);
  }
}

export function getDisallowedLessonVideoFields(fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([, url]) => isDisallowedLessonVideoUrl(url))
    .map(([label]) => label);
}
