// GET /api/teacher/milestones/[id]?lang= — milestone with its full pool (answer keys; staff only).
// PUT /api/teacher/milestones/[id] — edit title, battle size, boss and questions.
//   Draft: the questions array replaces the pool. Published: same ids and the
//   same item shape (type, list sizes) only, so text / option text /
//   correct-answer fixes (anything else: unpublish first). Each question is an
//   `interaction` (any battle type) or a legacy MC / TF / short-answer item;
//   both are stored with the interaction jsonb.

import { isUuid } from "@/lib/learners/types";
import type { TeacherMilestoneDetail } from "@/lib/milestones/types";
import { interactionShape, type BattleInteraction } from "@/lib/server/milestones/interactions";
import {
  isBossKey,
  isPlacement,
  loadBlockLessons,
  milestoneError,
  milestoneJson,
  parseLang,
  type MilestoneAdminClient,
  type MilestoneRow,
} from "@/lib/server/milestones/load";
import { PLACEMENT_QUESTION_COUNT, PLACEMENT_SOURCE_WEEKS } from "@/lib/measurement/types";
import { assessableSkills, loadSubjectSkills } from "@/lib/server/measurement/skills";
import {
  isValidBattleQuestionCount,
  teacherTagWrite,
  loadMilestoneRow,
  loadTeacherQuestions,
  openStaffRequest,
  canManagePathMilestones,
  publishForbiddenResponse,
  questionWriteRow,
  teacherMilestoneRow,
  validateTeacherQuestion,
  type TeacherItemWrite,
} from "@/lib/server/milestones/teacher";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const PLACEMENT_WEEKS = Array.from({ length: PLACEMENT_SOURCE_WEEKS }, (_, i) => i + 1);

async function pathSubject(admin: MilestoneAdminClient, pathId: string) {
  const { data } = await admin.from("learning_paths").select("subject_id").eq("id", pathId).maybeSingle<{ subject_id: string }>();
  return data?.subject_id ?? null;
}

async function subjectSkills(admin: MilestoneAdminClient, pathId: string) {
  const subjectId = await pathSubject(admin, pathId);
  return subjectId ? (await loadSubjectSkills(admin, subjectId)).skills : [];
}

