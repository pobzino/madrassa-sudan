import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { measurementSubjectKey } from "@/lib/measurement/rules";
import type { SkillInfo, SkillSubjectKey } from "@/lib/measurement/types";

// curriculum_skills is newer than database.types.ts: read through an untyped client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any>;

export type SkillRow = {
  skill_key: string;
  subject_key: SkillSubjectKey;
  label_en: string;
  label_ar: string;
  family_label_en: string;
  family_label_ar: string;
  assessable: boolean;
  sort_order: number;
  is_active?: boolean;
};

export const SKILL_COLUMNS = "skill_key, subject_key, label_en, label_ar, family_label_en, family_label_ar, assessable, sort_order, is_active";

export function toSkillInfo(row: SkillRow): SkillInfo {
  return {
    skillKey: row.skill_key,
    subjectKey: row.subject_key,
    labelEn: row.label_en,
    labelAr: row.label_ar,
    familyLabelEn: row.family_label_en,
    familyLabelAr: row.family_label_ar,
    assessable: row.assessable === true,
    sortOrder: Number(row.sort_order) || 0,
  };
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<{ subjectKey: SkillSubjectKey; skills: SkillInfo[] }> }>();

/** Test hook: forget memoised skill lists. */
export function clearSkillCache() {
  cache.clear();
}

/**
 * The subject's skills (its subject key from the subject's names), sorted, active only.
 * Two queries at most (subject, skills); memoised per process for 10 minutes.
 */
export async function loadSubjectSkills(
  admin: UntypedClient,
  subjectId: string,
  subject?: { name_en?: string | null; name_ar?: string | null } | null,
): Promise<{ subjectKey: SkillSubjectKey; skills: SkillInfo[] }> {
  const hit = cache.get(subjectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (async () => {
    const names = subject ?? (await admin.from("subjects").select("name_en, name_ar").eq("id", subjectId).maybeSingle<{ name_en: string | null; name_ar: string | null }>()).data;
    const subjectKey = measurementSubjectKey(names ?? null);
    const { data, error } = await admin
      .from("curriculum_skills")
      .select(SKILL_COLUMNS)
      .eq("subject_key", subjectKey)
      .order("sort_order", { ascending: true })
      .returns<SkillRow[]>();
    if (error) throw new Error(error.message);
    const skills = (data ?? []).filter((row) => row.is_active !== false).map(toSkillInfo);
    return { subjectKey, skills };
  })();
  cache.set(subjectId, { at: Date.now(), value });
  value.catch(() => cache.delete(subjectId));
  return value;
}

/** The skill key a lesson's curriculum topic maps to (mirrors measurement_lesson_skill in SQL). */
export function lessonSkillKey(topic: unknown): string | null {
  if (!topic || typeof topic !== "object") return null;
  const { subjectKey, topicId } = topic as { subjectKey?: unknown; topicId?: unknown };
  if ((subjectKey !== "math" && subjectKey !== "english") || typeof topicId !== "string" || !/^[a-z0-9-]+$/.test(topicId)) return null;
  return `${subjectKey}.${topicId}`;
}

/** The lesson's mapped skill when it exists and is assessable, else "<subjectKey>.general". */
export function defaultSkillForLesson(topic: unknown, skills: readonly SkillInfo[], subjectKey?: SkillSubjectKey): string {
  const mapped = lessonSkillKey(topic);
  const hit = mapped ? skills.find((skill) => skill.skillKey === mapped) : undefined;
  if (hit?.assessable) return hit.skillKey;
  const key = subjectKey ?? skills[0]?.subjectKey ?? (mapped?.split(".")[0] as SkillSubjectKey | undefined) ?? "general";
  return `${key}.general`;
}

/** The assessable skills, for the generator / verifier / tagger enums and the teacher dropdown. */
export function assessableSkills(skills: readonly SkillInfo[]): SkillInfo[] {
  return skills.filter((skill) => skill.assessable);
}
