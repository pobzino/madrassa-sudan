// AI Tools Registry and Executor

import { SupabaseClient } from "@supabase/supabase-js";
import { ToolDefinition, ToolExecutionResult, StudentContext } from "../types";
import { getStudentProfile, getStudentProgress, getWeakAreas, getSubjects } from "./student-tools";
import { getAvailableLessons, getLessonDetails, getLessonContentChunk, getLessonContext, searchLessons, suggestLearningPath } from "./lesson-tools";
import { getStudentHomework, getHomeworkDetails, getHomeworkQuestionContext, createHomeworkAssignment } from "./homework-tools";
import { getMistakePatterns } from "./insights-tools";

// Tool function type
type ToolFunction = (
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
) => Promise<ToolExecutionResult>;

// Tool registry
const toolRegistry: Record<string, ToolFunction> = {
  get_student_profile: getStudentProfile,
  get_student_progress: getStudentProgress,
  get_weak_areas: getWeakAreas,
  get_subjects: getSubjects,
  get_mistake_patterns: getMistakePatterns,
  get_available_lessons: getAvailableLessons,
  get_lesson_details: getLessonDetails,
  get_lesson_content_chunk: getLessonContentChunk,
  get_lesson_context: getLessonContext,
  search_lessons: searchLessons,
  suggest_learning_path: suggestLearningPath,
  get_student_homework: getStudentHomework,
  get_homework_details: getHomeworkDetails,
  get_homework_question_context: getHomeworkQuestionContext,
  create_homework_assignment: createHomeworkAssignment,
};

// OpenAI function definitions for all tools
export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_student_profile",
      description: "Get the current student's profile information including name, grade level, and preferred language",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_subjects",
      description: "Get list of all available subjects with their IDs",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mistake_patterns",
      description: "Analyze recent performance to identify mistake patterns and weak spots",
      parameters: {
        type: "object",
        properties: {
          subject_id: {
            type: "string",
            description: "Optional: Focus on a specific subject ID",
          },
          limit: {
            type: "number",
            description: "Maximum items to return (default 5)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_progress",
      description: "Get the student's learning progress including completed lessons, homework scores, and streak data",
      parameters: {
        type: "object",
        properties: {
          subject_id: {
            type: "string",
            description: "Optional: Filter progress by specific subject ID",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weak_areas",
      description: "Analyze the student's performance to identify subjects or topics where they are struggling",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_lessons",
      description: "Find lessons available for the student based on their grade level",
      parameters: {
        type: "object",
        properties: {
          subject_id: {
            type: "string",
            description: "Optional: Filter by subject ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of lessons to return (default 10)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lesson_details",
      description: "Get detailed information about a specific lesson including content and student's progress",
      parameters: {
        type: "object",
        properties: {
          lesson_id: {
            type: "string",
            description: "The ID of the lesson to retrieve",
          },
        },
        required: ["lesson_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lesson_content_chunk",
      description: "Get a chunk of lesson content for focused tutoring context",
      parameters: {
        type: "object",
        properties: {
          lesson_id: {
            type: "string",
            description: "The ID of the lesson",
          },
          offset: {
            type: "number",
            description: "Character offset to start from (default 0)",
          },
          limit: {
            type: "number",
            description: "Maximum characters to return (default 1200, max 2000)",
          },
        },
        required: ["lesson_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_lesson_context",
      description: "Get lesson references and snippets related to a query for grounded tutoring",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          subject_id: {
            type: "string",
            description: "Optional: Filter by subject ID",
          },
          limit: {
            type: "number",
            description: "Maximum sources to return (default 3)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lessons",
      description: "Search lessons by keyword and optional subject/grade filters",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          subject_id: {
            type: "string",
            description: "Optional: Filter by subject ID",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_learning_path",
      description: "Generate a recommended sequence of lessons based on student's progress and weak areas",
      parameters: {
        type: "object",
        properties: {
          subject_id: {
            type: "string",
            description: "Optional: Focus on a specific subject",
          },
          goal: {
            type: "string",
            description: "Optional: Specific learning goal to work towards",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_homework",
      description: "View the student's assigned homework with status and due dates",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["not_started", "in_progress", "submitted", "graded", "all"],
            description: "Filter by homework status (default: all)",
          },
          subject_id: {
            type: "string",
            description: "Optional: Filter by subject ID",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_homework_details",
      description: "Get detailed information about a specific homework assignment including questions",
      parameters: {
        type: "object",
        properties: {
          homework_id: {
            type: "string",
            description: "The ID of the homework assignment to retrieve",
          },
        },
        required: ["homework_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_homework_question_context",
      description: "Get a specific homework question with the student's current response for targeted help",
      parameters: {
        type: "object",
        properties: {
          submission_id: {
            type: "string",
            description: "Homework submission ID",
          },
          question_id: {
            type: "string",
            description: "Homework question ID",
          },
        },
        required: ["submission_id", "question_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_homework_assignment",
      description: "Create a new personalized homework assignment for the student. Use this when the student needs extra practice on a topic or asks for practice problems.",
      parameters: {
        type: "object",
        properties: {
          title_ar: {
            type: "string",
            description: "Arabic title for the assignment",
          },
          title_en: {
            type: "string",
            description: "English title for the assignment",
          },
          instructions_ar: {
            type: "string",
            description: "Arabic instructions for the student",
          },
          instructions_en: {
            type: "string",
            description: "English instructions for the student",
          },
          subject_id: {
            type: "string",
            description: "Subject ID for the homework (use get_subjects)",
          },
          subject_name: {
            type: "string",
            description: "Subject name if you don't have an ID (e.g., Math, Science)",
          },
          difficulty_level: {
            type: "string",
            enum: ["easy", "medium", "hard"],
            description: "Difficulty level based on student's current understanding",
          },
          reason: {
            type: "string",
            description: "Explanation of why you are creating this assignment for the student",
          },
          due_days: {
            type: "number",
            description: "Number of days until due (default: 3)",
          },
          confirm: {
            type: "boolean",
            description: "Set true only after the student explicitly confirms creation",
          },
          questions: {
            type: "array",
            description: "Array of questions for the assignment (3-5 recommended)",
            items: {
              type: "object",
              properties: {
                question_type: {
                  type: "string",
                  enum: ["multiple_choice", "short_answer", "long_answer"],
                },
                question_text_ar: {
                  type: "string",
                  description: "Question text in Arabic",
                },
                question_text_en: {
                  type: "string",
                  description: "Question text in English",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Answer options for multiple choice (4 options recommended)",
                },
                correct_answer: {
                  type: "string",
                  description: "Correct answer for multiple choice questions",
                },
                points: {
                  type: "number",
                  description: "Point value for this question",
                },
              },
              required: ["question_type", "question_text_ar", "points"],
            },
          },
        },
        required: ["title_ar", "difficulty_level", "reason", "questions"],
      },
    },
  },
];

// Execute a tool by name
export async function executeTool(
  toolName: string,
  supabase: SupabaseClient,
  studentContext: StudentContext,
  params: Record<string, unknown>
): Promise<ToolExecutionResult> {
  const toolFn = toolRegistry[toolName];

  if (!toolFn) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    return await toolFn(supabase, studentContext, params);
  } catch (error) {
    console.error(`Tool execution error [${toolName}]:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error executing tool",
    };
  }
}

// Get list of available tool names
export function getAvailableTools(): string[] {
  return Object.keys(toolRegistry);
}
