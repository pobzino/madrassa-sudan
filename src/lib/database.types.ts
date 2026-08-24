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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
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
      ai_image_generations: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          lesson_id: string | null
          mode: string
          prompt: string
          slide_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_id?: string | null
          mode: string
          prompt: string
          slide_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          lesson_id?: string | null
          mode?: string
          prompt?: string
          slide_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_image_generations_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: number
          locale: string
          path: string
          properties: Json
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: never
          locale?: string
          path: string
          properties?: Json
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: never
          locale?: string
          path?: string
          properties?: Json
        }
        Relationships: []
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
      diagnostic_attempts: {
        Row: {
          completed_at: string | null
          id: string
          is_complete: boolean | null
          questions_answered: number | null
          questions_correct: number | null
          recommended_grade: number | null
          started_at: string | null
          student_id: string
          subject_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          is_complete?: boolean | null
          questions_answered?: number | null
          questions_correct?: number | null
          recommended_grade?: number | null
          started_at?: string | null
          student_id: string
          subject_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          is_complete?: boolean | null
          questions_answered?: number | null
          questions_correct?: number | null
          recommended_grade?: number | null
          started_at?: string | null
          student_id?: string
          subject_id?: string
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
      diagnostic_questions: {
        Row: {
          correct_answer: string
          created_at: string | null
          difficulty: number | null
          grade_level: number
          id: string
          options: Json | null
          question_text_ar: string
          question_text_en: string | null
          question_type: string | null
          subject_id: string
        }
        Insert: {
          correct_answer: string
          created_at?: string | null
          difficulty?: number | null
          grade_level: number
          id?: string
          options?: Json | null
          question_text_ar: string
          question_text_en?: string | null
          question_type?: string | null
          subject_id: string
        }
        Update: {
          correct_answer?: string
          created_at?: string | null
          difficulty?: number | null
          grade_level?: number
          id?: string
          options?: Json | null
          question_text_ar?: string
          question_text_en?: string | null
          question_type?: string | null
          subject_id?: string
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
      diagnostic_responses: {
        Row: {
          answered_at: string | null
          attempt_id: string
          id: string
          is_correct: boolean | null
          question_id: string
          selected_answer: string | null
        }
        Insert: {
          answered_at?: string | null
          attempt_id: string
          id?: string
          is_correct?: boolean | null
          question_id: string
          selected_answer?: string | null
        }
        Update: {
          answered_at?: string | null
          attempt_id?: string
          id?: string
          is_correct?: boolean | null
          question_id?: string
          selected_answer?: string | null
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
      feedback: {
        Row: {
          category: string
          created_at: string
          description: string
          github_issue_number: number | null
          github_issue_url: string | null
          id: string
          page_url: string | null
          screenshot_url: string | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          github_issue_number?: number | null
          github_issue_url?: string | null
          id?: string
          page_url?: string | null
          screenshot_url?: string | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_invites: {
        Row: {
          code: string
          created_at: string | null
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
          created_at?: string | null
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
          created_at?: string | null
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
          created_at: string | null
          guardian_id: string
          id: string
          is_approved: boolean | null
          relationship_type: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          guardian_id: string
          id?: string
          is_approved?: boolean | null
          relationship_type: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          guardian_id?: string
          id?: string
          is_approved?: boolean | null
          relationship_type?: string
          student_id?: string
          updated_at?: string | null
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
      homework_assignments: {
        Row: {
          allow_late_submission: boolean
          assigned_at: string
          cohort_id: string | null
          created_at: string
          created_by: string
          due_at: string | null
          id: string
          instructions_ar: string | null
          instructions_en: string | null
          is_practice: boolean
          is_published: boolean
          is_test: boolean
          lesson_id: string | null
          passing_score: number
          show_instant_feedback: boolean
          subject_id: string | null
          title_ar: string
          title_en: string | null
          total_points: number
          updated_at: string
        }
        Insert: {
          allow_late_submission?: boolean
          assigned_at?: string
          cohort_id?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_practice?: boolean
          is_published?: boolean
          is_test?: boolean
          lesson_id?: string | null
          passing_score?: number
          show_instant_feedback?: boolean
          subject_id?: string | null
          title_ar: string
          title_en?: string | null
          total_points?: number
          updated_at?: string
        }
        Update: {
          allow_late_submission?: boolean
          assigned_at?: string
          cohort_id?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_practice?: boolean
          is_published?: boolean
          is_test?: boolean
          lesson_id?: string | null
          passing_score?: number
          show_instant_feedback?: boolean
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
      homework_attempts: {
        Row: {
          answers: Json
          assignment_id: string
          attempt_number: number
          correct_count: number | null
          created_at: string
          id: string
          max_score: number | null
          score: number | null
          student_id: string
          submission_id: string | null
          submitted_at: string
          total_questions: number | null
        }
        Insert: {
          answers?: Json
          assignment_id: string
          attempt_number: number
          correct_count?: number | null
          created_at?: string
          id?: string
          max_score?: number | null
          score?: number | null
          student_id: string
          submission_id?: string | null
          submitted_at?: string
          total_questions?: number | null
        }
        Update: {
          answers?: Json
          assignment_id?: string
          attempt_number?: number
          correct_count?: number | null
          created_at?: string
          id?: string
          max_score?: number | null
          score?: number | null
          student_id?: string
          submission_id?: string | null
          submitted_at?: string
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_attempts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_questions: {
        Row: {
          audio_text_hash_ar: string | null
          audio_text_hash_en: string | null
          audio_url_ar: string | null
          audio_url_en: string | null
          assignment_id: string
          correct_answer: string | null
          correct_option_index: number | null
          created_at: string
          display_order: number
          hints: Json
          id: string
          instructions: string | null
          options: Json | null
          options_ar: Json | null
          options_en: Json | null
          points: number
          question_text_ar: string
          question_text_en: string | null
          question_type: Database["public"]["Enums"]["homework_question_type"]
          rubric: Json | null
        }
        Insert: {
          audio_text_hash_ar?: string | null
          audio_text_hash_en?: string | null
          audio_url_ar?: string | null
          audio_url_en?: string | null
          assignment_id: string
          correct_answer?: string | null
          correct_option_index?: number | null
          created_at?: string
          display_order?: number
          hints?: Json
          id?: string
          instructions?: string | null
          options?: Json | null
          options_ar?: Json | null
          options_en?: Json | null
          points?: number
          question_text_ar: string
          question_text_en?: string | null
          question_type: Database["public"]["Enums"]["homework_question_type"]
          rubric?: Json | null
        }
        Update: {
          audio_text_hash_ar?: string | null
          audio_text_hash_en?: string | null
          audio_url_ar?: string | null
          audio_url_en?: string | null
          assignment_id?: string
          correct_answer?: string | null
          correct_option_index?: number | null
          created_at?: string
          display_order?: number
          hints?: Json
          id?: string
          instructions?: string | null
          options?: Json | null
          options_ar?: Json | null
          options_en?: Json | null
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
          attempt_count: number
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
          attempt_count?: number
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
          attempt_count?: number
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
      learning_path_steps: {
        Row: {
          created_at: string
          id: string
          lesson_id: string
          practice_assignment_id: string | null
          sequence: number
          week_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_id: string
          practice_assignment_id?: string | null
          sequence: number
          week_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_id?: string
          practice_assignment_id?: string | null
          sequence?: number
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_steps_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_steps_practice_assignment_id_fkey"
            columns: ["practice_assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_steps_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "learning_path_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_weeks: {
        Row: {
          created_at: string
          id: string
          path_id: string
          test_assignment_id: string | null
          title_ar: string
          title_en: string | null
          updated_at: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          path_id: string
          test_assignment_id?: string | null
          title_ar: string
          title_en?: string | null
          updated_at?: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          path_id?: string
          test_assignment_id?: string | null
          title_ar?: string
          title_en?: string | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_weeks_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_weeks_test_assignment_id_fkey"
            columns: ["test_assignment_id"]
            isOneToOne: false
            referencedRelation: "homework_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          subject_id: string
          title_ar: string
          title_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          subject_id: string
          title_ar: string
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          subject_id?: string
          title_ar?: string
          title_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_paths_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_chunk_embeddings: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string
          id: string
          language: string
          lesson_id: string
          source_type: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          language?: string
          lesson_id: string
          source_type?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          language?: string
          lesson_id?: string
          source_type?: string
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
      lesson_content_blocks: {
        Row: {
          content: string
          created_at: string
          id: string
          language: string
          lesson_id: string
          sequence: number
          source_type: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          language?: string
          lesson_id: string
          sequence?: number
          source_type?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          language?: string
          lesson_id?: string
          sequence?: number
          source_type?: string
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
          quiz_attempts: number | null
          quiz_passed: boolean | null
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
          quiz_attempts?: number | null
          quiz_passed?: boolean | null
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
          quiz_attempts?: number | null
          quiz_passed?: boolean | null
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
          attempt_number: number | null
          attempts: number
          attempts_history: Json | null
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          attempt_number?: number | null
          attempts?: number
          attempts_history?: Json | null
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          attempt_number?: number | null
          attempts?: number
          attempts_history?: Json | null
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
      lesson_sim_versions: {
        Row: {
          audio_duration_ms: number | null
          audio_mime: string | null
          audio_path: string | null
          audio_retained: boolean
          clip_segments: Json | null
          created_at: string
          created_by: string | null
          deck_snapshot: Json
          duration_ms: number
          events: Json
          id: string
          lesson_id: string
          reason: string
          sim_id: string | null
          version_number: number
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_retained?: boolean
          clip_segments?: Json | null
          created_at?: string
          created_by?: string | null
          deck_snapshot: Json
          duration_ms: number
          events: Json
          id?: string
          lesson_id: string
          reason?: string
          sim_id?: string | null
          version_number: number
        }
        Update: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_retained?: boolean
          clip_segments?: Json | null
          created_at?: string
          created_by?: string | null
          deck_snapshot?: Json
          duration_ms?: number
          events?: Json
          id?: string
          lesson_id?: string
          reason?: string
          sim_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_sim_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_sim_versions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_sim_versions_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "lesson_sims"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_sims: {
        Row: {
          audio_duration_ms: number | null
          audio_mime: string | null
          audio_path: string | null
          clip_segments: Json | null
          created_at: string
          deck_snapshot: Json
          duration_ms: number
          events: Json
          id: string
          lesson_id: string
          recorded_at: string
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          clip_segments?: Json | null
          created_at?: string
          deck_snapshot: Json
          duration_ms: number
          events?: Json
          id?: string
          lesson_id: string
          recorded_at?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          clip_segments?: Json | null
          created_at?: string
          deck_snapshot?: Json
          duration_ms?: number
          events?: Json
          id?: string
          lesson_id?: string
          recorded_at?: string
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_sims_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_sims_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_slide_responses: {
        Row: {
          attempts: number
          completed_at: string
          completion_score: number
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
          completed_at?: string
          completion_score?: number
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
          completed_at?: string
          completion_score?: number
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
      lesson_slides: {
        Row: {
          created_at: string
          generated_at: string | null
          id: string
          language_mode: string
          lesson_id: string
          slides: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string | null
          id?: string
          language_mode?: string
          lesson_id: string
          slides?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string | null
          id?: string
          language_mode?: string
          lesson_id?: string
          slides?: Json
          updated_at?: string
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
            foreignKeyName: "lesson_task_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_task_responses_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "lesson_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_tasks: {
        Row: {
          created_at: string
          display_order: number
          id: string
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
          display_order?: number
          id?: string
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
          display_order?: number
          id?: string
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
          playback_mode: string
          quiz_settings: Json | null
          subject_id: string
          submitted_for_review: boolean
          submitted_for_review_at: string | null
          thumbnail_url: string | null
          title_ar: string
          title_en: string
          updated_at: string
          video_duration_seconds: number | null
          video_processed_at: string | null
          video_processing_error: string | null
          video_processing_started_at: string | null
          video_processing_status: string
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
          playback_mode?: string
          quiz_settings?: Json | null
          subject_id: string
          submitted_for_review?: boolean
          submitted_for_review_at?: string | null
          thumbnail_url?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_started_at?: string | null
          video_processing_status?: string
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
          playback_mode?: string
          quiz_settings?: Json | null
          subject_id?: string
          submitted_for_review?: boolean
          submitted_for_review_at?: string | null
          thumbnail_url?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_processed_at?: string | null
          video_processing_error?: string | null
          video_processing_started_at?: string | null
          video_processing_status?: string
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
      parent_applications: {
        Row: {
          access_notes: string | null
          admin_notes: string | null
          auth_user_id: string | null
          can_access_website: boolean | null
          can_access_zoom: boolean | null
          child_war_affected: boolean | null
          children_ages: number[]
          children_count: number
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          email: string | null
          id: string
          missed_schooling: boolean | null
          out_of_school: boolean | null
          out_of_school_details: string | null
          out_of_school_duration: string | null
          parent_name: string
          preferred_language: string
          profession: string | null
          status: string
          sudanese_descent: boolean | null
          terms_accepted_at: string | null
          whatsapp: string
        }
        Insert: {
          access_notes?: string | null
          admin_notes?: string | null
          auth_user_id?: string | null
          can_access_website?: boolean | null
          can_access_zoom?: boolean | null
          child_war_affected?: boolean | null
          children_ages?: number[]
          children_count?: number
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          id?: string
          missed_schooling?: boolean | null
          out_of_school?: boolean | null
          out_of_school_details?: string | null
          out_of_school_duration?: string | null
          parent_name: string
          preferred_language?: string
          profession?: string | null
          status?: string
          sudanese_descent?: boolean | null
          terms_accepted_at?: string | null
          whatsapp: string
        }
        Update: {
          access_notes?: string | null
          admin_notes?: string | null
          auth_user_id?: string | null
          can_access_website?: boolean | null
          can_access_zoom?: boolean | null
          child_war_affected?: boolean | null
          children_ages?: number[]
          children_count?: number
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          email?: string | null
          id?: string
          missed_schooling?: boolean | null
          out_of_school?: boolean | null
          out_of_school_details?: string | null
          out_of_school_duration?: string | null
          parent_name?: string
          preferred_language?: string
          profession?: string | null
          status?: string
          sudanese_descent?: boolean | null
          terms_accepted_at?: string | null
          whatsapp?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_access_sims: boolean
          created_at: string
          date_of_birth: string | null
          full_name: string
          grade_level: number | null
          id: string
          is_approved: boolean
          phone: string | null
          preferred_language: string
          privacy_consent_at: string | null
          privacy_consent_version: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          can_access_sims?: boolean
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          grade_level?: number | null
          id: string
          is_approved?: boolean
          phone?: string | null
          preferred_language?: string
          privacy_consent_at?: string | null
          privacy_consent_version?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          can_access_sims?: boolean
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          grade_level?: number | null
          id?: string
          is_approved?: boolean
          phone?: string | null
          preferred_language?: string
          privacy_consent_at?: string | null
          privacy_consent_version?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sim_save_attempts: {
        Row: {
          audio_duration_ms: number | null
          audio_mime: string | null
          audio_path: string | null
          audio_size_bytes: number | null
          browser_info: Json
          client_attempt_id: string
          clip_segments_count: number | null
          created_at: string
          deck_slide_count: number | null
          duration_ms: number | null
          error_details: Json
          error_message: string | null
          error_status: number | null
          events_count: number | null
          id: string
          last_seen_at: string
          lesson_id: string | null
          page_url: string | null
          runtime_version: string | null
          sim_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          browser_info?: Json
          client_attempt_id: string
          clip_segments_count?: number | null
          created_at?: string
          deck_slide_count?: number | null
          duration_ms?: number | null
          error_details?: Json
          error_message?: string | null
          error_status?: number | null
          events_count?: number | null
          id?: string
          last_seen_at?: string
          lesson_id?: string | null
          page_url?: string | null
          runtime_version?: string | null
          sim_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          audio_duration_ms?: number | null
          audio_mime?: string | null
          audio_path?: string | null
          audio_size_bytes?: number | null
          browser_info?: Json
          client_attempt_id?: string
          clip_segments_count?: number | null
          created_at?: string
          deck_slide_count?: number | null
          duration_ms?: number | null
          error_details?: Json
          error_message?: string | null
          error_status?: number | null
          events_count?: number | null
          id?: string
          last_seen_at?: string
          lesson_id?: string | null
          page_url?: string | null
          runtime_version?: string | null
          sim_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_save_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_save_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_placements: {
        Row: {
          attempt_id: string | null
          confidence: string | null
          id: string
          placed_at: string | null
          placed_grade: number
          student_id: string
          subject_id: string
        }
        Insert: {
          attempt_id?: string | null
          confidence?: string | null
          id?: string
          placed_at?: string | null
          placed_grade: number
          student_id: string
          subject_id: string
        }
        Update: {
          attempt_id?: string | null
          confidence?: string | null
          id?: string
          placed_at?: string | null
          placed_grade?: number
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_placements_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "diagnostic_attempts"
            referencedColumns: ["id"]
          },
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
        ]
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
      volunteer_applications: {
        Row: {
          admin_notes: string | null
          areas: string[]
          created_at: string
          education_background: string | null
          email: string
          hours_per_week: string | null
          id: string
          location_city: string | null
          location_country: string | null
          name: string
          other_area: string | null
          preferred_language: string
          status: string
          whatsapp: string
        }
        Insert: {
          admin_notes?: string | null
          areas?: string[]
          created_at?: string
          education_background?: string | null
          email: string
          hours_per_week?: string | null
          id?: string
          location_city?: string | null
          location_country?: string | null
          name: string
          other_area?: string | null
          preferred_language?: string
          status?: string
          whatsapp: string
        }
        Update: {
          admin_notes?: string | null
          areas?: string[]
          created_at?: string
          education_background?: string | null
          email?: string
          hours_per_week?: string | null
          id?: string
          location_city?: string | null
          location_country?: string | null
          name?: string
          other_area?: string | null
          preferred_language?: string
          status?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_user_access_published_lesson: {
        Args: { p_lesson_id: string; p_user_id: string }
        Returns: boolean
      }
      get_active_student_cohort_ids: {
        Args: { p_student_id: string }
        Returns: string[]
      }
      get_analytics_summary: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_product_analytics_summary: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_assignment_submission_stats: {
        Args: { assignment_uuid: string }
        Returns: {
          average_score: number
          graded_count: number
          pending_count: number
          submitted_count: number
          total_students: number
        }[]
      }
      get_guardian_students: {
        Args: { guardian_uuid: string }
        Returns: {
          linked_at: string
          relationship_type: string
          student_email: string
          student_id: string
          student_name: string
        }[]
      }
      get_teacher_cohort_ids: {
        Args: { p_teacher_id: string }
        Returns: string[]
      }
      get_teacher_pending_grading_count: {
        Args: { teacher_uuid: string }
        Returns: number
      }
      match_lesson_chunks: {
        Args: {
          filter_grade_level?: number
          filter_language?: string
          filter_subject_id?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          content: string
          lesson_id: string
          lesson_title_ar: string
          lesson_title_en: string
          similarity: number
          source_type: string
          subject_name_ar: string
          subject_name_en: string
        }[]
      }
      restore_lesson_sim_version: {
        Args: { p_lesson_id: string; p_version_id: string }
        Returns: string
      }
      sync_homework_submissions_for_assignment_row: {
        Args: {
          assignment_row: Database["public"]["Tables"]["homework_assignments"]["Row"]
        }
        Returns: undefined
      }
      sync_homework_submissions_for_cohort_student_row: {
        Args: {
          cohort_student_row: Database["public"]["Tables"]["cohort_students"]["Row"]
        }
        Returns: undefined
      }
      update_lesson_quiz_progress: {
        Args: {
          p_lesson_id: string
          p_quiz_attempts: number
          p_quiz_passed: boolean
          p_student_id: string
        }
        Returns: undefined
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
      submission_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "graded"
        | "returned"
      task_type:
        | "match_pairs"
        | "sequence_order"
        | "fill_in_blank_enhanced"
        | "drag_drop_label"
        | "drawing_tracing"
        | "audio_recording"
        | "choose_correct"
        | "true_false"
        | "fill_missing_word"
        | "tap_to_count"
        | "sort_groups"
        | "free_response"
        | "matching_pairs"
        | "sorting_order"
      user_role: "student" | "teacher" | "parent" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

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
export type LessonSim = Tables<"lesson_sims">

export type UserRole = Enums<"user_role">
export type QuestionType = Enums<"question_type">
export type HomeworkQuestionType = Enums<"homework_question_type">
export type SubmissionStatus = Enums<"submission_status">
export type TaskType = Enums<"task_type">
