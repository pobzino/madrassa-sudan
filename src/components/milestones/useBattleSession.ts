"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { AnswerResult, BattleQuestion, BattleState, BattleTurn, Lang, MilestoneIntroResponse, OwlHint, StartBattleResponse } from "@/lib/milestones/types";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { MilestoneApiError, MilestoneNetworkError, milestoneApi, type Fetcher } from "./api";
import { answerRequestFor } from "./moves/contract";
import { superReady, turnOf } from "./turns";
import { loadIntro, takeEarlyStart } from "./prefetch";

/**
 * The battle's data and rules, with no drawing: load or resume, start a new
 * attempt, send answers (idempotent retries), the Owl hint, and analytics.
 * The server decides everything; this only mirrors what it says.
 */
export type Screen = "loading" | "play" | "won" | "lost" | "abandoned" | "locked" | "not_found" | "error";
export type EntranceKind = "first" | "rematch" | "resume";

export interface Feedback {
  correct: boolean;
  turn: BattleTurn;
  /** A Super Star hit (the streak had charged it). */
  super: boolean;
  /** This answer ended the battle. */
  final: boolean;
}

export interface PendingAnswer {
  position: number;
  answer: InteractionAnswer;
  /** Where the move launched from (an orb, a button), for the effects. */
  origin: DOMRect | null;
}

function applyResult(battle: BattleState, result: AnswerResult): BattleState {
  return {
    ...battle,
    correctCount: battle.correctCount + (result.correct ? 1 : 0),
    wrongCount: battle.wrongCount + (result.correct ? 0 : 1),
    answeredCount: battle.answeredCount + 1,
    heartsLeft: result.heartsLeft,
    bossHpPercent: result.bossHpPercent,
    status: result.finished ? (result.passed ? "won" : "lost") : "active",
    certificateId: result.certificateId ?? battle.certificateId,
    combo: result.combo,
    phase: result.phase,
    hint: null,
  };
}

