/**
 * True when OpenAI refused the request because the model is unknown or this key
 * cannot use it (so the caller can retry on an older model).
 */
export function isModelUnavailableError(error: unknown): boolean {
  const e = error as { status?: number; code?: string; error?: { code?: string } } | null;
  const code = e?.code ?? e?.error?.code;
  return code === "model_not_found" || e?.status === 404 || (e?.status === 403 && code === "model_not_found");
}

/**
 * Request options for the Big Challenge calls: each step must finish inside
 * the function time limit, so a call that hangs fails fast and visibly
 * (no silent SDK retries with backoff).
 */
export const MILESTONE_CALL_OPTIONS = {
  generate: { timeout: 18_000, maxRetries: 0 },
  verify: { timeout: 8_000, maxRetries: 0 },
} as const;

/** Runs one model call and logs its model, duration and outcome (one JSON line). */
export async function timedMilestoneCall<T>(step: "generate" | "verify", model: string, call: (model: string) => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await call(model);
    const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } }).usage;
    console.log(JSON.stringify({
      event: "milestone_ai_call", step, model, ms: Date.now() - started, ok: true,
      input: usage?.prompt_tokens, output: usage?.completion_tokens, reasoning: usage?.completion_tokens_details?.reasoning_tokens,
    }));
    return result;
  } catch (error) {
    const e = error as { status?: number; code?: string; name?: string; message?: string };
    const ms = Date.now() - started;
    console.error(JSON.stringify({
      event: "milestone_ai_call", step, model, ms, ok: false,
      status: e?.status, code: e?.code, name: e?.name, message: String(e?.message ?? "").slice(0, 200),
    }));
    if (e?.name === "APIConnectionTimeoutError" || /timed out/i.test(String(e?.message ?? ""))) {
      throw Object.assign(new Error(`The AI (${model}) did not answer within ${Math.round(ms / 1000)} s.`), { code: "ai_timeout", model, ms, cause: error });
    }
    throw error;
  }
}
