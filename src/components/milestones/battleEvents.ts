import type { AnalyticsEventName, AnalyticsProperties } from "@/lib/analytics.shared";
import type { AnswerResult, BattleQuestion, BattleState, MilestoneIntroResponse, StartBattleResponse } from "@/lib/milestones/types";
import { superReady, turnOf } from "./turns";

/**
 * What the battle reports and how it reacts, as pure functions (the session
 * hook sends these events). A placement ("Meet your first boss") only ever
 * sends placement events, with no answers, correctness or scores.
 */
export interface BattleEvent {
  name: AnalyticsEventName;
  props: AnalyticsProperties;
}

/** A placement battle (or intro): no tries, no hint, neutral feedback, its own analytics. */
export function isPlacementBattle(
  battle: Pick<BattleState, "kind"> | null | undefined,
  intro?: Pick<MilestoneIntroResponse, "kind" | "milestone"> | null
): boolean {
  return battle?.kind === "placement" || intro?.kind === "placement" || intro?.milestone.kind === "placement";
}

const subjectOf = (intro: MilestoneIntroResponse | null | undefined): AnalyticsProperties =>
  intro?.milestone.subjectId ? { subject_id: intro.milestone.subjectId } : {};

export function startEvents(started: StartBattleResponse, intro: MilestoneIntroResponse | null, milestoneId: string): BattleEvent[] {
  if (isPlacementBattle(started.battle, intro)) {
    return [{ name: "placement_start", props: { milestone_id: milestoneId, ...subjectOf(intro), resumed: started.resumed } }];
  }
  return [
    {
      name: "milestone_battle_start",
      props: {
        milestone_id: milestoneId,
        milestone_level: intro?.milestone.level ?? 1,
        ...subjectOf(intro),
        resumed: started.resumed,
        attempt_number: started.battle.attemptNumber,
        question_count: started.battle.questionCount,
        preview: started.battle.preview,
      },
    },
  ];
}

export interface AnswerFeedback {
  correct: boolean;
  turn: ReturnType<typeof turnOf>;
  super: boolean;
  final: boolean;
  neutral?: boolean;
}

/** Placement: the same happy reaction to every answer (shown as "right", never as right or wrong). */
export function answerFeedback(battle: BattleState, question: BattleQuestion, result: AnswerResult): AnswerFeedback {
  if (battle.kind === "placement" || result.neutral === true) {
    return { correct: true, turn: turnOf(question), super: false, final: result.finished, neutral: true };
  }
  return { correct: result.correct, turn: turnOf(question), super: result.correct && superReady(battle.combo), final: result.finished };
}

export function answerEvents(battle: BattleState, result: AnswerResult, position: number, milestoneId: string): BattleEvent[] {
  if (battle.kind === "placement" || result.neutral === true) {
    return [{ name: "placement_answer", props: { milestone_id: milestoneId, position } }];
  }
  return [
    {
      name: "milestone_answer",
      props: {
        milestone_id: milestoneId,
        attempt_number: battle.attemptNumber,
        position,
        correct: result.correct,
        hearts_left: result.heartsLeft,
        boss_hp_percent: result.bossHpPercent,
      },
    },
  ];
}

export function finishEvents(result: AnswerResult, state: BattleState, intro: MilestoneIntroResponse | null, milestoneId: string): BattleEvent[] {
  if (state.kind === "placement") {
    return [{ name: "placement_complete", props: { milestone_id: milestoneId, ...subjectOf(intro), question_count: state.questionCount } }];
  }
  const scorePercent = state.answeredCount > 0 ? Math.round((100 * state.correctCount) / state.answeredCount) : 0;
  const common: AnalyticsProperties = {
    milestone_id: milestoneId,
    milestone_level: intro?.milestone.level ?? 1,
    ...subjectOf(intro),
    attempt_number: state.attemptNumber,
    question_count: state.questionCount,
    score_percent: scorePercent,
    hearts_left: state.heartsLeft,
    preview: state.preview,
  };
  if (result.passed) {
    return [
      { name: "milestone_submit", props: { ...common, outcome: "won" } },
      { name: "milestone_victory", props: { ...common, first_pass: result.firstPass } },
      ...(result.firstPass ? [{ name: "milestone_pass" as const, props: { ...common, first_pass: true } }] : []),
    ];
  }
  return [
    { name: "milestone_submit", props: { ...common, outcome: "lost" } },
    { name: "milestone_defeat", props: common },
  ];
}

/** The Owl Hint is offered in Big Challenges only, once per battle. */
export function hintOffered(battle: Pick<BattleState, "kind" | "hintAllowed" | "hintUsed">): boolean {
  return battle.kind !== "placement" && battle.hintAllowed !== false && !battle.hintUsed;
}
