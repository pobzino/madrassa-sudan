import "server-only";

import { isLearnerAvatar, learnerDisplayName } from "@/lib/learners/types";
import { milestoneLevel } from "@/lib/milestones/rules";
import type { CertificateView } from "@/lib/milestones/types";
import { isBossKey, type MilestoneAdminClient } from "@/lib/server/milestones/load";

export interface CertificateRow {
  id: string;
  learner_id: string;
  milestone_id: string | null;
  assignment_id: string | null;
  battle_id: string | null;
  subject_id: string | null;
  after_week_number: number;
  title_ar: string;
  title_en: string | null;
  boss_key: string;
  score_percent: number | string;
  correct_count: number;
  wrong_count: number;
  question_count: number;
  stars: number;
  awarded_at: string;
  parent_notified_at: string | null;
}

export const CERTIFICATE_COLUMNS =
  "id, learner_id, milestone_id, assignment_id, battle_id, subject_id, after_week_number, title_ar, title_en, boss_key, score_percent, correct_count, wrong_count, question_count, stars, awarded_at, parent_notified_at";

export interface LearnerNameRow {
  id: string;
  full_name: string | null;
  learner_name: string | null;
  learner_avatar: string | null;
}

export interface SubjectNameRow {
  id: string;
  name_ar: string | null;
  name_en: string | null;
}

function clampStars(value: number): 1 | 2 | 3 {
  return value >= 3 ? 3 : value <= 1 ? 1 : 2;
}

export function toCertificateView(
  row: CertificateRow,
  learner: LearnerNameRow | null,
  subject: SubjectNameRow | null,
): CertificateView {
  return {
    id: row.id,
    learnerId: row.learner_id,
    learnerName: learner ? learnerDisplayName(learner) : "",
    learnerAvatar: isLearnerAvatar(learner?.learner_avatar) ? learner!.learner_avatar as CertificateView["learnerAvatar"] : null,
    subjectId: row.subject_id,
    subjectNameAr: subject?.name_ar ?? null,
    subjectNameEn: subject?.name_en ?? null,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    afterWeekNumber: row.after_week_number,
    level: milestoneLevel(row.after_week_number),
    bossKey: isBossKey(row.boss_key) ? row.boss_key : "puzzle_owlet",
    stars: clampStars(Number(row.stars)),
    scorePercent: Number(row.score_percent),
    awardedAt: row.awarded_at,
  };
}

/** Certificate views with the learner's name/avatar and subject names filled in. */
export async function certificateViews(admin: MilestoneAdminClient, rows: CertificateRow[]): Promise<CertificateView[]> {
  if (!rows.length) return [];
  const learnerIds = [...new Set(rows.map((row) => row.learner_id))];
  const subjectIds = [...new Set(rows.map((row) => row.subject_id).filter((id): id is string => Boolean(id)))];
  const [{ data: learners }, { data: subjects }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, learner_name, learner_avatar")
      .in("id", learnerIds)
      .returns<LearnerNameRow[]>(),
    subjectIds.length
      ? admin.from("subjects").select("id, name_ar, name_en").in("id", subjectIds).returns<SubjectNameRow[]>()
      : Promise.resolve({ data: [] as SubjectNameRow[] }),
  ]);
  const learnerById = new Map((learners ?? []).map((learner) => [learner.id, learner]));
  const subjectById = new Map((subjects ?? []).map((subject) => [subject.id, subject]));
  return rows.map((row) =>
    toCertificateView(row, learnerById.get(row.learner_id) ?? null, row.subject_id ? subjectById.get(row.subject_id) ?? null : null),
  );
}
