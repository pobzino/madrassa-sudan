import { describe, expect, it } from "vitest";
import { normalizeGeneratedPractice } from "@/lib/server/practice-generator";

const choice = {
  question_type: "multiple_choice",
  question_text_ar: "اختر العدد ثلاثة",
  question_text_en: "Choose the number three",
  options_ar: ["١", "٢", "٣", "٤"],
  options_en: ["1", "2", "3", "4"],
  correct_option_index: 2,
  correct_answer: "",
};

describe("normalizeGeneratedPractice", () => {
  it("derives the canonical Arabic choice answer by aligned option index", () => {
    const result = normalizeGeneratedPractice(
      { title_ar: "تدريب", title_en: "Practice", questions: [choice] },
      1
    );
    expect(result.questions[0].correct_answer).toBe("٣");
  });

  it("stores true/false answers canonically", () => {
    const result = normalizeGeneratedPractice(
      {
        title_ar: "تدريب",
        title_en: "Practice",
        questions: [
          {
            ...choice,
            question_type: "true_false",
            options_ar: ["صحيح", "خطأ"],
            options_en: ["True", "False"],
            correct_option_index: 1,
          },
        ],
      },
      1
    );
    expect(result.questions[0].correct_answer).toBe("false");
  });

  it("rejects missing bilingual choices", () => {
    expect(() =>
      normalizeGeneratedPractice(
        {
          title_ar: "تدريب",
          title_en: "Practice",
          questions: [{ ...choice, options_en: [] }],
        },
        1
      )
    ).toThrow("both languages");
  });
});
