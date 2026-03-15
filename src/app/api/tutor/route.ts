import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UIMessage, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { StudentContext } from "@/lib/ai/types";
import { Json } from "@/lib/database.types";
import { checkRateLimit } from "@/lib/ai/rate-limiter";
import { logToolStart, logToolComplete, logRateLimited } from "@/lib/ai/logger";
import { toolDefinitions } from "@/lib/ai/tools";
import { getOpenAIClient, AI_MODEL } from "@/lib/ai/openai-client";

// Import tool implementations
import { getStudentProfile, getStudentProgress, getWeakAreas, getSubjects } from "@/lib/ai/tools/student-tools";
import { getAvailableLessons, getLessonDetails, getLessonContentChunk, getLessonContext, searchLessons, suggestLearningPath } from "@/lib/ai/tools/lesson-tools";
import { getStudentHomework, getHomeworkDetails, getHomeworkQuestionContext, createHomeworkAssignment } from "@/lib/ai/tools/homework-tools";
import { getMistakePatterns } from "@/lib/ai/tools/insights-tools";

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
};

function isMissingTableError(error: SupabaseErrorLike | null | undefined, tableName: string) {
  if (!error) return false;

  const message = `${error.message || ""} ${error.hint || ""}`.toLowerCase();
  const normalizedName = tableName.toLowerCase();

  return (
    error.code === "PGRST205" ||
    message.includes(`public.${normalizedName}`) ||
    message.includes(`table 'public.${normalizedName}'`) ||
    message.includes(`relation "${normalizedName}" does not exist`)
  );
}

