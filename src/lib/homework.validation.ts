// MS-003: Teacher Homework Creation & Grading System - Validation Schemas
// Zod schemas for API validation

import { z } from "zod";

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
  question_type: questionTypeSchema,
  question_text_ar: z.string().min(1, "Question text in Arabic is required"),
  question_text_en: z.string().optional().nullable(),
  options: z.array(z.string()).optional().nullable(),
  correct_answer: z.string().optional().nullable(),
  points: z.number().int().min(1, "Points must be at least 1"),
  display_order: z.number().int().optional(),
  rubric: z.array(rubricCriterionSchema).optional().nullable(),
  instructions: z.string().optional().nullable(),
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
  questions: z.array(createQuestionSchema).min(1, "At least one question is required"),
});

// Update assignment schema
export const updateAssignmentSchema = createAssignmentSchema.partial().extend({
  id: z.string().uuid(),
});

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
