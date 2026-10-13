import { describe, expect, it } from "vitest";
import {
  resolvePracticeDisplayLanguages,
  resolvePracticeQuestionAnswerLanguage,
  resolvePracticeQuestionPresentation,
} from "@/lib/practice-language";

describe("resolvePracticeDisplayLanguages", () => {
  it("uses an Arabic instruction but English phonics material on an Arabic interface", () => {
    expect(resolvePracticeDisplayLanguages("en", "ar")).toEqual({
      instructionLanguage: "ar",
      answerLanguage: "en",
      narrationLanguage: "ar",
    });
  });

  it("keeps Arabic answer material in Arabic when the interface is English", () => {
    expect(resolvePracticeDisplayLanguages("ar", "en")).toEqual({
      instructionLanguage: "en",
      answerLanguage: "ar",
      narrationLanguage: "en",
    });
  });

  it("uses the interface language for a bilingual or legacy lesson", () => {
    expect(resolvePracticeDisplayLanguages("both", "ar")).toEqual({
      instructionLanguage: "ar",
      answerLanguage: "ar",
      narrationLanguage: "ar",
    });
    expect(resolvePracticeDisplayLanguages(undefined, "en")).toEqual({
      instructionLanguage: "en",
      answerLanguage: "en",
      narrationLanguage: "en",
    });
  });

  it("shows English choices when an Arabic prompt explicitly asks for English", () => {
    expect(
      resolvePracticeQuestionAnswerLanguage({
        defaultAnswerLanguage: "ar",
        questionTextAr: "اختر الكلمة أو العبارة الإنجليزية التي تعني «كيف حالك؟».",
        questionTextEn: "Choose the English word or phrase meaning «كيف حالك؟».",
      })
    ).toBe("en");
  });

  it("keeps the lesson answer language when the prompt does not request English", () => {
    expect(
      resolvePracticeQuestionAnswerLanguage({
        defaultAnswerLanguage: "ar",
        questionTextAr: "اختر الترجمة الصحيحة: How are you?",
        questionTextEn: "Choose the correct translation: How are you?",
      })
    ).toBe("ar");
  });

  it("keeps Arabic instruction separate from English learning content", () => {
    expect(
      resolvePracticeQuestionPresentation({
        defaultAnswerLanguage: "ar",
        instructionLanguage: "ar",
        instructionAr: "ما الحرف المتحرك في الكلمة التالية؟",
        instructionEn: "Which vowel is in the following word?",
        questionContent: "cat",
        questionContentLanguage: "en",
        answerLanguage: "en",
        questionTextAr: "ما الحرف المتحرك في كلمة قطة؟",
        questionTextEn: "Which vowel is in cat?",
      })
    ).toEqual({
      instruction: "ما الحرف المتحرك في الكلمة التالية؟",
      questionContent: "cat",
      questionContentLanguage: "en",
      answerLanguage: "en",
    });
  });

  it("uses the complete English prompt for legacy English practices", () => {
    expect(
      resolvePracticeQuestionPresentation({
        defaultAnswerLanguage: "en",
        instructionLanguage: "ar",
        legacyMaterialLanguage: "en",
        questionTextAr: "ما الحرف المتحرك في كلمة قطة؟",
        questionTextEn: "Which vowel is in cat?",
      })
    ).toMatchObject({
      instruction: "Which vowel is in cat?",
      answerLanguage: "en",
    });
  });
});
