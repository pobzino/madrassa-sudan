export type PracticeLanguage = "ar" | "en";
export type LessonLanguageMode = PracticeLanguage | "both" | null | undefined;

/**
 * Exercises must stay in the language being taught. Otherwise an English
 * phonics question can be rendered with Arabic answer choices and become
 * impossible to complete.
 */
export function resolvePracticeContentLanguage(
  lessonLanguageMode: LessonLanguageMode,
  interfaceLanguage: PracticeLanguage
): PracticeLanguage {
  return lessonLanguageMode === "ar" || lessonLanguageMode === "en"
    ? lessonLanguageMode
    : interfaceLanguage;
}
