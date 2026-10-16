import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolvePracticeDisplayLanguages,
  resolvePracticeQuestionPresentation,
  type LessonLanguageMode,
} from "@/lib/practice-language";

// Narration for homework_questions (Practice and Milestone pools): builds the
// spoken text, reuses the cached clip when its hash still matches, otherwise
// asks ElevenLabs, uploads to the practice-audio bucket and writes the cache
// columns back. Access checks stay in the calling route.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any>;

export const AUDIO_BUCKET = "practice-audio";
const MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_VOICE_IDS = {
  ar: "Q6bj3XETB6DxcvoDR9Ao",
  en: "V6HHcD4lyl4wUm50e7Ml",
} as const;

export const NARRATION_QUESTION_COLUMNS =
  "id, assignment_id, question_text_ar, question_text_en, instruction_ar, instruction_en, question_content, question_content_language, answer_language, options, options_ar, options_en, audio_url_ar, audio_url_en, audio_text_hash_ar, audio_text_hash_en";

export interface NarratableQuestion {
  id: string;
  question_text_ar: string;
  question_text_en: string | null;
  instruction_ar: string | null;
  instruction_en: string | null;
  question_content: string | null;
  question_content_language: string | null;
  answer_language: string | null;
  options: unknown;
  options_ar: unknown;
  options_en: unknown;
  audio_url_ar: string | null;
  audio_url_en: string | null;
  audio_text_hash_ar: string | null;
  audio_text_hash_en: string | null;
}

export type NarrationResult =
  | { audioUrl: string; cached: boolean }
  | { error: string; status: number };

