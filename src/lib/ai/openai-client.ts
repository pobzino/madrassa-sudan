import OpenAI from "openai";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

/** Fast model for structured output (slide deck generation, speaker notes). */
export const AI_MODEL_FAST = process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";

let openaiClientSingleton: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!openaiClientSingleton) {
    openaiClientSingleton = new OpenAI({ apiKey });
  }

  return openaiClientSingleton;
}
