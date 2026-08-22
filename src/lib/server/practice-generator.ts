import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import { getOpenAIClient, AI_MODEL_FAST } from "@/lib/ai/openai-client";
import { PRACTICE_PASSING_SCORE, PRACTICE_QUESTION_COUNT } from "@/lib/practice";
import type { Slide } from "@/lib/slides.types";

type PracticeClient = SupabaseClient<Database>;

type GeneratedQuestion = {
  question_type: "multiple_choice" | "true_false" | "short_answer";
  question_text_ar: string;
  question_text_en: string;
  options_ar: string[];
  options_en: string[];
  correct_option_index: number;
  correct_answer: string;
};

type GeneratedPractice = {
  title_ar: string;
  title_en: string;
  questions: GeneratedQuestion[];
};

export interface PracticeGenerationResult {
  assignmentId: string;
  lessonId: string;
  questionCount: number;
  generated: boolean;
  published: boolean;
  titleAr: string;
  titleEn: string;
}

interface EnsureLessonPracticeOptions {
  client: PracticeClient;
  lessonId: string;
  createdBy: string;
  force?: boolean;
  numQuestions?: number;
}

type StoredPracticeQuestion = Pick<
  Database["public"]["Tables"]["homework_questions"]["Row"],
  | "question_type"
  | "question_text_ar"
  | "question_text_en"
  | "options_ar"
  | "options_en"
  | "correct_option_index"
  | "correct_answer"
>;

