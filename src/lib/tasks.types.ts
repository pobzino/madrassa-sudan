// ── Task Type Enum ──

export type TaskType =
  | 'matching_pairs'
  | 'sorting_order'
  | 'fill_in_blank_enhanced'
  | 'drag_drop_label'
  | 'drawing_tracing'
  | 'audio_recording';

// ── Task Data (what the teacher defines) ──

export interface MatchingPairsData {
  pairs: Array<{
    id: string;
    left_ar: string;
    left_en?: string;
    right_ar: string;
    right_en?: string;
  }>;
  shuffle_right: boolean;
}

export interface SortingOrderData {
  items: Array<{
    id: string;
    text_ar: string;
    text_en?: string;
    correct_position: number;
  }>;
  instruction_type: 'ascending' | 'descending' | 'chronological' | 'custom';
}

export interface FillInBlankEnhancedData {
  sentence_ar: string;
  sentence_en?: string;
  blanks: Array<{
    id: string;
    position: number;
    correct_answer_ar: string;
    correct_answer_en?: string;
    accept_alternatives: string[];
  }>;
  word_bank_ar?: string[];
  word_bank_en?: string[];
}

export interface DragDropLabelData {
  image_url: string;
  zones: Array<{
    id: string;
    x_percent: number;
    y_percent: number;
    width_percent: number;
    height_percent: number;
    correct_label_ar: string;
    correct_label_en?: string;
  }>;
  labels_ar: string[];
  labels_en?: string[];
}

export interface DrawingTracingData {
  template_image_url?: string;
  instruction_type: 'free_draw' | 'trace' | 'connect_dots';
  reference_image_url?: string;
}

export interface AudioRecordingData {
  prompt_ar: string;
  prompt_en?: string;
  max_duration_seconds: number;
  reference_audio_url?: string;
}

// ── Response Data (what the student produces) ──

export interface MatchingPairsResponse {
  matches: Array<{ left_id: string; right_id: string }>;
}

export interface SortingOrderResponse {
  ordered_item_ids: string[];
}

export interface FillInBlankEnhancedResponse {
  answers: Array<{ blank_id: string; answer: string }>;
}

export interface DragDropLabelResponse {
  placements: Array<{ zone_id: string; label: string }>;
}

export interface DrawingTracingResponse {
  drawing_data_url: string;
}

export interface AudioRecordingResponse {
  audio_url: string;
  duration_seconds: number;
}

// ── DB Row Types ──

export interface LessonTask {
  id: string;
  lesson_id: string;
  task_type: TaskType;
  title_ar: string;
  title_en: string | null;
  instruction_ar: string;
  instruction_en: string | null;
  timestamp_seconds: number;
  display_order: number;
  task_data: Record<string, unknown>;
  timeout_seconds: number | null;
  is_skippable: boolean;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface LessonTaskResponse {
  id: string;
  task_id: string;
  student_id: string;
  response_data: Record<string, unknown>;
  completion_score: number;
  is_completed: boolean;
  time_spent_seconds: number;
  attempts: number;
  created_at: string;
  updated_at: string;
}