export interface NarrationOptions {
  /** Speak these options instead of the stored ones (a battle's display order). */
  displayOptions?: string[];
  /**
   * Reuse a clip already in storage for this exact text before calling
   * ElevenLabs. Battles shuffle options, so one question has several variants.
   */
  reuseStoredVariant?: boolean;
  /**
   * Voice the key line only (instruction and content), never the options:
   * one clip per question and language, whatever order the options show in.
   * Battles use this; the options are on screen (and the phone's own voice
   * reads them on request).
   */
  promptOnly?: boolean;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function narrationText(
  language: "ar" | "en",
  instruction: string,
  questionContent: string | null,
  options: string[],
) {
  const prompt = [instruction, questionContent].filter(Boolean).join(" ");
  if (options.length === 0) return prompt;
  if (language === "ar") {
    const labels = ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"];
    return `${prompt}. ${options.map((option, index) => `${labels[index]}: ${option}`).join(". ")}.`;
  }
  const labels = ["A", "B", "C", "D"];
  return `${prompt}. ${options.map((option, index) => `${labels[index]}: ${option}`).join(". ")}.`;
}

function voiceIdFor(language: "ar" | "en") {
  return (
    (language === "ar" ? process.env.ELEVENLABS_VOICE_ID_AR : process.env.ELEVENLABS_VOICE_ID_EN) ||
    DEFAULT_VOICE_IDS[language]
  );
}

/** The spoken text and its cache hash for a question in one language. */
export function questionNarration(
  question: NarratableQuestion,
  language: "ar" | "en",
  languageMode: LessonLanguageMode,
  displayOptions?: string[],
  promptOnly = false,
) {
  const practiceLanguages = resolvePracticeDisplayLanguages(languageMode, language);
  const presentation = resolvePracticeQuestionPresentation({
    defaultAnswerLanguage: practiceLanguages.answerLanguage,
    instructionLanguage: language,
    legacyMaterialLanguage: languageMode,
    answerLanguage: question.answer_language,
    instructionAr: question.instruction_ar,
    instructionEn: question.instruction_en,
    questionContent: question.question_content,
    questionContentLanguage: question.question_content_language,
    questionTextAr: question.question_text_ar,
    questionTextEn: question.question_text_en,
  });
  const localizedOptions = promptOnly
    ? []
    : displayOptions ??
    stringArray(
      presentation.answerLanguage === "ar"
        ? question.options_ar ?? question.options
        : question.options_en ?? question.options,
    );
  const text = narrationText(
    language,
    presentation.instruction,
    presentation.questionContent,
    localizedOptions,
  ).slice(0, 1800);
  const hash = createHash("sha256").update(`${MODEL_ID}:${voiceIdFor(language)}:${text}`).digest("hex");
  return { text, hash };
}

/** The cached clip for this exact narration, or null. */
export function cachedNarrationUrl(question: NarratableQuestion, language: "ar" | "en", hash: string) {
  const cachedUrl = language === "ar" ? question.audio_url_ar : question.audio_url_en;
  const cachedHash = language === "ar" ? question.audio_text_hash_ar : question.audio_text_hash_en;
  return cachedUrl && cachedHash === hash ? cachedUrl : null;
}

export async function narrateQuestion(
  admin: AdminClient,
  question: NarratableQuestion,
  language: "ar" | "en",
  languageMode: LessonLanguageMode,
  options: NarrationOptions = {},
): Promise<NarrationResult> {
  const questionId = question.id;
  const { text, hash } = questionNarration(question, language, languageMode, options.displayOptions, options.promptOnly === true);
  const cachedUrl = cachedNarrationUrl(question, language, hash);
  if (cachedUrl) return { audioUrl: cachedUrl, cached: true };

  const path = `${questionId}/${language}-${hash.slice(0, 16)}.mp3`;
  if (options.reuseStoredVariant) {
    const fileName = path.slice(questionId.length + 1);
    const { data: existing } = await admin.storage
      .from(AUDIO_BUCKET)
      .list(questionId, { search: fileName, limit: 1 });
    if (existing?.some((file: { name: string }) => file.name === fileName)) {
      const { data: publicUrl } = admin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
      return { audioUrl: publicUrl.publicUrl, cached: true };
    }
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return { error: "Narration is not configured", status: 503 };

  const voiceId = voiceIdFor(language);
  const speechResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.58,
          similarity_boost: 0.78,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!speechResponse.ok) {
    console.error("ElevenLabs narration failed:", speechResponse.status, await speechResponse.text());
    return { error: "Narration could not be generated", status: 502 };
  }

  const audio = Buffer.from(await speechResponse.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(AUDIO_BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) {
    console.error("Practice narration upload failed:", uploadError);
    return { error: "Narration could not be saved", status: 500 };
  }

  const { data: publicUrl } = admin.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  const update =
    language === "ar"
      ? { audio_url_ar: publicUrl.publicUrl, audio_text_hash_ar: hash }
      : { audio_url_en: publicUrl.publicUrl, audio_text_hash_en: hash };
  // Do not attach old narration if a teacher corrected the prompt/options
  // while speech generation was running. JSON comparisons are server-side.
  let cacheUpdate = admin
    .from("homework_questions")
    .update(update)
    .eq("id", questionId)
    .eq("question_text_ar", question.question_text_ar);
  for (const field of [
    "question_text_en",
    "instruction_ar",
    "instruction_en",
    "question_content",
    "question_content_language",
    "answer_language",
    "options",
    "options_ar",
    "options_en",
  ] as const) {
    const value = question[field];
    cacheUpdate = value === null || value === undefined
      ? cacheUpdate.is(field, null)
      : cacheUpdate.eq(field, typeof value === "object" ? JSON.stringify(value) : value);
  }
  const { data: updated, error: updateError } = await cacheUpdate.select("id");
  if (updateError) console.error("Practice narration cache update failed:", updateError);
  if (!updated?.length) {
    // A battle variant is still valid audio for what the child sees: the
    // clip is keyed by its own text hash, so return it even when the cache
    // row moved on.
    if (options.reuseStoredVariant) return { audioUrl: publicUrl.publicUrl, cached: false };
    return { error: "Question changed. Reload to hear its current narration.", status: 409 };
  }

  return { audioUrl: publicUrl.publicUrl, cached: false };
}