async function detail(admin: MilestoneAdminClient, row: MilestoneRow, lang: "ar" | "en"): Promise<TeacherMilestoneDetail> {
  const [milestone, questions, lessons, skills] = await Promise.all([
    teacherMilestoneRow(admin, row),
    loadTeacherQuestions(admin, row.assignment_id),
    loadBlockLessons(admin, row.path_id, row.after_week_number, lang, isPlacement(row) ? PLACEMENT_WEEKS : undefined),
    subjectSkills(admin, row.path_id).catch(() => []),
  ]);
  return {
    milestone,
    questions,
    lessons: lessons.map((lesson) => ({ id: lesson.lessonId, title: lesson.title, weekNumber: lesson.weekNumber })),
    skills: assessableSkills(skills),
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const lang = parseLang(new URL(request.url).searchParams.get("lang"));
  try {
    const row = await loadMilestoneRow(staff.admin, id);
    if (!row) return milestoneError("milestone_not_found", 404);
    return milestoneJson(await detail(staff.admin, row, lang));
  } catch (error) {
    console.error("Teacher milestone detail failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const staff = await openStaffRequest();
  if (!staff.ok) return staff.response;
  const { admin, userId } = staff;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const lang = parseLang(new URL(request.url).searchParams.get("lang"));
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return milestoneError("invalid_answer", 400, { message: "Invalid request" });

  try {
    const row = await loadMilestoneRow(admin, id);
    if (!row) return milestoneError("milestone_not_found", 404);
    if (!(await canManagePathMilestones(admin, staff, row.path_id))) return publishForbiddenResponse();
    const published = row.status === "published";
    const now = new Date().toISOString();

    const milestoneUpdate: Record<string, unknown> = { reviewed_at: now, reviewed_by: userId };
    if (body.titleAr !== undefined) {
      const titleAr = typeof body.titleAr === "string" ? body.titleAr.trim() : "";
      if (!titleAr) return milestoneError("invalid_answer", 400, { message: "The Arabic title is required." });
      milestoneUpdate.title_ar = titleAr;
    }
    if (body.titleEn !== undefined) {
      milestoneUpdate.title_en = typeof body.titleEn === "string" && body.titleEn.trim() ? body.titleEn.trim() : null;
    }
    if (body.battleQuestionCount !== undefined) {
      if (isPlacement(row) && body.battleQuestionCount !== PLACEMENT_QUESTION_COUNT) {
        return milestoneError("invalid_answer", 400, { message: "A starting boss always has 12 questions." });
      }
      if (!isValidBattleQuestionCount(body.battleQuestionCount)) {
        return milestoneError("invalid_answer", 400, { message: "The battle size must be 8 to 16 questions." });
      }
      milestoneUpdate.battle_question_count = body.battleQuestionCount;
    }
    if (body.required !== undefined) {
      if (typeof body.required !== "boolean") return milestoneError("invalid_answer", 400, { message: "required must be true or false." });
      if (!isPlacement(row)) return milestoneError("invalid_answer", 400, { message: "Only the starting boss can be required." });
      milestoneUpdate.required = body.required;
    }
    if (body.bossKey !== undefined) {
      if (!isBossKey(body.bossKey)) return milestoneError("invalid_answer", 400, { message: "Unknown boss." });
      milestoneUpdate.boss_key = body.bossKey;
    }

    if (body.questions !== undefined) {
      if (!Array.isArray(body.questions)) return milestoneError("invalid_answer", 400, { message: "questions must be an array." });
      const incoming: TeacherItemWrite[] = [];
      for (const [index, raw] of body.questions.entries()) {
        const result = validateTeacherQuestion(raw, index);
        if ("error" in result) return milestoneError("invalid_answer", 400, { message: result.error });
        incoming.push(result.item);
      }

      // Tags: a skill must be one of the subject's assessable skills.
      if (incoming.some((question) => typeof question.skill_key === "string")) {
        const allowed = new Set(assessableSkills(await subjectSkills(admin, row.path_id)).map((skill) => skill.skillKey));
        const bad = incoming.findIndex((question) => typeof question.skill_key === "string" && !allowed.has(question.skill_key));
        if (bad >= 0) return milestoneError("invalid_answer", 400, { message: `Question ${bad + 1}: unknown skill for this subject.` });
      }

      const existing = await loadTeacherQuestions(admin, row.assignment_id);
      const existingById = new Map(existing.map((question) => [question.id!, question]));
      const incomingIds = incoming.map((question) => question.id).filter((qid): qid is string => Boolean(qid));
      if (new Set(incomingIds).size !== incomingIds.length || incomingIds.some((qid) => !existingById.has(qid))) {
        return milestoneError("invalid_answer", 400, { message: "Invalid or duplicate question ids. Reload and try again." });
      }

      if (published) {
        // A live pool keeps its shape: battles in progress hold these ids and option counts.
        const sameSet = incomingIds.length === incoming.length && incoming.length === existing.length;
        const sameShape = incoming.every((question) => {
          const current = existingById.get(question.id!)?.interaction;
          return current && interactionShape(current as BattleInteraction) === interactionShape(question.interaction);
        });
        if (!sameSet || !sameShape) return milestoneError("unpublish_first", 409);
      }

      const removedIds = existing.map((question) => question.id!).filter((qid) => !incomingIds.includes(qid));
      for (const question of incoming) {
        // Tag edits are allowed while published (they don't change the item's shape).
        const stored = question.id ? existingById.get(question.id) ?? null : null;
        const write = questionWriteRow(row.assignment_id, question, teacherTagWrite(question, stored, now));
        const { error } = question.id
          ? await admin.from("homework_questions").update(write).eq("id", question.id).eq("assignment_id", row.assignment_id)
          : await admin.from("homework_questions").insert(write);
        if (error) throw new Error(error.message);
      }
      if (removedIds.length) {
        // Only staff previews run on a draft; stop them before their questions go.
        await admin
          .from("milestone_battles")
          .update({ status: "abandoned", finished_at: now })
          .eq("milestone_id", row.id)
          .eq("status", "active");
        const { error } = await admin.from("homework_questions").delete().in("id", removedIds).eq("assignment_id", row.assignment_id);
        if (error) throw new Error(error.message);
      }
      await admin
        .from("homework_assignments")
        .update({ total_points: incoming.length, updated_at: now })
        .eq("id", row.assignment_id);
    }

    if (typeof milestoneUpdate.title_ar === "string" || "title_en" in milestoneUpdate) {
      await admin
        .from("homework_assignments")
        .update({
          ...(typeof milestoneUpdate.title_ar === "string" ? { title_ar: milestoneUpdate.title_ar } : {}),
          ...("title_en" in milestoneUpdate ? { title_en: milestoneUpdate.title_en } : {}),
        })
        .eq("id", row.assignment_id);
    }
    const { error: updateError } = await admin.from("learning_path_milestones").update(milestoneUpdate).eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
    if (body.questions !== undefined) {
      // Tag corrections apply to history (measurement item snapshots and level scores).
      const { error: refreshError } = await admin.rpc("measurement_refresh_tags", { p_milestone_id: row.id });
      if (refreshError) console.error("measurement_refresh_tags failed:", refreshError.message);
    }

    const updated = await loadMilestoneRow(admin, row.id);
    if (!updated) return milestoneError("milestone_not_found", 404);
    return milestoneJson(await detail(admin, updated, lang));
  } catch (error) {
    console.error("Teacher milestone update failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
