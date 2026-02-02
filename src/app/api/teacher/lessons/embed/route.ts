import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 64;

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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { lesson_id: lessonId } = await request.json();
    if (!lessonId) {
      return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const service = createServiceClient();

    const { data: lesson } = await service
      .from("lessons")
      .select("id, description_ar, description_en")
      .eq("id", lessonId)
      .single();

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const { data: blocks } = await service
      .from("lesson_content_blocks")
      .select("content, language, source_type, sequence")
      .eq("lesson_id", lessonId)
      .order("sequence", { ascending: true });

    const { data: questions } = await service
      .from("lesson_questions")
      .select("question_text_ar, question_text_en")
      .eq("lesson_id", lessonId);

    const sources: Array<{
      lesson_id: string;
      language: "ar" | "en";
      source_type: string;
      chunk_index: number;
      content: string;
    }> = [];

    (blocks || []).forEach((block) => {
      const chunks = chunkText(block.content);
      chunks.forEach((chunk, index) => {
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

    (questions || []).forEach((q) => {
      if (q.question_text_ar) {
        sources.push({
          lesson_id: lessonId,
          language: "ar",
          source_type: "question",
          chunk_index: 0,
          content: q.question_text_ar,
        });
      }
      if (q.question_text_en) {
        sources.push({
          lesson_id: lessonId,
          language: "en",
          source_type: "question",
          chunk_index: 0,
          content: q.question_text_en,
        });
      }
    });

    await service.from("lesson_chunk_embeddings").delete().eq("lesson_id", lessonId);

    for (let i = 0; i < sources.length; i += BATCH_SIZE) {
      const batch = sources.slice(i, i + BATCH_SIZE);
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch.map((item) => item.content),
      });
      const rows = batch.map((item, index) => ({
        ...item,
        embedding: response.data[index].embedding,
      }));

      const { error } = await service.from("lesson_chunk_embeddings").insert(rows);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: sources.length });
  } catch (error) {
    return NextResponse.json({ error: "Failed to embed lesson content" }, { status: 500 });
  }
}
