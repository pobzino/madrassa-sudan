import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a friendly, patient tutor helping Sudanese students learn. Your name is "معلم البومة" (Owl Teacher).

Guidelines:
- Communicate in the student's preferred language (Arabic or English)
- Use simple, clear explanations appropriate for the student's grade level
- Be encouraging and supportive - celebrate small wins
- Use examples relevant to Sudanese culture and daily life when possible
- If asked about current lesson or homework, use the provided context
- NEVER give direct answers to homework questions - guide the student to discover the answer themselves
- Ask follow-up questions to check understanding
- If a student is struggling, break down the problem into smaller steps
- Use emojis sparingly to keep things friendly 🦉

Remember: You're helping children learn, so be patient and kind!`;

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

    // Build context string
    let contextInfo = "";
    if (context?.lesson_id) {
      const { data: lesson } = await supabase
        .from("lessons")
        .select("title_ar, title_en, description_ar, description_en")
        .eq("id", context.lesson_id)
        .single();
      if (lesson) {
        contextInfo += `\n\nCurrent Lesson: ${lesson.title_en || lesson.title_ar}\nDescription: ${lesson.description_en || lesson.description_ar}`;
      }
    }
    if (context?.homework_id) {
      const { data: homework } = await supabase
        .from("homework_assignments")
        .select("title_ar, title_en, instructions_ar, instructions_en")
        .eq("id", context.homework_id)
        .single();
      if (homework) {
        contextInfo += `\n\nCurrent Homework: ${homework.title_en || homework.title_ar}\nInstructions: ${homework.instructions_en || homework.instructions_ar}`;
      }
    }

    // Build messages for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nStudent Info:\n- Name: ${profile?.full_name || "Student"}\n- Preferred Language: ${profile?.preferred_language === "ar" ? "Arabic" : "English"}\n- Grade Level: ${profile?.grade_level || "Unknown"}${contextInfo}`,
      },
      ...(previousMessages || []).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const assistantMessage = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

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
