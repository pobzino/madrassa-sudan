import OpenAI from "openai";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

/** Fast model for structured output (slide deck generation, speaker notes). */
export const AI_MODEL_FAST = process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";

/** Big Challenge / starting boss question writer (structured output, low reasoning effort). */
export const AI_MODEL_MILESTONE = process.env.OPENAI_MODEL_MILESTONE || "gpt-6.1-sol";

/** Big Challenge blind verifier (fast GPT-5.6 tier): answers each item and estimates its difficulty. */
export const AI_MODEL_MILESTONE_VERIFY = process.env.OPENAI_MODEL_MILESTONE_VERIFY || "gpt-5.6-luna";

let openaiClientSingleton: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!openaiClientSingleton) {
    openaiClientSingleton = new OpenAI({ apiKey });
  }

  return openaiClientSingleton;
}

