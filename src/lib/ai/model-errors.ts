/**
 * True when OpenAI refused the request because the model is unknown or this key
 * cannot use it (so the caller can retry on an older model).
 */
export function isModelUnavailableError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; error?: { code?: string } } | null;
  const code = e?.code ?? e?.error?.code;
  return code === "model_not_found" || e?.status === 404 || (e?.status === 403 && code === "model_not_found");
}
