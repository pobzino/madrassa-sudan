import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export const maxDuration = 120;

const RequestSchema = z.object({ language: z.enum(["ar", "en"]) });
const AUDIO_BUCKET = "practice-audio";
const MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_VOICE_IDS = {
  ar: "Q6bj3XETB6DxcvoDR9Ao",
  en: "V6HHcD4lyl4wUm50e7Ml",
} as const;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function narrationText(
  language: "ar" | "en",
  prompt: string,
  options: string[]
) {
  if (options.length === 0) return prompt;
  if (language === "ar") {
    const labels = ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"];
    return `${prompt}. ${options.map((option, index) => `${labels[index]}: ${option}`).join(". ")}.`;
  }
  const labels = ["A", "B", "C", "D"];
  return `${prompt}. ${options.map((option, index) => `${labels[index]}: ${option}`).join(". ")}.`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "Narration storage is not configured" }, { status: 503 });
  }

  const { id: questionId } = await params;
  const { data: question, error: questionError } = await supabase
    .from("homework_questions")
    .select(
      "id, assignment_id, question_text_ar, question_text_en, options, options_ar, options_en, audio_url_ar, audio_url_en, audio_text_hash_ar, audio_text_hash_en"
    )
    .eq("id", questionId)
    .maybeSingle();
  if (questionError || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const { data: assignment } = await supabase
    .from("homework_assignments")
    .select("is_practice, is_published")
    .eq("id", question.assignment_id)
    .maybeSingle();
  if (!assignment?.is_practice || !assignment.is_published) {
    return NextResponse.json({ error: "Question not available" }, { status: 403 });
  }

  const language = parsed.data.language;
  const prompt =
    language === "ar"
      ? question.question_text_ar
      : question.question_text_en || question.question_text_ar;
  const localizedOptions = stringArray(
    language === "ar"
      ? question.options_ar ?? question.options
      : question.options_en ?? question.options
  );
  const text = narrationText(language, prompt, localizedOptions).slice(0, 1800);
  const voiceId =
    (language === "ar"
      ? process.env.ELEVENLABS_VOICE_ID_AR
      : process.env.ELEVENLABS_VOICE_ID_EN) || DEFAULT_VOICE_IDS[language];
  const hash = createHash("sha256")
    .update(`${MODEL_ID}:${voiceId}:${text}`)
    .digest("hex");
  const cachedUrl = language === "ar" ? question.audio_url_ar : question.audio_url_en;
  const cachedHash =
    language === "ar" ? question.audio_text_hash_ar : question.audio_text_hash_en;
  if (cachedUrl && cachedHash === hash) {
    return NextResponse.json({ audio_url: cachedUrl, cached: true });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Narration is not configured" }, { status: 503 });
  }

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
    }
  );
  if (!speechResponse.ok) {
    console.error("ElevenLabs narration failed:", speechResponse.status, await speechResponse.text());
    return NextResponse.json({ error: "Narration could not be generated" }, { status: 502 });
  }

  const service = createServiceClient();
  const path = `${questionId}/${language}-${hash.slice(0, 16)}.mp3`;
  const audio = Buffer.from(await speechResponse.arrayBuffer());
  const { error: uploadError } = await service.storage.from(AUDIO_BUCKET).upload(path, audio, {
    contentType: "audio/mpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) {
    console.error("Practice narration upload failed:", uploadError);
    return NextResponse.json({ error: "Narration could not be saved" }, { status: 500 });
  }

  const { data: publicUrl } = service.storage.from(AUDIO_BUCKET).getPublicUrl(path);
  const update =
    language === "ar"
      ? { audio_url_ar: publicUrl.publicUrl, audio_text_hash_ar: hash }
      : { audio_url_en: publicUrl.publicUrl, audio_text_hash_en: hash };
  const { error: updateError } = await service
    .from("homework_questions")
    .update(update)
    .eq("id", questionId);
  if (updateError) console.error("Practice narration cache update failed:", updateError);

  return NextResponse.json({ audio_url: publicUrl.publicUrl, cached: false });
}
