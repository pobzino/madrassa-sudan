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

  // The Level Test tables reference the profile with ON DELETE NO ACTION
  // (until 20261016130000 makes them cascade), which makes deleteUser fail for
  // anyone who ever started the Level Test. Clear them first (placements point
  // at attempts; diagnostic_responses cascade from the attempt).
  for (const table of ["student_placements", "diagnostic_attempts"] as const) {
    const { error } = await admin.from(table).delete().eq("student_id", userId);
    if (error) {
      console.error(`Account deletion: failed to clear ${table}:`, error);
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }
  }

  // Deleting the auth user removes the profile and, through the FK cascades,
  // the user's own homework, AI chats, streak, class enrolments, lesson
  // progress and task answers, all in one transaction, so a failure leaves
  // nothing half-deleted. Lessons, learning paths and (from 20261016130000)
  // homework and Practices a teacher wrote are kept, with no owner.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error("Account deletion: failed to delete auth user:", deleteUserError);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Sign out
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
