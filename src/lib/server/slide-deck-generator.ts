import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurriculumPromptBlock,
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
  getSupportedSubjectKey,
} from "../curriculum";
import { getOpenAIClient, AI_MODEL } from "../ai/openai-client";
import type { Database } from "../database.types";
import {
  clampSlideCount,
  suggestSlideCount,
  type SlideGenerationContext,
  type SlideLanguageMode,
} from "../slides-generation";
import {
  getSlideGeneratorPolicyPrompt,
  getSlideGeneratorValidationSchemaNotes,
  validateGeneratedSlides,
  type PolicySlide,
} from "../slide-generator-policy";
import { canManageLesson, getTeacherRole } from "./teacher-lesson-access";

const MAX_TRANSCRIPT_CONTEXT_CHARS = 1600;
const MAX_CONTENT_BLOCKS = 2;
const MAX_CONTENT_BLOCK_CHARS = 450;

type SubjectRow = {
  name_ar?: string | null;
  name_en?: string | null;
};

export class SlideGenerationError extends Error {
  status: number;
  details: string[] | null;

  constructor(message: string, status = 500, details: string[] | null = null) {
    super(message);
    this.name = "SlideGenerationError";
    this.status = status;
    this.details = details;
  }
}

function truncateContext(value: string | null | undefined, maxChars: number): string {
  const normalized = value?.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, maxChars).trim()}\n...[truncated for speed]`;
}

function joinNonEmpty(parts: Array<string | null | undefined>, separator = " "): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator)
    .trim();
}

function buildFallbackSpeakerNotes(
  slide: Pick<
    PolicySlide,
    | "body_ar"
    | "body_en"
    | "bullets_ar"
    | "bullets_en"
    | "reveal_items_ar"
    | "reveal_items_en"
    | "interaction_prompt_ar"
    | "interaction_prompt_en"
  >,
  language: "ar" | "en"
): string {
  const body = language === "ar" ? slide.body_ar : slide.body_en;
  const bullets = language === "ar" ? slide.bullets_ar : slide.bullets_en;
  const revealItems = language === "ar" ? slide.reveal_items_ar : slide.reveal_items_en;
  const interactionPrompt =
    language === "ar" ? slide.interaction_prompt_ar : slide.interaction_prompt_en;

  return joinNonEmpty(
    [
      body,
      bullets && bullets.length > 0 ? bullets.join(". ") : null,
      revealItems && revealItems.length > 0 ? revealItems.join(". ") : null,
      interactionPrompt,
    ],
    ". "
  );
}

function buildSpeakerNotesContext(slides: PolicySlide[]): string {
  return slides
    .map((slide, index) =>
      [
        `Slide ${index + 1} (sequence ${slide.sequence})`,
        `- type: ${slide.type}`,
        `- title_en: ${slide.title_en}`,
        `- title_ar: ${slide.title_ar}`,
        `- body_en: ${slide.body_en}`,
        `- body_ar: ${slide.body_ar}`,
        slide.bullets_en?.length ? `- bullets_en: ${slide.bullets_en.join(" | ")}` : null,
        slide.bullets_ar?.length ? `- bullets_ar: ${slide.bullets_ar.join(" | ")}` : null,
        slide.reveal_items_en?.length
          ? `- reveal_items_en: ${slide.reveal_items_en.join(" | ")}`
          : null,
        slide.reveal_items_ar?.length
          ? `- reveal_items_ar: ${slide.reveal_items_ar.join(" | ")}`
          : null,
        slide.interaction_prompt_en ? `- interaction_prompt_en: ${slide.interaction_prompt_en}` : null,
        slide.interaction_prompt_ar ? `- interaction_prompt_ar: ${slide.interaction_prompt_ar}` : null,
        slide.visual_hint ? `- visual_hint: ${slide.visual_hint}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

export type SlideGenerationEvent =
  | { type: 'progress'; message: string }
  | { type: 'slides'; slides: PolicySlide[] }
  | { type: 'done'; slides: PolicySlide[] }
  | { type: 'error'; message: string };

