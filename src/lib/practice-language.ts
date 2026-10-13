export type PracticeLanguage = "ar" | "en";
export type LessonLanguageMode = PracticeLanguage | "both" | null | undefined;

interface PracticeQuestionLanguageInput {
  defaultAnswerLanguage: PracticeLanguage;
  answerLanguage?: string | null;
  questionTextAr: string | null | undefined;
  questionTextEn: string | null | undefined;
}

interface PracticeQuestionPresentationInput extends PracticeQuestionLanguageInput {
  instructionLanguage: PracticeLanguage;
  legacyMaterialLanguage?: LessonLanguageMode;
  instructionAr?: string | null;
  instructionEn?: string | null;
  questionContent?: string | null;
  questionContentLanguage?: string | null;
}

export type PracticeQuestionPresentation = {
  answerLanguage: PracticeLanguage;
  instruction: string;
  questionContent: string | null;
  questionContentLanguage: PracticeLanguage | null;
};

function asPracticeLanguage(value: string | null | undefined): PracticeLanguage | null {
  return value === "ar" || value === "en" ? value : null;
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * A lesson can be narrated in Arabic while assessing English vocabulary. In
 * that case the prompt, rather than the narration language, determines which
 * option set a learner needs to see.
 */
export function resolvePracticeQuestionAnswerLanguage({
  defaultAnswerLanguage,
  answerLanguage,
  questionTextAr,
  questionTextEn,
}: PracticeQuestionLanguageInput): PracticeLanguage {
  const authoredAnswerLanguage = asPracticeLanguage(answerLanguage);
  if (authoredAnswerLanguage) return authoredAnswerLanguage;

  const asksForEnglishAnswer =
    /(?:الكلمة|العبارة|الجملة|الإجابة|الجواب).*(?:الإنجليزية|بالإنجليزية)|(?:الإنجليزية|بالإنجليزية).*(?:الكلمة|العبارة|الجملة|الإجابة|الجواب)/u.test(
      questionTextAr ?? ""
    ) || /\bEnglish (?:word|phrase|sentence|answer)\b/i.test(questionTextEn ?? "");

  return asksForEnglishAnswer ? "en" : defaultAnswerLanguage;
}

/**
 * New practices store the learner instruction separately from the material
 * under assessment. Older questions remain readable through the fallbacks.
 */
export function resolvePracticeQuestionPresentation({
  defaultAnswerLanguage,
  instructionLanguage,
  legacyMaterialLanguage,
  answerLanguage,
  instructionAr,
  instructionEn,
  questionContent,
  questionContentLanguage,
  questionTextAr,
  questionTextEn,
}: PracticeQuestionPresentationInput): PracticeQuestionPresentation {
  const resolvedAnswerLanguage = resolvePracticeQuestionAnswerLanguage({
    defaultAnswerLanguage,
    answerLanguage,
    questionTextAr,
    questionTextEn,
  });
  const preferredInstruction =
    instructionLanguage === "ar" ? cleanText(instructionAr) : cleanText(instructionEn);
  const fallbackInstruction =
    !preferredInstruction && legacyMaterialLanguage === "en"
      ? cleanText(questionTextEn) || cleanText(questionTextAr)
      : instructionLanguage === "ar"
        ? cleanText(questionTextAr)
        : cleanText(questionTextEn) || cleanText(questionTextAr);
  const content = cleanText(questionContent);

  return {
    answerLanguage: resolvedAnswerLanguage,
    instruction: preferredInstruction || fallbackInstruction,
    questionContent: content || null,
    questionContentLanguage: content ? asPracticeLanguage(questionContentLanguage) || resolvedAnswerLanguage : null,
  };
}

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
