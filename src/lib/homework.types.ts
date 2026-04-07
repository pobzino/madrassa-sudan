// MS-003: Teacher Homework Creation & Grading System - Types
// Extended types for the homework system

import type { Database } from "./database.types";

// Base types from database
export type HomeworkAssignment = Database["public"]["Tables"]["homework_assignments"]["Row"];
export type HomeworkQuestion = Database["public"]["Tables"]["homework_questions"]["Row"];
export type HomeworkSubmission = Database["public"]["Tables"]["homework_submissions"]["Row"];
export type HomeworkResponse = Database["public"]["Tables"]["homework_responses"]["Row"];
export type HomeworkQuestionType = Database["public"]["Enums"]["homework_question_type"];
export type SubmissionStatus = Database["public"]["Enums"]["submission_status"];

// Extended types with relationships
export interface HomeworkAssignmentWithQuestions extends HomeworkAssignment {
  questions: HomeworkQuestion[];
  subject?: {
    id: string;
    name_ar: string;
    name_en: string;
  } | null;
  cohort?: {
    id: string;
    name: string;
    grade_level: number;
  } | null;
}

export interface HomeworkSubmissionWithResponses extends HomeworkSubmission {
  responses: HomeworkResponseWithQuestion[];
  student?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  assignment?: HomeworkAssignmentWithQuestions;
}

export interface HomeworkResponseWithQuestion extends HomeworkResponse {
  question: HomeworkQuestion;
}

// Rubric item type
export interface RubricCriterion {
  criterion: string;
  description: string;
  points: number;
  [key: string]: string | number;
}

// Question with rubric
export interface HomeworkQuestionWithRubric extends HomeworkQuestion {
  rubric: RubricCriterion[] | null;
}

// For creating questions
export interface CreateQuestionInput {
  question_type: HomeworkQuestionType | "true_false";
  question_text_ar: string;
  question_text_en?: string | null;
  options?: string[] | null;
  correct_answer?: string | null;
  points: number;
  display_order?: number;
  rubric?: RubricCriterion[] | null;
  instructions?: string | null;
  hints?: string[];
}

// For creating assignments
export interface CreateAssignmentInput {
  cohort_id: string;
  subject_id?: string | null;
  title_ar: string;
  title_en?: string | null;
  instructions_ar?: string | null;
  instructions_en?: string | null;
  due_at?: string | null;
  total_points: number;
  is_published: boolean;
  questions: CreateQuestionInput[];
}

// For student submissions
export interface SubmitAnswerInput {
  question_id: string;
  response_text?: string | null;
  response_file_url?: string | null;
  response_file_urls?: string[] | null;
}

export interface SubmitHomeworkInput {
  assignment_id: string;
  answers: SubmitAnswerInput[];
  time_spent_seconds?: number;
}

// For grading
export interface GradeResponseInput {
  response_id: string;
  points_earned: number;
  teacher_comment?: string | null;
}

export interface GradeSubmissionInput {
  submission_id: string;
  grades: GradeResponseInput[];
  overall_feedback?: string | null;
}

// Teacher dashboard stats
export interface TeacherHomeworkStats {
  total_assignments: number;
  pending_grading: number;
  total_submissions: number;
  average_score: number;
}

// Assignment with submission stats
export interface AssignmentWithStats extends HomeworkAssignment {
  cohort_name?: string;
  subject_name?: string | null;
  submissions_count: number;
  graded_count: number;
  pending_count: number;
  average_score: number | null;
}

// Submission queue item
export interface SubmissionQueueItem {
  id: string;
  student_id: string;
  student_name: string;
  student_avatar: string | null;
  status: SubmissionStatus;
  score: number | null;
  submitted_at: string | null;
  started_at: string | null;
  time_spent_seconds: number;
  question_count: number;
  answered_count: number;
}

// Student view of homework
export interface StudentHomeworkView {
  assignment: HomeworkAssignment;
  subject?: {
    id: string;
    name_ar: string;
    name_en: string;
  } | null;
  submission?: HomeworkSubmission | null;
  progress: {
    total_questions: number;
    answered_questions: number;
    completion_percentage: number;
  };
}

// Filter types for homework list
export type HomeworkFilterStatus = "all" | "draft" | "published" | "closed";
export type SubmissionFilterStatus = "all" | "pending" | "graded" | "late" | "not_started";

// Sort options
export type HomeworkSortBy = "due_date" | "created_at" | "title" | "total_points";
export type SubmissionSortBy = "submitted_at" | "student_name" | "score";

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AssignmentListResponse {
  assignments: AssignmentWithStats[];
  total: number;
  page: number;
  per_page: number;
}

export interface SubmissionListResponse {
  submissions: SubmissionQueueItem[];
  total: number;
  page: number;
  per_page: number;
  stats: {
    total: number;
    pending: number;
    graded: number;
    not_started: number;
  };
}
