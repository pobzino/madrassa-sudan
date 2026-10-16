// Server-side homework / Practice marking rules, kept pure so they can be
// unit-tested. The submit and retake routes are the only places that turn
// these results into database writes (via the service role) — students can no
// longer write score / status / graded_at / points_earned themselves.

import { practiceAnswerMatches } from "@/lib/practice-answer";
import { PRACTICE_PASSING_SCORE } from "@/lib/practice";
import { gradeTraceLetterOnServer } from "@/lib/interactions/trace-templates.server";
import type { TraceLetterConfig } from "@/lib/interactions/types";

export interface SubmittedAnswerInput {
  question_id: string;
  response_text?: string | null;
}

export interface GradableQuestion {
  id: string;
  question_type: string;
  correct_answer: string | null;
  points: number | null;
  question_content?: string | null;
}

export type AnswerNormalization<T> =
  | { ok: true; answers: T[] }
  | { ok: false; unknownQuestionIds: string[] };

/**
 * One answer per question, and only for questions that belong to the
 * assignment. A repeated question_id keeps its first position but takes the
 * LAST value sent (the student's final choice), so sending the same correct
 * answer many times can no longer multiply its points. Any question id that is
 * not part of the assignment rejects the whole submission.
 */
export function normalizeSubmittedAnswers<T extends { question_id: string }>(
  answers: readonly T[],
  assignmentQuestionIds: Iterable<string>
): AnswerNormalization<T> {
  const allowed = new Set(assignmentQuestionIds);
  const unknown = new Set<string>();
  const byQuestion = new Map<string, T>();

  for (const answer of answers) {
    if (!allowed.has(answer.question_id)) {
      unknown.add(answer.question_id);
      continue;
    }
    byQuestion.set(answer.question_id, answer);
  }

  if (unknown.size > 0) {
    return { ok: false, unknownQuestionIds: [...unknown] };
  }
  return { ok: true, answers: [...byQuestion.values()] };
}

/**
 * Objective questions are marked automatically. Practices (is_practice) also
 * auto-mark short answers with a forgiving comparison (numbers, Arabic-Indic
 * digits); regular homework keeps the original exact MC/TF-only behaviour.
 */
export function isAutoGradableQuestion(
  question: Pick<GradableQuestion, "question_type" | "correct_answer">,
  isPractice: boolean
): boolean {
  return (
    (question.question_type === "trace_letter" || !!question.correct_answer) &&
    (question.question_type === "trace_letter" || question.question_type === "multiple_choice" ||
      question.question_type === "true_false" ||
      (isPractice && question.question_type === "short_answer"))
  );
}

export function isCorrectAnswer(
  question: Pick<GradableQuestion, "question_type" | "correct_answer" | "question_content">,
  response: string | null | undefined,
  isPractice: boolean
): boolean {
  if (!response) return false;
  if (question.question_type === "trace_letter") {
    try {
      const config = JSON.parse(question.question_content || "null") as TraceLetterConfig | null;
      const answer = JSON.parse(response) as { strokes?: unknown };
      return Boolean(config && Array.isArray(answer.strokes) && gradeTraceLetterOnServer(config, answer.strokes).is_correct);
    } catch {
      return false;
    }
  }
  if (!question.correct_answer) return false;
  return isPractice
    ? practiceAnswerMatches(response, question.correct_answer, question.question_type)
    : response === question.correct_answer;
}

export interface GradedAnswer {
  question_id: string;
  autoGradable: boolean;
  /** null when the question needs a teacher. */
  isCorrect: boolean | null;
  /** null when the question needs a teacher. */
  pointsEarned: number | null;
}

export interface HomeworkGrade {
  /** Same order as the answers passed in. */
  answers: GradedAnswer[];
  autoGradedScore: number;
  /** Points of the auto-gradable questions that were answered. */
  autoGradablePoints: number;
  /** Every question on the assignment can be marked automatically. */
  allQuestionsAutoGradable: boolean;
  correctCount: number;
}

/**
 * Marks normalized answers (see normalizeSubmittedAnswers). Answers for
 * unknown questions are ignored defensively, and each question is counted at
 * most once even if the caller forgot to normalize.
 */
