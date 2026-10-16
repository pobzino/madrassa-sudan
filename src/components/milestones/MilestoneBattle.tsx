"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { LearnerAvatar } from "@/lib/learners/types";
import type { AnswerResult, Lang } from "@/lib/milestones/types";
import { ArenaBackdrop, type PlacedAnchor } from "@/components/characters";
import AmalLoading from "@/components/AmalLoading";
import BattleScene, { useViewport, type FxEvent } from "./BattleScene";
import { MessageScreen, SoCloseScreen, VictoryScreen } from "./BattleEndScreens";
import { NeedsInternetCard } from "./BattleParts";
import type { Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY } from "./copy";
import { layoutModeFor } from "./geometry";
import { useBattleFeedback } from "./motion";
import { recallBoss } from "./prefetch";
import { useBattleSession, type EntranceKind, type Feedback, type PendingAnswer } from "./useBattleSession";

/**
 * The Big Challenge boss battle: a full-bleed arena over the dashboard, online
 * only, server-authoritative. Composition only: the session hook holds the
 * data and rules, BattleScene draws the fight, the end screens finish it.
 */
export interface MilestoneBattleProps {
  milestoneId: string;
  lang: Lang;
  fetcher: Fetcher;
  isOnline: boolean;
  learner: { name: string; avatar: LearnerAvatar | null } | null;
}

const noSubscribe = () => () => undefined;

