export type SlideLanguageMode = "ar" | "en" | "both";

export type SlideGoalMix =
  | "balanced"
  | "concept_explanation"
  | "worked_examples"
  | "activity_focus"
  | "quiz_review";

export interface SlideGenerationContext {
  learningObjective: string;
  keyIdeas: string[];
  sourceNotes: string;
  lessonDurationMinutes: number | null;
  slideGoalMix: SlideGoalMix;
  requestedSlideCount: number;
}

export const DEFAULT_SLIDE_GOAL_MIX: SlideGoalMix = "balanced";

export const SLIDE_GOAL_MIX_OPTIONS: Array<{
  value: SlideGoalMix;
  label: string;
  description: string;
}> = [
  {
    value: "balanced",
    label: "Balanced",
    description: "Mix explanation, examples, activity, and recap evenly.",
  },
  {
    value: "concept_explanation",
    label: "Explain Concepts",
    description: "Prioritize clarity, sequencing, and conceptual understanding.",
  },
  {
    value: "worked_examples",
    label: "Worked Examples",
    description: "Spend more slides on step-by-step examples and modeling.",
  },
  {
    value: "activity_focus",
    label: "Activity Focus",
    description: "Lean into participation, prompts, and classroom interaction.",
  },
  {
    value: "quiz_review",
    label: "Quiz Review",
    description: "Emphasize checks for understanding and revision-style prompts.",
  },
];

export function getSlideGenerationContextStorageKey(lessonId: string): string {
  return `slide-generator-context:${lessonId}`;
}

export function normalizeKeyIdeasInput(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function clampSlideCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 8;
  }

  return Math.min(Math.max(Math.round(value), 8), 12);
}

export function parseSlideGenerationContext(value: unknown): SlideGenerationContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const learningObjective =
    typeof candidate.learningObjective === "string" ? candidate.learningObjective.trim() : "";
  const sourceNotes =
    typeof candidate.sourceNotes === "string" ? candidate.sourceNotes.trim() : "";
  const lessonDurationMinutes =
    typeof candidate.lessonDurationMinutes === "number" &&
    Number.isFinite(candidate.lessonDurationMinutes)
      ? candidate.lessonDurationMinutes
      : null;
  const requestedSlideCount = clampSlideCount(
    typeof candidate.requestedSlideCount === "number" ? candidate.requestedSlideCount : null
  );
  const slideGoalMix =
    candidate.slideGoalMix === "balanced" ||
    candidate.slideGoalMix === "concept_explanation" ||
    candidate.slideGoalMix === "worked_examples" ||
    candidate.slideGoalMix === "activity_focus" ||
    candidate.slideGoalMix === "quiz_review"
      ? candidate.slideGoalMix
      : DEFAULT_SLIDE_GOAL_MIX;
  const keyIdeas = Array.isArray(candidate.keyIdeas)
    ? candidate.keyIdeas.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean).slice(0, 8)
    : [];

  if (
    !learningObjective &&
    keyIdeas.length === 0 &&
    !sourceNotes &&
    lessonDurationMinutes == null &&
    requestedSlideCount === 10 &&
    slideGoalMix === DEFAULT_SLIDE_GOAL_MIX
  ) {
    return null;
  }

  return {
    learningObjective,
    keyIdeas,
    sourceNotes,
    lessonDurationMinutes,
    slideGoalMix,
    requestedSlideCount,
  };
}

export function suggestSlideCount(durationMinutes: number | null): number {
  if (durationMinutes == null) {
    return 10;
  }

  if (durationMinutes <= 15) {
    return 8;
  }

  if (durationMinutes <= 25) {
    return 10;
  }

  return 12;
}