export function gradeHomeworkAnswers(
  questions: readonly GradableQuestion[],
  answers: readonly SubmittedAnswerInput[],
  isPractice: boolean
): HomeworkGrade {
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const counted = new Set<string>();
  let autoGradedScore = 0;
  let autoGradablePoints = 0;
  let correctCount = 0;

  const graded = answers.map((answer): GradedAnswer => {
    const question = questionsById.get(answer.question_id);
    if (!question || !isAutoGradableQuestion(question, isPractice)) {
      return { question_id: answer.question_id, autoGradable: false, isCorrect: null, pointsEarned: null };
    }

    const isCorrect = isCorrectAnswer(question, answer.response_text, isPractice);
    const pointsEarned = isCorrect ? question.points || 0 : 0;

    if (!counted.has(question.id)) {
      counted.add(question.id);
      autoGradablePoints += question.points || 0;
      autoGradedScore += pointsEarned;
      if (isCorrect) correctCount += 1;
    }

    return { question_id: answer.question_id, autoGradable: true, isCorrect, pointsEarned };
  });

  return {
    answers: graded,
    autoGradedScore,
    autoGradablePoints,
    allQuestionsAutoGradable: questions.every((q) => isAutoGradableQuestion(q, isPractice)),
    correctCount,
  };
}

/** Points needed to pass, from a percent pass mark (defaults to the Practice mark). */
export function passMarkPoints(totalPoints: number, passingScorePercent: number | null | undefined): number {
  return ((passingScorePercent ?? PRACTICE_PASSING_SCORE) / 100) * totalPoints;
}

export function meetsPassingScore(
  score: number | null | undefined,
  totalPoints: number | null | undefined,
  passingScorePercent: number | null | undefined
): boolean {
  const total = totalPoints ?? 0;
  return score != null && total > 0 && score >= passMarkPoints(total, passingScorePercent);
}

export interface HomeworkCompletionCountInput {
  isPractice: boolean;
  /** Attempts already recorded for this assignment, not counting this one. */
  priorAttempts: number;
  /** This attempt meets the pass mark. */
  passedNow: boolean;
  /** An earlier attempt already met the pass mark. */
  passedBefore: boolean;
}

/**
 * Whether a submission adds one to student_streaks.total_homework_completed.
 * Each assignment counts once, however often it is retaken: a Practice on its
 * first pass (the attempt that also completes its lesson), anything else on
 * its first submission. Submitting wrong answers and retaking in a loop used
 * to add 20 points per cycle.
 */
export function countsAsNewHomeworkCompletion(input: HomeworkCompletionCountInput): boolean {
  if (input.isPractice) {
    return input.passedNow && !input.passedBefore;
  }
  return input.priorAttempts === 0;
}

export interface RetakeAssignmentInput {
  is_test: boolean | null;
  is_practice: boolean | null;
  passing_score: number | null;
  total_points: number | null;
  questions: ReadonlyArray<Pick<GradableQuestion, "question_type" | "correct_answer">>;
}

export interface RetakeSubmissionInput {
  status: string;
  score: number | null;
}

export type RetakeDecision = { allowed: true } | { allowed: false; status: number; error: string };

/**
 * Whether a graded attempt may be reset for another try:
 *  - a gating week test (is_test) or a Practice (is_practice): only while it
 *    has NOT been passed (>= passing_score). Resetting a passed one would wipe
 *    the result that unlocks the student's path.
 *  - regular auto-gradable homework: until it is mastered (100%).
 */
export function decideRetake(assignment: RetakeAssignmentInput, submission: RetakeSubmissionInput): RetakeDecision {
  if (submission.status !== "graded" && submission.status !== "returned") {
    return { allowed: false, status: 400, error: "This attempt has not been graded yet" };
  }

  const totalPoints = assignment.total_points ?? 0;
  const isPractice = !!assignment.is_practice;

  if (assignment.is_test) {
    if (meetsPassingScore(submission.score, totalPoints, assignment.passing_score)) {
      return { allowed: false, status: 400, error: "You have already passed this test" };
    }
    return { allowed: true };
  }

  const allAutoGradable =
    assignment.questions.length > 0 && assignment.questions.every((q) => isAutoGradableQuestion(q, isPractice));
  if (!allAutoGradable) {
    return { allowed: false, status: 400, error: "This homework cannot be retried" };
  }

  if (isPractice) {
    if (meetsPassingScore(submission.score, totalPoints, assignment.passing_score)) {
      return { allowed: false, status: 400, error: "You have already passed this practice" };
    }
    return { allowed: true };
  }

  const mastered = submission.score != null && totalPoints > 0 && submission.score >= totalPoints;
  if (mastered) {
    return { allowed: false, status: 400, error: "You have already completed this homework" };
  }
  return { allowed: true };
}

/** Submission states a student may still edit (answers, drafts, time spent). */
export const OPEN_SUBMISSION_STATUSES = ["not_started", "in_progress"] as const;

export function isOpenSubmissionStatus(status: string | null | undefined): boolean {
  return status == null || (OPEN_SUBMISSION_STATUSES as readonly string[]).includes(status);
}
