import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { questionNarration, type NarratableQuestion } from "@/lib/server/question-audio";

const question: NarratableQuestion = {
  id: "q1",
  assignment_id: "a1",
  question_text_ar: "ما ناتج ٧ + ٥؟",
  question_text_en: "What is 7 + 5?",
  instruction_ar: null,
  instruction_en: null,
  question_content: null,
  question_content_language: null,
  answer_language: null,
  options: ["10", "12", "13", "11"],
  options_ar: null,
  options_en: null,
  audio_url_ar: null,
  audio_url_en: null,
  audio_text_hash_ar: null,
  audio_text_hash_en: null,
} as NarratableQuestion;

describe("questionNarration", () => {
  it("voices the key line only when asked, so shuffled options share one clip", () => {
    const full = questionNarration(question, "en", "en");
    const keyLine = questionNarration(question, "en", "en", undefined, true);
    const shuffled = questionNarration(question, "en", "en", ["12", "10", "11", "13"], true);
    expect(full.text).toContain("A: 10");
    expect(keyLine.text).toBe("What is 7 + 5?");
    expect(keyLine.text).not.toMatch(/A:|10/);
    expect(shuffled.hash).toBe(keyLine.hash);
    expect(full.hash).not.toBe(keyLine.hash);
    expect(questionNarration(question, "ar", "ar", undefined, true).text).toBe("ما ناتج ٧ + ٥؟");
  });
});
