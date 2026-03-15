import OpenAI from "openai";

export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

let openaiClientSingleton: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  if (!openaiClientSingleton) {
    openaiClientSingleton = new OpenAI({ apiKey });
  }

  return openaiClientSingleton;
}