export function useBattleSession({
  milestoneId,
  lang,
  fetcher: fetcherProp,
  onEntrance,
  onAnswered,
  onFinished,
}: {
  milestoneId: string;
  lang: Lang;
  fetcher: Fetcher;
  /** A battle is about to be shown: play its entrance. */
  onEntrance: (kind: EntranceKind) => void;
  /** An answer came back (before the effects). */
  onAnswered: (result: AnswerResult, feedback: Feedback, pending: PendingAnswer) => void;
  /** The battle ended and its end screen is showing. */
  onFinished: (result: AnswerResult) => void;
}) {
  // Calls always use the latest fetcher and callbacks without re-running the load.
  const fetcherRef = useRef(fetcherProp);
  const callbacks = useRef({ onEntrance, onAnswered, onFinished });
  useEffect(() => {
    fetcherRef.current = fetcherProp;
    callbacks.current = { onEntrance, onAnswered, onFinished };
  });
  const fetcher = useCallback<Fetcher>((input, init) => fetcherRef.current(input, init), []);

  const [screen, setScreen] = useState<Screen>("loading");
  const [intro, setIntro] = useState<MilestoneIntroResponse | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [question, setQuestion] = useState<BattleQuestion | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [netError, setNetError] = useState(false);
  const [final, setFinal] = useState<AnswerResult | null>(null);
  const [hint, setHint] = useState<OwlHint | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const resultRef = useRef<AnswerResult | null>(null);

  const analyticsBase = useMemo(
    () => ({
      milestone_id: milestoneId,
      milestone_level: intro?.milestone.level ?? 1,
      ...(intro?.milestone.subjectId ? { subject_id: intro.milestone.subjectId } : {}),
    }),
    [intro?.milestone.level, intro?.milestone.subjectId, milestoneId]
  );

  const enterBattle = useCallback((state: BattleState) => {
    setBattle(state);
    setQuestion(state.question);
    setFeedback(null);
    setPending(null);
    setNetError(false);
    setHint(state.hint);
    if (state.status === "active") setScreen("play");
    else if (state.status === "won") setScreen("won");
    else if (state.status === "lost") setScreen("lost");
    else setScreen("abandoned");
  }, []);

  const applyStart = useCallback(
    (started: StartBattleResponse, introData: MilestoneIntroResponse | null) => {
      trackAnalyticsEvent("milestone_battle_start", {
        milestone_id: milestoneId,
        milestone_level: introData?.milestone.level ?? 1,
        ...(introData?.milestone.subjectId ? { subject_id: introData.milestone.subjectId } : {}),
        resumed: started.resumed,
        attempt_number: started.battle.attemptNumber,
        question_count: started.battle.questionCount,
        preview: started.battle.preview,
      });
      setFinal(null);
      enterBattle(started.battle);
      if (started.battle.status === "active") {
        callbacks.current.onEntrance(started.resumed ? "resume" : started.battle.attemptNumber > 1 ? "rematch" : "first");
      }
    },
    [enterBattle, milestoneId]
  );

  const start = useCallback(
    async (introData: MilestoneIntroResponse | null) => {
      applyStart(await milestoneApi.startBattle(fetcher, milestoneId, lang), introData);
    },
    [applyStart, fetcher, lang, milestoneId]
  );

  const handleLoadError = useCallback((error: unknown) => {
    if (error instanceof MilestoneApiError && error.code === "milestone_locked") {
      setLockedMessage(error.serverMessage);
      setScreen("locked");
    }
    else if (error instanceof MilestoneApiError && error.status === 404) setScreen("not_found");
    else setScreen("error");
  }, []);

  // Load the challenge and resume (or start) the battle. Re-runs when the
  // language changes so the question comes back localized.
  const load = useCallback(async () => {
    setScreen((current) => (current === "won" || current === "lost" ? current : "loading"));
    try {
      // Pressing Play on the intro already started (or resumed) the battle.
      const early = takeEarlyStart(milestoneId);
      if (early) {
        const [introData, started] = await Promise.all([loadIntro(fetcher, milestoneId, lang), early.catch(() => null)]);
        setIntro(introData);
        if (started) {
          applyStart(started, introData);
          return;
        }
      }
      const [introData, current] = await Promise.all([
        loadIntro(fetcher, milestoneId, lang),
        milestoneApi.getBattle(fetcher, milestoneId, lang),
      ]);
      setIntro(introData);
      if (current.battle) {
        enterBattle(current.battle);
        if (current.battle.status === "active") callbacks.current.onEntrance("resume");
        return;
      }
      if (introData.state === "locked" && !introData.preview) {
        setScreen("locked");
        return;
      }
      await start(introData);
    } catch (error) {
      handleLoadError(error);
    }
  }, [applyStart, enterBattle, fetcher, handleLoadError, lang, milestoneId, start]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const finish = useCallback(
    (result: AnswerResult, state: BattleState) => {
      const scorePercent = state.answeredCount > 0 ? Math.round((100 * state.correctCount) / state.answeredCount) : 0;
      const common = {
        ...analyticsBase,
        attempt_number: state.attemptNumber,
        question_count: state.questionCount,
        score_percent: scorePercent,
        hearts_left: state.heartsLeft,
        preview: state.preview,
      };
      setFinal(result);
      if (result.passed) {
        trackAnalyticsEvent("milestone_submit", { ...common, outcome: "won" });
        trackAnalyticsEvent("milestone_victory", { ...common, first_pass: result.firstPass });
        if (result.firstPass) trackAnalyticsEvent("milestone_pass", { ...common, first_pass: true });
        setScreen("won");
      } else {
        trackAnalyticsEvent("milestone_submit", { ...common, outcome: "lost" });
        trackAnalyticsEvent("milestone_defeat", common);
        setScreen("lost");
      }
      callbacks.current.onFinished(result);
    },
    [analyticsBase]
  );

  /** On to the next question, or the end screen. */
  const advance = useCallback(() => {
    const result = resultRef.current;
    resultRef.current = null;
    if (!result || !battle) return;
    setFeedback(null);
    setPending(null);
    setHint(null);
    if (result.finished) {
      finish(result, battle);
      return;
    }
    setQuestion(result.next);
    setBattle({ ...battle, question: result.next });
  }, [battle, finish]);

  const send = useCallback(
    async (answer: PendingAnswer) => {
      if (!battle || !question) return;
      setPending(answer);
      setInFlight(true);
      setNetError(false);
      try {
        const result = await milestoneApi.answer(fetcher, battle.battleId, answerRequestFor(question, answer.answer), lang);
        setInFlight(false);
        const nextFeedback: Feedback = {
          correct: result.correct,
          turn: turnOf(question),
          super: result.correct && superReady(battle.combo),
          final: result.finished,
        };
        setBattle(applyResult(battle, result));
        resultRef.current = result;
        trackAnalyticsEvent("milestone_answer", {
          milestone_id: milestoneId,
          attempt_number: battle.attemptNumber,
          position: answer.position,
          correct: result.correct,
          hearts_left: result.heartsLeft,
          boss_hp_percent: result.bossHpPercent,
        });
        setFeedback(nextFeedback);
        callbacks.current.onAnswered(result, nextFeedback, answer);
      } catch (error) {
        setInFlight(false);
        if (error instanceof MilestoneNetworkError) {
          // Keep the chosen answer; re-sending the same position is idempotent.
          setNetError(true);
          return;
        }
        if (error instanceof MilestoneApiError && error.battle) {
          // The server knows better (another tab, a replayed request): resync.
          enterBattle(error.battle);
          return;
        }
        if (error instanceof MilestoneApiError && error.status === 404) {
          setScreen("not_found");
          return;
        }
        if (error instanceof MilestoneApiError && error.code === "battle_finished") {
          setScreen("abandoned");
          return;
        }
        setPending(null);
      }
    },
    [battle, enterBattle, fetcher, lang, milestoneId, question]
  );

  const submit = useCallback(
    (answer: InteractionAnswer, origin: DOMRect | null) => {
      if (!question || inFlight || feedback || pending) return;
      void send({ position: question.position, answer, origin });
    },
    [feedback, inFlight, pending, question, send]
  );

  const retry = useCallback(() => {
    if (pending && !inFlight) void send(pending);
  }, [inFlight, pending, send]);

  const askOwl = useCallback(async () => {
    if (!battle || !question || battle.hintUsed || hintLoading || inFlight || feedback || pending) return;
    setHintLoading(true);
    try {
      const response = await milestoneApi.hint(fetcher, milestoneId, question.position, lang);
      setHint({ hideOptionIds: response.hideOptionIds ?? [], lockedPlacement: response.lockedPlacement ?? null });
      setBattle({ ...battle, hintUsed: true });
    } catch (error) {
      if (error instanceof MilestoneNetworkError) setNetError(true);
      else if (error instanceof MilestoneApiError && error.code === "hint_used") setBattle({ ...battle, hintUsed: true });
    } finally {
      setHintLoading(false);
    }
  }, [battle, feedback, fetcher, hintLoading, inFlight, lang, milestoneId, pending, question]);

  const playAgain = useCallback(async () => {
    setRestarting(true);
    try {
      await start(intro);
    } catch (error) {
      handleLoadError(error);
    } finally {
      setRestarting(false);
    }
  }, [handleLoadError, intro, start]);

  return {
    screen,
    intro,
    battle,
    question,
    feedback,
    pending,
    inFlight,
    netError,
    final,
    hint,
    hintLoading,
    restarting,
    lockedMessage,
    submit,
    retry,
    askOwl,
    advance,
    playAgain,
    reload: load,
  };
}
