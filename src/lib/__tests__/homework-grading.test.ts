import { describe, expect, it } from "vitest";
import {
  countsAsNewHomeworkCompletion,
  decideRetake,
  gradeHomeworkAnswers,
  isOpenSubmissionStatus,
  meetsPassingScore,
  normalizeSubmittedAnswers,
  passMarkPoints,
  type GradableQuestion,
  type RetakeAssignmentInput,
} from "../homework-grading";

const mc = (id: string, correct: string, points = 10): GradableQuestion => ({
  id,
  question_type: "multiple_choice",
  correct_answer: correct,
  points,
});

describe("normalizeSubmittedAnswers", () => {
  it("keeps one answer per question, last value wins, first position kept", () => {
    const result = normalizeSubmittedAnswers(
      [
        { question_id: "q1", response_text: "A" },
        { question_id: "q2", response_text: "B" },
        { question_id: "q1", response_text: "C" },
      ],
      ["q1", "q2"]
    );
    expect(result).toEqual({
      ok: true,
      answers: [
        { question_id: "q1", response_text: "C" },
        { question_id: "q2", response_text: "B" },
      ],
    });
  });

  it("rejects question ids that are not part of the assignment", () => {
    const result = normalizeSubmittedAnswers(
      [
        { question_id: "q1", response_text: "A" },
        { question_id: "other-assignment-q", response_text: "A" },
        { question_id: "other-assignment-q", response_text: "B" },
      ],
      ["q1"]
    );
    expect(result).toEqual({ ok: false, unknownQuestionIds: ["other-assignment-q"] });
  });

  it("accepts an empty answer list", () => {
    expect(normalizeSubmittedAnswers([], ["q1"])).toEqual({ ok: true, answers: [] });
  });
});

describe("gradeHomeworkAnswers", () => {
  const questions = [mc("q1", "A", 10), mc("q2", "B", 10)];

  it("cannot be inflated by repeating a correct answer", () => {
    const repeated = Array.from({ length: 20 }, () => ({ question_id: "q1", response_text: "A" }));
    const grade = gradeHomeworkAnswers(questions, repeated, false);
    expect(grade.autoGradedScore).toBe(10);
    expect(grade.autoGradablePoints).toBe(10);
    expect(grade.correctCount).toBe(1);
  });

  it("ignores answers for questions outside the assignment", () => {
    const grade = gradeHomeworkAnswers(questions, [{ question_id: "foreign", response_text: "A" }], false);
    expect(grade.autoGradedScore).toBe(0);
    expect(grade.autoGradablePoints).toBe(0);
    expect(grade.answers[0]).toEqual({ question_id: "foreign", autoGradable: false, isCorrect: null, pointsEarned: null });
  });

  it("scores normalized answers per question", () => {
    const grade = gradeHomeworkAnswers(
      questions,
      [
        { question_id: "q1", response_text: "A" },
        { question_id: "q2", response_text: "A" },
      ],
      false
    );
    expect(grade.autoGradedScore).toBe(10);
    expect(grade.autoGradablePoints).toBe(20);
    expect(grade.allQuestionsAutoGradable).toBe(true);
    expect(grade.answers.map((a) => a.pointsEarned)).toEqual([10, 0]);
  });

  it("grades trace-letter homework from strokes rather than a client pass flag", () => {
    const config = { script: "en", letter: "A", case: "upper" };
    const strokes = [
      [[0.15, 0.85], [0.5, 0.15], [0.85, 0.85]],
      [[0.29, 0.58], [0.71, 0.58]],
    ];
    const question: GradableQuestion = {
      id: "trace",
      question_type: "trace_letter",
      correct_answer: "A",
      question_content: JSON.stringify(config),
      points: 5,
    };
    const grade = gradeHomeworkAnswers(
      [question],
      [{ question_id: "trace", response_text: JSON.stringify({ strokes, is_correct: false }) }],
      false
    );
    expect(grade.autoGradedScore).toBe(5);
    expect(grade.answers[0]?.isCorrect).toBe(true);
  });

  it("leaves teacher-marked questions ungraded and reports partial auto-grading", () => {
    const mixed: GradableQuestion[] = [
      mc("q1", "A", 5),
      { id: "q2", question_type: "long_answer", correct_answer: null, points: 15 },
    ];
    const grade = gradeHomeworkAnswers(
      mixed,
      [
        { question_id: "q1", response_text: "A" },
        { question_id: "q2", response_text: "essay" },
      ],
      false
    );
    expect(grade.allQuestionsAutoGradable).toBe(false);
    expect(grade.autoGradedScore).toBe(5);
    expect(grade.answers[1]).toEqual({ question_id: "q2", autoGradable: false, isCorrect: null, pointsEarned: null });
  });

  it("auto-marks short answers only for Practices, with the forgiving comparison", () => {
    const short: GradableQuestion[] = [{ id: "q1", question_type: "short_answer", correct_answer: "12", points: 10 }];
    const answer = [{ question_id: "q1", response_text: " ١٢ " }];
    expect(gradeHomeworkAnswers(short, answer, true).autoGradedScore).toBe(10);
    const homework = gradeHomeworkAnswers(short, answer, false);
    expect(homework.autoGradablePoints).toBe(0);
    expect(homework.allQuestionsAutoGradable).toBe(false);
  });
});

