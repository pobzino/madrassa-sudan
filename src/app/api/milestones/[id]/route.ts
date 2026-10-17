// GET /api/milestones/[id]?lang=ar|en — the intro screen for a Big Challenge:
// the milestone, the active learner's state, attempts, certificate and the
// block's lessons. Never includes questions.

import { isUuid } from "@/lib/learners/types";
import type { MilestoneIntroResponse } from "@/lib/milestones/types";
import { bossHpPercent } from "@/lib/milestones/rules";
import { openMilestoneLearnerRequest } from "@/lib/server/milestones/context";
import {
  isFinalBoss,
  isPlacement,
  loadActiveBattle,
  loadBlockLessons,
  loadCertificateFor,
  loadMilestoneForLearner,
  milestoneError,
  milestoneJson,
  milestoneStateFor,
  parseLang,
  toMilestoneSummary,
} from "@/lib/server/milestones/load";
import { battleHpPercent, heartsLeftFor } from "@/lib/server/milestones/present";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opened = await openMilestoneLearnerRequest(request);
  if (!opened.ok) return opened.response;
  const { context, admin, preview } = opened.value;
  if (!isUuid(id)) return milestoneError("milestone_not_found", 404);
  const lang = parseLang(new URL(request.url).searchParams.get("lang"));

  try {
    const loaded = await loadMilestoneForLearner(admin, id, { preview });
    if (!loaded) return milestoneError("milestone_not_found", 404);
    const { row, path, subject } = loaded;
    const learnerId = context.learnerId;

    if (isPlacement(row)) {
      // A placement never locks: completed (non-superseded, non-preview), in battle, or available.
      const [activeBattle, { data: done }, attempts] = await Promise.all([
        loadActiveBattle(admin, learnerId, row.id),
        admin
          .from("milestone_battles")
          .select("id")
          .eq("learner_id", learnerId)
          .eq("milestone_id", row.id)
          .eq("status", "completed")
          .eq("is_preview", false)
          .is("superseded_at", null)
          .limit(1)
          .returns<Array<{ id: string }>>(),
        admin
          .from("milestone_battles")
          .select("id", { count: "exact", head: true })
          .eq("learner_id", learnerId)
          .eq("milestone_id", row.id),
      ]);
      const state = activeBattle ? "in_battle" : (done ?? []).length && !preview ? "completed" : "available";
      const body: MilestoneIntroResponse = {
        milestone: toMilestoneSummary(row, path),
        subjectNameAr: subject?.name_ar ?? null,
        subjectNameEn: subject?.name_en ?? null,
        state,
        lockedReason: null,
        activeBattle: activeBattle
          ? {
              battleId: activeBattle.id,
              answeredCount: activeBattle.answered_count,
              heartsLeft: heartsLeftFor(activeBattle),
              bossHpPercent: battleHpPercent(activeBattle),
            }
          : null,
        certificate: null,
        attempts: attempts.count ?? 0,
        blockLessons: [],
        preview,
        kind: "placement",
      };
      return milestoneJson(body);
    }

    const [engineState, activeBattle, certificate, attempts, blockLessons] = await Promise.all([
      milestoneStateFor(admin, row, path, learnerId),
      loadActiveBattle(admin, learnerId, row.id),
      loadCertificateFor(admin, learnerId, row.id),
      admin
        .from("milestone_battles")
        .select("id", { count: "exact", head: true })
        .eq("learner_id", learnerId)
        .eq("milestone_id", row.id),
      loadBlockLessons(admin, path.id, row.after_week_number, lang, isFinalBoss(row) ? Array.from({ length: row.after_week_number }, (_, i) => i + 1) : undefined),
    ]);

    // Preview opens drafts and locked blocks without changing the learner's tree.
    const state = certificate
      ? "passed"
      : activeBattle
        ? "in_battle"
        : engineState === "locked" && !preview
          ? "locked"
          : "available";

    const body: MilestoneIntroResponse = {
      milestone: toMilestoneSummary(row, path),
      subjectNameAr: subject?.name_ar ?? null,
      subjectNameEn: subject?.name_en ?? null,
      state,
      lockedReason: state === "locked" ? "block_incomplete" : null,
      activeBattle: activeBattle
        ? {
            battleId: activeBattle.id,
            answeredCount: activeBattle.answered_count,
            heartsLeft: heartsLeftFor(activeBattle),
            bossHpPercent: bossHpPercent(activeBattle.correct_count, activeBattle.required_correct),
          }
        : null,
      certificate: certificate ? { id: certificate.id, awardedAt: certificate.awarded_at, stars: certificate.stars } : null,
      attempts: attempts.count ?? 0,
      blockLessons,
      preview,
      kind: "milestone",
    };
    return milestoneJson(body);
  } catch (error) {
    console.error("Milestone intro failed:", error);
    return milestoneError("service_unavailable", 500);
  }
}