export default function MilestoneBattle({ milestoneId, lang, fetcher, isOnline, learner }: MilestoneBattleProps) {
  const t = MILESTONE_COPY[lang];
  const viewport = useViewport();
  const mode = layoutModeFor(viewport.width, viewport.height);
  // A landscape screen too small for the desktop layout gets a phone-shaped stage.
  const staged = mode === "phone" && viewport.width > viewport.height;
  // The boss we're about to fight, remembered from the path or the intro, for the loading line.
  const rememberedBoss = useSyncExternalStore(noSubscribe, () => recallBoss(milestoneId), () => null);
  const sounds = useBattleFeedback();
  const [entrance, setEntrance] = useState<EntranceKind | null>(null);
  const [fxEvent, setFxEvent] = useState<FxEvent | null>(null);
  const [bigConfetti, setBigConfetti] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<number | null>(null);
  const advanceRef = useRef<() => void>(() => undefined);

  const onAnswered = useCallback(
    (result: AnswerResult, feedback: Feedback, pending: PendingAnswer) => {
      setFxEvent({ key: Date.now(), result, feedback, origin: pending.origin });
      const big = feedback.super || (result.finished && result.passed);
      if (result.correct) {
        sounds.right(big);
        // A right answer carries straight on once the hit has landed.
        if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
        advanceTimer.current = window.setTimeout(() => advanceRef.current(), result.finished ? 1600 : 1300);
      } else {
        sounds.wrong();
      }
    },
    [sounds]
  );
  const onFinished = useCallback(
    (result: AnswerResult) => {
      setFxEvent(null);
      if (result.passed) {
        sounds.celebrate();
        setBigConfetti((n) => n + 1);
      }
    },
    [sounds]
  );

  const session = useBattleSession({ milestoneId, lang, fetcher, onEntrance: setEntrance, onAnswered, onFinished });
  useEffect(() => {
    advanceRef.current = () => {
      advanceTimer.current = null;
      setFxEvent(null);
      session.advance();
    };
  }, [session]);
  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    },
    []
  );

  const { screen, intro, battle, question } = session;
  const bossKey = intro?.milestone.bossKey ?? rememberedBoss ?? "puzzle_owlet";
  const level = intro?.milestone.level ?? 1;
  const powered = screen === "play" && battle?.phase === 2;
  const fontStyle: CSSProperties = {
    fontFamily: lang === "ar" ? "var(--font-cairo), var(--font-fredoka), sans-serif" : "var(--font-fredoka), system-ui, sans-serif",
  };

  // The arena fills the screen; the battle stands its cast on the arena's
  // anchors (px), every other screen sits in a centred column on top.
  const shell = (content: ReactNode | ((anchors: { boss: PlacedAnchor; owl: PlacedAnchor }) => ReactNode), dim = false) => (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      translate="no"
      className="notranslate fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-[radial-gradient(ellipse_at_center,#0B4A26,#04200F)] text-white"
      style={fontStyle}
    >
      {/* Phones and tablets in portrait fill the screen with the portrait arena;
          desktops get the landscape arena and their own layout; a small
          landscape screen gets a phone-shaped stage, centred. */}
      <div
        className={`relative mx-auto h-full overflow-hidden ${staged ? "shadow-[0_0_60px_rgba(0,0,0,0.45)]" : ""}`}
        style={{ width: staged ? "min(100vw, calc(100dvh * 0.62))" : "100%" }}
      >
      <ArenaBackdrop bossKey={bossKey} orientation={mode === "desktop" ? "landscape" : "portrait"}>
        {(anchors) => (
          <>
            {/* phase 2: the arena warms as the boss powers up */}
            {powered && <div className="pointer-events-none absolute inset-0 bg-[#D21034]/15" aria-hidden="true" />}
            {dim && <div className="absolute inset-0 bg-[#1a1a1a]/35" aria-hidden="true" />}
            <div ref={shellRef} className="absolute inset-0">
              {typeof content === "function" ? (
                content(anchors)
              ) : (
                <div
                  className="relative mx-auto h-full w-full max-w-[480px]"
                  style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
                >
                  {content}
                </div>
              )}
            </div>
          </>
        )}
      </ArenaBackdrop>
      </div>
    </div>
  );

  if (screen === "loading" || (screen === "play" && (!question || !battle))) {
    if (!isOnline) return shell(<div className="flex h-full items-center justify-center px-5"><NeedsInternetCard lang={lang} bossLabel={bossName(bossKey, lang, true)} /></div>, true);
    // The normal Amal loader (rarely seen: Play on the intro already started the battle).
    return (
      <AmalLoading
        fullScreen
        dir={lang === "ar" ? "rtl" : "ltr"}
        message={intro || rememberedBoss ? t.gettingReady(bossName(bossKey, lang, true)) : t.loading}
      />
    );
  }

  if (screen === "error" && !isOnline) {
    return shell(<div className="flex h-full items-center justify-center px-5"><NeedsInternetCard lang={lang} bossLabel={bossName(bossKey, lang, true)} /></div>, true);
  }

  if (screen === "locked" || screen === "not_found" || screen === "abandoned" || screen === "error") {
    const title =
      screen === "locked"
        ? session.lockedMessage ?? t.lockedTitle(formatNumber(intro?.milestone.firstWeekNumber ?? 1, lang), formatNumber(intro?.milestone.afterWeekNumber ?? 4, lang))
        : screen === "not_found"
          ? t.notFound
          : screen === "abandoned"
            ? t.gameReset
            : t.somethingWrong;
    const action =
      screen === "abandoned"
        ? { label: t.startFresh, onClick: () => void session.playAgain(), disabled: session.restarting }
        : screen === "error"
          ? { label: t.retry, onClick: () => void session.reload() }
          : null;
    return shell(<MessageScreen lang={lang} bossKey={bossKey} level={level} title={title} action={action} />, true);
  }

  if (screen === "won") {
    return shell(
      <VictoryScreen
        lang={lang}
        bossKey={bossKey}
        level={level}
        burst={bigConfetti}
        stars={session.final?.stars ?? intro?.certificate?.stars ?? null}
        certificateId={session.final?.certificateId ?? battle?.certificateId ?? intro?.certificate?.id ?? null}
        firstPass={session.final?.firstPass ?? false}
        preview={battle?.preview ?? false}
        learner={learner}
      />,
      true
    );
  }

  if (screen === "lost") {
    return shell(
      <SoCloseScreen
        lang={lang}
        bossKey={bossKey}
        level={level}
        blockLessons={intro?.blockLessons ?? []}
        isOnline={isOnline}
        restarting={session.restarting}
        onPlayAgain={() => void session.playAgain()}
      />,
      true
    );
  }

  if (!question || !battle) return null;
  return shell((anchors) => (
    <BattleScene
      anchors={anchors}
      milestoneId={milestoneId}
      lang={lang}
      bossKey={bossKey}
      level={level}
      battle={battle}
      question={question}
      feedback={session.feedback}
      pending={session.pending}
      inFlight={session.inFlight}
      isOnline={isOnline}
      netError={session.netError}
      hint={session.hint}
      hintLoading={session.hintLoading}
      fxEvent={fxEvent}
      entrance={entrance}
      muted={sounds.muted}
      fetcher={fetcher}
      shellRef={shellRef}
      onEntranceEnd={() => setEntrance(null)}
      onSubmit={session.submit}
      onAskOwl={() => void session.askOwl()}
      onRetry={session.retry}
      onNext={() => advanceRef.current()}
    />
  ));
}
