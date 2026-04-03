import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

export type TeacherRole = "teacher" | "admin";

function normalizeTeacherRole(value: unknown): TeacherRole | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "teacher" || normalized === "admin") {
    return normalized;
  }
  return null;
}

export async function getTeacherRole(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TeacherRole | null> {
  // Primary source of truth: public.profiles.role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const profileRole = normalizeTeacherRole(profile?.role);
  if (profileRole) {
    return profileRole;
  }

  // Fallback: auth app_metadata.role (admin-managed, not user-editable)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return null;
  }

  const metadataRole = normalizeTeacherRole(
    (user.app_metadata as Record<string, unknown> | undefined)?.role
  );

  if (!metadataRole) {
    return null;
  }

  return metadataRole;
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
