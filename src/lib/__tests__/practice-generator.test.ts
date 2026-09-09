import { describe, expect, it, vi } from "vitest";
import {
  getPracticeQualityIssues,
  normalizeGeneratedPractice,
  shouldRegenerateExistingPractice,
  ensureLessonPractice,
} from "@/lib/server/practice-generator";

const choice = {
  question_type: "multiple_choice" as const,
  question_text_ar: "اختر العدد ثلاثة",
  question_text_en: "Choose the number three",
  options_ar: ["١", "٢", "٣", "٤"],
  options_en: ["1", "2", "3", "4"],
  correct_option_index: 2,
  correct_answer: "",
};

describe('ensureLessonPractice create-only boundary', () => {
  it.each([0, 1, 10])('preserves existing questions (%i rows), even with force', async count => {
    const calls: string[] = [];
    const client = {from: vi.fn((table: string) => {
      const result = {data: table === 'lessons' ? {id: 'lesson'}
        : table === 'homework_assignments' ? {id: 'practice', title_ar: 'تدريب', title_en: 'Practice', is_published: true}
        : table === 'homework_questions' ? Array.from({length: count}, () => ({})) : null, error: null};
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () => Promise.resolve(result),
        update: () => { calls.push(`${table}:update`); return query; },
        insert: () => { throw new Error(`Unexpected insert into ${table}`); },
        delete: () => { throw new Error(`Unexpected delete from ${table}`); },
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    })};
    const result = await ensureLessonPractice({
      client: client as unknown as Parameters<typeof ensureLessonPractice>[0]['client'],
      lessonId: 'lesson', createdBy: 'owner', force: true,
    });
    expect(result).toMatchObject({assignmentId: 'practice', generated: false, published: true, questionCount: count});
    expect(calls).toEqual(['learning_path_steps:update']);
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain('lesson_sims');
  });
});

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

  it("flags duplicate choices for repair before final acceptance", () => {
    const result = normalizeGeneratedPractice(
      {
        title_ar: "تدريب",
        title_en: "Practice",
        questions: [{ ...choice, options_en: ["1", "1", "3", "4"] }],
      },
      1
    );
    expect(getPracticeQualityIssues(result, 1)).toContain(
      "Question 1 contains duplicate answer choices."
    );
  });

  it("flags repeated, generic, and missing-context prompts", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...choice,
      question_text_ar: index < 2 ? "ما الكلمة الصحيحة؟" : `اختر العدد ${index + 1}`,
      question_text_en: index < 2 ? "What is the correct word?" : `Choose number ${index + 1}`,
      correct_option_index: index % 4,
    }));
    questions[2] = {
      ...questions[2],
      question_text_ar: "انظر إلى الصورة واختر العدد",
      question_text_en: "Look at the picture and choose the number",
    };

    const issues = getPracticeQualityIssues(
      { title_ar: "تدريب", title_en: "Practice", questions },
      10
    );

    expect(issues.some((issue) => issue.includes("repeat the same prompt"))).toBe(true);
    expect(issues.some((issue) => issue.includes("generic"))).toBe(true);
    expect(issues.some((issue) => issue.includes("missing context"))).toBe(true);
  });

  it("does not treat the taught command listen as missing audio", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...choice,
      question_text_ar: `ماذا تعني كلمة listen في السؤال ${index + 1}؟`,
      question_text_en: `What does listen mean in question ${index + 1}?`,
      correct_option_index: index % 4,
    }));

    const issues = getPracticeQualityIssues(
      { title_ar: "تدريب", title_en: "Practice", questions },
      10
    );

    expect(issues.some((issue) => issue.includes("missing context"))).toBe(false);
  });

  it("does not treat a complete pictogram fact as missing a picture", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...choice,
      question_text_ar: `في مخطط الصور، كل صورة تمثل واحدًا (${index + 1}).`,
      question_text_en: `In a pictogram, each picture represents one (${index + 1}).`,
      correct_option_index: index % 4,
    }));

    const issues = getPracticeQualityIssues(
      { title_ar: "تدريب", title_en: "Practice", questions },
      10
    );

    expect(issues.some((issue) => issue.includes("missing context"))).toBe(false);
  });

  it("does not treat place words such as below as missing context", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      ...choice,
      question_text_ar: `القطة أسفل الكرسي في المثال ${index + 1}.`,
      question_text_en: `The cat is below the chair in example ${index + 1}.`,
      correct_option_index: index % 4,
    }));

    const issues = getPracticeQualityIssues(
      { title_ar: "تدريب", title_en: "Practice", questions },
      10
    );

    expect(issues.some((issue) => issue.includes("missing context"))).toBe(false);
  });
});

describe("shouldRegenerateExistingPractice", () => {
  it("never overwrites a human-reviewed Practice, even when regeneration is forced", () => {
    expect(
      shouldRegenerateExistingPractice({
        force: true,
        reviewedAt: "2026-09-06T12:00:00.000Z",
        hasCompleteQuestions: true,
      })
    ).toBe(false);
  });

  it("preserves an existing Practice even when explicitly forced", () => {
    expect(
      shouldRegenerateExistingPractice({
        force: true,
        reviewedAt: null,
        hasCompleteQuestions: true,
      })
    ).toBe(false);
  });

  it("keeps a complete unreviewed draft during normal background ensure calls", () => {
    expect(
      shouldRegenerateExistingPractice({
        force: false,
        reviewedAt: null,
        hasCompleteQuestions: true,
      })
    ).toBe(false);
  });

  it("preserves incomplete drafts for manual repair", () => {
    expect(
      shouldRegenerateExistingPractice({
        force: false,
        reviewedAt: null,
        hasCompleteQuestions: false,
      })
    ).toBe(false);
  });
});
