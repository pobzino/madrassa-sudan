import "server-only";

import type { RetagResponse } from "@/lib/measurement/types";
import { battleInteractionFor, type InteractionSourceRow } from "@/lib/server/milestones/interactions";
import type { MilestoneAdminClient, MilestoneRow } from "@/lib/server/milestones/load";
import { assessableSkills, loadSubjectSkills } from "@/lib/server/measurement/skills";
import { tagItemsWithModel, type ItemTagger } from "@/lib/server/measurement/tagger";

type TagRow = InteractionSourceRow & {
  id: string;
  source_lesson_id: string | null;
  skill_key: string | null;
  difficulty: number | null;
  tag_source: string | null;
};

const TAG_ROW_COLUMNS =
  "id, question_type, question_text_ar, question_text_en, options, options_ar, options_en, correct_answer, correct_option_index, interaction, source_lesson_id, skill_key, difficulty, tag_source";

/**
 * Tag a pool with the model (the backfill and teacher-added items): "untagged"
 * = rows missing a skill or a difficulty; "all" = every row. Teacher tags are
 * never overwritten. A lesson-backfilled skill is kept and the item is marked
 * disputed when the model picks another skill. Then measurement_refresh_tags.
 */
export async function retagMilestone(
  admin: MilestoneAdminClient,
  milestone: MilestoneRow,
  scope: "untagged" | "all",
  tagBatch?: ItemTagger,
): Promise<RetagResponse> {
  const [{ data: rows, error }, { data: path }] = await Promise.all([
    admin.from("homework_questions").select(TAG_ROW_COLUMNS).eq("assignment_id", milestone.assignment_id).order("display_order", { ascending: true }).returns<TagRow[]>(),
    admin.from("learning_paths").select("subject_id").eq("id", milestone.path_id).maybeSingle<{ subject_id: string }>(),
  ]);
  if (error) throw new Error(error.message);
  if (!path) return { tagged: 0, disputed: 0, unchanged: (rows ?? []).length };
  const [{ data: subject }, { data: lesson }] = await Promise.all([
    admin.from("subjects").select("name_en, name_ar").eq("id", path.subject_id).maybeSingle<{ name_en: string | null; name_ar: string | null }>(),
    admin.from("lessons").select("grade_level").eq("subject_id", path.subject_id).limit(1).maybeSingle<{ grade_level: number | null }>(),
  ]);
  const { skills } = await loadSubjectSkills(admin, path.subject_id, subject ?? null);
  const tagSkills = assessableSkills(skills).map((skill) => ({ key: skill.skillKey, label: skill.labelEn }));

  const candidates = (rows ?? [])
    .filter((row) => row.tag_source !== "teacher")
    .filter((row) => scope === "all" || !row.skill_key || !row.difficulty)
    .map((row) => ({ row, interaction: battleInteractionFor(row) }))
    .filter((item): item is { row: TagRow; interaction: NonNullable<ReturnType<typeof battleInteractionFor>> } => item.interaction !== null);
  const untouched = (rows ?? []).length - candidates.length;
  if (!candidates.length || !tagSkills.length) return { tagged: 0, disputed: 0, unchanged: (rows ?? []).length };

  const tags = await tagItemsWithModel(
    { items: candidates.map((item) => item.interaction), subjectName: subject?.name_en || subject?.name_ar || "General", gradeLevel: lesson?.grade_level ?? 1, skills: tagSkills },
    tagBatch,
  );
  const tagByIndex = new Map(tags.map((tag) => [tag.index, tag]));
  const now = new Date().toISOString();
  let tagged = 0;
  let disputed = 0;
  let unchanged = untouched;
  for (const [index, { row }] of candidates.entries()) {
    const tag = tagByIndex.get(index);
    if (!tag) {
      unchanged += 1;
      continue;
    }
    const keepLessonSkill = row.tag_source === "backfill_lesson" && Boolean(row.skill_key);
    const skillKey = keepLessonSkill ? row.skill_key : tag.skillKey ?? row.skill_key;
    const difficulty = tag.difficulty ?? row.difficulty;
    const isDisputed = keepLessonSkill && tag.skillKey !== null && tag.skillKey !== row.skill_key;
    if (skillKey === row.skill_key && difficulty === row.difficulty && !isDisputed && row.tag_source) {
      unchanged += 1;
      continue;
    }
    const { error: updateError } = await admin
      .from("homework_questions")
      .update({ skill_key: skillKey, difficulty, tag_source: isDisputed ? "model_disputed" : "model", tagged_at: now })
      .eq("id", row.id)
      .eq("assignment_id", milestone.assignment_id);
    if (updateError) throw new Error(updateError.message);
    tagged += 1;
    if (isDisputed) disputed += 1;
  }
  const { error: refreshError } = await admin.rpc("measurement_refresh_tags", { p_milestone_id: milestone.id });
  if (refreshError) console.error("measurement_refresh_tags failed:", refreshError.message);
  return { tagged, disputed, unchanged };
}
