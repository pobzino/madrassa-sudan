// MS-003: Teacher Homework Creation & Grading System - Validation Schemas
// Zod schemas for API validation

import { z } from "zod";
import { PRACTICE_PASSING_SCORE } from "@/lib/practice";

// Question types
const questionTypeSchema = z.enum([
  "multiple_choice",
  "short_answer",
  "long_answer",
  "file_upload",
  "true_false",
]);

// Rubric criterion schema
const rubricCriterionSchema = z.object({
  criterion: z.string().min(1, "Criterion name is required"),
  description: z.string().min(1, "Description is required"),
  points: z.number().int().min(0, "Points must be non-negative"),
});

// Create question schema
export const createQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  question_type: questionTypeSchema,
  question_text_ar: z.string().min(1, "Question text in Arabic is required"),
  question_text_en: z.string().optional().nullable(),
  options: z.array(z.string()).optional().nullable(),
  options_ar: z.array(z.string()).optional().nullable(),
  options_en: z.array(z.string()).optional().nullable(),
  correct_option_index: z.number().int().min(0).max(5).optional().nullable(),
  correct_answer: z.string().optional().nullable(),
  points: z.number().int().min(1, "Points must be at least 1"),
  display_order: z.number().int().optional(),
  rubric: z.array(rubricCriterionSchema).optional().nullable(),
  instructions: z.string().optional().nullable(),
  hints: z.array(z.string()).optional().default([]),
});

// Create assignment schema
export const createAssignmentSchema = z.object({
  cohort_id: z.string().uuid("Valid cohort ID is required"),
  subject_id: z.string().uuid().optional().nullable(),
  title_ar: z.string().min(1, "Title in Arabic is required"),
  title_en: z.string().optional().nullable(),
  instructions_ar: z.string().optional().nullable(),
  instructions_en: z.string().optional().nullable(),
  due_at: z.string().datetime().optional().nullable(),
  is_published: z.boolean().default(false),
  // Track B: mark this assignment as a gating "week test" and set the pass mark
  // (percent). Defaults keep regular homework behaviour unchanged.
  is_test: z.boolean().optional().default(false),
  passing_score: z.number().min(0).max(100).optional().default(PRACTICE_PASSING_SCORE),
  questions: z.array(createQuestionSchema).min(1, "At least one question is required"),
});

// Update assignment schema
export const updateAssignmentSchema = createAssignmentSchema.partial().extend({
  id: z.string().uuid(),
});

export function practicePublicationError(questions: Array<{
  question_type: string; question_text_ar: string; question_text_en?: string | null;
  options?: unknown; options_ar?: unknown; options_en?: unknown;
  correct_option_index?: number | null; correct_answer?: string | null;
}>): string | null {
  if (!questions.length) return "Practice needs questions before publication.";
  for (const [i, q] of questions.entries()) {
    const fail = (message: string) => `Question ${i + 1}: ${message}`;
    if (!q.question_text_ar.trim() || !q.question_text_en?.trim()) return fail("complete both question languages.");
    if (!q.correct_answer?.trim()) return fail("provide a correct answer.");
    if (q.question_type === "short_answer") continue;
    if (q.question_type !== "multiple_choice" && q.question_type !== "true_false") return fail("use an automatically markable question type.");
    const ar = q.options_ar;
    const en = q.options_en;
    if (!Array.isArray(ar) || !Array.isArray(en) || ar.length !== en.length || ar.length < 2) return fail("provide aligned choices in both languages.");
    for (const choices of [ar, en]) {
      if (choices.some(c => typeof c !== "string" || !c.trim())) return fail("complete every choice.");
      if (new Set(choices.map(c => c.trim())).size !== choices.length) return fail("remove duplicate choices.");
    }
    const index = q.correct_option_index;
    if (index == null || index < 0 || index >= ar.length) return fail("select the correct choice.");
    const expected = q.question_type === "true_false" ? (index === 0 ? "true" : "false") : ar[index];
    if (q.correct_answer !== expected) return fail("answer and choice index disagree.");
    if (q.question_type === "true_false" && (JSON.stringify(ar) !== JSON.stringify(["صحيح", "خطأ"]) || JSON.stringify(en) !== JSON.stringify(["True", "False"]))) return fail("use standard true/false choices.");
  }
  return null;
}

// Submit answer schema
export const submitAnswerSchema = z.object({
  question_id: z.string().uuid(),
  response_text: z.string().optional().nullable(),
  response_file_url: z.string().min(1).optional().nullable(),
  response_file_urls: z.array(z.string().min(1)).optional().nullable(),
});

// Submit homework schema
export const submitHomeworkSchema = z.object({
  assignment_id: z.string().uuid(),
  answers: z.array(submitAnswerSchema),
  time_spent_seconds: z.number().int().min(0).optional(),
});

// Save draft schema (partial submission)
export const saveDraftSchema = z.object({
  assignment_id: z.string().uuid(),
  answers: z.array(submitAnswerSchema),
  time_spent_seconds: z.number().int().min(0).optional(),
});

// Grade response schema
export const gradeResponseSchema = z.object({
  response_id: z.string().uuid(),
  points_earned: z.number().int().min(0),
  teacher_comment: z.string().optional().nullable(),
});

// Grade submission schema
export const gradeSubmissionSchema = z.object({
  submission_id: z.string().uuid(),
  grades: z.array(gradeResponseSchema),
  overall_feedback: z.string().optional().nullable(),
});

// List assignments query schema
export const listAssignmentsQuerySchema = z.object({
  cohort_id: z.string().uuid().optional(),
  status: z.enum(["all", "draft", "published", "closed"]).optional(),
  subject_id: z.string().uuid().optional(),
  sort_by: z.enum(["due_date", "created_at", "title", "total_points"]).optional(),
  sort_order: z.enum(["asc", "desc"]).optional(),
  page: z.string().transform(Number).pipe(z.number().int().min(1)).optional(),
  per_page: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
});

// List submissions query schema
export const listSubmissionsQuerySchema = z.object({
  assignment_id: z.string().uuid(),
  status: z.enum(["all", "pending", "graded", "late", "not_started"]).optional(),
  sort_by: z.enum(["submitted_at", "student_name", "score"]).optional(),
  sort_order: z.enum(["asc", "desc"]).optional(),
  page: z.string().transform(Number).pipe(z.number().int().min(1)).optional(),
  per_page: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
});

// Auto-grade schema
export const autoGradeSchema = z.object({
  assignment_id: z.string().uuid(),
});

// Export types derived from schemas
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
export type SubmitHomeworkInput = z.infer<typeof submitHomeworkSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type GradeResponseInput = z.infer<typeof gradeResponseSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
export type AutoGradeInput = z.infer<typeof autoGradeSchema>;
