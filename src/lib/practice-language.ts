export type PracticeLanguage = "ar" | "en";
export type LessonLanguageMode = PracticeLanguage | "both" | null | undefined;

/**
 * Keep the learner's instructional language separate from the material being
 * assessed. An Arabic explanation of English phonics should still show the
 * word and answer choices in English.
 */
export function resolvePracticeDisplayLanguages(
  lessonLanguageMode: LessonLanguageMode,
  interfaceLanguage: PracticeLanguage
): {
  instructionLanguage: PracticeLanguage;
  answerLanguage: PracticeLanguage;
  narrationLanguage: PracticeLanguage;
} {
  const answerLanguage =
    lessonLanguageMode === "ar" || lessonLanguageMode === "en"
      ? lessonLanguageMode
      : interfaceLanguage;

  return {
    instructionLanguage: interfaceLanguage,
    answerLanguage,
    narrationLanguage: interfaceLanguage,
  };
}
