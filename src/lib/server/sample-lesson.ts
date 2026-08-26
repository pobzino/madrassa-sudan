import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { signAudioUrl } from "@/lib/server/sim-storage";
import type { SimEvent, SimPayload, SimRow } from "@/lib/sim.types";
import type {
  SampleLessonData,
  SamplePracticeQuestion,
} from "@/lib/sample-lesson.types";

export const SAMPLE_LESSON_ID = "40cd0100-abf4-4e6a-a2bf-9a1a3b49d010";
const SAMPLE_TITLE_AR = "الأسبوع 1: Hello وPlease وThank You وGoodbye";
const SAMPLE_DESCRIPTION_AR =
  "تعلّم واستخدم كلمات المجاملة الإنجليزية الأساسية: Hello وPlease وThank You وGoodbye.";
const SAMPLE_DESCRIPTION_EN =
  "Learn and practise the everyday English words Hello, Please, Thank You, and Goodbye through simple activities and role-play.";

function containsArabic(value: string | null): value is string {
  return Boolean(value && /[\u0600-\u06ff]/.test(value));
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function practiceType(value: string): SamplePracticeQuestion["type"] {
  if (value === "true_false" || value === "short_answer") return value;
  return "multiple_choice";
}

async function loadSampleLessonUncached(): Promise<SampleLessonData> {
  const supabase = createServiceClient();

  const [{ data: lesson, error: lessonError }, { data: sim, error: simError }] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(
          "id, title_ar, title_en, description_ar, description_en, grade_level, subject_id, is_published"
        )
        .eq("id", SAMPLE_LESSON_ID)
        .eq("is_published", true)
        .single(),
      supabase
        .from("lesson_sims")
        .select("*")
        .eq("lesson_id", SAMPLE_LESSON_ID)
        .single(),
    ]);

  if (lessonError || !lesson || simError || !sim) {
    throw new Error("The sample lesson is not available.");
  }

  const [subjectResult, deckResult, assignmentResult] = await Promise.all([
    supabase
      .from("subjects")
      .select("name_ar, name_en")
      .eq("id", lesson.subject_id)
      .single(),
    supabase
      .from("lesson_slides")
      .select("language_mode, slides")
      .eq("lesson_id", SAMPLE_LESSON_ID)
      .single(),
    supabase
      .from("homework_assignments")
      .select("id, title_ar, title_en, passing_score")
      .eq("lesson_id", SAMPLE_LESSON_ID)
      .eq("is_practice", true)
      .eq("is_published", true)
      .single(),
  ]);

  if (
    subjectResult.error ||
    !subjectResult.data ||
    deckResult.error ||
    !deckResult.data ||
    assignmentResult.error ||
    !assignmentResult.data
  ) {
    throw new Error("The sample lesson is incomplete.");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("homework_questions")
    .select(
      "id, question_type, question_text_ar, question_text_en, options, options_ar, options_en, correct_answer, correct_option_index, audio_url_ar, audio_url_en"
    )
    .eq("assignment_id", assignmentResult.data.id)
    .order("display_order", { ascending: true });

  if (questionsError || !questions?.length) {
    throw new Error("The sample Practice is not available.");
  }

  const audioUrl = await signAudioUrl(SAMPLE_LESSON_ID, sim.audio_path);
  if (!audioUrl) throw new Error("The sample lesson recording is not available.");

  const slides = Array.isArray(deckResult.data.slides) ? deckResult.data.slides : [];
  const events = Array.isArray(sim.events) ? (sim.events as unknown as SimEvent[]) : [];
  const activityCount = events.filter(
    (event) => event.type === "activity_gate" || event.type === "exploration_gate"
  ).length;
  const simRow = {
    id: sim.id,
    lesson_id: sim.lesson_id,
    duration_ms: sim.duration_ms,
    deck_snapshot: Array.isArray(sim.deck_snapshot) ? sim.deck_snapshot : slides,
    events,
    audio_path: null,
    audio_duration_ms: sim.audio_duration_ms,
    audio_mime: sim.audio_mime,
    recorded_by: null,
    recorded_at: sim.recorded_at,
    clip_segments: sim.clip_segments,
    created_at: sim.created_at,
    updated_at: sim.updated_at,
  } as unknown as SimRow;
  const payload: SimPayload = { sim: simRow, audio_url: audioUrl };

  return {
    lesson: {
      id: lesson.id,
      titleAr: containsArabic(lesson.title_ar) ? lesson.title_ar : SAMPLE_TITLE_AR,
      titleEn: lesson.title_en || lesson.title_ar,
      descriptionAr: SAMPLE_DESCRIPTION_AR,
      descriptionEn: SAMPLE_DESCRIPTION_EN,
      gradeLevel: lesson.grade_level,
      subjectAr: subjectResult.data.name_ar,
      subjectEn: subjectResult.data.name_en,
      durationMs: sim.duration_ms,
      slideCount: slides.length,
      activityCount,
    },
    contentLanguage: deckResult.data.language_mode === "en" ? "en" : "ar",
    sim: payload,
    practice: {
      titleAr: assignmentResult.data.title_ar,
      titleEn: assignmentResult.data.title_en || assignmentResult.data.title_ar,
      passingPercent: assignmentResult.data.passing_score,
      questions: questions
        .filter((question) => question.correct_answer)
        .map((question) => ({
          id: question.id,
          type: practiceType(question.question_type),
          promptAr: question.question_text_ar,
          promptEn: question.question_text_en || question.question_text_ar,
          optionsAr: strings(question.options_ar ?? question.options),
          optionsEn: strings(question.options_en ?? question.options),
          correctAnswer: question.correct_answer || "",
          correctOptionIndex: question.correct_option_index,
          audioUrlAr: question.audio_url_ar,
          audioUrlEn: question.audio_url_en,
        })),
    },
  };
}

export const loadSampleLesson = unstable_cache(
  loadSampleLessonUncached,
  ["public-sample-lesson"],
  { revalidate: 300, tags: ["public-sample-lesson"] },
);
