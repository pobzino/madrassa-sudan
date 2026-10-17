import OpenAI from "openai";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

/** Fast model for structured output (slide deck generation, speaker notes). */
export const AI_MODEL_FAST = process.env.OPENAI_MODEL_FAST || "gpt-5.4-mini";

/**
 * Big Challenge / starting boss question writer (structured output, low reasoning
 * effort). The fast 5.6 tier: each lesson's questions must come back well inside
 * the function time limit; gpt-6.1-sol took over 16 s per lesson (2026-10-16).
 */
export const AI_MODEL_MILESTONE = process.env.OPENAI_MODEL_MILESTONE || "gpt-5.6-luna";

/** Big Challenge blind verifier (fast GPT-5.6 tier): answers each item and estimates its difficulty. */
export const AI_MODEL_MILESTONE_VERIFY = process.env.OPENAI_MODEL_MILESTONE_VERIFY || "gpt-5.6-luna";

/**
 * The same two jobs when a boss is generated in the background (OpenAI
 * background responses: the model may think for minutes, the server never
 * waits): the strongest writer, with medium reasoning, and the fast verifier
 * also at medium.
 */
export const AI_MODEL_MILESTONE_BACKGROUND = process.env.OPENAI_MODEL_MILESTONE_BACKGROUND || "gpt-6.1-sol";
export const AI_MODEL_MILESTONE_VERIFY_BACKGROUND = process.env.OPENAI_MODEL_MILESTONE_VERIFY_BACKGROUND || "gpt-5.6-luna";

let openaiClientSingleton: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!openaiClientSingleton) {
    openaiClientSingleton = new OpenAI({ apiKey });
  }

  return openaiClientSingleton;
}