// Enhanced system prompt with tool awareness
const SYSTEM_PROMPT = `# Role and Identity
You are "معلم البومة" (Owl Teacher), an AI tutor for Amal Madrassa - an educational platform for Sudanese children.

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

# Tool Usage - VERY IMPORTANT

## NEVER use tools for:
- Greetings: "hi", "hello", "hey", "good morning", etc.
- Single words: "yes", "no", "ok", "really", "thanks"
- Casual chat or small talk
- Questions you can answer from general knowledge

For these, just reply with friendly conversational text. NO TOOLS.

## ONLY use tools when student EXPLICITLY asks:
- Progress/performance → get_student_progress (e.g., "how am I doing?", "show my progress")
- Weak areas → get_weak_areas (e.g., "what should I study?", "where am I struggling?")
- Practice/exercises → create_homework_assignment (e.g., "give me homework", "I need practice")
- Available lessons → get_available_lessons (e.g., "what lessons are there?")

If unsure whether to use a tool, DON'T. Just have a conversation.

For homework creation: First call shows preview, student confirms, then call again with confirm=true.

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

function createErrorStream(message: string) {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "error";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: message });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "error" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
      console.error("Tutor API misconfigured: OPENAI_API_KEY is missing");
      return createErrorStream("Tutor AI is not configured yet. Please contact support.");
    }

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
    let canPersistConversation = true;
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
        if (isMissingTableError(convError, "ai_conversations")) {
          canPersistConversation = false;
          conversationId = crypto.randomUUID();
          console.warn("ai_conversations table is missing. Continuing tutor chat without persistence.");
        } else {
          console.error("Error creating conversation:", convError);
          return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
        }
      } else {
        conversationId = newConversation.id;
      }
    }

    if (!conversationId) {
      canPersistConversation = false;
      conversationId = crypto.randomUUID();
      console.warn("No conversation id available. Falling back to non-persistent tutor session.");
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

    const responseTools = toolDefinitions.map((toolDef) => ({
      type: "function" as const,
      name: toolDef.function.name,
      description: toolDef.function.description,
      parameters: toolDef.function.parameters,
      strict: false,
    }));

    const executeTool = async (toolName: string, params: Record<string, unknown>) => {
      switch (toolName) {
        case "get_student_profile": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_student_profile");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_student_profile", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_profile", params);
          const result = await getStudentProfile(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_student_progress": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_student_progress");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_student_progress", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_progress", params);
          const result = await getStudentProgress(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_weak_areas": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_weak_areas");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_weak_areas", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_weak_areas", params);
          const result = await getWeakAreas(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_mistake_patterns": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_mistake_patterns");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_mistake_patterns", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_mistake_patterns", params);
          const result = await getMistakePatterns(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_subjects": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_subjects", params);
          const result = await getSubjects(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_available_lessons": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_available_lessons", params);
          const result = await getAvailableLessons(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_lesson_details": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_details", params);
          const result = await getLessonDetails(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_lesson_content_chunk": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_content_chunk", params);
          const result = await getLessonContentChunk(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_lesson_context": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "get_lesson_context");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "get_lesson_context", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_lesson_context", params);
          const result = await getLessonContext(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "search_lessons": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "search_lessons", params);
          const result = await searchLessons(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "suggest_learning_path": {
          const rateCheck = await checkRateLimit(supabase, studentContext.id, "suggest_learning_path");
          if (!rateCheck.allowed) {
            await logRateLimited(supabase, conversationId, studentContext.id, "suggest_learning_path", params, rateCheck.reason || "Rate limited");
            return { success: false, output: { error: rateCheck.reason } };
          }
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "suggest_learning_path", params);
          const result = await suggestLearningPath(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_student_homework": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_student_homework", params);
          const result = await getStudentHomework(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_homework_details": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_homework_details", params);
          const result = await getHomeworkDetails(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "get_homework_question_context": {
          const logId = await logToolStart(supabase, conversationId, studentContext.id, "get_homework_question_context", params);
          const result = await getHomeworkQuestionContext(supabase, studentContext, params);
          if (logId) await logToolComplete(supabase, logId, result);
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        case "create_homework_assignment": {
          const shouldRateLimit = params.confirm === true;
          if (shouldRateLimit) {
            const rateCheck = await checkRateLimit(supabase, studentContext.id, "create_homework_assignment");
            if (!rateCheck.allowed) {
              await logRateLimited(supabase, conversationId, studentContext.id, "create_homework_assignment", params, rateCheck.reason || "Rate limited");
              return { success: false, output: { error: rateCheck.reason } };
            }
          }
          const result = await createHomeworkAssignment(supabase, studentContext, {
            ...params,
            _last_user_message: lastUserText,
          });
          if (result.success && result.data && (result.data as Record<string, unknown>).status === "created") {
            const logId = await logToolStart(supabase, conversationId, studentContext.id, "create_homework_assignment", params);
            if (logId) await logToolComplete(supabase, logId, result);
          }
          return result.success ? { success: true, output: result.data } : { success: false, output: { error: result.error } };
        }
        default:
          return { success: false, output: { error: `Unknown tool: ${toolName}` } };
      }
    };

    const inputMessages: Array<
      | { type: "message"; role: "user" | "assistant"; content: string }
      | { type: "function_call_output"; call_id: string; output: string }
    > = [];

    messages
      .filter((msg) => msg.role === "user" || msg.role === "assistant")
      .forEach((msg) => {
        const text = msg.parts
          ?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ")
          .trim();

        if (text) {
          inputMessages.push({ type: "message", role: msg.role as "user" | "assistant", content: text });
        }

        // Include tool outputs in context when available (helps with confirmation flows)
        msg.parts
          ?.filter((part) => part.type.startsWith("tool-"))
          .forEach((part) => {
            const toolPart = part as { toolCallId?: string; output?: unknown; state?: string; errorText?: string };
            if (!toolPart.toolCallId) return;
            if (toolPart.state === "output-error") {
              inputMessages.push({
                type: "function_call_output",
                call_id: toolPart.toolCallId,
                output: JSON.stringify({ error: toolPart.errorText || "Tool error" }),
              });
              return;
            }
            if (toolPart.state === "output-available" && toolPart.output) {
              inputMessages.push({
                type: "function_call_output",
                call_id: toolPart.toolCallId,
                output: JSON.stringify(toolPart.output),
              });
            }
          });
      });

    const toolResultsForUi: Array<{
      toolName: string;
      toolCallId: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      state: "output-available" | "output-error";
      errorText?: string;
    }> = [];

    const getResponseText = (response: { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text: string }> }> }) => {
      if (response.output_text) return response.output_text;
      const outputs = response.output || [];
      const messagesText = outputs
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content || [])
        .filter((content) => content.type === "output_text")
        .map((content) => content.text);
      return messagesText.join("\n").trim();
    };

    const extractToolCalls = (response: { output?: Array<{ type: string; name?: string; call_id?: string; arguments?: string }> }) => {
      return (response.output || []).filter((item) => item.type === "function_call");
    };

    let response = await openaiClient.responses.create({
      model: AI_MODEL,
      instructions: SYSTEM_PROMPT + sessionContext,
      input: inputMessages,
      tools: responseTools,
      tool_choice: "auto",
    });

    let toolCalls = extractToolCalls(response);
    let guard = 0;

    while (toolCalls.length > 0 && guard < 3) {
      const toolOutputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];

      for (const call of toolCalls) {
        const toolName = call.name || "";
        const callId = call.call_id || crypto.randomUUID();
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
        } catch (error) {
          parsedArgs = {};
        }

        const toolResult = await executeTool(toolName, parsedArgs);
        const output = toolResult.output as Record<string, unknown>;

        toolResultsForUi.push({
          toolName,
          toolCallId: callId,
          input: parsedArgs,
          output,
          state: toolResult.success ? "output-available" : "output-error",
          errorText: toolResult.success ? undefined : String(output.error || "Tool error"),
        });

        toolOutputs.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(output),
        });
      }

      response = await openaiClient.responses.create({
        model: AI_MODEL,
        instructions: SYSTEM_PROMPT + sessionContext,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: responseTools,
        tool_choice: "auto",
      });

      toolCalls = extractToolCalls(response);
      guard += 1;
    }

    const assistantText = getResponseText(response as { output_text?: string; output?: Array<{ type: string; content?: Array<{ type: string; text: string }> }> });

    // Save conversation messages to database
    if (canPersistConversation) {
      try {
        const lastUserMessage = messages.filter((m) => m.role === "user").pop();
        const userText = lastUserMessage?.parts?.find((p) => p.type === "text")?.text || "";

        if (userText) {
          const { error: userInsertError } = await supabase.from("ai_messages").insert({
            conversation_id: conversationId,
            role: "user",
            content: userText,
          });
          if (userInsertError) {
            throw userInsertError;
          }
        }

        const persistedToolResults = toolResultsForUi.map((toolResult) => ({
          type: `tool-${toolResult.toolName}`,
          toolName: toolResult.toolName,
          state: toolResult.state,
          output: toolResult.output,
        }));

        if (assistantText || persistedToolResults.length > 0) {
          const { error: assistantInsertError } = await supabase.from("ai_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: assistantText || "",
            tool_results: persistedToolResults.length > 0 ? (persistedToolResults as unknown as Json) : null,
          });
          if (assistantInsertError) {
            throw assistantInsertError;
          }
        }

        const { error: conversationUpdateError } = await supabase
          .from("ai_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        if (conversationUpdateError) {
          throw conversationUpdateError;
        }
      } catch (error) {
        if (
          isMissingTableError(error as SupabaseErrorLike, "ai_messages") ||
          isMissingTableError(error as SupabaseErrorLike, "ai_conversations")
        ) {
          canPersistConversation = false;
          console.warn("Tutor persistence tables are missing. Continuing without saving messages.");
        } else {
          console.error("Error saving messages:", error);
        }
      }
    }

    const responseMetadata = canPersistConversation ? { conversation_id: conversationId } : undefined;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const messageId = crypto.randomUUID();
        writer.write({
          type: "start",
          messageId,
          ...(responseMetadata ? { messageMetadata: responseMetadata } : {}),
        });

        toolResultsForUi.forEach((toolResult) => {
          writer.write({
            type: "tool-input-available",
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            input: toolResult.input,
          });

          if (toolResult.state === "output-error") {
            writer.write({
              type: "tool-output-error",
              toolCallId: toolResult.toolCallId,
              errorText: toolResult.errorText || "Tool error",
            });
          } else {
            writer.write({
              type: "tool-output-available",
              toolCallId: toolResult.toolCallId,
              output: toolResult.output,
            });
          }
        });

        if (assistantText) {
          const textId = crypto.randomUUID();
          writer.write({ type: "text-start", id: textId });
          writer.write({ type: "text-delta", id: textId, delta: assistantText });
          writer.write({ type: "text-end", id: textId });
        }

        writer.write({
          type: "finish",
          finishReason: "stop",
          ...(responseMetadata ? { messageMetadata: responseMetadata } : {}),
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("Tutor API error:", error);
    return createErrorStream("An error occurred while processing your request.");
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
        if (isMissingTableError(error, "ai_messages")) {
          return NextResponse.json({ messages: [] });
        }
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
        if (isMissingTableError(error, "ai_conversations")) {
          return NextResponse.json({ conversations: [] });
        }
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
      }

      return NextResponse.json({ conversations });
    }
  } catch (error) {
    console.error("Tutor API GET error:", error);
    return NextResponse.json({ error: "An error occurred" }, { status: 500 });
  }
}
