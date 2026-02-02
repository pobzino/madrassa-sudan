import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 64;

function chunkText(text) {
  if (!text) return [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }
  return chunks;
}

async function ensureContentBlocks(lesson) {
  const { data: blocks, error } = await supabase
    .from("lesson_content_blocks")
    .select("id")
    .eq("lesson_id", lesson.id)
    .limit(1);

  if (!error && blocks && blocks.length > 0) return;

  const inserts = [];
  if (lesson.description_ar) {
    inserts.push({
      lesson_id: lesson.id,
      language: "ar",
      content: lesson.description_ar,
      source_type: "description",
      sequence: 0,
    });
  }
  if (lesson.description_en) {
    inserts.push({
      lesson_id: lesson.id,
      language: "en",
      content: lesson.description_en,
      source_type: "description",
      sequence: 0,
    });
  }

  if (inserts.length > 0) {
    await supabase.from("lesson_content_blocks").insert(inserts);
  }
}

async function embedBatch(items) {
  const texts = items.map((item) => item.content);
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

async function ingestLesson(lesson) {
  await ensureContentBlocks(lesson);

  const { data: blocks } = await supabase
    .from("lesson_content_blocks")
    .select("content, language, source_type, sequence")
    .eq("lesson_id", lesson.id)
    .order("sequence", { ascending: true });

  const { data: questions } = await supabase
    .from("lesson_questions")
    .select("question_text_ar, question_text_en")
    .eq("lesson_id", lesson.id);

  const sources = [];

  (blocks || []).forEach((block) => {
    chunkText(block.content).forEach((chunk, index) => {
      sources.push({
        lesson_id: lesson.id,
        language: block.language,
        source_type: block.source_type || "lesson",
        chunk_index: index,
        content: chunk,
      });
    });
  });

  (questions || []).forEach((q) => {
    if (q.question_text_ar) {
      sources.push({
        lesson_id: lesson.id,
        language: "ar",
        source_type: "question",
        chunk_index: 0,
        content: q.question_text_ar,
      });
    }
    if (q.question_text_en) {
      sources.push({
        lesson_id: lesson.id,
        language: "en",
        source_type: "question",
        chunk_index: 0,
        content: q.question_text_en,
      });
    }
  });

  if (sources.length === 0) return;

  await supabase
    .from("lesson_chunk_embeddings")
    .delete()
    .eq("lesson_id", lesson.id);

  for (let i = 0; i < sources.length; i += BATCH_SIZE) {
    const batch = sources.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch);
    const rows = batch.map((item, idx) => ({
      ...item,
      embedding: embeddings[idx],
    }));
    await supabase.from("lesson_chunk_embeddings").insert(rows);
  }
}

async function run() {
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, description_ar, description_en");

  if (error) throw error;

  for (const lesson of lessons || []) {
    console.log(`Embedding lesson ${lesson.id}...`);
    await ingestLesson(lesson);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