function hasCompletePracticeQuestions(
  questions: StoredPracticeQuestion[] | null | undefined,
  expectedCount = PRACTICE_QUESTION_COUNT
) {
  if (!questions || questions.length !== expectedCount) return false;
  return questions.every((question) => {
    if (!question.question_text_ar?.trim() || !question.question_text_en?.trim()) return false;
    if (!question.correct_answer?.trim()) return false;
    if (question.question_type === "short_answer") return true;
    const optionsAr = cleanOptions(question.options_ar);
    const optionsEn = cleanOptions(question.options_en);
    const expectedOptions = question.question_type === "true_false" ? 2 : 4;
    return (
      optionsAr.length === expectedOptions &&
      optionsEn.length === expectedOptions &&
      question.correct_option_index !== null &&
      question.correct_option_index >= 0 &&
      question.correct_option_index < expectedOptions
    );
  });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

export function normalizeGeneratedPractice(
  value: unknown,
  expectedCount = PRACTICE_QUESTION_COUNT
): GeneratedPractice {
  if (!value || typeof value !== "object") {
    throw new Error("Practice generation returned an invalid response.");
  }

  const raw = value as Record<string, unknown>;
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  if (rawQuestions.length !== expectedCount) {
    throw new Error(`Practice generation returned ${rawQuestions.length} questions; expected ${expectedCount}.`);
  }

  const questions = rawQuestions.map((item, index): GeneratedQuestion => {
    if (!item || typeof item !== "object") {
      throw new Error(`Question ${index + 1} is invalid.`);
    }
    const question = item as Record<string, unknown>;
    const questionType = question.question_type;
    if (
      questionType !== "multiple_choice" &&
      questionType !== "true_false" &&
      questionType !== "short_answer"
    ) {
      throw new Error(`Question ${index + 1} has an unsupported type.`);
    }

    const questionTextAr = cleanText(question.question_text_ar);
    const questionTextEn = cleanText(question.question_text_en);
    if (!questionTextAr || !questionTextEn) {
      throw new Error(`Question ${index + 1} is missing bilingual text.`);
    }

    const optionsAr = cleanOptions(question.options_ar);
    const optionsEn = cleanOptions(question.options_en);
    const optionIndex = Number(question.correct_option_index);
    const correctAnswer = cleanText(question.correct_answer);

    if (questionType === "short_answer") {
      if (!/^-?\d+(?:[.,]\d+)?$/.test(correctAnswer)) {
        throw new Error(`Question ${index + 1} must have a numeric short answer.`);
      }
      return {
        question_type: questionType,
        question_text_ar: questionTextAr,
        question_text_en: questionTextEn,
        options_ar: [],
        options_en: [],
        correct_option_index: -1,
        correct_answer: correctAnswer,
      };
    }

    const expectedOptions = questionType === "true_false" ? 2 : 4;
    if (optionsAr.length !== expectedOptions || optionsEn.length !== expectedOptions) {
      throw new Error(`Question ${index + 1} must have ${expectedOptions} options in both languages.`);
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= expectedOptions) {
      throw new Error(`Question ${index + 1} has an invalid correct option.`);
    }

    return {
      question_type: questionType,
      question_text_ar: questionTextAr,
      question_text_en: questionTextEn,
      options_ar: optionsAr,
      options_en: optionsEn,
      correct_option_index: optionIndex,
      correct_answer:
        questionType === "true_false"
          ? optionIndex === 0
            ? "true"
            : "false"
          : optionsAr[optionIndex],
    };
  });

  return {
    title_ar: cleanText(raw.title_ar) || "تدريب الدرس",
    title_en: cleanText(raw.title_en) || "Lesson practice",
    questions,
  };
}

async function loadLessonSource(client: PracticeClient, lessonId: string) {
  const [{ data: sims }, { data: slideDeck }] = await Promise.all([
    client
      .from("lesson_sims")
      .select("deck_snapshot, recorded_at")
      .eq("lesson_id", lessonId)
      .order("recorded_at", { ascending: false })
      .limit(1),
    client.from("lesson_slides").select("slides").eq("lesson_id", lessonId).maybeSingle(),
  ]);

  const latestSim = (sims ?? [])[0] as { deck_snapshot?: unknown } | undefined;
  if (Array.isArray(latestSim?.deck_snapshot) && latestSim.deck_snapshot.length > 0) {
    return latestSim.deck_snapshot as unknown as Slide[];
  }
  if (Array.isArray(slideDeck?.slides) && slideDeck.slides.length > 0) {
    return slideDeck.slides as unknown as Slide[];
  }
  return null;
}

async function linkPracticeToLessonSteps(
  client: PracticeClient,
  lessonId: string,
  assignmentId: string
) {
  const { error } = await client
    .from("learning_path_steps")
    .update({ practice_assignment_id: assignmentId })
    .eq("lesson_id", lessonId);
  if (error) throw error;
}

async function generatePracticeContent(args: {
  content: string;
  lessonTitleAr: string;
  lessonTitleEn: string;
  subjectName: string;
  gradeLevel: number;
  questionCount: number;
}) {
  const openai = getOpenAIClient();
  if (!openai) throw new Error("OpenAI is not configured for Practice generation.");

  const prompt = `You are the curriculum designer for Amal School, a bilingual learning platform for Sudanese children aged roughly 6-10 who often study independently on a phone.

Create a short Practice completed immediately after this lesson. Use only facts, examples, vocabulary, and methods present in the lesson content. Keep the tone warm and the wording concise. This is mastery practice, not a trick test.

Lesson Arabic title: ${args.lessonTitleAr}
Lesson English title: ${args.lessonTitleEn}
Subject: ${args.subjectName}
Grade: ${args.gradeLevel}

LESSON CONTENT
${args.content}

REQUIREMENTS
- Exactly ${args.questionCount} auto-markable questions.
- Every prompt and every choice must be properly translated into clear Arabic and clear English.
- Use "multiple_choice" with exactly 4 aligned Arabic/English choices.
- Use "true_false" with options_ar ["صحيح", "خطأ"] and options_en ["True", "False"].
- Use "short_answer" only for a single numeric answer; both option arrays are empty and correct_answer is digits only.
- correct_option_index is zero-based for choice questions and -1 for short answers.
- For maths, include several numeric short answers. For English language lessons, prefer visualisable vocabulary and simple phrase recognition.
- Avoid culturally unfamiliar examples, negative punishment language, and ambiguous distractors.
- Do not ask anything that was not taught in the lesson.`;

  const completion = await openai.chat.completions.create({
    model: AI_MODEL_FAST,
    messages: [{ role: "user", content: prompt }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lesson_practice",
        strict: true,
        schema: {
          type: "object",
          properties: {
            title_ar: { type: "string" },
            title_en: { type: "string" },
            questions: {
              type: "array",
              minItems: args.questionCount,
              maxItems: args.questionCount,
              items: {
                type: "object",
                properties: {
                  question_type: {
                    type: "string",
                    enum: ["multiple_choice", "true_false", "short_answer"],
                  },
                  question_text_ar: { type: "string" },
                  question_text_en: { type: "string" },
                  options_ar: { type: "array", items: { type: "string" } },
                  options_en: { type: "array", items: { type: "string" } },
                  correct_option_index: { type: "integer" },
                  correct_answer: { type: "string" },
                },
                required: [
                  "question_type",
                  "question_text_ar",
                  "question_text_en",
                  "options_ar",
                  "options_en",
                  "correct_option_index",
                  "correct_answer",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["title_ar", "title_en", "questions"],
          additionalProperties: false,
        },
      },
    },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Practice generation returned no content.");
  return normalizeGeneratedPractice(JSON.parse(text), args.questionCount);
}

export async function ensureLessonPractice({
  client,
  lessonId,
  createdBy,
  force = false,
  numQuestions = PRACTICE_QUESTION_COUNT,
}: EnsureLessonPracticeOptions): Promise<PracticeGenerationResult> {
  const questionCount = Math.min(Math.max(Math.round(numQuestions), 4), 12);
  const { data: lesson, error: lessonError } = await client
    .from("lessons")
    .select("id, created_by, title_ar, title_en, grade_level, subject_id, is_published, subject:subjects(name_ar, name_en)")
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) throw lessonError;
  if (!lesson) throw new Error("Lesson not found.");

  const { data: existingAssignment, error: existingError } = await client
    .from("homework_assignments")
    .select("id, title_ar, title_en, is_published")
    .eq("lesson_id", lessonId)
    .eq("is_practice", true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existingAssignment && !force) {
    const { data: existingQuestions, error: questionsError } = await client
      .from("homework_questions")
      .select(
        "question_type, question_text_ar, question_text_en, options_ar, options_en, correct_option_index, correct_answer"
      )
      .eq("assignment_id", existingAssignment.id);
    if (questionsError) throw questionsError;
    if (hasCompletePracticeQuestions(existingQuestions, questionCount)) {
      const shouldPublish = !!lesson.is_published;
      if (existingAssignment.is_published !== shouldPublish) {
        const { error: publishError } = await client
          .from("homework_assignments")
          .update({ is_published: shouldPublish, passing_score: PRACTICE_PASSING_SCORE })
          .eq("id", existingAssignment.id);
        if (publishError) throw publishError;
      }
      await linkPracticeToLessonSteps(client, lessonId, existingAssignment.id);
      return {
        assignmentId: existingAssignment.id,
        lessonId,
        questionCount: existingQuestions.length,
        generated: false,
        published: shouldPublish,
        titleAr: existingAssignment.title_ar,
        titleEn: existingAssignment.title_en ?? existingAssignment.title_ar,
      };
    }
  }

  const deck = await loadLessonSource(client, lessonId);
  if (!deck) throw new Error("This lesson has no slides or recording to generate Practice from.");
  const content = extractSlideContent(deck).trim();
  if (!content) throw new Error("This lesson has no readable content to generate Practice from.");

  const subject = Array.isArray(lesson.subject) ? lesson.subject[0] : lesson.subject;
  const generated = await generatePracticeContent({
    content,
    lessonTitleAr: lesson.title_ar || lesson.title_en || "الدرس",
    lessonTitleEn: lesson.title_en || lesson.title_ar || "Lesson",
    subjectName: subject?.name_en || subject?.name_ar || "General",
    gradeLevel: lesson.grade_level || 1,
    questionCount,
  });

  const totalPoints = generated.questions.length * 10;
  const shouldPublish = !!lesson.is_published;
  const ownerId = createdBy || lesson.created_by;
  if (!ownerId) throw new Error("Practice generation requires a content owner.");
  let assignmentId = existingAssignment?.id ?? null;

  if (assignmentId) {
    const { error } = await client
      .from("homework_assignments")
      .update({
        title_ar: generated.title_ar,
        title_en: generated.title_en,
        total_points: totalPoints,
        is_published: shouldPublish,
        passing_score: PRACTICE_PASSING_SCORE,
        show_instant_feedback: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);
    if (error) throw error;
  } else {
    const { data: created, error } = await client
      .from("homework_assignments")
      .insert({
        cohort_id: null,
        subject_id: lesson.subject_id,
        lesson_id: lessonId,
        created_by: ownerId,
        title_ar: generated.title_ar,
        title_en: generated.title_en,
        total_points: totalPoints,
        is_published: shouldPublish,
        is_practice: true,
        is_test: false,
        passing_score: PRACTICE_PASSING_SCORE,
        show_instant_feedback: true,
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const { data: concurrentAssignment, error: concurrentError } = await client
        .from("homework_assignments")
        .select("id")
        .eq("lesson_id", lessonId)
        .eq("is_practice", true)
        .single();
      if (concurrentError || !concurrentAssignment) {
        throw concurrentError ?? new Error("Failed to load the canonical Practice assignment.");
      }
      assignmentId = concurrentAssignment.id;
      const { error: updateError } = await client
        .from("homework_assignments")
        .update({
          title_ar: generated.title_ar,
          title_en: generated.title_en,
          total_points: totalPoints,
          is_published: shouldPublish,
          passing_score: PRACTICE_PASSING_SCORE,
          show_instant_feedback: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignmentId);
      if (updateError) throw updateError;
    } else {
      if (error || !created) throw error ?? new Error("Failed to create Practice assignment.");
      assignmentId = created.id;
    }
  }

  const { error: deleteError } = await client
    .from("homework_questions")
    .delete()
    .eq("assignment_id", assignmentId);
  if (deleteError) throw deleteError;

  const rows: Database["public"]["Tables"]["homework_questions"]["Insert"][] =
    generated.questions.map((question, index) => ({
      assignment_id: assignmentId as string,
      question_type: question.question_type,
      question_text_ar: question.question_text_ar,
      question_text_en: question.question_text_en,
      options: (question.options_ar.length ? question.options_ar : null) as Json | null,
      options_ar: (question.options_ar.length ? question.options_ar : null) as Json | null,
      options_en: (question.options_en.length ? question.options_en : null) as Json | null,
      correct_option_index:
        question.correct_option_index >= 0 ? question.correct_option_index : null,
      correct_answer: question.correct_answer,
      points: 10,
      display_order: index + 1,
    }));
  const { error: questionsError } = await client.from("homework_questions").insert(rows);
  if (questionsError) throw questionsError;

  await linkPracticeToLessonSteps(client, lessonId, assignmentId);
  return {
    assignmentId,
    lessonId,
    questionCount: generated.questions.length,
    generated: true,
    published: shouldPublish,
    titleAr: generated.title_ar,
    titleEn: generated.title_en,
  };
}

export async function findNextLessonMissingPractice(client: PracticeClient) {
  const [{ data: lessons, error: lessonError }, { data: practices, error: practiceError }] =
    await Promise.all([
      client
        .from("lessons")
        .select("id, title_ar, title_en, created_by, is_published, video_processing_status, video_url_720p")
        .order("created_at", { ascending: true }),
      client
        .from("homework_assignments")
        .select(
          "id, lesson_id, is_published, homework_questions(question_type, question_text_ar, question_text_en, options_ar, options_en, correct_option_index, correct_answer)"
        )
        .eq("is_practice", true),
    ]);
  if (lessonError) throw lessonError;
  if (practiceError) throw practiceError;

  const practiceByLesson = new Map(
    (practices ?? []).filter((practice) => practice.lesson_id).map((practice) => [practice.lesson_id, practice])
  );
  return (
    (lessons ?? []).find((lesson) => {
      const eligible =
        lesson.is_published ||
        lesson.video_processing_status === "ready" ||
        Boolean(lesson.video_url_720p);
      if (!eligible) return false;
      const practice = practiceByLesson.get(lesson.id);
      const questions = practice?.homework_questions as StoredPracticeQuestion[] | undefined;
      return (
        !practice ||
        !hasCompletePracticeQuestions(questions) ||
        (lesson.is_published && !practice.is_published)
      );
    }) ?? null
  );
}
