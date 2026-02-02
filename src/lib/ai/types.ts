// AI Teaching Assistant Types

export interface StudentContext {
  id: string;
  full_name: string;
  grade_level: number | null;
  preferred_language: string;
  cohort_ids: string[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AIMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface HomeworkQuestion {
  question_type: "multiple_choice" | "short_answer" | "long_answer";
  question_text_ar: string;
  question_text_en?: string;
  options?: string[];
  correct_answer?: string;
  points: number;
}

export interface CreateHomeworkParams {
  title_ar?: string;
  title_en?: string;
  instructions_ar?: string;
  instructions_en?: string;
  subject_id?: string; // Optional if subject_name provided
  subject_name?: string; // Alternative to subject_id
  difficulty_level: "easy" | "medium" | "hard";
  reason?: string;
  questions?: HomeworkQuestion[];
  due_days?: number;
  confirm?: boolean;
  _last_user_message?: string;
}

export interface StudentProgress {
  lessons_completed: number;
  total_lessons: number;
  homework_completed: number;
  homework_pending: number;
  average_score: number | null;
  current_streak: number;
  longest_streak: number;
  weak_subjects: Array<{
    subject_id: string;
    subject_name: string;
    average_score: number;
  }>;
}

export interface LessonSummary {
  id: string;
  title_ar: string;
  title_en: string;
  title?: string;
  subject_id: string;
  subject_name_ar: string;
  subject_name_en: string;
  subject_name?: string | null;
  grade_level: number;
  completed: boolean;
  progress_percentage: number;
}

export interface HomeworkSummary {
  id: string;
  title_ar: string;
  title_en: string | null;
  title?: string;
  subject_id: string | null;
  subject_name_ar?: string;
  subject_name_en?: string;
  subject_name?: string | null;
  due_at: string | null;
  status: "not_started" | "in_progress" | "submitted" | "graded";
  score: number | null;
  total_points: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining?: number;
  reset_at?: string;
}

// Tool execution log entry
export interface ToolExecutionLog {
  id?: string;
  conversation_id: string | null;
  student_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
  status: "pending" | "success" | "failed" | "rate_limited";
  error_message?: string;
  created_at?: string;
  executed_at?: string;
}
