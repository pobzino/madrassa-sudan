import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Collect all user data
  const [profile, submissions, conversations, messages, progress, streaks] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase
        .from("homework_submissions")
        .select("*, homework_responses(*)")
        .eq("student_id", userId),
      supabase.from("ai_conversations").select("*").eq("student_id", userId),
      supabase
        .from("ai_conversations")
        .select("id")
        .eq("student_id", userId)
        .then(async ({ data: convos }) => {
          if (!convos || convos.length === 0) return { data: [] };
          const ids = convos.map((c) => c.id);
          return supabase.from("ai_messages").select("*").in("conversation_id", ids);
        }),
      supabase.from("lesson_progress").select("*").eq("student_id", userId),
      supabase.from("student_streaks").select("*").eq("student_id", userId),
    ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    user_email: user.email,
    profile: profile.data,
    homework_submissions: submissions.data,
    ai_conversations: conversations.data,
    ai_messages: messages.data,
    lesson_progress: progress.data,
    student_streaks: streaks.data,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="amal-school-data-export-${new Date().toISOString().split("T")[0]}.json"`,
    },
  });
}