describe("pass marks", () => {
  it("uses the assignment pass mark, defaulting to the Practice mark", () => {
    expect(passMarkPoints(100, 80)).toBe(80);
    expect(passMarkPoints(100, null)).toBe(75);
  });

  it("needs a score, positive total and the threshold", () => {
    expect(meetsPassingScore(75, 100, 75)).toBe(true);
    expect(meetsPassingScore(74, 100, 75)).toBe(false);
    expect(meetsPassingScore(null, 100, 75)).toBe(false);
    expect(meetsPassingScore(10, 0, 75)).toBe(false);
  });
});

describe("decideRetake", () => {
  const practice: RetakeAssignmentInput = {
    is_test: false,
    is_practice: true,
    passing_score: 75,
    total_points: 100,
    questions: [{ question_type: "multiple_choice", correct_answer: "A" }],
  };

  it("refuses to reset a passed Practice, even below 100%", () => {
    expect(decideRetake(practice, { status: "graded", score: 80 })).toEqual({
      allowed: false,
      status: 400,
      error: "You have already passed this practice",
    });
  });

  it("allows retrying a failed Practice", () => {
    expect(decideRetake(practice, { status: "graded", score: 50 })).toEqual({ allowed: true });
  });

  it("refuses attempts that have not been graded", () => {
    for (const status of ["not_started", "in_progress", "submitted"]) {
      expect(decideRetake(practice, { status, score: null }).allowed).toBe(false);
    }
  });

  it("refuses a passed week test and allows a failed one", () => {
    const test = { ...practice, is_practice: false, is_test: true, questions: [] };
    expect(decideRetake(test, { status: "graded", score: 90 }).allowed).toBe(false);
    expect(decideRetake(test, { status: "returned", score: 10 }).allowed).toBe(true);
  });

  it("lets regular auto-gradable homework retry until mastered", () => {
    const homework = { ...practice, is_practice: false };
    expect(decideRetake(homework, { status: "graded", score: 90 }).allowed).toBe(true);
    expect(decideRetake(homework, { status: "graded", score: 100 }).allowed).toBe(false);
  });

  it("refuses retrying homework a teacher has to mark", () => {
    const homework = {
      ...practice,
      is_practice: false,
      questions: [{ question_type: "long_answer", correct_answer: null }],
    };
    expect(decideRetake(homework, { status: "graded", score: 10 })).toEqual({
      allowed: false,
      status: 400,
      error: "This homework cannot be retried",
    });
  });
});

describe("isOpenSubmissionStatus", () => {
  it("treats only not_started / in_progress as editable", () => {
    expect(isOpenSubmissionStatus("not_started")).toBe(true);
    expect(isOpenSubmissionStatus("in_progress")).toBe(true);
    expect(isOpenSubmissionStatus("submitted")).toBe(false);
    expect(isOpenSubmissionStatus("graded")).toBe(false);
    expect(isOpenSubmissionStatus("returned")).toBe(false);
  });
});

describe("countsAsNewHomeworkCompletion", () => {
  it("counts regular homework and week tests once, on the first submission", () => {
    const first = { isPractice: false, priorAttempts: 0, passedNow: false, passedBefore: false };
    expect(countsAsNewHomeworkCompletion(first)).toBe(true);
    expect(countsAsNewHomeworkCompletion({ ...first, priorAttempts: 1 })).toBe(false);
    expect(countsAsNewHomeworkCompletion({ ...first, priorAttempts: 3, passedNow: true })).toBe(false);
  });

  it("counts a Practice once, on its first pass, however many failed retakes came first", () => {
    // fail, retake, fail, retake, pass: only the pass counts
    const attempts = [
      { passedNow: false, passedBefore: false },
      { passedNow: false, passedBefore: false },
      { passedNow: true, passedBefore: false },
    ];
    const counted = attempts.filter((a, i) =>
      countsAsNewHomeworkCompletion({ isPractice: true, priorAttempts: i, ...a })
    ).length;
    expect(counted).toBe(1);
    expect(
      countsAsNewHomeworkCompletion({ isPractice: true, priorAttempts: 4, passedNow: true, passedBefore: true })
    ).toBe(false);
  });
});
