// GET /api/teacher/measurement/skills?subject_id= — the subject's skills (labels
// for staff and families, assessable flag), for the tag editor. Approved staff.

import type { SkillListResponse } from "@/lib/measurement/types";
import { measurementError, measurementJson, UUID_PATTERN } from "@/lib/server/measurement/http";
import { loadSubjectSkills } from "@/lib/server/measurement/skills";
import { openStaffRequest } from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  const subjectId = new URL(request.url).searchParams.get("subject_id") ?? "";
  if (!UUID_PATTERN.test(subjectId)) return measurementError("invalid_query", 400, "subject_id is required");

  try {
    const { data: subject } = await staff.admin
      .from("subjects")
      .select("id, name_en, name_ar")
      .eq("id", subjectId)
      .maybeSingle<{ id: string; name_en: string | null; name_ar: string | null }>();
    if (!subject) return measurementError("not_found", 404);
    const { subjectKey, skills } = await loadSubjectSkills(staff.admin, subjectId, subject);
    return measurementJson({ subjectId, subjectKey, skills } satisfies SkillListResponse);
  } catch (error) {
    console.error("Skill list failed:", error);
    return measurementError("service_unavailable", 500);
  }
}
