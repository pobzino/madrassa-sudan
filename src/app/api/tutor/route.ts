import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Available OpenAI models (as of 2025):
// - gpt-5.2: Latest flagship model, best quality (RECOMMENDED)
// - gpt-5-mini: Fast & affordable, good for simple tasks
// - gpt-4.1: Previous generation, still excellent
const AI_MODEL = "gpt-5.2";

// Explicit system prompt with clear instructions and constraints
const SYSTEM_PROMPT = `# Role and Identity
You are "معلم البومة" (Owl Teacher), an AI tutor for Madrassa Sudan - an educational platform for Sudanese children.

# Core Responsibilities
1. Help students understand academic concepts across subjects (Math, Science, English, Arabic)
2. Guide students through homework WITHOUT providing direct answers
3. Adapt explanations to the student's grade level and preferred language
4. Track learning progress and celebrate achievements

# Communication Guidelines
- LANGUAGE: Respond in the student's preferred language (Arabic or English)
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

# Response Format
- Keep responses concise and focused (under 200 words when possible)
- Use bullet points or numbered lists for multi-step explanations
- Include ONE relevant emoji per response maximum (🦉 preferred)
- End responses with a question or encouragement to keep them engaged

# Constraints
- Do NOT search the internet or access external resources
- Do NOT generate inappropriate content
- Do NOT help with anything unrelated to education
- Do NOT provide medical, legal, or financial advice
- If asked about non-educational topics, gently redirect to learning

# Context Awareness
You will receive context about:
- The student's name, grade level, and language preference
- Current lesson or homework assignment (if applicable)
- Previous conversation history

Use this context to provide personalized, relevant assistance.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile for language preference
    const { data: profile } = await supabase
      .from("profiles")
      .select("preferred_language, grade_level, full_name")
      .eq("id", user.id)
      .single();

    const body = await request.json();
    const { message, conversation_id, context } = body;

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId) {
      const { data: newConversation, error: convError } = await supabase
        .from("ai_conversations")
        .insert({
          student_id: user.id,
          lesson_id: context?.lesson_id || null,
          homework_id: context?.homework_id || null,
          subject_id: context?.subject_id || null,
          title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        })
        .select()
        .single();

      if (convError) {
        console.error("Error creating conversation:", convError);
        return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
      }
      conversationId = newConversation.id;
    }

    // Get conversation history
    const { data: previousMessages } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Build context string for current session
    let sessionContext = `\n\n# Current Session Context\n`;
    sessionContext += `- Student Name: ${profile?.full_name || "Student"}\n`;
    sessionContext += `- Preferred Language: ${profile?.preferred_language === "ar" ? "Arabic (العربية)" : "English"}\n`;
    sessionContext += `- Grade Level: ${profile?.grade_level ? `Grade ${profile.grade_level}` : "Unknown"}\n`;

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

    // Build conversation input for Responses API
    const conversationHistory = (previousMessages || []).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // Call OpenAI Responses API
    const response = await openai.responses.create({
      model: AI_MODEL,
      instructions: SYSTEM_PROMPT + sessionContext,
      input: [
        ...conversationHistory,
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_output_tokens: 1000,
    });

    const assistantMessage = response.output_text || "I'm sorry, I couldn't generate a response.";

    // Save user message
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    // Save assistant message
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: assistantMessage,
    });

    // Update conversation timestamp
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({
      message: assistantMessage,
      conversation_id: conversationId,
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
