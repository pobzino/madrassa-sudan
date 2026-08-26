import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { extractSlideContent } from "@/lib/ai/homework-slides";
import { getOpenAIClient, AI_MODEL, AI_MODEL_FAST } from "@/lib/ai/openai-client";
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
  const structurallyComplete = questions.every((question) => {
    if (
      question.question_type !== "multiple_choice" &&
      question.question_type !== "true_false" &&
      question.question_type !== "short_answer"
    ) {
      return false;
    }
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
  if (!structurallyComplete) return false;

  const normalizedQuestions: GeneratedQuestion[] = questions.map((question) => ({
    question_type: question.question_type as GeneratedQuestion["question_type"],
    question_text_ar: question.question_text_ar.trim(),
    question_text_en: question.question_text_en?.trim() ?? "",
    options_ar: cleanOptions(question.options_ar),
    options_en: cleanOptions(question.options_en),
    correct_option_index: question.correct_option_index ?? -1,
    correct_answer: question.correct_answer?.trim() ?? "",
  }));
  return (
    getPracticeQualityIssues(
      { title_ar: "تدريب الدرس", title_en: "Lesson practice", questions: normalizedQuestions },
      expectedCount
    ).length === 0
  );
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function normalizedText(value: string) {
  return value
    .toLocaleLowerCase("en")
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

function duplicateValues(values: string[]) {
  const normalized = values.map((value) => value.normalize("NFKC").replace(/\s+/gu, " ").trim());
  return normalized.some((value, index) => normalized.indexOf(value) !== index);
}

const MISSING_CONTEXT_PATTERN =
  /\b(?:(?:the|this|that|shown|following)\s+(?:picture|image)|(?:picture|image)\s+(?:above|below|shown)|shown|in the lesson)\b|\b(?:this|the|previous)\s+slide\b|\bslide\s+(?:above|below)\b|\b(?:answer|text|item)\s+(?:above|below)\b|\b(?:listen|hear)\s+(?:to|again|carefully|and)\b|الصورة|انظر إلى|استمع (?:إلى|مرة|جيدًا)|تسمع في|أعلاه|أدناه|في الدرس|المعروض/iu;
const GENERIC_PROMPTS = new Set([
  "what is the correct word",
  "which word is correct",
  "choose the correct answer",
  "which answer is correct",
  "ما الكلمة الصحيحة",
  "اختر الإجابة الصحيحة",
  "ما الإجابة الصحيحة",
]);

export function getPracticeQualityIssues(
  practice: GeneratedPractice,
  expectedCount = PRACTICE_QUESTION_COUNT
) {
  const issues: string[] = [];
  if (practice.questions.length !== expectedCount) {
    issues.push(`Return exactly ${expectedCount} questions.`);
  }

  const promptKeys = new Map<string, number>();
  const choiceIndexes: number[] = [];
  let trueFalseCount = 0;
  const questionTypes = new Set<string>();

  practice.questions.forEach((question, index) => {
    const number = index + 1;
    questionTypes.add(question.question_type);
    const promptKey = normalizedText(question.question_text_en || question.question_text_ar);
    const previous = promptKeys.get(promptKey);
    if (previous !== undefined) {
      issues.push(`Questions ${previous + 1} and ${number} repeat the same prompt.`);
    } else {
      promptKeys.set(promptKey, index);
    }

    if (GENERIC_PROMPTS.has(promptKey)) {
      issues.push(`Question ${number} is generic and lacks the fact, word, or situation being tested.`);
    }
    if (
      MISSING_CONTEXT_PATTERN.test(question.question_text_ar) ||
      MISSING_CONTEXT_PATTERN.test(question.question_text_en)
    ) {
      issues.push(`Question ${number} depends on a picture, audio cue, slide, or other missing context.`);
    }
    if (question.question_text_ar.length > 220 || question.question_text_en.length > 220) {
      issues.push(`Question ${number} is too long for a young learner on a phone.`);
    }

    const expressionOnly = !/[A-Za-z\u0600-\u06ff]/u.test(
      `${question.question_text_ar}${question.question_text_en}`
    );
    if (!expressionOnly && !/[\u0600-\u06ff]/u.test(question.question_text_ar)) {
      issues.push(`Question ${number} needs a clear Arabic prompt, not an English duplicate.`);
    }
    if (!expressionOnly && !/[A-Za-z]/u.test(question.question_text_en)) {
      issues.push(`Question ${number} needs a clear English prompt, not an Arabic duplicate.`);
    }

    if (question.question_type === "short_answer") return;
    if (question.question_type === "multiple_choice") {
      choiceIndexes.push(question.correct_option_index);
    }
    if (question.question_type === "true_false") {
      trueFalseCount += 1;
      if (/[?؟]\s*$/u.test(question.question_text_ar) || /[?؟]\s*$/u.test(question.question_text_en)) {
        issues.push(`Question ${number} must be a clear statement for true/false, not a yes/no question.`);
      }
    }
    if (duplicateValues(question.options_ar) || duplicateValues(question.options_en)) {
      issues.push(`Question ${number} contains duplicate answer choices.`);
    }
    if (
      [...question.options_ar, ...question.options_en].some((option) => option.length > 80)
    ) {
      issues.push(`Question ${number} has an answer choice that is too long.`);
    }
  });

  if (expectedCount >= 8 && questionTypes.size < 2) {
    issues.push("Use at least two suitable question types across the Practice.");
  }
  if (trueFalseCount > Math.ceil(expectedCount * 0.3)) {
    issues.push("Use no more than 30% true/false questions; they provide weak evidence of mastery.");
  }
  if (choiceIndexes.length >= 6) {
    const distribution = new Map<number, number>();
    choiceIndexes.forEach((value) => distribution.set(value, (distribution.get(value) ?? 0) + 1));
    if (distribution.size < 3 || Math.max(...distribution.values()) > Math.ceil(choiceIndexes.length / 2)) {
      issues.push("Balance correct choices across option positions so the answer pattern is not guessable.");
    }
  }

  return issues;
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
    if (
      questionType === "true_false" &&
      (optionsAr[0] !== "صحيح" ||
        optionsAr[1] !== "خطأ" ||
        optionsEn[0].toLocaleLowerCase("en") !== "true" ||
        optionsEn[1].toLocaleLowerCase("en") !== "false")
    ) {
      throw new Error(`Question ${index + 1} must use the standard bilingual true/false choices.`);
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

const BALANCED_OPTION_POSITIONS = [1, 3, 0, 2, 2, 0, 3, 1, 0, 2, 1, 3];

function balanceMultipleChoiceOptions(practice: GeneratedPractice): GeneratedPractice {
  let multipleChoiceIndex = 0;
  return {
    ...practice,
    questions: practice.questions.map((question) => {
      if (question.question_type !== "multiple_choice") return question;

      const targetIndex =
        BALANCED_OPTION_POSITIONS[multipleChoiceIndex % BALANCED_OPTION_POSITIONS.length];
      multipleChoiceIndex += 1;
      if (question.correct_option_index === targetIndex) return question;

      const optionPairs = question.options_ar.map((optionAr, index) => ({
        optionAr,
        optionEn: question.options_en[index],
      }));
      const [correctPair] = optionPairs.splice(question.correct_option_index, 1);
      optionPairs.splice(targetIndex, 0, correctPair);
      const optionsAr = optionPairs.map((option) => option.optionAr);
      const optionsEn = optionPairs.map((option) => option.optionEn);
      return {
        ...question,
        options_ar: optionsAr,
        options_en: optionsEn,
        correct_option_index: targetIndex,
        correct_answer: optionsAr[targetIndex],
      };
    }),
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

function generatedPracticeSchema(questionCount: number) {
  return {
    type: "object",
    properties: {
      title_ar: { type: "string" },
      title_en: { type: "string" },
      questions: {
        type: "array",
        minItems: questionCount,
        maxItems: questionCount,
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
  } as const;
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

  const context = `Lesson Arabic title: ${args.lessonTitleAr}
Lesson English title: ${args.lessonTitleEn}
Subject: ${args.subjectName}
Grade: ${args.gradeLevel}

LESSON CONTENT
${args.content}`;
  const requirements = `QUALITY REQUIREMENTS
- Exactly ${args.questionCount} auto-markable questions for a Sudanese child aged roughly 6-10 studying independently on a phone.
- Cover the lesson's main learning goals evenly. Do not spend several questions repeating one fact, template, example, or skill.
- A lesson with only a few target words or facts may revisit them, but each revisit must use a meaningfully different situation or task. Never repeat the same scenario with paraphrased wording.
- Use only facts, vocabulary, examples, and methods explicitly supported by the lesson content.
- When the lesson teaches a reusable method, operation, phonics rule, or language pattern, create fresh age-appropriate examples that apply that taught skill. The exact numbers or sentence need not appear in the slides, but the underlying concept must.
- Every question must be self-contained. Never refer to a picture, audio, gesture, slide, text above/below, or "the lesson" because that context is not shown in Practice.
- A mnemonic gesture or visual property explicitly taught in the source may be tested only when the prompt fully describes the action or property in text.
- Give every question exactly one unambiguous correct answer. Avoid opinions, personal preferences, trick wording, and teacher-dependent activities.
- Keep prompts concise and age-appropriate. Include the specific word, number, object, sentence, or situation being tested; never ask generic prompts such as "What is the correct word?"
- Use varied, plausible distractors that are clearly wrong for the stated prompt. Do not duplicate choices and do not use "all of the above".
- Arabic and English prompts and options must be natural, accurate, and meaning-aligned. Every question_text_ar must contain a real Arabic instruction or sentence; do not copy the English prompt into it. In English lessons, keep the specific target English word in Latin script inside that Arabic instruction where translating it would remove the skill being tested.
- Use at least two suitable question types. Use no more than 3 true/false questions.
- Use "multiple_choice" with exactly 4 aligned Arabic/English choices. Compare all four choices after trimming and ensure that every choice is distinct in each language. correct_option_index may use any valid position because the application balances positions after generation.
- Use "true_false" only with options_ar ["صحيح", "خطأ"] and options_en ["True", "False"].
- Write true/false prompts as short declarative statements, never as questions beginning with "Does", "Is", or similar wording.
- Use "short_answer" only when one numeric answer is sufficient; both option arrays must be empty, correct_option_index must be -1, and correct_answer must contain digits only.
- For arithmetic lessons, include several distinct numeric applications, not only definition questions. For non-arithmetic topics, do not force numeric short answers.
- Use simple, culturally familiar situations where context helps, without assuming access to special objects or experiences.
- correct_option_index is zero-based for choice questions. correct_answer must match that choice (or the numeric short answer).
- Before returning JSON, silently check every answer, translation, distractor, and coverage decision.`;
  const schema = generatedPracticeSchema(args.questionCount);

  const requestPractice = async (
    prompt: string,
    schemaName: string,
    model = AI_MODEL_FAST
  ) => {
    const complete = async (requestPrompt: string, requestName: string, requestModel: string) => {
      const completion = await openai.chat.completions.create({
        model: requestModel,
        messages: [
          {
            role: "system",
            content:
              "You are a rigorous bilingual primary-education assessment designer. Accuracy and child clarity matter more than preserving a weak draft.",
          },
          { role: "user", content: requestPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: requestName, strict: true, schema },
        },
      });
      const text = completion.choices[0]?.message?.content;
      if (!text) throw new Error("Practice generation returned no content.");
      return JSON.parse(text) as unknown;
    };

    const normalize = (candidate: unknown) =>
      balanceMultipleChoiceOptions(normalizeGeneratedPractice(candidate, args.questionCount));
    const candidate = await complete(prompt, schemaName, model);
    try {
      return normalize(candidate);
    } catch (error) {
      const validationError =
        error instanceof Error ? error.message : "The candidate has invalid structure.";
      const repaired = await complete(
        `Repair this malformed Practice and return the complete corrected Practice.

${context}

${requirements}

VALIDATION ERROR
${validationError}

MALFORMED PRACTICE
${JSON.stringify(candidate)}`,
        `${schemaName}_repair`,
        AI_MODEL
      );
      return normalize(repaired);
    }
  };

  const auditPractice = async (practice: GeneratedPractice) => {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are the final quality gate for a bilingual primary Practice. Block only concrete defects that would harm learning or auto-marking.",
        },
        {
          role: "user",
          content: `Audit this Practice against the lesson source. Put an item in blocking_issues only for a concrete defect: a wrong or unsupported answer, off-topic content, missing information required to answer, materially inaccurate translation, more than one defensible answer, a near-duplicate situation, or omission of a core concept that makes the set misleadingly incomplete. Include question numbers when relevant.

Important judging rules:
- The database intentionally stores true/false correct_answer as the canonical strings "true" or "false". That is correct and must not be flagged.
- A text question does not need to reproduce every picture or listening activity from the lesson. Flag missing context only when the question itself refers to a picture, audio cue, gesture, slide, or other information it does not include.
- When the source explicitly teaches a useful mnemonic gesture or visual property, it may be tested by describing that action or property fully in text.
- A lesson with few target words may test a word more than once, provided the context or thinking task is meaningfully different.
- A taught arithmetic operation or reusable language rule may be applied to fresh age-appropriate numbers or examples. Do not flag an item merely because its exact values or sentence are not copied from the slides.
- Do not demand skills or content that the source does not teach.
- Do not require every teacher-led activity, gesture, visual modality, or worked example to appear in the Practice. Put optional variety or coverage suggestions in improvement_notes, not blocking_issues.
- Approve when blocking_issues is empty. Do not block for style preferences.

${context}

PRACTICE TO AUDIT
${JSON.stringify(practice)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "practice_semantic_audit",
          strict: true,
          schema: {
            type: "object",
            properties: {
              approved: { type: "boolean" },
              blocking_issues: { type: "array", items: { type: "string" } },
              improvement_notes: { type: "array", items: { type: "string" } },
            },
            required: ["approved", "blocking_issues", "improvement_notes"],
            additionalProperties: false,
          },
        },
      },
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Practice quality audit returned no content.");
    return JSON.parse(text) as {
      approved: boolean;
      blocking_issues: string[];
      improvement_notes: string[];
    };
  };

  let retryFeedback = "";
  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const draft = await requestPractice(
        `Create the final Practice completed immediately after this lesson.

${context}

${requirements}
${retryFeedback}`,
        `lesson_practice_${attempt}`
      );

      const reviewed = await requestPractice(
        `Act as an independent senior reviewer. Rewrite this draft wherever needed, then return the complete corrected Practice. Do not merely comment on it.

${context}

${requirements}

DRAFT TO REVIEW
${JSON.stringify(draft)}`,
        `reviewed_lesson_practice_${attempt}`,
        AI_MODEL
      );
      const assess = async (candidate: GeneratedPractice) => {
        const semanticAudit = await auditPractice(candidate);
        const semanticIssues = semanticAudit.blocking_issues.map((issue) => `Reviewer: ${issue}`);
        if (!semanticAudit.approved && semanticIssues.length === 0) {
          semanticIssues.push(
            "Reviewer did not approve the candidate; regenerate it with clearer coverage and answers."
          );
        }
        return {
          approved: semanticAudit.approved,
          issues: [
            ...getPracticeQualityIssues(candidate, args.questionCount),
            ...semanticIssues,
          ],
        };
      };

      let candidate = reviewed;
      let assessment = await assess(candidate);
      if (assessment.approved && assessment.issues.length === 0) return candidate;

      candidate = await requestPractice(
        `Correct every listed defect, then return the complete final Practice. Preserve good questions only when they remain accurate and varied.

${context}

${requirements}

REJECTED PRACTICE
${JSON.stringify(candidate)}

DEFECTS TO CORRECT
- ${assessment.issues.join("\n- ")}`,
        `corrected_lesson_practice_${attempt}`,
        AI_MODEL
      );
      assessment = await assess(candidate);
      lastIssues = assessment.issues;
      if (assessment.approved && lastIssues.length === 0) return candidate;
    } catch (error) {
      lastIssues = [
        error instanceof Error ? error.message : "The generated Practice was invalid.",
      ];
    }
    retryFeedback = `\nThe previous candidate was rejected for these reasons. Correct every one:\n- ${lastIssues.join("\n- ")}`;
  }

  throw new Error(`Practice failed quality validation: ${lastIssues.join(" ")}`);
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
