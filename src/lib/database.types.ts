export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface QuizSettings {
  require_pass_to_continue: boolean
  min_pass_questions: number
  allow_retries: boolean
  max_attempts: number | null
  show_explanation: boolean
}

export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string
          homework_id: string | null
          id: string
          lesson_id: string | null
          student_id: string
          subject_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          homework_id?: string | null
          id?: string
          lesson_id?: string | null
          student_id: string
          subject_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          homework_id?: string | null
          id?: string
          lesson_id?: string | null
          student_id?: string
          subject_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_conversations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
          tool_results: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
          tool_results?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_students: {
        Row: {
          cohort_id: string
          enrolled_at: string
          id: string
          is_active: boolean
          status: string
          student_id: string
        }
        Insert: {
          cohort_id: string
          enrolled_at?: string
          id?: string
          is_active?: boolean
          status?: string
          student_id: string
        }
        Update: {
          cohort_id?: string
          enrolled_at?: string
          id?: string
          is_active?: boolean
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_students_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_teachers: {
        Row: {
          cohort_id: string
          created_at: string
          id: string
          is_primary: boolean
          teacher_id: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          teacher_id: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_teachers_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_lessons: {
        Row: {
          assigned_by: string | null
          cohort_id: string
          created_at: string
          id: string
          is_active: boolean
          lesson_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          cohort_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          lesson_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          cohort_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lesson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_lessons_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_lessons_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_lessons_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          description: string | null
          grade_level: number
          id: string
          is_active: boolean
          join_code: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          grade_level: number
          id?: string
          is_active?: boolean
          join_code?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          grade_level?: number
          id?: string
          is_active?: boolean
          join_code?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_assignments: {
        Row: {
          allow_late_submission: boolean
          assigned_at: string
          cohort_id: string
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions_ar: string | null
          instructions_en: string | null
          is_published: boolean
          lesson_id: string | null
          subject_id: string | null
          title_ar: string
          title_en: string | null
          total_points: number
          updated_at: string
        }
        Insert: {
          allow_late_submission?: boolean
          assigned_at?: string
          cohort_id: string
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_published?: boolean
          lesson_id?: string | null
          subject_id?: string | null
          title_ar: string
          title_en?: string | null
          total_points?: number
          updated_at?: string
        }
        Update: {
          allow_late_submission?: boolean
          assigned_at?: string
          cohort_id?: string
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_published?: boolean
          lesson_id?: string | null
          subject_id?: string | null
          title_ar?: string
          title_en?: string | null
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_questions: {
        Row: {
          assignment_id: string
          correct_answer: string | null
          created_at: string
          display_order: number
          id: string
          instructions: string | null
          options: Json | null
          points: number
          question_text_ar: string
          question_text_en: string | null
          question_type: Database["public"]["Enums"]["homework_question_type"]
          rubric: Json | null
        }
        Insert: {
          assignment_id: string
          correct_answer?: string | null
          created_at?: string
          display_order?: number
          id?: string
          instructions?: string | null
          options?: Json | null
          points?: number
          question_text_ar: string
          question_text_en?: string | null
          question_type: Database["public"]["Enums"]["homework_question_type"]
          rubric?: Json | null
        }
        Update: {
          assignment_id?: string
          correct_answer?: string | null
          created_at?: string
          display_order?: number
          id?: string
          instructions?: string | null
          options?: Json | null
          points?: number
          question_text_ar?: string
          question_text_en?: string | null
          question_type?: Database["public"]["Enums"]["homework_question_type"]
          rubric?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_responses: {
        Row: {
          created_at: string
          id: string
          points_earned: number | null
          question_id: string
          response_file_url: string | null
          response_file_urls: Json | null
          response_text: string | null
          submission_id: string
          teacher_comment: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_earned?: number | null
          question_id: string
          response_file_url?: string | null
          response_file_urls?: Json | null
          response_text?: string | null
          submission_id: string
          teacher_comment?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          points_earned?: number | null
          question_id?: string
          response_file_url?: string | null
          response_file_urls?: Json | null
          response_text?: string | null
          submission_id?: string
          teacher_comment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "homework_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          assignment_id: string
          created_at: string
          feedback: string | null
          graded_at: string | null
          graded_by: string | null
          id: string
          overall_feedback: string | null
          score: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          time_spent_seconds: number | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          overall_feedback?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          feedback?: string | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          overall_feedback?: string | null
          score?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          relationship_type: string
          student_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          relationship_type?: string
          student_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          relationship_type?: string
          student_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardian_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_invites_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_students: {
        Row: {
          created_at: string
          guardian_id: string
          id: string
          is_approved: boolean | null
          relationship_type: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          id?: string
          is_approved?: boolean | null
          relationship_type: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          id?: string
          is_approved?: boolean | null
          relationship_type?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_students_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          interactive_slides_completed: number
          interactive_slides_correct: number
          last_position_seconds: number
          lesson_id: string
          questions_answered: number
          questions_correct: number
          quiz_attempts: number
          quiz_passed: boolean
          required_tasks_completed: number
          student_id: string
          tasks_completed: number
          tasks_skipped: number
          tasks_total_score: number
          total_watch_time_seconds: number
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          interactive_slides_completed?: number
          interactive_slides_correct?: number
          last_position_seconds?: number
          lesson_id: string
          questions_answered?: number
          questions_correct?: number
          quiz_attempts?: number
          quiz_passed?: boolean
          required_tasks_completed?: number
          student_id: string
          tasks_completed?: number
          tasks_skipped?: number
          tasks_total_score?: number
          total_watch_time_seconds?: number
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          interactive_slides_completed?: number
          interactive_slides_correct?: number
          last_position_seconds?: number
          lesson_id?: string
          questions_answered?: number
          questions_correct?: number
          quiz_attempts?: number
          quiz_passed?: boolean
          required_tasks_completed?: number
          student_id?: string
          tasks_completed?: number
          tasks_skipped?: number
          tasks_total_score?: number
          total_watch_time_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_question_responses: {
        Row: {
          answer: string
          attempt_number: number
          attempts: number
          attempts_history: Json
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          attempt_number?: number
          attempts?: number
          attempts_history?: Json
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          attempt_number?: number
          attempts?: number
          attempts_history?: Json
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_question_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "lesson_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_question_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_task_responses: {
        Row: {
          attempts: number
          completion_score: number
          created_at: string
          id: string
          is_completed: boolean
          response_data: Json
          status: string
          student_id: string
          task_id: string
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          completion_score?: number
          created_at?: string
          id?: string
          is_completed?: boolean
          response_data?: Json
          status?: string
          student_id: string
          task_id: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          completion_score?: number
          created_at?: string
          id?: string
          is_completed?: boolean
          response_data?: Json
          status?: string
          student_id?: string
          task_id?: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_task_responses_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "lesson_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_task_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_slide_responses: {
        Row: {
          attempts: number
          completion_score: number
          completed_at: string
          created_at: string
          id: string
          interaction_type: string
          is_correct: boolean
          lesson_id: string
          response_data: Json
          slide_id: string
          student_id: string
          time_spent_seconds: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          completion_score?: number
          completed_at?: string
          created_at?: string
          id?: string
          interaction_type: string
          is_correct?: boolean
          lesson_id: string
          response_data?: Json
          slide_id: string
          student_id: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          completion_score?: number
          completed_at?: string
          created_at?: string
          id?: string
          interaction_type?: string
          is_correct?: boolean
          lesson_id?: string
          response_data?: Json
          slide_id?: string
          student_id?: string
          time_spent_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_slide_responses_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_slide_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_tasks: {
        Row: {
          created_at: string
          id: string
          display_order: number
          instruction_ar: string
          instruction_en: string | null
          is_skippable: boolean
          lesson_id: string
          linked_slide_id: string | null
          points: number
          required: boolean
          task_data: Json
          task_type: Database["public"]["Enums"]["task_type"]
          timeout_seconds: number | null
          timestamp_seconds: number
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          display_order?: number
          instruction_ar: string
          instruction_en?: string | null
          is_skippable?: boolean
          lesson_id: string
          linked_slide_id?: string | null
          points?: number
          required?: boolean
          task_data?: Json
          task_type: Database["public"]["Enums"]["task_type"]
          timeout_seconds?: number | null
          timestamp_seconds?: number
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          display_order?: number
          instruction_ar?: string
          instruction_en?: string | null
          is_skippable?: boolean
          lesson_id?: string
          linked_slide_id?: string | null
          points?: number
          required?: boolean
          task_data?: Json
          task_type?: Database["public"]["Enums"]["task_type"]
          timeout_seconds?: number | null
          timestamp_seconds?: number
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_tasks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_questions: {
        Row: {
          allow_retry: boolean
          correct_answer: string
          created_at: string
          display_order: number
          explanation_ar: string | null
          explanation_en: string | null
          id: string
          is_required: boolean
          lesson_id: string
          options: Json | null
          question_text_ar: string
          question_text_en: string | null
          question_type: Database["public"]["Enums"]["question_type"]
          timestamp_seconds: number
        }
        Insert: {
          allow_retry?: boolean
          correct_answer: string
          created_at?: string
          display_order?: number
          explanation_ar?: string | null
          explanation_en?: string | null
          id?: string
          is_required?: boolean
          lesson_id: string
          options?: Json | null
          question_text_ar: string
          question_text_en?: string | null
          question_type?: Database["public"]["Enums"]["question_type"]
          timestamp_seconds: number
        }
        Update: {
          allow_retry?: boolean
          correct_answer?: string
          created_at?: string
          display_order?: number
          explanation_ar?: string | null
          explanation_en?: string | null
          id?: string
          is_required?: boolean
          lesson_id?: string
          options?: Json | null
          question_text_ar?: string
          question_text_en?: string | null
          question_type?: Database["public"]["Enums"]["question_type"]
          timestamp_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          ai_generated_at: string | null
          ai_transcript: string | null
          captions_ar_url: string | null
          captions_en_url: string | null
          created_at: string
          created_by: string | null
          curriculum_topic: Json | null
          description_ar: string | null
          description_en: string | null
          display_order: number
          grade_level: number
          id: string
          is_published: boolean
          quiz_settings: QuizSettings | null
          subject_id: string
          thumbnail_url: string | null
          title_ar: string
          title_en: string
          updated_at: string
          video_duration_seconds: number | null
          video_url_1080p: string | null
          video_url_360p: string | null
          video_url_480p: string | null
          video_url_720p: string | null
        }
        Insert: {
          ai_generated_at?: string | null
          ai_transcript?: string | null
          captions_ar_url?: string | null
          captions_en_url?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_topic?: Json | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          grade_level: number
          id?: string
          is_published?: boolean
          quiz_settings?: QuizSettings | null
          subject_id: string
          thumbnail_url?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_url_1080p?: string | null
          video_url_360p?: string | null
          video_url_480p?: string | null
          video_url_720p?: string | null
        }
        Update: {
          ai_generated_at?: string | null
          ai_transcript?: string | null
          captions_ar_url?: string | null
          captions_en_url?: string | null
          created_at?: string
          created_by?: string | null
          curriculum_topic?: Json | null
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          grade_level?: number
          id?: string
          is_published?: boolean
          quiz_settings?: QuizSettings | null
          subject_id?: string
          thumbnail_url?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_url_1080p?: string | null
          video_url_360p?: string | null
          video_url_480p?: string | null
          video_url_720p?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_slides: {
        Row: {
          id: string
          lesson_id: string
          slides: Json
          language_mode: string
          generated_at: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          slides?: Json
          language_mode?: string
          generated_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          slides?: Json
          language_mode?: string
          generated_at?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_slides_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_content_blocks: {
        Row: {
          id: string
          lesson_id: string
          language: string
          content: string
          source_type: string
          sequence: number
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          language: string
          content: string
          source_type?: string
          sequence?: number
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          language?: string
          content?: string
          source_type?: string
          sequence?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_content_blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_chunk_embeddings: {
        Row: {
          id: string
          lesson_id: string
          language: string
          source_type: string
          chunk_index: number
          content: string
          embedding: number[]
          created_at: string
        }
        Insert: {
          id?: string
          lesson_id: string
          language: string
          source_type?: string
          chunk_index: number
          content: string
          embedding: number[]
          created_at?: string
        }
        Update: {
          id?: string
          lesson_id?: string
          language?: string
          source_type?: string
          chunk_index?: number
          content?: string
          embedding?: number[]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_chunk_embeddings_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          grade_level: number | null
          id: string
          phone: string | null
          preferred_language: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          grade_level?: number | null
          id: string
          phone?: string | null
          preferred_language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          grade_level?: number | null
          id?: string
          phone?: string | null
          preferred_language?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      student_streaks: {
        Row: {
          current_streak_days: number
          id: string
          last_activity_date: string | null
          longest_streak_days: number
          student_id: string
          total_homework_completed: number
          total_lessons_completed: number
          updated_at: string
        }
        Insert: {
          current_streak_days?: number
          id?: string
          last_activity_date?: string | null
          longest_streak_days?: number
          student_id: string
          total_homework_completed?: number
          total_lessons_completed?: number
          updated_at?: string
        }
        Update: {
          current_streak_days?: number
          id?: string
          last_activity_date?: string | null
          longest_streak_days?: number
          student_id?: string
          total_homework_completed?: number
          total_lessons_completed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_streaks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_questions: {
        Row: {
          id: string
          subject_id: string
          grade_level: number
          question_text_ar: string
          question_text_en: string | null
          question_type: string
          options: Json | null
          correct_answer: string
          difficulty: number
          created_at: string
        }
        Insert: {
          id?: string
          subject_id: string
          grade_level: number
          question_text_ar: string
          question_text_en?: string | null
          question_type?: string
          options?: Json | null
          correct_answer: string
          difficulty?: number
          created_at?: string
        }
        Update: {
          id?: string
          subject_id?: string
          grade_level?: number
          question_text_ar?: string
          question_text_en?: string | null
          question_type?: string
          options?: Json | null
          correct_answer?: string
          difficulty?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_attempts: {
        Row: {
          id: string
          student_id: string
          subject_id: string
          started_at: string
          completed_at: string | null
          questions_answered: number
          questions_correct: number
          recommended_grade: number | null
          is_complete: boolean
        }
        Insert: {
          id?: string
          student_id: string
          subject_id: string
          started_at?: string
          completed_at?: string | null
          questions_answered?: number
          questions_correct?: number
          recommended_grade?: number | null
          is_complete?: boolean
        }
        Update: {
          id?: string
          student_id?: string
          subject_id?: string
          started_at?: string
          completed_at?: string | null
          questions_answered?: number
          questions_correct?: number
          recommended_grade?: number | null
          is_complete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_attempts_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_responses: {
        Row: {
          id: string
          attempt_id: string
          question_id: string
          selected_answer: string | null
          is_correct: boolean | null
          answered_at: string
        }
        Insert: {
          id?: string
          attempt_id: string
          question_id: string
          selected_answer?: string | null
          is_correct?: boolean | null
          answered_at?: string
        }
        Update: {
          id?: string
          attempt_id?: string
          question_id?: string
          selected_answer?: string | null
          is_correct?: boolean | null
          answered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_responses_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnostic_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      student_placements: {
        Row: {
          id: string
          student_id: string
          subject_id: string
          placed_grade: number
          confidence: string | null
          attempt_id: string | null
          placed_at: string
        }
        Insert: {
          id?: string
          student_id: string
          subject_id: string
          placed_grade: number
          confidence?: string | null
          attempt_id?: string | null
          placed_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          subject_id?: string
          placed_grade?: number
          confidence?: string | null
          attempt_id?: string | null
          placed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_placements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_placements_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_placements_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          name_ar: string
          name_en: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          name_ar: string
          name_en: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          name_ar?: string
          name_en?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_lesson_chunks: {
        Args: {
          query_embedding: number[]
          match_count?: number
          filter_subject_id?: string | null
          filter_grade_level?: number | null
          filter_language?: string | null
        }
        Returns: {
          lesson_id: string
          content: string
          similarity: number
          source_type: string
          lesson_title_ar: string | null
          lesson_title_en: string | null
          subject_name_ar: string | null
          subject_name_en: string | null
        }[]
      }
    }
    Enums: {
      homework_question_type:
        | "multiple_choice"
        | "short_answer"
        | "long_answer"
        | "file_upload"
        | "true_false"
      question_type: "multiple_choice" | "true_false" | "fill_in_blank"
      task_type:
        | "matching_pairs"
        | "sorting_order"
        | "choose_correct"
        | "true_false"
        | "fill_missing_word"
        | "tap_to_count"
        | "match_pairs"
        | "sequence_order"
        | "sort_groups"
        | "fill_in_blank_enhanced"
        | "drag_drop_label"
        | "drawing_tracing"
        | "audio_recording"
      submission_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "graded"
        | "returned"
      user_role: "student" | "teacher" | "parent" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier usage
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T]

// Convenient type aliases
export type Profile = Tables<"profiles">
export type Subject = Tables<"subjects">
export type Lesson = Tables<"lessons">
export type LessonQuestion = Tables<"lesson_questions">
export type LessonProgress = Tables<"lesson_progress">
export type LessonContentBlock = Tables<"lesson_content_blocks">
export type LessonChunkEmbedding = Tables<"lesson_chunk_embeddings">
export type Cohort = Tables<"cohorts">
export type CohortLesson = Tables<"cohort_lessons">
export type HomeworkAssignment = Tables<"homework_assignments">
export type HomeworkQuestion = Tables<"homework_questions">
export type HomeworkSubmission = Tables<"homework_submissions">
export type HomeworkResponse = Tables<"homework_responses">
export type AIConversation = Tables<"ai_conversations">
export type AIMessage = Tables<"ai_messages">
export type LessonTask = Tables<"lesson_tasks">
export type LessonTaskResponse = Tables<"lesson_task_responses">
export type LessonSlideResponse = Tables<"lesson_slide_responses">

export type UserRole = Enums<"user_role">
export type QuestionType = Enums<"question_type">
export type HomeworkQuestionType = Enums<"homework_question_type">
export type SubmissionStatus = Enums<"submission_status">
export type TaskType = Enums<"task_type">
