export type SlideType =
  | 'title'
  | 'content'
  | 'key_points'
  | 'diagram_description'
  | 'activity'
  | 'quiz_preview'
  | 'question_answer'
  | 'summary';

export type SlideLayout = 'default' | 'image_left' | 'image_right' | 'image_top' | 'full_image';
export type SlideTextSize = 'sm' | 'md' | 'lg' | 'xl';
export type SlideLessonPhase = 'title' | 'objectives' | 'core_teaching' | 'practice' | 'summary_goodbye';
export type MathRepresentationStage = 'concrete_visual' | 'abstract' | 'not_applicable';
export type SlideInteractionType =
  | 'free_response'
  | 'choose_correct'
  | 'true_false'
  | 'tap_to_count'
  | 'match_pairs'
  | 'sequence_order'
  | 'sort_groups'
  | 'fill_missing_word';

export interface Slide {
  id: string;
  type: SlideType;
  sequence: number;
  is_required?: boolean | null;
  timestamp_seconds?: number | null;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  speaker_notes_ar: string;
  speaker_notes_en: string;
  visual_hint: string;
  bullets_ar: string[] | null;
  bullets_en: string[] | null;
  reveal_items_ar: string[] | null;
  reveal_items_en: string[] | null;
  image_url: string | null;
  layout: SlideLayout | null;
  title_size?: SlideTextSize | null;
  body_size?: SlideTextSize | null;
  lesson_phase?: SlideLessonPhase | null;
  idea_focus_en?: string | null;
  idea_focus_ar?: string | null;
  vocabulary_word_en?: string | null;
  vocabulary_word_ar?: string | null;
  say_it_twice_prompt?: boolean | null;
  practice_question_count?: number | null;
  representation_stage?: MathRepresentationStage | null;
  interaction_type?: SlideInteractionType | null;
  interaction_prompt_ar?: string | null;
  interaction_prompt_en?: string | null;
  interaction_expected_answer_ar?: string | null;
  interaction_expected_answer_en?: string | null;
  interaction_options_ar?: string[] | null;
  interaction_options_en?: string[] | null;
  interaction_correct_index?: number | null;
  interaction_true_false_answer?: boolean | null;
  interaction_count_target?: number | null;
  interaction_visual_emoji?: string | null;
  interaction_items_ar?: string[] | null;
  interaction_items_en?: string[] | null;
  interaction_targets_ar?: string[] | null;
  interaction_targets_en?: string[] | null;
  interaction_solution_map?: number[] | null;
  activity_id?: string | null;
}

export interface SlideDeck {
  id: string;
  lesson_id: string;
  slides: Slide[];
  language_mode: 'ar' | 'en' | 'both';
  generated_at: string | null;
  updated_at: string;
}
