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

export function getSlideGeneratorPolicyPrompt({
  slideCount,
  subjectKey,
}: BuildPromptOptions): string {
  const globalRules = [
    "## Mandatory Slide Policy",
    "- These rules are mandatory and cannot be skipped or relaxed.",
    `- Generate exactly ${slideCount} slides.`,
    '- Use this fixed lesson flow:',
    '  1. Slide 1 = title slide',
    '  2. Slide 2 = learning objectives slide',
    '  3. Middle slides = core teaching slides',
    '  4. Final teaching section before the last slide = practice slide(s)',
    '  5. Final slide = practice summary / goodbye slide',
    '- Core teaching slides must be the majority of the deck.',
    '- Return `lesson_phase` on every slide using one of: `title`, `objectives`, `core_teaching`, `practice`, `summary_goodbye`.',
    '- Return `idea_focus_en` and `idea_focus_ar` on every slide. Each slide must focus on exactly one idea only.',
    '- Never combine two teaching concepts on one slide.',
    '- Keep slide text large and clear: short titles, short bodies, minimal clutter.',
    '- The title slide must show the lesson title in both English and Arabic.',
    '- The objectives slide must come immediately after the title slide.',
    '- The final slide must be a summary / goodbye slide.',
    '- Practice slides must contain exactly one question only.',
    '- Use `practice_question_count` to declare the number of questions shown on each practice slide.',
    '- Every slide must keep Arabic and English visible and readable; do not bury one language in speaker notes.',
    '- On content slides, show key terms and concepts in BOTH English and Arabic side by side so students see both languages clearly.',
    '- For English lessons: vocabulary words must be displayed prominently (large, bold, or highlighted) — not buried in a sentence. Use a clear format like "Word: apple — التفاحة" so the student can see and read the word at a glance.',
  ];

  const englishRules =
    subjectKey === "english"
      ? [
          "## Mandatory English Rules",
          "- Every `core_teaching` slide must introduce one beginner-friendly English vocabulary item or short usable phrase.",
          "- On every `core_teaching` slide, fill `vocabulary_word_en` and `vocabulary_word_ar`.",
          '- The English vocabulary item must appear PROMINENTLY in the visible English slide content — use a clear format like "Word: apple" or place it as the main heading so students can read it at a glance.',
          '- The Arabic translation must appear PROMINENTLY in the visible Arabic slide content — placed next to or directly below the English word so both are visible together.',
          '- On every core teaching slide, the title or body must clearly show the vocabulary in BOTH languages side by side (e.g. "apple — تفاحة") so bilingual learners see the connection immediately.',
          '- Set `say_it_twice_prompt` to true on every `core_teaching` slide.',
          '- The visible English content on each vocabulary slide must include the literal cue `Say it twice`.',
          '- Vocabulary slides must include an explicit visual cue through `visual_hint` describing a simple picture of the word.',
          '- Practice slides must stay simple enough for a complete English beginner.',
          '- Choose vocabulary that is practical and everyday: greetings, classroom objects, body parts, family, food, colours, numbers — not abstract or advanced words.',
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
    "- `vocabulary_word_en` and `vocabulary_word_ar`: required for English core teaching slides, null otherwise.",
    "- `say_it_twice_prompt`: true for English core teaching slides, null otherwise.",
    "- `practice_question_count`: 1 for practice slides, null otherwise.",
    "- `representation_stage`: required for maths slides (`concrete_visual`, `abstract`, or `not_applicable`), `not_applicable` for non-maths.",
  ];

  const interactionRules = [
    "## Interaction Rules",
    "- Every practice slide must include a student interaction via `interaction_type`.",
    "- Activity slides may include a student interaction via `interaction_type` when it improves participation.",
    "- When `interaction_type` is set, all companion fields for that type must be filled.",
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
    "practice_question_count must be 1 on every practice slide",
    "every practice slide must set interaction_type",
  ];

  notes.push("Slides with interaction_type must include all companion fields for that type");

  if (subjectKey === "english") {
    notes.push("English core teaching slides must set vocabulary_word_en, vocabulary_word_ar, and say_it_twice_prompt=true");
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

  if (slides.length !== slideCount) {
    issues.push(`Deck must contain exactly ${slideCount} slides; received ${slides.length}.`);
  }

  if (slides.length < 4) {
    issues.push("Deck is too short to satisfy the required title, objectives, practice, and summary structure.");
    return issues;
  }

  const first = slides[0];
  const second = slides[1];
  const last = slides[slides.length - 1];

  if (first.type !== "title" || first.lesson_phase !== "title") {
    issues.push("Slide 1 must be a title slide with lesson_phase=`title`.");
  }

  if (second.type !== "key_points" || second.lesson_phase !== "objectives") {
    issues.push("Slide 2 must be the learning objectives slide and use lesson_phase=`objectives`.");
  }

  if (last.type !== "summary" || last.lesson_phase !== "summary_goodbye") {
    issues.push("The final slide must be a summary/goodbye slide with lesson_phase=`summary_goodbye`.");
  }

  if (!first.title_en?.trim() || !first.title_ar?.trim()) {
    issues.push("The title slide must include the lesson title in both English and Arabic.");
  }

  const practiceStartIndex = slides.findIndex((slide, index) => index > 1 && slide.lesson_phase === "practice");
  if (practiceStartIndex === -1 || practiceStartIndex >= slides.length - 1) {
    issues.push("The deck must include at least one practice slide before the final summary/goodbye slide.");
  } else {
    const prePracticeSlides = slides.slice(2, practiceStartIndex);
    const practiceSlides = slides.slice(practiceStartIndex, slides.length - 1);

    if (prePracticeSlides.length === 0) {
      issues.push("The deck needs a core teaching section before practice begins.");
    }

    if (!prePracticeSlides.every((slide) => slide.lesson_phase === "core_teaching")) {
      issues.push("All slides between the objectives slide and the practice section must use lesson_phase=`core_teaching`.");
    }

    if (!practiceSlides.every((slide) => slide.lesson_phase === "practice")) {
      issues.push("Once the practice section starts, every slide before the final summary must use lesson_phase=`practice`.");
    }

    if (prePracticeSlides.length <= practiceSlides.length) {
      issues.push("Core teaching slides must be the majority of the deck.");
    }
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

    // Interaction validation
    if (slide.interaction_type) {
      const isInteractiveSlideType = slide.type === "activity" || isPracticeType(slide);
      if (!isInteractiveSlideType) {
        issues.push(`Slide ${index + 1} has interaction_type set but is not an activity or practice slide.`);
      }

      if (!slide.interaction_prompt_ar?.trim() || !slide.interaction_prompt_en?.trim()) {
        issues.push(`Slide ${index + 1} has interaction_type but missing interaction prompt.`);
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
      if (slide.lesson_phase !== "core_teaching") {
        return;
      }

      if (!slide.vocabulary_word_en?.trim() || !slide.vocabulary_word_ar?.trim()) {
        issues.push(`English core teaching slide ${index + 1} must include vocabulary_word_en and vocabulary_word_ar.`);
      }

      if (slide.say_it_twice_prompt !== true) {
        issues.push(`English core teaching slide ${index + 1} must set say_it_twice_prompt=true.`);
      }

      if (!containsText(slideCombinedEnglish(slide), slide.vocabulary_word_en) || !containsText(slideCombinedArabic(slide), slide.vocabulary_word_ar)) {
        issues.push(`English core teaching slide ${index + 1} must visibly show the English vocabulary and Arabic translation.`);
      }

      if (!containsText(slide.body_en, "say it twice")) {
        issues.push(`English core teaching slide ${index + 1} must include the visible cue "Say it twice" in body_en.`);
      }

      if (!slide.visual_hint?.trim()) {
        issues.push(`English core teaching slide ${index + 1} must include a visual_hint.`);
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