export async function generateSlidesForLesson({
  supabase,
  lessonId,
  userId,
  generationContext,
  requestedSlideCount,
  languageMode,
  onProgress,
  skipSpeakerNotes,
  enrichNotesOnly,
}: {
  supabase: SupabaseClient<Database>;
  lessonId: string;
  userId: string;
  generationContext: SlideGenerationContext | null;
  requestedSlideCount?: number | null;
  languageMode: SlideLanguageMode;
  onProgress?: (event: SlideGenerationEvent) => void;
  /** Return immediately after deck generation, skip speaker notes pass. */
  skipSpeakerNotes?: boolean;
  /** Skip deck generation — load existing slides and only enrich speaker notes. */
  enrichNotesOnly?: boolean;
}): Promise<PolicySlide[]> {
  const aiClient = getOpenAIClient();
  if (!aiClient) {
    throw new SlideGenerationError("AI not configured", 500);
  }
  const openaiClient = aiClient;

  const role = await getTeacherRole(supabase, userId);
  if (!role) {
    throw new SlideGenerationError("Forbidden", 403);
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*, subject:subjects(name_ar, name_en)")
    .eq("id", lessonId)
    .single();

  if (!lesson || !canManageLesson({ role, userId, lessonCreatedBy: lesson.created_by })) {
    throw new SlideGenerationError("Lesson not found", 404);
  }

  const lessonRow = lesson;

  const { data: contentBlocks } = await supabase
    .from("lesson_content_blocks")
    .select("language, content, source_type")
    .eq("lesson_id", lessonId)
    .order("sequence");

  const requestedCount =
    typeof requestedSlideCount === "number" && Number.isFinite(requestedSlideCount)
      ? requestedSlideCount
      : generationContext?.requestedSlideCount ??
        suggestSlideCount(generationContext?.lessonDurationMinutes ?? null);
  const slideCount = clampSlideCount(requestedCount || 10);

  const subject = (lessonRow.subject as SubjectRow | null) || null;
  const subjectName = subject?.name_en || subject?.name_ar || "General";
  const curriculumSelection = getCurriculumSelectionForLesson(
    subject,
    lessonRow.grade_level,
    lessonRow.curriculum_topic
  );
  const curriculumRequirement = getCurriculumRequirementMessage(
    subject,
    lessonRow.grade_level,
    curriculumSelection
  );

  if (curriculumRequirement) {
    throw new SlideGenerationError(curriculumRequirement, 400);
  }

  const subjectKey = curriculumSelection?.subjectKey ?? getSupportedSubjectKey(subject);

  const languageInstruction =
    languageMode === "en"
      ? "- Write clean English slide copy in the English fields and write the corresponding Arabic slide copy separately in the Arabic fields. Do not place Arabic translations inside the English fields."
      : languageMode === "both"
        ? "- Write fully polished parallel Arabic and English slide fields. Each language must stand alone cleanly. Do not mix both languages inside a single field."
        : "- Write clean Arabic slide copy in the Arabic fields and write the corresponding English slide copy separately in the English fields. Do not place English translations inside the Arabic fields.";
  const goalMixInstruction =
    generationContext?.slideGoalMix === "concept_explanation"
      ? "- Prioritize concept-building slides with clean explanation before moving into examples or checks"
      : generationContext?.slideGoalMix === "worked_examples"
        ? "- Allocate extra slide space to worked examples and step-by-step modeling"
        : generationContext?.slideGoalMix === "activity_focus"
          ? "- Include stronger participation moments, teacher prompts, and classroom activity cues"
          : generationContext?.slideGoalMix === "quiz_review"
            ? "- Emphasize quick checks for understanding, retrieval prompts, and review-style framing"
            : "- Keep a balanced mix of explanation, examples, interaction, and recap";
  const keyIdeasSection =
    generationContext?.keyIdeas && generationContext.keyIdeas.length > 0
      ? `- Key ideas to cover:\n${generationContext.keyIdeas.map((idea) => `  - ${idea}`).join("\n")}`
      : curriculumSelection && curriculumSelection.suggestedKeyIdeas.length > 0
        ? `- Key ideas to cover:\n${curriculumSelection.suggestedKeyIdeas.map((idea) => `  - ${idea}`).join("\n")}`
        : "- Key ideas to cover: choose the most important age-appropriate ideas from the lesson context";
  const sourceNotesSection = generationContext?.sourceNotes
    ? `- Source notes:\n${generationContext.sourceNotes}`
    : "- Source notes: none provided";
  const learningObjectiveLine = generationContext?.learningObjective
    ? `- Learning objective: ${generationContext.learningObjective}`
    : curriculumSelection
      ? `- Learning objective: ${curriculumSelection.suggestedLearningObjective}`
      : "- Learning objective: infer the clearest objective from the lesson title and subject";
  const durationLine =
    generationContext?.lessonDurationMinutes != null
      ? `- Intended lesson duration: ${generationContext.lessonDurationMinutes} minutes`
      : "- Intended lesson duration: not specified";
  const curriculumBlock = getCurriculumPromptBlock(curriculumSelection);

  let contentContext = "";
  if (lessonRow.ai_transcript) {
    contentContext += `\n## Existing Transcript Excerpt\n${truncateContext(
      lessonRow.ai_transcript,
      MAX_TRANSCRIPT_CONTEXT_CHARS
    )}\n`;
  }
  if (contentBlocks && contentBlocks.length > 0) {
    contentContext += `\n## Content Block Summaries\n`;
    for (const block of contentBlocks.slice(0, MAX_CONTENT_BLOCKS)) {
      contentContext += `[${block.language}] ${truncateContext(
        block.content,
        MAX_CONTENT_BLOCK_CHARS
      )}\n\n`;
    }
  }

  const policyPrompt = getSlideGeneratorPolicyPrompt({
    slideCount,
    subjectKey,
  });
  const validationSchemaNotes = getSlideGeneratorValidationSchemaNotes(subjectKey)
    .map((note) => `- ${note}`)
    .join("\n");

  const basePrompt = `You are an expert curriculum designer for Amal School, an educational platform for Sudanese children.

Generate a presentation slide deck for a teacher to use as visual aids while recording a video lesson.

## Lesson Context
- Title (Arabic): ${lessonRow.title_ar || "Untitled"}
- Title (English): ${lessonRow.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lessonRow.grade_level || 1}
- Description (Arabic): ${lessonRow.description_ar || "N/A"}
- Description (English): ${lessonRow.description_en || "N/A"}
${learningObjectiveLine}
${durationLine}
${keyIdeasSection}
${sourceNotesSection}
${curriculumBlock}
${contentContext}

${policyPrompt}

## Requirements
- Generate exactly ${slideCount} slides
- First slide MUST be type "title" (lesson introduction with subject and grade)
- Slide 2 MUST be type "key_points" and serve as the learning objectives slide
- Final practice slides MUST use either "quiz_preview" or "question_answer"
- Last slide MUST be type "summary" (lesson recap with key takeaways)
- Use slide types intentionally: title for title, key_points for objectives, content/diagram_description/activity for core teaching, quiz_preview/question_answer for practice, summary for goodbye
- Each slide MUST provide parallel Arabic and English versions across the separate fields
${languageInstruction}
${goalMixInstruction}
- title_ar/title_en: Short slide heading
- body_ar/body_en: Main text (2-4 sentences for content slides, keep concise for slides)
- Keep each field single-language only. Do not add inline translations, slashes, or parenthetical translations.
- visual_hint: Brief description of what image/diagram would complement this slide
- image_url: Always set to null (teachers add images manually later)
- layout: Suggested layout preset per slide. Options: "default", "image_left", "image_right", "image_top", "full_image"
  - Use "default" for most slides
  - Use "image_left" or "image_right" for diagram_description slides
  - Use "default" for title, activity, quiz_preview, summary slides
- For key_points and summary slides: provide bullets_ar and bullets_en as arrays of 3-5 items
- For other slide types: set bullets_ar and bullets_en to null
- For question_answer slides: show a question with hidden answers that reveal on click; provide reveal_items_ar and reveal_items_en as arrays of 1-3 items (the answers to reveal). Set the question in body_ar/body_en.
- For non-question_answer slides: set reveal_items_ar and reveal_items_en to null
- Include these required metadata fields on every slide:
${validationSchemaNotes}
- Content should be grade-appropriate for Grade ${lessonRow.grade_level || 1}
- Slides should have MINIMAL text on screen; concise teacher speaker notes will be generated in a separate pass
- Keep every slide strictly within the selected curriculum topic and stage
- Do not introduce future-stage concepts except for a minimal prerequisite reminder when needed
- Make sure the deck directly supports the stated learning objective
- Make sure the named key ideas are clearly covered across the deck
- Use any provided source notes as grounding context, not as text to copy verbatim
- Distribute content logically: introduce, explain concepts, provide examples, activities, then summarize

## Student Interactions
- Every practice slide (type "quiz_preview" or "question_answer") MUST include a student interaction
- Activity slides (type "activity") MAY include a student interaction when it helps participation
- Set interaction_type to one of: "free_response", "choose_correct", "true_false", "tap_to_count", "match_pairs", "sequence_order", "sort_groups", "fill_missing_word", or "draw_answer"
- Every practice slide must set interaction_type to one of those values; it cannot be null
- For free_response: set interaction_expected_answer_ar and interaction_expected_answer_en to a short model answer the teacher can reveal later
- For choose_correct: provide 3-4 options in interaction_options_ar/interaction_options_en, set interaction_correct_index to the 0-based index of the correct answer
- For fill_missing_word: default to multiple choice (interaction_free_entry=false) with 2-4 options in interaction_options_ar/interaction_options_en and set interaction_correct_index to the 0-based index of the correct word. If the answer is a short, unambiguous single word, you may instead set interaction_free_entry=true and provide interaction_expected_answer_ar/interaction_expected_answer_en (options can be null). Either way, make the visible slide text clearly contain a blank to fill.
- For true_false: set interaction_true_false_answer to true or false
- For tap_to_count: set interaction_count_target (1-12) and interaction_visual_emoji (a single emoji)
- For match_pairs: provide 2-4 aligned pairs using interaction_items_ar/en and interaction_targets_ar/en. The correct match is item 0 to target 0, item 1 to target 1, and so on
- For sequence_order: provide 3-5 ordered entries in interaction_items_ar/en. The listed order is the correct answer
- For sort_groups: provide 2-6 items in interaction_items_ar/en, 2-4 group labels in interaction_targets_ar/en, and interaction_solution_map as the 0-based target index for each item
- For draw_answer: fill interaction_expected_answer_ar and/or interaction_expected_answer_en with a short plain-language description of what a correct student drawing must contain (shapes, labels, relationships). This description is used by a vision grader to judge the submitted drawing.
- Set interaction_prompt_ar/interaction_prompt_en: a short question or instruction for the student
- Non-interactive slides (title, content, key_points, diagram_description, summary): set ALL interaction fields to null, including interaction_items_ar/en, interaction_targets_ar/en, and interaction_solution_map
- Keep interaction prompts short and grade-appropriate for Grade ${lessonRow.grade_level || 1}`;

  const slideSchema = {
    type: "object",
    properties: {
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "title",
                "content",
                "key_points",
                "diagram_description",
                "activity",
                "quiz_preview",
                "question_answer",
                "summary",
              ],
            },
            title_ar: { type: "string" },
            title_en: { type: "string" },
            body_ar: { type: "string" },
            body_en: { type: "string" },
            visual_hint: { type: "string" },
            bullets_ar: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            bullets_en: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            reveal_items_ar: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            reveal_items_en: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            image_url: { type: "null" },
            layout: {
              type: "string",
              enum: ["default", "image_left", "image_right", "image_top", "full_image"],
            },
            lesson_phase: {
              type: "string",
              enum: ["title", "objectives", "core_teaching", "practice", "summary_goodbye"],
            },
            idea_focus_ar: { type: "string" },
            idea_focus_en: { type: "string" },
            vocabulary_word_ar: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            vocabulary_word_en: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            say_it_twice_prompt: {
              anyOf: [{ type: "boolean" }, { type: "null" }],
            },
            practice_question_count: {
              anyOf: [{ type: "integer" }, { type: "null" }],
            },
            representation_stage: {
              type: "string",
              enum: ["concrete_visual", "abstract", "not_applicable"],
            },
            interaction_type: {
              anyOf: [
                {
                  type: "string",
                  enum: [
                    "free_response",
                    "choose_correct",
                    "true_false",
                    "tap_to_count",
                    "match_pairs",
                    "sequence_order",
                    "sort_groups",
                    "fill_missing_word",
                    "draw_answer",
                  ],
                },
                { type: "null" },
              ],
            },
            interaction_prompt_ar: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            interaction_prompt_en: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            interaction_expected_answer_ar: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            interaction_expected_answer_en: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            interaction_options_ar: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_options_en: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_correct_index: {
              anyOf: [{ type: "integer" }, { type: "null" }],
            },
            interaction_true_false_answer: {
              anyOf: [{ type: "boolean" }, { type: "null" }],
            },
            interaction_count_target: {
              anyOf: [{ type: "integer" }, { type: "null" }],
            },
            interaction_visual_emoji: {
              anyOf: [{ type: "string" }, { type: "null" }],
            },
            interaction_items_ar: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_items_en: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_targets_ar: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_targets_en: {
              anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
            },
            interaction_solution_map: {
              anyOf: [{ type: "array", items: { type: "integer" } }, { type: "null" }],
            },
            interaction_free_entry: {
              anyOf: [{ type: "boolean" }, { type: "null" }],
            },
          },
          required: [
            "type",
            "title_ar",
            "title_en",
            "body_ar",
            "body_en",
            "visual_hint",
            "bullets_ar",
            "bullets_en",
            "reveal_items_ar",
            "reveal_items_en",
            "image_url",
            "layout",
            "lesson_phase",
            "idea_focus_ar",
            "idea_focus_en",
            "vocabulary_word_ar",
            "vocabulary_word_en",
            "say_it_twice_prompt",
            "practice_question_count",
            "representation_stage",
            "interaction_type",
            "interaction_prompt_ar",
            "interaction_prompt_en",
            "interaction_expected_answer_ar",
            "interaction_expected_answer_en",
            "interaction_options_ar",
            "interaction_options_en",
            "interaction_correct_index",
            "interaction_true_false_answer",
            "interaction_count_target",
            "interaction_visual_emoji",
            "interaction_items_ar",
            "interaction_items_en",
            "interaction_targets_ar",
            "interaction_targets_en",
            "interaction_solution_map",
            "interaction_free_entry",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["slides"],
    additionalProperties: false,
  } as const;

  function patchSlides(slides: PolicySlide[]): PolicySlide[] {
    return slides.map((slide) => {
      const patched = { ...slide };

      // Ensure idea_focus fields are populated
      if (!patched.idea_focus_en?.trim()) {
        patched.idea_focus_en = patched.title_en?.trim() || "Lesson content";
      }
      if (!patched.idea_focus_ar?.trim()) {
        patched.idea_focus_ar = patched.title_ar?.trim() || "محتوى الدرس";
      }

      // --- English subject: auto-fix explanation slides ---
      const isEnglishExplanation =
        subjectKey === "english" &&
        patched.lesson_phase === "core_teaching" &&
        (patched.type === "content" || patched.type === "diagram_description");

      if (isEnglishExplanation) {
        patched.say_it_twice_prompt = true;

        // Fill vocabulary_word from idea_focus or title if AI left it blank
        if (!patched.vocabulary_word_en?.trim()) {
          patched.vocabulary_word_en =
            patched.idea_focus_en?.trim() || patched.title_en?.trim() || "";
        }
        if (!patched.vocabulary_word_ar?.trim()) {
          patched.vocabulary_word_ar =
            patched.idea_focus_ar?.trim() || patched.title_ar?.trim() || "";
        }

        // Ensure vocabulary word appears somewhere in the slide text
        const combinedEn = [patched.title_en, patched.body_en, ...(patched.bullets_en || [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (
          patched.vocabulary_word_en &&
          !combinedEn.includes(patched.vocabulary_word_en.toLowerCase())
        ) {
          patched.body_en = patched.body_en
            ? `${patched.body_en.trim()}\n${patched.vocabulary_word_en}`
            : patched.vocabulary_word_en;
        }

        const combinedAr = [patched.title_ar, patched.body_ar, ...(patched.bullets_ar || [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (
          patched.vocabulary_word_ar &&
          !combinedAr.includes(patched.vocabulary_word_ar.toLowerCase())
        ) {
          patched.body_ar = patched.body_ar
            ? `${patched.body_ar.trim()}\n${patched.vocabulary_word_ar}`
            : patched.vocabulary_word_ar;
        }

        // Append "Say it twice!" to body_en if missing
        if (patched.body_en && !patched.body_en.toLowerCase().includes("say it twice")) {
          patched.body_en = `${patched.body_en.trim()}\nSay it twice!`;
        } else if (!patched.body_en) {
          patched.body_en = "Say it twice!";
        }

        // Ensure visual_hint is set
        if (!patched.visual_hint?.trim()) {
          patched.visual_hint = `Visual for: ${patched.vocabulary_word_en || patched.title_en || "lesson concept"}`;
        }
      }

      // --- Math subject: ensure representation_stage is set ---
      if (subjectKey === "math" && !patched.representation_stage) {
        patched.representation_stage = patched.lesson_phase === "core_teaching"
          ? "concrete_visual"
          : "not_applicable";
      }

      // --- Practice slides: ensure practice_question_count ---
      if (
        patched.lesson_phase === "practice" &&
        (patched.type === "quiz_preview" || patched.type === "question_answer")
      ) {
        patched.practice_question_count = 1;
      }

      return patched;
    });
  }

  function hydrateGeneratedSlides(rawSlides: Record<string, unknown>[]): PolicySlide[] {
    return rawSlides.map(
      (slide, index) => {
        const fallbackNoteSource = slide as unknown as Pick<
          PolicySlide,
          | "body_ar"
          | "body_en"
          | "bullets_ar"
          | "bullets_en"
          | "reveal_items_ar"
          | "reveal_items_en"
          | "interaction_prompt_ar"
          | "interaction_prompt_en"
        >;

        return {
          ...slide,
          id: crypto.randomUUID(),
          sequence: index,
          is_required: true,
          speaker_notes_ar: buildFallbackSpeakerNotes(fallbackNoteSource, "ar"),
          speaker_notes_en: buildFallbackSpeakerNotes(fallbackNoteSource, "en"),
          title_size: "md",
          body_size: "md",
        } as PolicySlide;
      }
    );
  }

  async function requestStructuredDeck(prompt: string, schemaName: string): Promise<PolicySlide[]> {
    const completion = await openaiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: slideSchema,
        },
      },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new SlideGenerationError("AI did not return content. Please try again.");
    }

    const generated = JSON.parse(content) as { slides?: Record<string, unknown>[] };
    return hydrateGeneratedSlides(generated.slides || []);
  }

  async function requestDeck(): Promise<PolicySlide[]> {
    return requestStructuredDeck(basePrompt, "slide_deck");
  }

  async function repairDeck(
    invalidSlides: PolicySlide[],
    validationIssues: string[]
  ): Promise<PolicySlide[]> {
    const repairPrompt = `You are repairing an Amal School lesson slide deck so it satisfies the mandatory lesson policy exactly.

Do not change the lesson topic, curriculum stage, or the separate English/Arabic slide intent. Keep as much of the existing slide wording as possible while fixing the policy violations.

## Lesson Context
- Title (Arabic): ${lessonRow.title_ar || "Untitled"}
- Title (English): ${lessonRow.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lessonRow.grade_level || 1}
${learningObjectiveLine}
${keyIdeasSection}
${curriculumBlock}

${policyPrompt}

## Validation Failures To Fix
${validationIssues.map((issue) => `- ${issue}`).join("\n")}

## Existing Invalid Deck
${JSON.stringify(
  {
    slides: invalidSlides.map((slide) => ({
      type: slide.type,
      title_ar: slide.title_ar,
      title_en: slide.title_en,
      body_ar: slide.body_ar,
      body_en: slide.body_en,
      visual_hint: slide.visual_hint,
      bullets_ar: slide.bullets_ar,
      bullets_en: slide.bullets_en,
      reveal_items_ar: slide.reveal_items_ar,
      reveal_items_en: slide.reveal_items_en,
      image_url: slide.image_url,
      layout: slide.layout,
      lesson_phase: slide.lesson_phase,
      idea_focus_ar: slide.idea_focus_ar,
      idea_focus_en: slide.idea_focus_en,
      vocabulary_word_ar: slide.vocabulary_word_ar,
      vocabulary_word_en: slide.vocabulary_word_en,
      say_it_twice_prompt: slide.say_it_twice_prompt,
      practice_question_count: slide.practice_question_count,
      representation_stage: slide.representation_stage,
      interaction_type: slide.interaction_type,
      interaction_prompt_ar: slide.interaction_prompt_ar,
      interaction_prompt_en: slide.interaction_prompt_en,
      interaction_expected_answer_ar: slide.interaction_expected_answer_ar,
      interaction_expected_answer_en: slide.interaction_expected_answer_en,
      interaction_options_ar: slide.interaction_options_ar,
      interaction_options_en: slide.interaction_options_en,
      interaction_correct_index: slide.interaction_correct_index,
      interaction_true_false_answer: slide.interaction_true_false_answer,
      interaction_count_target: slide.interaction_count_target,
      interaction_visual_emoji: slide.interaction_visual_emoji,
      interaction_items_ar: slide.interaction_items_ar,
      interaction_items_en: slide.interaction_items_en,
      interaction_targets_ar: slide.interaction_targets_ar,
      interaction_targets_en: slide.interaction_targets_en,
      interaction_solution_map: slide.interaction_solution_map,
      interaction_free_entry: slide.interaction_free_entry,
    })),
  },
  null,
  2
)}`;

    return requestStructuredDeck(repairPrompt, "repaired_slide_deck");
  }

  async function enrichSpeakerNotes(slides: PolicySlide[]): Promise<PolicySlide[]> {
    const speakerNotesPrompt = `You are writing teacher speaker notes for an existing Amal School lesson deck.

Do not change slide order, slide types, or visible on-screen content. Only write what the teacher should say.

## Lesson Context
- Title (Arabic): ${lessonRow.title_ar || "Untitled"}
- Title (English): ${lessonRow.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lessonRow.grade_level || 1}
${learningObjectiveLine}
${keyIdeasSection}
${curriculumBlock}

## Rules
- Return exactly one notes entry for every slide sequence below.
- Keep notes concise but useful: 2-4 short sentences per slide in each language.
- Expand the teaching explanation, but do not introduce new curriculum concepts.
- For English teaching slides, clearly model the key word or phrase and explain the Arabic meaning when helpful for the teacher.
- For practice slides, explain how the teacher should prompt the child and reveal or confirm the answer.
- Preserve the beginner-friendly tone and curriculum alignment already present in the slides.

## Existing Slides
${buildSpeakerNotesContext(slides)}`;

    const speakerNotesSchema = {
      type: "object",
      properties: {
        slides: {
          type: "array",
          minItems: slides.length,
          maxItems: slides.length,
          items: {
            type: "object",
            properties: {
              sequence: { type: "integer" },
              speaker_notes_ar: { type: "string" },
              speaker_notes_en: { type: "string" },
            },
            required: ["sequence", "speaker_notes_ar", "speaker_notes_en"],
            additionalProperties: false,
          },
        },
      },
      required: ["slides"],
      additionalProperties: false,
    } as const;

    const completion = await openaiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: speakerNotesPrompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "slide_speaker_notes",
          strict: true,
          schema: speakerNotesSchema,
        },
      },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new SlideGenerationError("AI did not return speaker notes content. Please try again.");
    }

    const generated = JSON.parse(content) as {
      slides?: Array<{
        sequence?: number;
        speaker_notes_ar?: string;
        speaker_notes_en?: string;
      }>;
    };
    const notesBySequence = new Map(
      (generated.slides || [])
        .filter((slide): slide is { sequence: number; speaker_notes_ar: string; speaker_notes_en: string } =>
          typeof slide.sequence === "number"
        )
        .map((slide) => [slide.sequence, slide])
    );

    return slides.map((slide) => {
      const noteEntry = notesBySequence.get(slide.sequence);

      if (!noteEntry) {
        return slide;
      }

      return {
        ...slide,
        speaker_notes_ar: noteEntry.speaker_notes_ar?.trim() || slide.speaker_notes_ar,
        speaker_notes_en: noteEntry.speaker_notes_en?.trim() || slide.speaker_notes_en,
      };
    });
  }

  const generatedAt = new Date().toISOString();

  async function persistSlides(slides: PolicySlide[]): Promise<void> {
    const slidePayload =
      slides as unknown as Database["public"]["Tables"]["lesson_slides"]["Insert"]["slides"];

    const { error: saveError } = await supabase.from("lesson_slides").upsert(
      {
        lesson_id: lessonId,
        slides: slidePayload,
        language_mode: languageMode,
        generated_at: generatedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id" }
    );

    if (saveError) {
      throw new SlideGenerationError(saveError.message, 500);
    }
  }

  // ── Notes-only mode: load existing slides, enrich, return ──────────
  if (enrichNotesOnly) {
    const { data: existingDeck } = await supabase
      .from("lesson_slides")
      .select("slides")
      .eq("lesson_id", lessonId)
      .single();

    const existingSlides = Array.isArray(existingDeck?.slides)
      ? (existingDeck.slides as unknown as PolicySlide[])
      : null;

    if (!existingSlides || existingSlides.length === 0) {
      throw new SlideGenerationError("No existing slides to enrich", 404);
    }

    const enriched = await enrichSpeakerNotes(existingSlides);
    await persistSlides(enriched);
    return enriched;
  }

  // ── Normal deck generation ────────────────────────────────────────
  onProgress?.({ type: 'progress', message: 'Generating slide deck...' });
  let slides = patchSlides(await requestDeck());
  let validationIssues = validateGeneratedSlides(slides, {
    slideCount,
    subjectKey,
  });

  if (validationIssues.length > 0) {
    onProgress?.({ type: 'progress', message: 'Refining slides...' });
    slides = patchSlides(await repairDeck(slides, validationIssues));
    validationIssues = validateGeneratedSlides(slides, {
      slideCount,
      subjectKey,
    });
  }

  if (validationIssues.length > 0) {
    console.warn("Slide validation issues after repair + patch:", validationIssues);
    const criticalIssues = validationIssues.filter(
      (issue) =>
        !issue.includes("say_it_twice_prompt") &&
        !issue.includes("vocabulary_word") &&
        !issue.includes("Say it twice") &&
        !issue.includes("visual_hint") &&
        !issue.includes("practice_question_count") &&
        !issue.includes("idea_focus")
    );

    if (criticalIssues.length > 0) {
      throw new SlideGenerationError(
        "Generated slides did not pass the mandatory lesson policy.",
        502,
        criticalIssues
      );
    }
  }

  await persistSlides(slides);

  // Return early without speaker notes — caller can enrich later
  if (skipSpeakerNotes) {
    return slides;
  }

  try {
    const slidesWithSpeakerNotes = await enrichSpeakerNotes(slides);
    await persistSlides(slidesWithSpeakerNotes);
    return slidesWithSpeakerNotes;
  } catch (error) {
    console.error("Speaker notes enrichment failed; keeping first-pass deck.", error);
  }

  return slides;
}
