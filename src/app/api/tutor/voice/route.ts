import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { StudentContext } from "@/lib/ai/types";
import { Json } from "@/lib/database.types";
import { checkRateLimit } from "@/lib/ai/rate-limiter";
import { logToolStart, logToolComplete, logRateLimited } from "@/lib/ai/logger";
import { toolDefinitions } from "@/lib/ai/tools";

// Import tool implementations
import { getStudentProfile, getStudentProgress, getWeakAreas, getSubjects } from "@/lib/ai/tools/student-tools";
import { getAvailableLessons, getLessonDetails, getLessonContentChunk, getLessonContext, searchLessons, suggestLearningPath } from "@/lib/ai/tools/lesson-tools";
import { getStudentHomework, getHomeworkDetails, getHomeworkQuestionContext, createHomeworkAssignment } from "@/lib/ai/tools/homework-tools";
import { getMistakePatterns } from "@/lib/ai/tools/insights-tools";

const AI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

let openaiClientSingleton: OpenAI | null = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!openaiClientSingleton) {
    openaiClientSingleton = new OpenAI({ apiKey });
  }
  return openaiClientSingleton;
}

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

// Same system prompt as the text tutor, with voice-specific additions
const SYSTEM_PROMPT = `# Role and Identity
You are "معلم البومة" (Owl Teacher), an AI tutor for Amal School - an educational platform for Sudanese children.

# Voice Mode
You are currently in VOICE MODE. The student is speaking to you and will hear your response read aloud.
- Keep responses SHORT and conversational (under 100 words when possible)
- Use simple, clear language suitable for speech
- Avoid markdown formatting, bullet points, or numbered lists — just speak naturally
- Do NOT use special characters, code blocks, or complex formatting
- Use short sentences

# Core Responsibilities
1. Help students understand academic concepts across subjects (Math, Science, English, Arabic)
2. Guide students through homework WITHOUT providing direct answers
3. Adapt explanations to the student's grade level and preferred language
4. Track learning progress and celebrate achievements

# Communication Guidelines
- LANGUAGE: You MUST respond in the student's preferred language as specified in the session context.
- TONE: Friendly, patient, encouraging - like a supportive older sibling
- COMPLEXITY: Match explanations to the student's grade level
- CULTURAL CONTEXT: Use examples relevant to Sudanese daily life

# Teaching Methodology
1. When a student asks for help:
   - Ask clarifying questions to understand their current knowledge
   - Break complex problems into smaller steps
   - Use the Socratic method
   - Provide hints, not direct solutions

2. For homework questions:
   - NEVER provide direct answers
   - Guide them through the problem-solving process

# Tool Usage
## NEVER use tools for:
- Greetings, casual chat, or small talk
- Questions you can answer from general knowledge

## ONLY use tools when student EXPLICITLY asks:
- Progress/performance → get_student_progress
- Weak areas → get_weak_areas
- Practice/exercises → create_homework_assignment
- Available lessons → get_available_lessons

If unsure whether to use a tool, DON'T.

# Constraints
- Do NOT search the internet or access external resources
- Do NOT generate inappropriate content
- Do NOT help with anything unrelated to education
- If asked about non-educational topics, gently redirect to learning`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
      return NextResponse.json(
        { error: "Voice tutor is not configured" },
        { status: 500 }
      );
    }

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse multipart form data
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const conversationIdParam = formData.get("conversation_id") as string | null;
    const languageParam = (formData.get("language") as string) || "en";
    const contextParam = formData.get("context") as string | null;
    const messagesParam = formData.get("messages") as string | null;

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    // Parse context
    let context: { lesson_id?: string; homework_id?: string; subject_id?: string } = {};
    if (contextParam) {
      try { context = JSON.parse(contextParam); } catch { /* ignore */ }
    }

    // Parse previous messages for LLM context
    let previousMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    if (messagesParam) {
      try { previousMessages = JSON.parse(messagesParam); } catch { /* ignore */ }
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language, grade_level, full_name, role")
      .eq("id", user.id)
      .single();

    const { data: cohortMemberships } = await supabase
      .from("cohort_students")
      .select("cohort_id")
      .eq("student_id", user.id)
      .eq("is_active", true);

    const studentContext: StudentContext = {
      id: user.id,
      full_name: profile?.full_name || "Student",
      grade_level: profile?.grade_level || null,
      preferred_language: languageParam as "ar" | "en",
      cohort_ids: cohortMemberships?.map(c => c.cohort_id) || [],
    };

    // ─── Step 1: Speech-to-Text (Whisper) ───
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioBlob = new File([audioBuffer], "audio.webm", { type: audioFile.type || "audio/webm" });

    let userTranscript: string;
    try {
      const transcription = await openaiClient.audio.transcriptions.create({
        model: "whisper-1",
        file: audioBlob,
        language: languageParam === "ar" ? "ar" : "en",
      });
      userTranscript = transcription.text?.trim() || "";
    } catch (err) {
      console.error("[Voice] STT error:", err);
      return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
    }

    if (!userTranscript) {
      return NextResponse.json({ error: "Could not understand audio" }, { status: 400 });
    }

    // ─── Step 2: Get or create conversation ───
    let conversationId = conversationIdParam || undefined;
    let canPersistConversation = true;

    if (!conversationId) {
      const title = userTranscript.substring(0, 50);
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
    }

    // ─── Step 3: Build session context ───
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
        sessionContext += `- REMINDER: Do NOT provide direct answers.\n`;
      }
    }

    // ─── Step 4: LLM call with tools ───
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
            _last_user_message: userTranscript,
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

    // Build input messages from history + current transcribed text
    const inputMessages: Array<
      | { type: "message"; role: "user" | "assistant"; content: string }
      | { type: "function_call_output"; call_id: string; output: string }
    > = [];

    for (const msg of previousMessages) {
      if (msg.content?.trim()) {
        inputMessages.push({ type: "message", role: msg.role, content: msg.content });
      }
    }
    inputMessages.push({ type: "message", role: "user", content: userTranscript });

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
        try { parsedArgs = call.arguments ? JSON.parse(call.arguments) : {}; } catch { parsedArgs = {}; }

        const toolResult = await executeTool(toolName, parsedArgs);
        toolOutputs.push({
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(toolResult.output),
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

    // ─── Step 5: Persist messages ───
    if (canPersistConversation) {
      try {
        await supabase.from("ai_messages").insert({
          conversation_id: conversationId,
          role: "user",
          content: userTranscript,
        });

        if (assistantText) {
          await supabase.from("ai_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: assistantText,
          });
        }

        await supabase
          .from("ai_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      } catch (error) {
        if (
          isMissingTableError(error as SupabaseErrorLike, "ai_messages") ||
          isMissingTableError(error as SupabaseErrorLike, "ai_conversations")
        ) {
          console.warn("Tutor persistence tables missing for voice mode.");
        } else {
          console.error("Error saving voice messages:", error);
        }
      }
    }

    // ─── Step 6: Text-to-Speech ───
    if (!assistantText) {
      return NextResponse.json({ error: "No response generated" }, { status: 500 });
    }

    // Truncate for TTS if needed
    const ttsText = assistantText.length > 4096 ? assistantText.slice(0, 4096) : assistantText;

    try {
      const ttsResponse = await openaiClient.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: ttsText,
        response_format: "mp3",
      });

      const audioArrayBuffer = await ttsResponse.arrayBuffer();

      return new NextResponse(audioArrayBuffer, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audioArrayBuffer.byteLength),
          "X-User-Transcript": encodeURIComponent(userTranscript),
          "X-Assistant-Transcript": encodeURIComponent(assistantText),
          "X-Conversation-Id": conversationId || "",
        },
      });
    } catch (err) {
      console.error("[Voice] TTS error:", err);
      // Return text response as fallback
      return NextResponse.json({
        user_transcript: userTranscript,
        assistant_text: assistantText,
        conversation_id: conversationId,
        error: "TTS generation failed, text response attached",
      }, { status: 200 });
    }
  } catch (error) {
    console.error("[Voice] API error:", error);
    return NextResponse.json({ error: "Voice processing failed" }, { status: 500 });
  }
}
