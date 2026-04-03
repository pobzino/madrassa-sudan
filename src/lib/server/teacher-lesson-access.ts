import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type TeacherRole = "teacher" | "admin";

export async function getTeacherRole(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TeacherRole | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
    return null;
  }

  return profile.role;
}

export function canManageLesson({
  role,
  userId,
  lessonCreatedBy,
}: {
  role: TeacherRole;
  userId: string;
  lessonCreatedBy: string | null | undefined;
}) {
  return role === "admin" || lessonCreatedBy === userId;
}
