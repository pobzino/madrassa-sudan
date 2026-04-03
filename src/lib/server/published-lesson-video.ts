import type OpenAI from "openai";

import type { Database } from "@/lib/database.types";
import { getOpenAIClient } from "@/lib/ai/openai-client";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

const MAX_WHISPER_SIZE = 25 * 1024 * 1024;
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 64;

type LessonRow = Database["public"]["Tables"]["lessons"]["Row"];
type ServiceClient = ReturnType<typeof createServiceClient>;

type EmbeddingSource = {
  lesson_id: string;
  language: "ar" | "en";
  source_type: string;
  chunk_index: number;
  content: string;
};

function getOpenAIOrThrow(): OpenAI {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("AI not configured");
  }
  return openai;
}

function getPreferredVideoUrl(lesson: Pick<LessonRow, "video_url_360p" | "video_url_480p" | "video_url_720p" | "video_url_1080p">) {
  return (
    lesson.video_url_360p ||
    lesson.video_url_480p ||
    lesson.video_url_720p ||
    lesson.video_url_1080p ||
    null
  );
}

function chunkText(text: string) {
  if (!text) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

function inferTranscriptLanguage(text: string): "ar" | "en" {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

async function getLessonOrThrow(service: ServiceClient, lessonId: string) {
  const { data: lesson, error } = await service
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  if (error || !lesson) {
    throw new Error("Lesson not found");
  }

  return lesson;
}

export async function transcribeLessonVideo(
  lessonId: string,
  languageHint?: string
): Promise<{ transcript: string; cached: boolean; warning?: string }> {
  const openai = getOpenAIOrThrow();
  const service = createServiceClient();
  const lesson = await getLessonOrThrow(service, lessonId);

  if (lesson.ai_transcript && lesson.ai_transcript.trim().length > 20) {
    return { transcript: lesson.ai_transcript, cached: true };
  }

  const videoUrl = getPreferredVideoUrl(lesson);
  if (!videoUrl) {
    throw new Error("No video URL available. Upload a video first.");
  }

  const videoResponse = await fetch(videoUrl, {
    signal: AbortSignal.timeout(60_000),
    headers: { Referer: getSiteUrl() },
  });

  if (!videoResponse.ok) {
    throw new Error("Could not download video from CDN");
  }

  let videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  let warning: string | undefined;

  if (videoBuffer.length > MAX_WHISPER_SIZE) {
    videoBuffer = videoBuffer.subarray(0, MAX_WHISPER_SIZE);
    warning = "Video was truncated for transcription. Only a portion was processed.";
  }

  const file = new File([videoBuffer], "lesson.mp4", { type: "video/mp4" });
  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
    ...(languageHint ? { language: languageHint } : {}),
  });

  const segments =
    (transcription as { segments?: Array<{ text: string }> }).segments || [];
  const transcriptText =
    (transcription as { text?: string }).text ||
    segments.map((segment) => segment.text).join(" ");

  if (!transcriptText || transcriptText.trim().length < 20) {
    throw new Error(
      "Could not extract meaningful transcript from the video. Check that the video has audio."
    );
  }

  const { error: updateError } = await service
    .from("lessons")
    .update({ ai_transcript: transcriptText })
    .eq("id", lessonId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { transcript: transcriptText, cached: false, ...(warning ? { warning } : {}) };
}

export async function embedLessonSources(lessonId: string) {
  const openai = getOpenAIOrThrow();
  const service = createServiceClient();
  const lesson = await getLessonOrThrow(service, lessonId);

  const [{ data: blocks }, { data: questions }] = await Promise.all([
    service
      .from("lesson_content_blocks")
      .select("content, language, source_type, sequence")
      .eq("lesson_id", lessonId)
      .order("sequence", { ascending: true }),
    service
      .from("lesson_questions")
      .select("question_text_ar, question_text_en")
      .eq("lesson_id", lessonId),
  ]);

  const sources: EmbeddingSource[] = [];

  if (lesson.ai_transcript) {
    chunkText(lesson.ai_transcript).forEach((chunk, index) => {
      sources.push({
        lesson_id: lessonId,
        language: inferTranscriptLanguage(lesson.ai_transcript!),
        source_type: "ai_transcript",
        chunk_index: index,
        content: chunk,
      });
    });
  }

  (blocks || []).forEach((block) => {
    chunkText(block.content).forEach((chunk, index) => {
      sources.push({
        lesson_id: lessonId,
        language: block.language as "ar" | "en",
        source_type: block.source_type || "lesson",
        chunk_index: index,
        content: chunk,
      });
    });
  });

  if (sources.length === 0) {
    if (lesson.description_ar) {
      chunkText(lesson.description_ar).forEach((chunk, index) => {
        sources.push({
          lesson_id: lessonId,
          language: "ar",
          source_type: "description",
          chunk_index: index,
          content: chunk,
        });
      });
    }

    if (lesson.description_en) {
      chunkText(lesson.description_en).forEach((chunk, index) => {
        sources.push({
          lesson_id: lessonId,
          language: "en",
          source_type: "description",
          chunk_index: index,
          content: chunk,
        });
      });
    }
  }

  (questions || []).forEach((question) => {
    if (question.question_text_ar) {
      sources.push({
        lesson_id: lessonId,
        language: "ar",
        source_type: "question",
        chunk_index: 0,
        content: question.question_text_ar,
      });
    }

    if (question.question_text_en) {
      sources.push({
        lesson_id: lessonId,
        language: "en",
        source_type: "question",
        chunk_index: 0,
        content: question.question_text_en,
      });
    }
  });

  const { error: deleteError } = await service
    .from("lesson_chunk_embeddings")
    .delete()
    .eq("lesson_id", lessonId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (sources.length === 0) {
    return { count: 0 };
  }

  for (let index = 0; index < sources.length; index += BATCH_SIZE) {
    const batch = sources.slice(index, index + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((item) => item.content),
    });

    const rows = batch.map((item, batchIndex) => ({
      ...item,
      embedding: response.data[batchIndex].embedding,
    }));

    const { error: insertError } = await service
      .from("lesson_chunk_embeddings")
      .insert(rows);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return { count: sources.length };
}

export async function processPublishedLessonVideo(
  lessonId: string,
  languageHint?: string
) {
  const service = createServiceClient();
  const lesson = await getLessonOrThrow(service, lessonId);

  if (!lesson.is_published) {
    throw new Error("Lesson must be published before video processing can run.");
  }

  if (!getPreferredVideoUrl(lesson)) {
    throw new Error("No video URL available. Upload a video first.");
  }

  const transcription = await transcribeLessonVideo(lessonId, languageHint);
  const embeddings = await embedLessonSources(lessonId);

  return {
    transcript: transcription.transcript,
    transcriptCached: transcription.cached,
    warning: transcription.warning,
    embeddingCount: embeddings.count,
  };
}
