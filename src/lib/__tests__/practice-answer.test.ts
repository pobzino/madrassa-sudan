import { describe, it, expect } from "vitest";
import { practiceAnswerMatches } from "../practice-answer";
import { readFileSync } from "node:fs";
describe("shared Practice marking", () => {
  it("distinguishes capitalisation and punctuation in choices", () => {
    expect(practiceAnswerMatches("sam", "Sam", "multiple_choice")).toBe(false);
    expect(practiceAnswerMatches("My name is Sara", "My name is Sara.", "multiple_choice")).toBe(false);
    expect(practiceAnswerMatches("Sam", "Sam", "multiple_choice")).toBe(true);
  });
  it("accepts Arabic digits and decimal commas for typed answers", () => {
    expect(practiceAnswerMatches(" ١٢ ", "12", "short_answer")).toBe(true);
    expect(practiceAnswerMatches("۱۲", "12", "short_answer")).toBe(true);
    expect(practiceAnswerMatches("1,5", "1.5", "short_answer")).toBe(true);
    expect(practiceAnswerMatches("", "0", "short_answer")).toBe(false);
  });
  it("supports one supplied word without accepting other completions", () => {
    expect(practiceAnswerMatches(" Pen ", "pen", "short_answer")).toBe(true);
    expect(practiceAnswerMatches("dug", "dog", "short_answer")).toBe(false);
  });
  it("marks explicitly typed letter case accurately", () => {
    expect(practiceAnswerMatches("b", "B", "short_answer")).toBe(false);
    expect(practiceAnswerMatches(" B ", "B", "short_answer")).toBe(true);
    expect(practiceAnswerMatches("C", "c", "short_answer")).toBe(false);
  });
  it("accepts exactly the keyed choice for every corrected bank question", () => {
    const {questions} = JSON.parse(readFileSync(new URL('../../../scripts/practice-maintenance/plan.json', import.meta.url), 'utf8')) as {
      questions: {id: string; question_type: string; correct_answer: string; correct_option_index: number | null; options_ar: string[] | null; options_en: string[] | null}[];
    };
    expect(questions).toHaveLength(410);
    for (const q of questions) {
      expect(practiceAnswerMatches(q.correct_answer, q.correct_answer, q.question_type), q.id).toBe(true);
      if (q.question_type === 'short_answer') continue;
      for (const choices of [q.options_ar!, q.options_en!]) {
        const displayedAnswer = choices[q.correct_option_index!];
        choices.forEach((choice, i) => {
          expect(practiceAnswerMatches(choice, displayedAnswer, q.question_type), `${q.id}/${i}`).toBe(i === q.correct_option_index);
        });
      }
    }
  });
});
