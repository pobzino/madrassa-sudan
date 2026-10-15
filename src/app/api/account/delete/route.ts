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
  // re-earn completions), and the profile and auth user never could. Without
  // the service role nothing would really be removed, so refuse instead of
  // reporting a deletion that did not happen.
  if (!hasServiceRoleConfig()) {
    console.error("Account deletion: service role is not configured; account data can only be removed server-side.");
    return NextResponse.json({ error: "Account deletion is temporarily unavailable" }, { status: 503 });
  }
  // Every delete below is scoped to the verified user's id.
  const admin = createServiceClient();

  // 1. Delete homework responses (via submissions)
  const { data: subs } = await admin
    .from("homework_submissions")
    .select("id")
    .eq("student_id", userId);

  if (subs && subs.length > 0) {
    const subIds = subs.map((s) => s.id);
    await admin.from("homework_responses").delete().in("submission_id", subIds);
  }

  // 2. Delete homework submissions
  await admin.from("homework_submissions").delete().eq("student_id", userId);

  // 3. Delete AI messages (via conversations)
  const { data: convos } = await admin
    .from("ai_conversations")
    .select("id")
    .eq("student_id", userId);

  if (convos && convos.length > 0) {
    const convoIds = convos.map((c) => c.id);
    await admin.from("ai_messages").delete().in("conversation_id", convoIds);
  }

  // 4. Delete AI conversations
  await admin.from("ai_conversations").delete().eq("student_id", userId);

  // 5. Delete remaining user data
  await admin.from("student_streaks").delete().eq("student_id", userId);
  await admin.from("cohort_students").delete().eq("student_id", userId);
  await admin.from("lesson_progress").delete().eq("student_id", userId);

  // 6. Delete the auth user; the profile and every remaining row that
  // references it are removed by the FK cascades.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error("Account deletion: failed to delete auth user:", deleteUserError);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // 7. Sign out
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
