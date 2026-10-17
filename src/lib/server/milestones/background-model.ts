import "server-only";

import { AI_MODEL_MILESTONE, getOpenAIClient } from "@/lib/ai/openai-client";
import { isModelUnavailableError } from "@/lib/ai/model-errors";

/**
 * Structured model calls that run on OpenAI's side (Responses API, background
 * mode): `start` returns at once with a response id, `poll` asks whether it is
 * done. A Big Challenge job can then let a strong model think for minutes per
 * lesson while every server request stays well under the function time limit.
 */
export type BackgroundCall = {
  model: string;
  effort: "low" | "medium" | "high";
  system: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** For the log line. */
  tag: "generate" | "verify";
};

export type BackgroundPoll = { status: "pending" } | { status: "done"; text: string } | { status: "failed"; error: string };

export async function startBackgroundCall(call: BackgroundCall): Promise<{ id: string; model: string }> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for Big Challenge generation.");
  const create = (model: string) =>
    openai.responses.create(
      {
        model,
        background: true,
        store: true,
        reasoning: { effort: call.effort },
        input: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        text: { format: { type: "json_schema", name: call.schemaName, strict: true, schema: call.schema } },
      },
      { timeout: 20_000, maxRetries: 1 },
    );
  const started = Date.now();
  try {
    const response = await create(call.model).catch(async (error: unknown) => {
      // The newest model first; the sync writer's model if this key cannot use it.
      if (!isModelUnavailableError(error) || call.model === AI_MODEL_MILESTONE) throw error;
      console.warn(`OpenAI model ${call.model} unavailable; using ${AI_MODEL_MILESTONE}`);
      return create(AI_MODEL_MILESTONE);
    });
    console.log(JSON.stringify({ event: "milestone_model_start", step: call.tag, model: response.model, id: response.id, ms: Date.now() - started }));
    return { id: response.id, model: response.model };
  } catch (error) {
    console.error(JSON.stringify({ event: "milestone_model_start_failed", step: call.tag, model: call.model, ms: Date.now() - started, message: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}

export async function pollBackgroundCall(id: string, tag: BackgroundCall["tag"]): Promise<BackgroundPoll> {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for Big Challenge generation.");
  const response = await openai.responses.retrieve(id, {}, { timeout: 15_000, maxRetries: 1 });
  if (response.status === "completed") {
    const text = response.output_text;
    if (!text) return { status: "failed", error: "The model returned no content." };
    console.log(JSON.stringify({ event: "milestone_model_done", step: tag, model: response.model, id, tokens: response.usage?.total_tokens ?? null }));
    return { status: "done", text };
  }
  if (response.status === "queued" || response.status === "in_progress") return { status: "pending" };
  const error = response.error?.message || response.incomplete_details?.reason || response.status || "unknown";
  console.error(JSON.stringify({ event: "milestone_model_failed", step: tag, id, status: response.status, error }));
  return { status: "failed", error: `The model did not finish (${error}).` };
}
