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
    .select("role, is_approved")
    .eq("id", userId)
    .maybeSingle();

  const profileRole = normalizeTeacherRole(profile?.role);
  if (profileRole) {
    // A public signup can ask for the teacher role; it carries no teacher
    // rights until an admin approves the account. /api routes are not behind
    // the middleware's approval redirect, so check it here too.
    return profile?.is_approved === true ? profileRole : null;
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

export async function canEditAssignedLesson({
  supabase,
  role,
  userId,
  lessonId,
  lessonCreatedBy,
}: {
  supabase: SupabaseClient<Database>;
  role: TeacherRole;
  userId: string;
  lessonId: string;
  lessonCreatedBy: string | null | undefined;
}): Promise<boolean> {
  if (canManageLesson({ role, userId, lessonCreatedBy })) {
    return true;
  }

  if (role !== "teacher") {
    return false;
  }

  const { data: cohortRows, error: cohortError } = await supabase
    .from("cohort_teachers")
    .select("cohort_id")
    .eq("teacher_id", userId);

  if (cohortError || !cohortRows || cohortRows.length === 0) {
    return false;
  }

  const cohortIds = cohortRows.map((row) => row.cohort_id);
  const { data: assignment, error: assignmentError } = await supabase
    .from("cohort_lessons")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("is_active", true)
    .in("cohort_id", cohortIds)
    .limit(1)
    .maybeSingle();

  if (assignmentError) {
    return false;
  }

  return Boolean(assignment);
}

// Published lessons are open to every family, so authoring a lesson does not
// make its students yours. Returns the approved students in the teacher's own
// classes, or null for an admin (who may see everyone).
export async function getClassStudentIds(
  service: SupabaseClient<Database>,
  role: TeacherRole,
  teacherId: string
): Promise<Set<string> | null> {
  if (role === "admin") return null;

  const { data: cohortRows, error: cohortError } = await service
    .from("cohort_teachers")
    .select("cohort_id")
    .eq("teacher_id", teacherId);
  if (cohortError) throw cohortError;

  const cohortIds = (cohortRows || []).map((row) => row.cohort_id);
  if (!cohortIds.length) return new Set();

  const { data: memberRows, error: memberError } = await service
    .from("cohort_students")
    .select("student_id")
    .in("cohort_id", cohortIds)
    .eq("status", "approved");
  if (memberError) throw memberError;

  return new Set((memberRows || []).map((row) => row.student_id));
}
