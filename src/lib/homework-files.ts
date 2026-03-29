export const HOMEWORK_BUCKET = "homework";

export function isRemoteFileUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value);
}

export function normalizeHomeworkFileRefs(
  fileRefs: unknown,
  singleFileRef?: string | null
): string[] {
  const refs =
    Array.isArray(fileRefs) ? fileRefs.filter((value): value is string => typeof value === "string" && value.length > 0) : [];

  if (refs.length > 0) {
    return refs;
  }

  return typeof singleFileRef === "string" && singleFileRef.length > 0 ? [singleFileRef] : [];
}

export function getHomeworkFileName(value: string): string {
  const lastSegment = decodeURIComponent(value.split("/").pop() || value);
  return lastSegment.replace(/^\d+-[0-9a-f-]+-/i, "");
}

export function isImageFile(value: string): boolean {
  const path = value.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path);
}
