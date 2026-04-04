import type { Slide } from "@/lib/slides.types";
import type { SupportedSubjectKey } from "@/lib/curriculum";

type SlideLessonPhase =
  | "title"
  | "objectives"
  | "core_teaching"
  | "practice"
  | "summary_goodbye";

type MathRepresentationStage = "concrete_visual" | "abstract" | "not_applicable";

export interface SlideGeneratorMeta {
  lesson_phase?: SlideLessonPhase | null;
  idea_focus_en?: string | null;
  idea_focus_ar?: string | null;
  vocabulary_word_en?: string | null;
  vocabulary_word_ar?: string | null;
  say_it_twice_prompt?: boolean | null;
  practice_question_count?: number | null;
  representation_stage?: MathRepresentationStage | null;
}

export type PolicySlide = Slide & SlideGeneratorMeta;

interface BuildPromptOptions {
  slideCount: number;
  subjectKey: SupportedSubjectKey | null;
}

interface ValidateOptions {
  slideCount: number;
  subjectKey: SupportedSubjectKey | null;
}

type RequiredSlideShape = {
  expectedType: PolicySlide["type"];
  expectedPhase: SlideLessonPhase;
  label: string;
};

const FIXED_STRUCTURE_SLIDE_COUNT = 6;

function words(value: string | null | undefined): string[] {
  return (value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function wordCount(value: string | null | undefined): number {
  return words(value).length;
}

function containsText(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  if (!haystack || !needle) {
    return false;
  }

  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function slideCombinedEnglish(slide: PolicySlide): string {
  return [
    slide.title_en,
    slide.body_en,
    ...(slide.bullets_en || []),
    ...(slide.reveal_items_en || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function slideCombinedArabic(slide: PolicySlide): string {
  return [
    slide.title_ar,
    slide.body_ar,
    ...(slide.bullets_ar || []),
    ...(slide.reveal_items_ar || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countQuestionMarks(text: string): number {
  return (text.match(/[?؟]/g) || []).length;
}

function isPracticeType(slide: PolicySlide): boolean {
  return slide.type === "quiz_preview" || slide.type === "question_answer";
}

function isEnglishVocabularySlide(slide: PolicySlide): boolean {
  return (
    slide.lesson_phase === "core_teaching" &&
    (slide.type === "content" || slide.type === "diagram_description")
  );
}

function getExplanationSlideCount(slideCount: number): number {
  return Math.max(slideCount - FIXED_STRUCTURE_SLIDE_COUNT, 0);
}

function getRequiredSlideShapes(slideCount: number): RequiredSlideShape[] {
  const explanationSlideCount = getExplanationSlideCount(slideCount);

  return [
    { expectedType: "title", expectedPhase: "title", label: "title slide" },
    { expectedType: "key_points", expectedPhase: "objectives", label: "learning objectives slide" },
    ...Array.from({ length: explanationSlideCount }, (_, index) => ({
      expectedType: "content" as const,
      expectedPhase: "core_teaching" as const,
      label: `explanation slide ${index + 1}`,
    })),
    { expectedType: "activity", expectedPhase: "core_teaching", label: "activity slide" },
    { expectedType: "quiz_preview", expectedPhase: "practice", label: "training slide 1" },
    { expectedType: "question_answer", expectedPhase: "practice", label: "training slide 2" },
    { expectedType: "summary", expectedPhase: "summary_goodbye", label: "summary slide" },
  ];
}

export function getSlideGeneratorPolicyPrompt({
  slideCount,
  subjectKey,
}: BuildPromptOptions): string {
  const explanationSlideCount = getExplanationSlideCount(slideCount);
  const activitySlideNumber = explanationSlideCount + 3;
  const trainingSlideOneNumber = activitySlideNumber + 1;
  const trainingSlideTwoNumber = activitySlideNumber + 2;
  const globalRules = [
    "## Mandatory Slide Policy",
    "- These rules are mandatory and cannot be skipped or relaxed.",
    `- Generate exactly ${slideCount} slides.`,
    '- Use this exact fixed lesson flow and do not add, remove, merge, or reorder parts:',
    "  1. Slide 1 = title slide",
    "  2. Slide 2 = learning objectives slide",
    `  3. Slides 3-${activitySlideNumber - 1} = ${explanationSlideCount} explanation slides using only one teaching idea per slide`,
    `  4. Slide ${activitySlideNumber} = one activity slide`,
    `  5. Slide ${trainingSlideOneNumber} = training slide 1`,
    `  6. Slide ${trainingSlideTwoNumber} = training slide 2`,
    `  7. Slide ${slideCount} = summary / goodbye slide`,
    "- The explanation slides must use type `content` or `diagram_description` only.",
    "- The activity slide must use type `activity`.",
    "- Training slide 1 must use type `quiz_preview`.",
    "- Training slide 2 must use type `question_answer`.",
    '- Return `lesson_phase` on every slide using one of: `title`, `objectives`, `core_teaching`, `practice`, `summary_goodbye`.',
    '- Return `idea_focus_en` and `idea_focus_ar` on every slide. Each slide must focus on exactly one idea only.',
    '- Never combine two teaching concepts on one slide.',
    '- Keep slide text large and clear: short titles, short bodies, minimal clutter.',
    "- Fill the English and Arabic slide fields separately so each language reads naturally on its own.",
    "- Never mix both languages inside one title, body, bullet, or reveal item.",
    "- Do not use slashes, brackets, or inline translations to combine English and Arabic in the same field.",
    '- The title slide must fill the lesson title in both English and Arabic fields.',
    '- The objectives slide must come immediately after the title slide.',
    '- Every explanation slide must teach a single clear idea and provide a clean English version and a clean Arabic version in their respective fields.',
    '- The activity slide must reinforce the lesson without introducing a new concept.',
    '- The two training slides must be simple guided checks that stay tightly aligned to the explanation slides.',
    '- The final slide must be a summary / goodbye slide.',
    '- Practice slides must contain exactly one question only.',
    '- Use `practice_question_count` to declare the number of questions shown on each practice slide.',
    '- Every slide must keep both language versions complete and readable in the separate fields; do not bury one language in speaker notes.',
  ];

  const englishRules =
    subjectKey === "english"
      ? [
          "## Mandatory English Rules",
          "- Every explanation slide (`content` or `diagram_description`) must introduce one beginner-friendly English vocabulary item or short usable phrase.",
          "- On every explanation slide, fill `vocabulary_word_en` and `vocabulary_word_ar`.",
          '- The English vocabulary item must appear clearly in the English slide fields.',
          '- The Arabic translation must appear clearly in the Arabic slide fields.',
          '- Set `say_it_twice_prompt` to true on every explanation slide.',
          '- The English slide content on each explanation slide must include the literal cue `Say it twice`.',
          '- Vocabulary slides must include an explicit visual cue through `visual_hint`.',
          '- The activity slide should reinforce the same vocabulary without needing extra vocabulary metadata.',
          '- Practice slides must stay simple enough for a complete English beginner.',
        ].join("\n")
      : "";

  const mathRules =
    subjectKey === "math"
      ? [
          "## Mandatory Maths Rules",
          "- Use `representation_stage` on every slide with one of: `concrete_visual`, `abstract`, `not_applicable`.",
          '- When a maths concept needs CRA, show `concrete_visual` before any related `abstract` slide.',
          '- Maths practice slides must use visuals, so `visual_hint` must clearly describe the visual representation.',
          '- Shapes, colours, and labeled objects should be named in English on screen where relevant.',
        ].join("\n")
      : "";

  const metadataRules = [
    "## Metadata Rules",
    "- `lesson_phase`: required for every slide.",
    "- `idea_focus_en` and `idea_focus_ar`: required for every slide, one idea only.",
    "- `vocabulary_word_en` and `vocabulary_word_ar`: required for English explanation slides (`content` / `diagram_description`), null otherwise.",
    "- `say_it_twice_prompt`: true for English explanation slides, null otherwise.",
    "- `practice_question_count`: 1 for practice slides, null otherwise.",
    "- `representation_stage`: required for maths slides (`concrete_visual`, `abstract`, or `not_applicable`), `not_applicable` for non-maths.",
  ];

  const interactionRules = [
    "## Interaction Rules",
    "- Every practice slide must include a student interaction via `interaction_type`.",
    "- Activity slides may include a student interaction via `interaction_type` when it improves participation.",
    "- When `interaction_type` is set, all companion fields for that type must be filled.",
    "- `free_response`: requires `interaction_prompt_ar`/`interaction_prompt_en` and `interaction_expected_answer_ar`/`interaction_expected_answer_en` so the teacher can model a strong answer.",
    "- `choose_correct`: requires `interaction_options_ar` and `interaction_options_en` (2-4 items each), `interaction_correct_index` within range, and `interaction_prompt_ar`/`interaction_prompt_en`.",
    "- `fill_missing_word`: requires `interaction_options_ar` and `interaction_options_en` (2-4 items each), `interaction_correct_index`, and `interaction_prompt_ar`/`interaction_prompt_en`.",
    "- `true_false`: requires `interaction_true_false_answer` (boolean) and `interaction_prompt_ar`/`interaction_prompt_en`.",
    "- `tap_to_count`: requires `interaction_count_target` (1-12), `interaction_visual_emoji`, and `interaction_prompt_ar`/`interaction_prompt_en`.",
    "- `match_pairs`: requires `interaction_items_ar/en` and `interaction_targets_ar/en` with 2-4 entries each; matching is by aligned index.",
    "- `sequence_order`: requires `interaction_items_ar/en` with 3-5 entries in the correct order.",
    "- `sort_groups`: requires `interaction_items_ar/en`, `interaction_targets_ar/en`, and `interaction_solution_map` where each item maps to a target index.",
    "- Non-activity/non-practice slides must set all interaction fields to null.",
    "- Keep interaction prompts short and grade-appropriate.",
  ];

  return [globalRules.join("\n"), metadataRules.join("\n"), interactionRules.join("\n"), englishRules, mathRules]
    .filter(Boolean)
    .join("\n\n");
}

export function getSlideGeneratorValidationSchemaNotes(subjectKey: SupportedSubjectKey | null): string[] {
  const notes = [
    "lesson_phase must be present on every slide",
    "idea_focus_en and idea_focus_ar must be present on every slide",
    "the deck must follow the fixed title -> objectives -> explanation -> activity -> training -> summary structure",
    "practice_question_count must be 1 on every practice slide",
    "every practice slide must set interaction_type",
  ];

  notes.push("Slides with interaction_type must include all companion fields for that type");

  if (subjectKey === "english") {
    notes.push("English explanation slides must set vocabulary_word_en, vocabulary_word_ar, and say_it_twice_prompt=true");
  }

  if (subjectKey === "math") {
    notes.push("Math slides must set representation_stage");
  }

  return notes;
}

export function validateGeneratedSlides(
  slides: PolicySlide[],
  { slideCount, subjectKey }: ValidateOptions
): string[] {
  const issues: string[] = [];
  const requiredSlides = getRequiredSlideShapes(slideCount);
  const explanationSlideCount = getExplanationSlideCount(slideCount);
  const activitySlideIndex = explanationSlideCount + 2;
  const firstTrainingSlideIndex = activitySlideIndex + 1;
  const secondTrainingSlideIndex = activitySlideIndex + 2;

  if (slides.length !== slideCount) {
    issues.push(`Deck must contain exactly ${slideCount} slides; received ${slides.length}.`);
  }

  if (slides.length < requiredSlides.length) {
    issues.push("Deck is too short to satisfy the required Amal lesson skeleton.");
    return issues;
  }

  requiredSlides.forEach((requiredSlide, index) => {
    const slide = slides[index];
    if (!slide) {
      return;
    }

    const validExplanationType =
      requiredSlide.label.startsWith("explanation") &&
      (slide.type === "content" || slide.type === "diagram_description");

    if (
      !validExplanationType &&
      slide.type !== requiredSlide.expectedType
    ) {
      issues.push(
        `Slide ${index + 1} must be the ${requiredSlide.label} and use type \`${requiredSlide.expectedType}\`.`
      );
    }

    if (slide.lesson_phase !== requiredSlide.expectedPhase) {
      issues.push(
        `Slide ${index + 1} must use lesson_phase=\`${requiredSlide.expectedPhase}\` for the ${requiredSlide.label}.`
      );
    }
  });

  const first = slides[0];

  if (!first.title_en?.trim() || !first.title_ar?.trim()) {
    issues.push("The title slide must include the lesson title in both English and Arabic.");
  }

  slides.forEach((slide, index) => {
    if (!slide.idea_focus_en?.trim() || !slide.idea_focus_ar?.trim()) {
      issues.push(`Slide ${index + 1} must declare idea_focus_en and idea_focus_ar.`);
    }

    if (wordCount(slide.title_en) > 12 || wordCount(slide.title_ar) > 12) {
      issues.push(`Slide ${index + 1} title is too crowded; keep titles concise.`);
    }

    if (wordCount(slide.body_en) > 28 || wordCount(slide.body_ar) > 28) {
      issues.push(`Slide ${index + 1} body text is too dense; keep visible slide text minimal.`);
    }

    if ((slide.bullets_en?.length || 0) > 5 || (slide.bullets_ar?.length || 0) > 5) {
      issues.push(`Slide ${index + 1} has too many bullets.`);
    }

    const englishBulletTooLong = (slide.bullets_en || []).some((bullet) => wordCount(bullet) > 12);
    const arabicBulletTooLong = (slide.bullets_ar || []).some((bullet) => wordCount(bullet) > 12);
    if (englishBulletTooLong || arabicBulletTooLong) {
      issues.push(`Slide ${index + 1} bullet text is too long for a clear slide.`);
    }

    if (slide.lesson_phase === "practice") {
      if (!isPracticeType(slide)) {
        issues.push(`Slide ${index + 1} is marked as practice but must use a practice slide type.`);
      }

      if (slide.practice_question_count !== 1) {
        issues.push(`Slide ${index + 1} practice_question_count must be 1.`);
      }

      if (!slide.interaction_type) {
        issues.push(`Slide ${index + 1} is a practice slide and must include an interaction_type.`);
      }

      const combinedPracticeText = [slide.title_en, slide.title_ar, slide.body_en, slide.body_ar].join(" ");
      if (countQuestionMarks(combinedPracticeText) > 2) {
        issues.push(`Slide ${index + 1} appears to contain multiple questions; practice slides must show one question only.`);
      }
    }

    if (slide.type === "activity" && index !== activitySlideIndex) {
      issues.push("There must be exactly one activity slide in the fixed activity slot.");
    }

    if (slide.type === "quiz_preview" && index !== firstTrainingSlideIndex) {
      issues.push("quiz_preview is reserved for the first fixed training slide.");
    }

    if (slide.type === "question_answer" && index !== secondTrainingSlideIndex) {
      issues.push("question_answer is reserved for the second fixed training slide.");
    }

    // Interaction validation
    if (slide.interaction_type) {
      const isInteractiveSlideType = slide.type === "activity" || isPracticeType(slide);
      if (!isInteractiveSlideType) {
        issues.push(`Slide ${index + 1} has interaction_type set but is not an activity or practice slide.`);
      }

      if (!slide.interaction_prompt_ar?.trim() || !slide.interaction_prompt_en?.trim()) {
        issues.push(`Slide ${index + 1} has interaction_type but missing interaction prompt.`);
      }

      if (slide.interaction_type === "free_response") {
        if (!slide.interaction_expected_answer_ar?.trim() || !slide.interaction_expected_answer_en?.trim()) {
          issues.push(`Slide ${index + 1} free_response must include model answers in both languages.`);
        }
      }

      if (slide.interaction_type === "choose_correct" || slide.interaction_type === "fill_missing_word") {
        const arLen = slide.interaction_options_ar?.length ?? 0;
        const enLen = slide.interaction_options_en?.length ?? 0;
        if (arLen < 2 || arLen > 4 || enLen < 2 || enLen > 4) {
          issues.push(`Slide ${index + 1} ${slide.interaction_type} must have 2-4 options in both languages.`);
        }
        if (typeof slide.interaction_correct_index !== "number" || slide.interaction_correct_index < 0 || slide.interaction_correct_index >= Math.max(arLen, enLen)) {
          issues.push(`Slide ${index + 1} ${slide.interaction_type} must have a valid interaction_correct_index.`);
        }
      }

      if (slide.interaction_type === "true_false") {
        if (typeof slide.interaction_true_false_answer !== "boolean") {
          issues.push(`Slide ${index + 1} true_false must set interaction_true_false_answer to true or false.`);
        }
      }

      if (slide.interaction_type === "tap_to_count") {
        const target = slide.interaction_count_target;
        if (typeof target !== "number" || target < 1 || target > 12) {
          issues.push(`Slide ${index + 1} tap_to_count must set interaction_count_target between 1 and 12.`);
        }
        if (!slide.interaction_visual_emoji?.trim()) {
          issues.push(`Slide ${index + 1} tap_to_count must set interaction_visual_emoji.`);
        }
      }

      if (slide.interaction_type === "match_pairs") {
        const itemArLen = slide.interaction_items_ar?.length ?? 0;
        const itemEnLen = slide.interaction_items_en?.length ?? 0;
        const targetArLen = slide.interaction_targets_ar?.length ?? 0;
        const targetEnLen = slide.interaction_targets_en?.length ?? 0;

        if (
          itemArLen < 2 ||
          itemArLen > 4 ||
          itemEnLen < 2 ||
          itemEnLen > 4 ||
          targetArLen !== itemArLen ||
          targetEnLen !== itemEnLen
        ) {
          issues.push(`Slide ${index + 1} match_pairs must have aligned item/target lists with 2-4 pairs in both languages.`);
        }
      }

      if (slide.interaction_type === "sequence_order") {
        const itemArLen = slide.interaction_items_ar?.length ?? 0;
        const itemEnLen = slide.interaction_items_en?.length ?? 0;
        if (
          itemArLen < 3 ||
          itemArLen > 5 ||
          itemEnLen < 3 ||
          itemEnLen > 5 ||
          itemArLen !== itemEnLen
        ) {
          issues.push(`Slide ${index + 1} sequence_order must have 3-5 ordered items in both languages.`);
        }
      }

      if (slide.interaction_type === "sort_groups") {
        const itemArLen = slide.interaction_items_ar?.length ?? 0;
        const itemEnLen = slide.interaction_items_en?.length ?? 0;
        const targetArLen = slide.interaction_targets_ar?.length ?? 0;
        const targetEnLen = slide.interaction_targets_en?.length ?? 0;
        const solutionMap = slide.interaction_solution_map ?? [];
        const withinRange = solutionMap.every(
          (targetIndex) =>
            Number.isInteger(targetIndex) &&
            targetIndex >= 0 &&
            targetIndex < Math.max(targetArLen, targetEnLen)
        );

        if (
          itemArLen < 2 ||
          itemArLen > 6 ||
          itemEnLen < 2 ||
          itemEnLen > 6 ||
          itemArLen !== itemEnLen ||
          targetArLen < 2 ||
          targetArLen > 4 ||
          targetEnLen < 2 ||
          targetEnLen > 4 ||
          targetArLen !== targetEnLen ||
          solutionMap.length !== itemArLen ||
          !withinRange
        ) {
          issues.push(`Slide ${index + 1} sort_groups must include 2-6 items, 2-4 group labels, and a valid interaction_solution_map.`);
        }
      }
    }
  });

  if (subjectKey === "english") {
    slides.forEach((slide, index) => {
      if (!isEnglishVocabularySlide(slide)) {
        return;
      }

      if (!slide.vocabulary_word_en?.trim() || !slide.vocabulary_word_ar?.trim()) {
        issues.push(`English explanation slide ${index + 1} must include vocabulary_word_en and vocabulary_word_ar.`);
      }

      if (slide.say_it_twice_prompt !== true) {
        issues.push(`English explanation slide ${index + 1} must set say_it_twice_prompt=true.`);
      }

      if (!containsText(slideCombinedEnglish(slide), slide.vocabulary_word_en) || !containsText(slideCombinedArabic(slide), slide.vocabulary_word_ar)) {
        issues.push(`English explanation slide ${index + 1} must visibly show the English vocabulary and Arabic translation.`);
      }

      if (!containsText(slide.body_en, "say it twice")) {
        issues.push(`English explanation slide ${index + 1} must include the visible cue "Say it twice" in body_en.`);
      }

      if (!slide.visual_hint?.trim()) {
        issues.push(`English explanation slide ${index + 1} must include a visual_hint.`);
      }
    });

    slides.forEach((slide, index) => {
      if (slide.lesson_phase !== "practice") {
        return;
      }

      if (wordCount(slide.body_en) > 18 || wordCount(slide.body_ar) > 18) {
        issues.push(`English practice slide ${index + 1} is too difficult or text-heavy for a complete beginner.`);
      }
    });
  }

  if (subjectKey === "math") {
    const coreTeachingSlides = slides.filter((slide) => slide.lesson_phase === "core_teaching");
    const firstAbstractIndex = coreTeachingSlides.findIndex(
      (slide) => slide.representation_stage === "abstract"
    );
    if (firstAbstractIndex >= 0) {
      const earlierConcrete = coreTeachingSlides
        .slice(0, firstAbstractIndex)
        .some((slide) => slide.representation_stage === "concrete_visual");

      if (!earlierConcrete) {
        issues.push("Math slides must show concrete/visual representation before abstract notation when CRA applies.");
      }
    }

    slides.forEach((slide, index) => {
      if (!slide.representation_stage) {
        issues.push(`Math slide ${index + 1} must include representation_stage.`);
      }

      if (slide.lesson_phase === "practice" && !slide.visual_hint?.trim()) {
        issues.push(`Math practice slide ${index + 1} must include a visual_hint so the prompt is not text-only.`);
      }
    });
  }

  return issues;
}
