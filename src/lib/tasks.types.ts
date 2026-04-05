export type SupportedTaskType =
  | 'free_response'
  | 'choose_correct'
  | 'true_false'
  | 'fill_missing_word'
  | 'tap_to_count'
  | 'match_pairs'
  | 'sequence_order'
  | 'sort_groups';

export type LegacyTaskType =
  | 'matching_pairs'
  | 'sorting_order'
  | 'fill_in_blank_enhanced'
  | 'drag_drop_label'
  | 'drawing_tracing'
  | 'audio_recording';

export type TaskType = SupportedTaskType | LegacyTaskType;

export type LessonTaskResponseStatus = 'completed' | 'skipped' | 'timed_out';

export interface ChooseCorrectData {
  options_ar: string[];
  options_en: string[];
  correct_index: number;
}

export interface FreeResponseData {
  expected_answer_ar: string;
  expected_answer_en?: string;
}

export interface TrueFalseData {
  correct_answer: boolean;
}

export interface FillMissingWordData {
  options_ar: string[];
  options_en: string[];
  correct_index: number;
  /** When true, students type their answer instead of picking an option. */
  free_entry?: boolean;
  /** Expected answer used for exact-match + AI fallback when free_entry is on. */
  expected_answer_ar?: string;
  expected_answer_en?: string;
}

export interface TapToCountData {
  count_target: number;
  visual_emoji?: string | null;
}

export interface MatchPairsData {
  pairs: Array<{
    id: string;
    left_ar: string;
    left_en?: string;
    right_ar: string;
    right_en?: string;
  }>;
  shuffle_right: boolean;
}

export interface SequenceOrderData {
  items: Array<{
    id: string;
    text_ar: string;
    text_en?: string;
    correct_position: number;
  }>;
  instruction_type: 'ascending' | 'descending' | 'chronological' | 'custom';
}

export type MatchingPairsData = MatchPairsData;
export type SortingOrderData = SequenceOrderData;

export interface SortGroupsData {
  groups_ar: string[];
  groups_en: string[];
  items: Array<{
    id: string;
    text_ar: string;
    text_en?: string;
    group_index: number;
  }>;
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

export type TaskData =
  | FreeResponseData
  | ChooseCorrectData
  | TrueFalseData
  | FillMissingWordData
  | TapToCountData
  | MatchPairsData
  | SequenceOrderData
  | SortGroupsData
  | FillInBlankEnhancedData
  | DragDropLabelData
  | DrawingTracingData
  | AudioRecordingData;

export interface MatchingPairsResponse {
  matches: Array<{ left_id: string; right_id: string }>;
}

export interface SequenceOrderResponse {
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

export interface LessonTaskForm {
  id: string;
  task_type: TaskType;
  title_ar: string;
  title_en: string;
  instruction_ar: string;
  instruction_en: string;
  timestamp_seconds: number;
  task_data: Record<string, unknown>;
  timeout_seconds: number | null;
  is_skippable: boolean;
  required: boolean;
  points: number;
  linked_slide_id: string | null;
  display_order: number;
}

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
  required: boolean;
  linked_slide_id: string | null;
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
  status: LessonTaskResponseStatus;
  time_spent_seconds: number;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export const SUPPORTED_TASK_TYPES: SupportedTaskType[] = [
  'free_response',
  'choose_correct',
  'true_false',
  'fill_missing_word',
  'tap_to_count',
  'match_pairs',
  'sequence_order',
  'sort_groups',
];

export function isSupportedTaskType(value: string): value is SupportedTaskType {
  return SUPPORTED_TASK_TYPES.includes(value as SupportedTaskType);
}
