import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, UIMessage, tool } from "ai";
import { z } from "zod";
import { StudentContext } from "@/lib/ai/types";
import { Json } from "@/lib/database.types";
import { checkRateLimit } from "@/lib/ai/rate-limiter";
import { logToolStart, logToolComplete, logRateLimited } from "@/lib/ai/logger";

// Import tool implementations
import { getStudentProfile, getStudentProgress, getWeakAreas, getSubjects } from "@/lib/ai/tools/student-tools";
import { getAvailableLessons, getLessonDetails, getLessonContentChunk, getLessonContext, searchLessons, suggestLearningPath } from "@/lib/ai/tools/lesson-tools";
import { getStudentHomework, getHomeworkDetails, getHomeworkQuestionContext, createHomeworkAssignment } from "@/lib/ai/tools/homework-tools";
import { getMistakePatterns } from "@/lib/ai/tools/insights-tools";

// Available OpenAI models
const AI_MODEL = "gpt-5.2";

// Enhanced system prompt with tool awareness
const SYSTEM_PROMPT = `# Role and Identity
You are "معلم البومة" (Owl Teacher), an AI tutor for Madrassa Sudan - an educational platform for Sudanese children.

# Core Responsibilities
1. Help students understand academic concepts across subjects (Math, Science, English, Arabic)
2. Guide students through homework WITHOUT providing direct answers
3. Adapt explanations to the student's grade level and preferred language
4. Track learning progress and celebrate achievements
5. Create personalized homework when students need extra practice

# Communication Guidelines
- LANGUAGE: You MUST respond in the student's preferred language as specified in the session context. If "English" is specified, respond ONLY in English. If "Arabic" is specified, respond ONLY in Arabic.
- TONE: Friendly, patient, encouraging - like a supportive older sibling
- COMPLEXITY: Match explanations to the student's grade level
- CULTURAL CONTEXT: Use examples relevant to Sudanese daily life, culture, and environment

# Teaching Methodology
1. When a student asks for help:
   - First, ask clarifying questions to understand their current knowledge
   - Break complex problems into smaller, manageable steps
   - Use the Socratic method - guide them to discover answers themselves
   - Provide hints and scaffolding, not direct solutions

2. For homework questions:
   - NEVER provide direct answers to homework problems
   - Ask: "What have you tried so far?" or "What part is confusing you?"
   - Guide them through the problem-solving process step by step
   - Celebrate when they reach the answer on their own

3. When students are frustrated:
   - Acknowledge their feelings: "I understand this is challenging"
   - Suggest taking a short break if needed
   - Offer alternative explanations or approaches
   - Remind them that struggle is part of learning

# Tool Usage - MANDATORY

**RULE: When student asks for practice/exercises/problems → CALL create_homework_assignment tool**

DO NOT write practice questions as text. ALWAYS use the tool.

**Simple workflow:**
1. Student says "give me math practice" or "I need addition problems"
2. YOU CALL: create_homework_assignment({ title_ar, reason, questions, subject_name/subject_id, difficulty_level })
3. Tool shows preview, student confirms
4. YOU CALL AGAIN: create_homework_assignment({ title_ar, reason, questions, subject_name/subject_id, difficulty_level, confirm: true })
5. Done - homework is created and tracked

**Examples of requests that REQUIRE the tool:**
- "give me some math problems" → use tool
- "I want to practice addition" → use tool
- "can you make me some exercises?" → use tool
- "help me practice fractions" → use tool

**Other tools:**
- get_student_progress: Check completed lessons or scores
- get_weak_areas: Analyze struggling topics
- get_mistake_patterns: Use when the student is stuck or repeats errors; personalize hints
- get_available_lessons: Recommend platform lessons
- get_lesson_context: Use to ground explanations in actual lesson content
- get_student_homework: Show assigned homework

# Response Format
- Keep responses concise and focused (under 200 words when possible)
- Use bullet points or numbered lists for multi-step explanations
- Include ONE relevant emoji per response maximum (🦉 preferred)
- End responses with a question or encouragement to keep them engaged
- For math: Use plain symbols × (times), ÷ (divide), + (plus), − (minus), = (equals). Do NOT use LaTeX like \times or \div

# Constraints
- Do NOT search the internet or access external resources
- Do NOT generate inappropriate content
- Do NOT help with anything unrelated to education
- Do NOT provide medical, legal, or financial advice
- If asked about non-educational topics, gently redirect to learning`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language, grade_level, full_name, role")
      .eq("id", user.id)
      .single();

    // Get cohort memberships
    const { data: cohortMemberships } = await supabase
      .from("cohort_students")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("is_active", true);

    const studentContext: StudentContext = {
      id: user.id,
      full_name: profile?.full_name || "Student",
      grade_level: profile?.grade_level || null,
      preferred_language: profile?.preferred_language || "en",
      cohort_ids: cohortMemberships?.map(c => c.cohort_id) || [],
    };

    const body = await request.json();
    const { messages, conversation_id, context, language: requestLanguage } = body as {
      messages: UIMessage[];
      conversation_id?: string;
      context?: { lesson_id?: string; homework_id?: string; subject_id?: string };
      language?: "ar" | "en";
    };

    // Use request language if provided, otherwise fall back to profile preference
    const effectiveLanguage = requestLanguage || studentContext.preferred_language;
    studentContext.preferred_language = effectiveLanguage;
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    const lastUserText = lastUserMessage?.parts?.find(p => p.type === "text")?.text || "";

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      const title = lastUserMessage?.parts?.find(p => p.type === "text")?.text?.substring(0, 50) || "New conversation";

      const { data: newConversation, error: convError } = await supabase
        .from("ai_conversations")
        .insert({
          student_id: user.id,
          lesson_id: context?.lesson_id || null,
          homework_id: context?.homework_id || null,
          subject_id: context?.subject_id || null,
          title: title + (title.length >= 50 ? "..." : ""),
        })
        .select()
        .single();

      if (convError) {
        console.error("Error creating conversation:", convError);
        return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
      }
      conversationId = newConversation.id;
    }

    // Build context string for current session
    let sessionContext = `\n\n# Current Session Context\n`;
    sessionContext += `- Student Name: ${studentContext.full_name}\n`;
    sessionContext += `- **RESPONSE LANGUAGE: ${studentContext.preferred_language === "ar" ? "Arabic (العربية) - Respond in Arabic ONLY" : "English - Respond in English ONLY"}**\n`;
    sessionContext += `- Grade Level: ${studentContext.grade_level ? `Grade ${studentContext.grade_level}` : "Unknown"}\n`;

    if (context?.lesson_id) {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("title_ar, title_en, description_ar, description_en")
        .eq("id", context.lesson_id)
        .single();
      if (lesson) {
        sessionContext += `\n## Current Lesson\n`;
        sessionContext += `- Title: ${lesson.title_en || lesson.title_ar}\n`;
        sessionContext += `- Description: ${lesson.description_en || lesson.description_ar}\n`;
      }
    }

    if (context?.homework_id) {
      const { data: homework } = await supabase
        .from("homework_assignments")
        .select("title_ar, title_en, instructions_ar, instructions_en")
        .eq("id", context.homework_id)
        .single();
      if (homework) {
        sessionContext += `\n## Current Homework Assignment\n`;
        sessionContext += `- Title: ${homework.title_en || homework.title_ar}\n`;
        sessionContext += `- Instructions: ${homework.instructions_en || homework.instructions_ar}\n`;
        sessionContext += `- REMINDER: Do NOT provide direct answers. Guide the student to solve it themselves.\n`;
      }
    }

    // Define tools using AI SDK format
    const tools = {
      get_student_profile: tool({
        description: "Get detailed student profile info. RARELY NEEDED - basic info (name, grade, language) is already in session context. Only use if you need additional profile details not in context.",
        inputSchema: z.object({
          _placeholder: z.string().optional().describe("Not used"),
        }),
        execute: async () => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_student_profile");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_student_profile", {}, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_profile", {});
          const result = await getStudentProfile(supabase, studentContext, {});
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_student_progress: tool({
        description: "Get the student's learning progress including completed lessons, homework scores, and streak data",
        inputSchema: z.object({
          subject_id: z.string().optional().describe("Optional: Filter progress by specific subject ID"),
        }),
        execute: async ({ subject_id }) => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_student_progress");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_student_progress", { subject_id }, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_progress", { subject_id });
          const result = await getStudentProgress(supabase, studentContext, { subject_id });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_weak_areas: tool({
        description: "Analyze the student's performance to identify subjects or topics where they are struggling",
        inputSchema: z.object({
          _placeholder: z.string().optional().describe("Not used"),
        }),
        execute: async () => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_weak_areas");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_weak_areas", {}, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_weak_areas", {});
          const result = await getWeakAreas(supabase, studentContext, {});
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_mistake_patterns: tool({
        description: "Analyze recent performance to identify mistake patterns and weak spots",
        inputSchema: z.object({
          subject_id: z.string().optional().describe("Optional: Focus on a specific subject ID"),
          limit: z.number().optional().describe("Maximum items to return (default 5)"),
        }),
        execute: async ({ subject_id, limit }) => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_mistake_patterns");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_mistake_patterns", { subject_id, limit }, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_mistake_patterns", { subject_id, limit });
          const result = await getMistakePatterns(supabase, studentContext, { subject_id, limit });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_subjects: tool({
        description: "Get list of all available subjects with their IDs. ALWAYS call this BEFORE creating homework to get valid subject IDs.",
        inputSchema: z.object({
          _placeholder: z.string().optional().describe("Not used"),
        }),
        execute: async () => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_subjects", {});
          const result = await getSubjects(supabase, studentContext, {});
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_available_lessons: tool({
        description: "Find lessons available for the student based on their grade level",
        inputSchema: z.object({
          subject_id: z.string().optional().describe("Optional: Filter by subject ID"),
          limit: z.number().optional().describe("Maximum number of lessons to return (default 10)"),
        }),
        execute: async ({ subject_id, limit }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_available_lessons", { subject_id, limit });
          const result = await getAvailableLessons(supabase, studentContext, { subject_id, limit });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_lesson_details: tool({
        description: "Get detailed information about a specific lesson including content and student's progress",
        inputSchema: z.object({
          lesson_id: z.string().describe("The ID of the lesson to retrieve"),
        }),
        execute: async ({ lesson_id }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_details", { lesson_id });
          const result = await getLessonDetails(supabase, studentContext, { lesson_id });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_lesson_content_chunk: tool({
        description: "Get a chunk of lesson content for focused tutoring context",
        inputSchema: z.object({
          lesson_id: z.string().describe("The ID of the lesson"),
          offset: z.number().optional().describe("Character offset to start from (default 0)"),
          limit: z.number().optional().describe("Maximum characters to return (default 1200, max 2000)"),
        }),
        execute: async ({ lesson_id, offset, limit }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_content_chunk", { lesson_id, offset, limit });
          const result = await getLessonContentChunk(supabase, studentContext, { lesson_id, offset, limit });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_lesson_context: tool({
        description: "Get lesson references and snippets related to a query for grounded tutoring",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          subject_id: z.string().optional().describe("Optional: Filter by subject ID"),
          limit: z.number().optional().describe("Maximum sources to return (default 3)"),
        }),
        execute: async ({ query, subject_id, limit }) => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_lesson_context");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_lesson_context", { query, subject_id, limit }, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_context", { query, subject_id, limit });
          const result = await getLessonContext(supabase, studentContext, { query, subject_id, limit });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      search_lessons: tool({
        description: "Search lessons by keyword and optional subject/grade filters",
        inputSchema: z.object({
          query: z.string().describe("Search query"),
          subject_id: z.string().optional().describe("Optional: Filter by subject ID"),
          limit: z.number().optional().describe("Maximum results to return (default 10)"),
        }),
        execute: async ({ query, subject_id, limit }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "search_lessons", { query, subject_id, limit });
          const result = await searchLessons(supabase, studentContext, { query, subject_id, limit });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      suggest_learning_path: tool({
        description: "Generate a recommended sequence of lessons based on student's progress and weak areas",
        inputSchema: z.object({
          subject_id: z.string().optional().describe("Optional: Focus on a specific subject"),
          goal: z.string().optional().describe("Optional: Specific learning goal to work towards"),
        }),
        execute: async ({ subject_id, goal }) => {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "suggest_learning_path");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "suggest_learning_path", { subject_id, goal }, rateCheck.reason || "Rate limited");
            return { error: rateCheck.reason };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "suggest_learning_path", { subject_id, goal });
          const result = await suggestLearningPath(supabase, studentContext, { subject_id, goal });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_student_homework: tool({
        description: "View the student's assigned homework with status and due dates",
        inputSchema: z.object({
          status: z.enum(["not_started", "in_progress", "submitted", "graded", "all"]).optional().describe("Filter by homework status (default: all)"),
          subject_id: z.string().optional().describe("Optional: Filter by subject ID"),
        }),
        execute: async ({ status, subject_id }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_homework", { status, subject_id });
          const result = await getStudentHomework(supabase, studentContext, { status, subject_id });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_homework_details: tool({
        description: "Get detailed information about a specific homework assignment including questions",
        inputSchema: z.object({
          homework_id: z.string().describe("The ID of the homework assignment to retrieve"),
        }),
        execute: async ({ homework_id }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_homework_details", { homework_id });
          const result = await getHomeworkDetails(supabase, studentContext, { homework_id });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      get_homework_question_context: tool({
        description: "Get a specific homework question with the student's current response for targeted help",
        inputSchema: z.object({
          submission_id: z.string().describe("Homework submission ID"),
          question_id: z.string().describe("Homework question ID"),
        }),
        execute: async ({ submission_id, question_id }) => {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_homework_question_context", { submission_id, question_id });
          const result = await getHomeworkQuestionContext(supabase, studentContext, { submission_id, question_id });
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? result.data : { error: result.error };
        },
      }),

      create_homework_assignment: tool({
        description: `MUST USE THIS TOOL when student asks for practice, exercises, problems, or homework.

DO NOT write practice questions as plain text - use this tool instead.

Provide a title, reason, subject, difficulty, and a short list of questions.`,
        inputSchema: z.object({
          title_ar: z.string().describe("Arabic title for the assignment"),
          title_en: z.string().optional().describe("English title for the assignment"),
          instructions_ar: z.string().optional().describe("Arabic instructions for the student"),
          instructions_en: z.string().optional().describe("English instructions for the student"),
          subject_id: z.string().optional().describe("Subject ID (from get_subjects). Either subject_id or subject_name required"),
          subject_name: z.string().optional().describe("Subject name if you don't have an ID"),
          difficulty_level: z.enum(["easy", "medium", "hard"]).describe("Difficulty level based on student's understanding"),
          reason: z.string().describe("Why this assignment is helpful for the student"),
          due_days: z.number().optional().describe("Number of days until due (default: 3)"),
          confirm: z.boolean().optional().describe("First call without confirm (shows preview), then call with confirm=true after user approves"),
          questions: z.array(z.object({
            question_type: z.enum(["multiple_choice", "short_answer", "long_answer"]),
            question_text_ar: z.string().describe("Question text in Arabic"),
            question_text_en: z.string().optional().describe("Question text in English"),
            options: z.array(z.string()).optional().describe("Answer options for multiple choice"),
            correct_answer: z.string().optional().describe("Correct answer for multiple choice questions"),
            points: z.number().describe("Point value for this question"),
          })).describe("Array of questions for the assignment (3-5 recommended)"),
        }),
        execute: async (params) => {
          // Only rate limit and log actual creations (confirm=true), not previews
          if (params.confirm === true) {
            const rateCheck = await checkRateLimit(supabase, studentContext.id, "create_homework_assignment");
            if (!rateCheck.allowed) {
              await logRateLimited(supabase, conversationId, studentContext.id, "create_homework_assignment", params, rateCheck.reason || "Rate limited");
              return { error: rateCheck.reason };
            }
          }

          const result = await createHomeworkAssignment(supabase, studentContext, {
            ...params,
            _last_user_message: lastUserText,
          });

          // Only log actual homework creations (when result shows "created" status)
          if (result.success && result.data && (result.data as Record<string, unknown>).status === "created") {
            const logId = await logToolStart(supabase, conversationId, studentContext.id, "create_homework_assignment", params);
            if (logId) await logToolComplete(supabase, logId, result);
          }

          return result.success ? result.data : { error: result.error };
        },
      }),
    };

    // Filter messages to only include valid parts for the model
    // Tool result parts (tool-xxx) are for UI display only, not for the model
    const filteredMessages = messages.map(msg => ({
      ...msg,
      parts: msg.parts?.filter(part =>
        part.type === "text" ||
        part.type === "tool-invocation" ||
        part.type === "tool-result"
      ) || []
    })).filter(msg => msg.parts.length > 0);

    // Use AI SDK streamText with tools
    const result = streamText({
      model: openai(AI_MODEL),
      system: SYSTEM_PROMPT + sessionContext,
      messages: await convertToModelMessages(filteredMessages as UIMessage[]),
      tools,
    });

    // Return streaming response
    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === "start" || part.type === "finish") {
          return { conversation_id: conversationId };
        }
        return undefined;
      },
      onFinish: async ({ responseMessage }) => {
        // Save conversation messages to database
        try {
          // Extract text content from the response message
          const assistantText = responseMessage.parts
            ?.filter(p => p.type === "text")
            .map(p => (p as { type: "text"; text: string }).text)
            .join("") || "";

          // Extract tool results from response message parts (cast to Json-compatible format)
          const toolResults = responseMessage.parts
            ?.filter(p => p.type.startsWith("tool-"))
            .map(p => ({
              type: p.type as string,
              toolName: p.type.replace("tool-", "") as string,
              state: ((p as { state?: string }).state || "output-available") as string,
              output: JSON.parse(JSON.stringify((p as { output?: unknown }).output)) as Record<string, unknown>,
            })) || [];

          // Get the last user message text
          const lastUserMessage = messages.filter(m => m.role === "user").pop();
          const userText = lastUserMessage?.parts?.find(p => p.type === "text")?.text || "";

          // Save user message
          if (userText) {
            await supabase.from("ai_messages").insert({
              conversation_id: conversationId,
              role: "user",
              content: userText,
            });
          }

          // Save assistant message with tool results
          if (assistantText || toolResults.length > 0) {
            await supabase.from("ai_messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: assistantText,
              tool_results: toolResults.length > 0 ? (toolResults as unknown as Json) : null,
            });
          }

          // Update conversation timestamp
          await supabase
            .from("ai_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        } catch (error) {
          console.error("Error saving messages:", error);
        }
      },
    });
  } catch (error) {
    console.error("Tutor API error:", error);
    return NextResponse.json(
      { error: "An error occurred while processing your request" },
      { status: 500 }
    );
  }
}

// GET - Fetch conversation history
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get("conversation_id");

    if (conversationId) {
      // Get specific conversation with messages
      const { data: messages, error } = await supabase
        .from("ai_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) {
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
      }

      return NextResponse.json({ messages });
    } else {
      // Get all conversations for user
      const { data: conversations, error } = await supabase
        .from("ai_conversations")
        .select("id, title, lesson_id, homework_id, subject_id, created_at, updated_at")
        .eq("student_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
      }

      return NextResponse.json({ conversations });
    }
  } catch (error) {
    console.error("Tutor API GET error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
