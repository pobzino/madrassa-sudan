import { NextRequest, NextResponse } from "next/server";
import {
  getCurriculumPromptBlock,
  getCurriculumRequirementMessage,
  getCurriculumSelectionForLesson,
  getSupportedSubjectKey,
} from "@/lib/curriculum";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";
import type { Database } from "@/lib/database.types";
import {
  clampSlideCount,
  parseSlideGenerationContext,
  suggestSlideCount,
} from "@/lib/slides-generation";
import {
  getSlideGeneratorPolicyPrompt,
  getSlideGeneratorValidationSchemaNotes,
  validateGeneratedSlides,
  type PolicySlide,
} from "@/lib/slide-generator-policy";

export const maxDuration = 120;

const MAX_TRANSCRIPT_CONTEXT_CHARS = 4000;
const MAX_CONTENT_BLOCKS = 4;
const MAX_CONTENT_BLOCK_CHARS = 800;

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: lessonId } = await params;
    const aiClient = getOpenAIClient();
    if (!aiClient) {
      return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }
    const openaiClient = aiClient!;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

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

    const { data: lesson } = await supabase
      .from("lessons")
      .select("*, subject:subjects(name_ar, name_en)")
      .eq("id", lessonId)
      .single();

    if (!lesson || lesson.created_by !== user.id) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Get optional content blocks for richer context
    const { data: contentBlocks } = await supabase
      .from("lesson_content_blocks")
      .select("language, content, source_type")
      .eq("lesson_id", lessonId)
      .order("sequence");

    const body = await request.json().catch(() => ({}));
    const generationContext = parseSlideGenerationContext(body.generation_context);
    const requestedSlideCount =
      typeof body.slide_count === "number" && Number.isFinite(body.slide_count)
        ? body.slide_count
        : generationContext?.requestedSlideCount ?? suggestSlideCount(generationContext?.lessonDurationMinutes ?? null);
    const slideCount = clampSlideCount(requestedSlideCount || 10);
    const languageMode =
      body.language_mode === "ar" || body.language_mode === "en" || body.language_mode === "both"
        ? body.language_mode
        : "ar";

    const subject = lesson.subject as { name_ar?: string; name_en?: string } | null;
    const subjectName = subject?.name_en || subject?.name_ar || "General";
    const curriculumSelection = getCurriculumSelectionForLesson(
      subject,
      lesson.grade_level,
      lesson.curriculum_topic
    );
    const curriculumRequirement = getCurriculumRequirementMessage(
      subject,
      lesson.grade_level,
      curriculumSelection
    );

    if (curriculumRequirement) {
      return NextResponse.json({ error: curriculumRequirement }, { status: 400 });
    }

    const subjectKey = curriculumSelection?.subjectKey ?? getSupportedSubjectKey(subject);

    const languageInstruction =
      languageMode === "en"
        ? "- Each slide MUST include English-first phrasing with natural Arabic support in the paired fields"
        : languageMode === "both"
          ? "- Each slide MUST feel balanced across Arabic and English, with both versions equally polished"
          : "- Each slide MUST include Arabic-first phrasing with clear English support in the paired fields";
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
    const sourceNotesSection =
      generationContext?.sourceNotes
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

    // Build context from transcript and content blocks
    let contentContext = "";
    if (lesson.ai_transcript) {
      contentContext += `\n## Existing Transcript Excerpt\n${truncateContext(
        lesson.ai_transcript,
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

    const basePrompt = `You are an expert curriculum designer for Amal Madrassa, an educational platform for Sudanese children.

Generate a presentation slide deck for a teacher to use as visual aids while recording a video lesson.

## Lesson Context
- Title (Arabic): ${lesson.title_ar || "Untitled"}
- Title (English): ${lesson.title_en || "Untitled"}
- Subject: ${subjectName}
- Grade Level: ${lesson.grade_level || 1}
- Description (Arabic): ${lesson.description_ar || "N/A"}
- Description (English): ${lesson.description_en || "N/A"}
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
- Each slide MUST have bilingual content in Arabic and English
${languageInstruction}
${goalMixInstruction}
- title_ar/title_en: Short slide heading
- body_ar/body_en: Main text (2-4 sentences for content slides, keep concise for slides)
- speaker_notes_ar/speaker_notes_en: What the teacher should SAY (3-5 sentences, more detailed than body)
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
- Content should be grade-appropriate for Grade ${lesson.grade_level || 1}
- Slides should have MINIMAL text — speaker notes carry the detail
- Keep every slide strictly within the selected curriculum topic and stage
- Do not introduce future-stage concepts except for a minimal prerequisite reminder when needed
- Make sure the deck directly supports the stated learning objective
- Make sure the named key ideas are clearly covered across the deck
- Use any provided source notes as grounding context, not as text to copy verbatim
- Distribute content logically: introduce, explain concepts, provide examples, activities, then summarize

## Student Interactions
- Every practice slide (type "quiz_preview" or "question_answer") MUST include a student interaction
- Activity slides (type "activity") MAY include a student interaction when it helps participation
- Set interaction_type to one of: "choose_correct", "true_false", "tap_to_count", "match_pairs", "sequence_order", "sort_groups", or "fill_missing_word"
- Every practice slide must set interaction_type to one of those values; it cannot be null
- For choose_correct: provide 3-4 options in interaction_options_ar/interaction_options_en, set interaction_correct_index to the 0-based index of the correct answer
- For fill_missing_word: provide 2-4 options in interaction_options_ar/interaction_options_en, set interaction_correct_index to the 0-based index of the correct word, and make the visible slide text clearly contain a blank to fill
- For true_false: set interaction_true_false_answer to true or false
- For tap_to_count: set interaction_count_target (1-12) and interaction_visual_emoji (a single emoji)
- For match_pairs: provide 2-4 aligned pairs using interaction_items_ar/en and interaction_targets_ar/en. The correct match is item 0 to target 0, item 1 to target 1, and so on
- For sequence_order: provide 3-5 ordered entries in interaction_items_ar/en. The listed order is the correct answer
- For sort_groups: provide 2-6 items in interaction_items_ar/en, 2-4 group labels in interaction_targets_ar/en, and interaction_solution_map as the 0-based target index for each item
- Set interaction_prompt_ar/interaction_prompt_en: a short question or instruction for the student
- Non-interactive slides (title, content, key_points, diagram_description, summary): set ALL interaction fields to null, including interaction_items_ar/en, interaction_targets_ar/en, and interaction_solution_map
- Keep interaction prompts short and grade-appropriate for Grade ${lesson.grade_level || 1}`;

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
              speaker_notes_ar: { type: "string" },
              speaker_notes_en: { type: "string" },
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
                      "choose_correct",
                      "true_false",
                      "tap_to_count",
                      "match_pairs",
                      "sequence_order",
                      "sort_groups",
                      "fill_missing_word",
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
            },
            required: [
              "type",
              "title_ar",
              "title_en",
              "body_ar",
              "body_en",
              "speaker_notes_ar",
              "speaker_notes_en",
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
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["slides"],
      additionalProperties: false,
    } as const;

    async function requestDeck(validationIssues: string[] = []): Promise<PolicySlide[]> {
      const retryBlock =
        validationIssues.length > 0
          ? `\n\n## Previous Attempt Failed Validation\nFix every issue below in the new deck:\n${validationIssues.map((issue) => `- ${issue}`).join("\n")}`
          : "";

      const completion = await openaiClient.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: "user", content: `${basePrompt}${retryBlock}` }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "slide_deck",
            strict: true,
            schema: slideSchema,
          },
        },
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("AI did not return content. Please try again.");
      }

      const generated = JSON.parse(content) as { slides?: Record<string, unknown>[] };

      return (generated.slides || []).map(
        (slide, index) =>
          ({
            ...slide,
            id: crypto.randomUUID(),
            sequence: index,
            is_required: true,
            title_size: "md",
            body_size: "md",
          }) as PolicySlide
      );
    }

    let slides: PolicySlide[] | null = null;
    let validationIssues: string[] = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const candidate = await requestDeck(validationIssues);
      const candidateIssues = validateGeneratedSlides(candidate, {
        slideCount,
        subjectKey,
      });

      if (candidateIssues.length === 0) {
        slides = candidate;
        break;
      }

      validationIssues = candidateIssues;
    }

    if (!slides) {
      return NextResponse.json(
        {
          error: "Generated slides did not pass the mandatory lesson policy.",
          issues: validationIssues,
        },
        { status: 502 }
      );
    }

    // Save to database
    const slidePayload =
      slides as unknown as Database["public"]["Tables"]["lesson_slides"]["Insert"]["slides"];

    await supabase
      .from("lesson_slides")
      .upsert(
        {
          lesson_id: lessonId,
          slides: slidePayload,
          language_mode: languageMode,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id" }
      );

    return NextResponse.json({ slides });
  } catch (error) {
    console.error("Generate slides error:", error);
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
