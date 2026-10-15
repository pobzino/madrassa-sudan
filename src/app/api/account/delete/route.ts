import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, hasServiceRoleConfig } from "@/lib/supabase/service";

export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  // Homework, streak and lesson-progress rows can no longer be deleted from a
  // student's own session (deleting and re-creating them could reset grades or
  // re-earn completions), so remove them with the service role when it is
  // configured. Every delete below is scoped to the verified user's id; the
  // profile / auth-user deletion also cascades to these tables.
  const learningData = hasServiceRoleConfig() ? createServiceClient() : supabase;

  // 1. Delete homework responses (via submissions)
  const { data: subs } = await learningData
    .from("homework_submissions")
    .select("id")
    .eq("student_id", userId);

  if (subs && subs.length > 0) {
    const subIds = subs.map((s) => s.id);
    await learningData.from("homework_responses").delete().in("submission_id", subIds);
  }

  // 2. Delete homework submissions
  await learningData.from("homework_submissions").delete().eq("student_id", userId);

  // 3. Delete AI messages (via conversations)
  const { data: convos } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("student_id", userId);

  if (convos && convos.length > 0) {
    const convoIds = convos.map((c) => c.id);
    await supabase.from("ai_messages").delete().in("conversation_id", convoIds);
  }

  // 4. Delete AI conversations
  await supabase.from("ai_conversations").delete().eq("student_id", userId);

  // 5. Delete remaining user data
  await learningData.from("student_streaks").delete().eq("student_id", userId);
  await supabase.from("cohort_students").delete().eq("student_id", userId);
  await learningData.from("lesson_progress").delete().eq("student_id", userId);

  // 6. Delete profile
  await supabase.from("profiles").delete().eq("id", userId);

  // 7. Delete auth user via service role client (if available)
  if (hasServiceRoleConfig()) {
    const serviceClient = createServiceClient();
    await serviceClient.auth.admin.deleteUser(userId);
  }

  // 8. Sign out
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
