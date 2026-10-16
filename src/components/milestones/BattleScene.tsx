"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { OwlHead } from "@/components/illustrations";
import {
  BossCharacter,
  OwlCharacter,
  type BossHandle,
  type CharacterCue,
  type OwlHandle,
  type OwlPose,
  type PlacedAnchor,
  type Pose,
} from "@/components/characters";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { AnswerResult, BattleQuestion, BattleState, BossKey, Lang, MilestoneIntroResponse, OwlHint } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { MathText, OwlShieldIcon, Projectile, ReadAloudButton, WifiOffIcon } from "./BattleParts";
import { milestoneApi, type Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { play, prefersReducedMotion } from "./motion";
import BattleMove, { moveOwnsPrompt } from "./moves/BattleMove";
import { hintFits, promptOf } from "./moves/contract";
import { BOSS_TAUNTS, REMATCH_TAUNT, RESUME_TAUNT, SKIN_PARTS, signatureFor } from "./signatures";
import { superReady, turnOf } from "./turns";
import type { EntranceKind, Feedback, PendingAnswer } from "./useBattleSession";
import { battleGeometry, layoutModeFor, type BattleLayoutMode } from "./geometry";
import { clearFx } from "./moves/fx";
import { Combat, type CombatSizes } from "./combat";

export interface FxEvent {
  key: number;
  result: AnswerResult;
  feedback: Feedback;
  origin: DOMRect | null;
}

/** quiet -> the ground shakes -> the boss lands (THUD, dust, name banner) -> its taunt. */
type EntranceStep = 0 | 1 | 2 | 3;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

/** A character's visible art inside its box, as a style. */
const artBox = (a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number }) => ({ left: a.left - b.left, top: a.top - b.top, width: a.right - a.left, height: a.bottom - a.top });

/** Translucent dark-green panels for the HUD. */
const GLASS = "bg-[#052814]/70 ring-1 ring-white/15 backdrop-blur-sm shadow-[0_4px_0_rgba(0,0,0,0.25)]";


/** The viewport, kept current on resize and rotation. */
function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`;
export function useViewport() {
  const key = useSyncExternalStore(subscribeViewport, viewportKey, () => "375x812");
  const [w, h] = key.split("x").map(Number);
  return { width: w, height: h };
}

/** The layout for the current screen: the phone layout, or the real desktop layout. */
export function useLayoutMode(): BattleLayoutMode {
  const { width, height } = useViewport();
  return layoutModeFor(width, height);
}

/**
 * Waits for a character cue (projectile release, impact, shield up), or a
 * fallback time if the cue never comes (reduced motion crossfades, say).
 */
function useCues() {
  const waiting = useRef(new Map<CharacterCue, Array<() => void>>());
  const onCue = useCallback((cue: CharacterCue) => {
    const list = waiting.current.get(cue) ?? [];
    waiting.current.delete(cue);
    list.forEach((resolve) => resolve());
  }, []);
  const waitFor = useCallback(
    (cue: CharacterCue, fallbackMs: number) =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        waiting.current.set(cue, [...(waiting.current.get(cue) ?? []), finish]);
        window.setTimeout(finish, fallbackMs);
      }),
    []
  );
  return { onCue, waitFor };
}

interface BattleSceneProps {
  anchors: { boss: PlacedAnchor; owl: PlacedAnchor };
  milestoneId: string;
  lang: Lang;
  bossKey: BossKey;
  level: number;
  battle: BattleState;
  question: BattleQuestion;
  feedback: Feedback | null;
  pending: PendingAnswer | null;
  inFlight: boolean;
  isOnline: boolean;
  netError: boolean;
  hint: OwlHint | null;
  hintLoading: boolean;
  fxEvent: FxEvent | null;
  entrance: EntranceKind | null;
  muted: boolean;
  onToggleMute: () => void;
  /** The block's lessons: the entrance offers "Practise these lessons". */
  blockLessons: MilestoneIntroResponse["blockLessons"];
  fetcher: Fetcher;
  onEntranceEnd: () => void;
  onSubmit: (answer: InteractionAnswer, origin: DOMRect | null) => void;
  onAskOwl: () => void;
  onRetry: () => void;
  onNext: () => void;
}

export default function BattleScene(props: BattleSceneProps) {
  const { anchors, lang, bossKey, battle, question, feedback, pending, inFlight, isOnline, netError, hint, hintLoading, fxEvent, entrance, muted, fetcher } = props;
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  const turn = turnOf(question);
  const interaction = question.interaction;
  const prompt = promptOf(question, lang);
  const powered = battle.phase === 2;
  const signature = signatureFor(bossKey, interaction.type, turn);

  // The layout for this screen (phone or desktop) and the question's length.
  const { width, height } = useViewport();
  const geometry = battleGeometry({ width, height, anchors, prompt: moveOwnsPrompt(interaction) ? "" : prompt, lang });
  const desktop = geometry.mode === "landscape";
  const ui = geometry.ui;
  const hudBottom = geometry.hud.bottom;
  const { bossSize, owlSize, bandHeight, moveScale } = geometry;
  const bossLeft = geometry.boss.left;
  const bossTop = geometry.boss.top;
  const owlLeft = geometry.owl.left;
  const owlTop = geometry.owl.top;

  const arenaRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const bossBoxRef = useRef<HTMLDivElement>(null);
  const bossRigRef = useRef<HTMLDivElement>(null);
  const owlBoxRef = useRef<HTMLDivElement>(null);
  const shieldsRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<BossHandle>(null);
  const owlRef = useRef<OwlHandle>(null);
  const projectileRef = useRef<HTMLDivElement>(null);
  const hpBarRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const thudRef = useRef<HTMLDivElement>(null);
  const bossCues = useCues();
  const owlCues = useCues();
  const [knockedOut, setKnockedOut] = useState(false);
  const [flash, setFlash] = useState<{ key: number; text: string; grumpy: boolean } | null>(null);
  const [step, setStep] = useState<EntranceStep | null>(entrance ? (entrance === "resume" ? 2 : 0) : null);
  /** The child has confirmed this turn's move (it's in flight). */
  const [launched, setLaunched] = useState(false);
  /** The move's outcome has played out (only then does a miss offer "Next"). */
  const [settled, setSettled] = useState(false);
  // Signature effects fly in a layer of their own: clear it when the battle closes.
  useEffect(() => () => clearFx(), []);
  const previousPhase = useRef(battle.phase);

  // The entrance THUD shakes the characters only (never the HUD or the bubble), a small fast jitter.
  const shake = useCallback((strength: number, delay = 0) => {
    const s = Math.min(6, strength);
    let first: Animation | null = null;
    for (const el of [bossBoxRef.current, owlBoxRef.current, shieldsRef.current]) {
      const a = play(el, [
        { transform: "translate(0, 0)" },
        { transform: `translate(${-s}px, ${s * 0.4}px)` },
        { transform: `translate(${s * 0.75}px, ${-s * 0.3}px)` },
        { transform: `translate(${-s * 0.4}px, ${s * 0.2}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 170, delay, easing: "linear", composite: "add" });
      first ??= a;
    }
    return first;
  }, []);

  // ------------------------------------------------------------ entrance
  useEffect(() => {
    if (!entrance) return;
    const reduce = prefersReducedMotion();
    const plan: Array<[number, EntranceStep | null]> =
      entrance === "resume" || reduce
        ? [[0, 2], [reduce ? 400 : 450, 3], [reduce ? 1600 : 1300, null]]
        : [[0, 0], [450, 1], [1000, 2], [2050, 3], [3100, null]];
    const timers = plan.map(([at, next]) => window.setTimeout(() => (next === null ? props.onEntranceEnd() : setStep(next)), at));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrance]);

  const activeStep = entrance ? step : null;
  const taunt = activeStep === 3 ? (entrance === "rematch" ? REMATCH_TAUNT : entrance === "resume" ? RESUME_TAUNT : BOSS_TAUNTS[bossKey])[lang] : null;

  useEffect(() => {
    if (activeStep === null || !entrance) return;
    const animations: Array<Animation | null> = [];
    let cancelled = false;
    if (activeStep === 1) animations.push(shake(4));
    if (activeStep === 2 && entrance !== "resume") {
      void bossCues.waitFor("land", 700).then(() => {
        if (cancelled || prefersReducedMotion()) return;
        animations.push(shake(7));
        animations.push(
          play(thudRef.current, [
            { transform: "translate(-50%, -50%) scale(0.3) rotate(-8deg)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15) rotate(-8deg)", opacity: 1, offset: 0.3 },
            { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 1, offset: 0.75 },
            { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 0 },
          ], { duration: 950, easing: "ease-out", fill: "both" })
        );
        Array.from(arenaRef.current?.querySelectorAll("[data-dust]") ?? []).forEach((puff, i) =>
          animations.push(
            play(puff, [
              { transform: "translate(0, 0) scale(0.3)", opacity: 0 },
              { transform: `translate(${(i % 2 ? 1 : -1) * (24 + i * 10)}px, -10px) scale(1.2)`, opacity: 0.95, offset: 0.4 },
              { transform: `translate(${(i % 2 ? 1 : -1) * (40 + i * 14)}px, -22px) scale(1.5)`, opacity: 0 },
            ], { duration: 900, easing: "ease-out", fill: "both" })
          )
        );
        animations.push(
          play(bannerRef.current, [
            { transform: "translateX(-110%) skewY(-6deg)" },
            { transform: "translateX(4%) skewY(-6deg)", offset: 0.7 },
            { transform: "translateX(0) skewY(-6deg)" },
          ], { duration: 500, easing: "ease-out", fill: "backwards" })
        );
      });
    }
    if (activeStep === 3 && taunt) {
      const ms = Math.min(4000, Math.max(1200, taunt.length * 60));
      void bossRef.current?.play("talk", { durationMs: ms });
      if (!muted) speakLine(taunt, lang);
    }
    return () => {
      cancelled = true;
      animations.forEach((a) => a?.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, entrance]);

  // ------------------------------------------------------------ turn flash
  const turnKey = !entrance ? `${question.questionId}:${question.position}` : null;
  useEffect(() => {
    if (!turnKey) return;
    const grumpy = battle.phase === 2 && previousPhase.current === 1;
    previousPhase.current = battle.phase;
    const id = window.setTimeout(() => {
      setLaunched(false);
      setSettled(false);
      setHeld(null);
      setFlash({ key: Date.now(), text: signature ? signature.name[lang] : turn === "attack" ? t.turnAttack : t.turnBlock, grumpy });
      if (grumpy) void bossRef.current?.play("powered");
    }, 0);
    return () => window.clearTimeout(id);
    // Only when the turn changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);
  useLayoutEffect(() => {
    if (!flash) return;
    const duration = flash.grumpy ? 1400 : 800;
    const animation = prefersReducedMotion()
      ? null
      : flashRef.current?.animate(
          [
            { scale: "0.6", opacity: 0 },
            { scale: "1.1", opacity: 1, offset: 0.25 },
            { scale: "1", opacity: 1, offset: 0.7 },
            { scale: "1", opacity: 0 },
          ],
          { duration, easing: "ease-out", fill: "forwards" }
        );
    const clear = () => setFlash(null);
    if (animation) {
      animation.onfinish = clear;
      return () => animation.cancel();
    }
    const id = window.setTimeout(clear, duration);
    return () => window.clearTimeout(id);
  }, [flash]);

  // --------------------------------------------------------- the effects
  // One fixed, fast timeline per move (see combat.ts): wind-up, flight, and
  // contact, resolved by the server's answer without ever freezing.
  const combat = useRef<Combat | null>(null);
  const sizes = useRef<CombatSizes>({ owlSize, bossSize, desktop });
  useEffect(() => {
    sizes.current = { owlSize, bossSize, desktop };
  }, [owlSize, bossSize, desktop]);
  useEffect(() => {
    const engine = new Combat(
      {
        arena: () => arenaRef.current,
        owlBox: () => owlBoxRef.current,
        bossBox: () => bossBoxRef.current,
        owl: () => owlRef.current,
        boss: () => bossRef.current,
        shakeTargets: () => [bossBoxRef.current, owlBoxRef.current, shieldsRef.current].filter((el): el is HTMLDivElement => Boolean(el)),
        bossRig: () => bossRigRef.current,
        hpBar: () => hpBarRef.current,
        bossProjectile: () => projectileRef.current,
      },
      () => sizes.current
    );
    combat.current = engine;
    return () => engine.dispose();
  }, []);

  // The boss's HP (and hits to go) stay as they were until the hit lands.
  const [held, setHeld] = useState<{ hp: number; correct: number } | null>(null);
  const hpBefore = useRef(battle.bossHpPercent);

  // 1. The instant the child confirms: wind up and throw.
  const submit = (answer: InteractionAnswer, origin: DOMRect | null) => {
    hpBefore.current = battle.bossHpPercent;
    // The dodge roll is the owl's wind-up on attack turns.
    const dodge = interaction.type === "true_false" && turn === "attack";
    combat.current?.start(turn, {
      windupMs: dodge ? 220 : 130,
      skipOwlWindup: dodge,
      effort: t.effort,
      onImpact: () => setHeld(null),
      onSettled: () => setSettled(true),
    });
    // The answer leaves now; React's re-render waits its turn so the throw's first frames aren't held up.
    startTransition(() => {
      props.onSubmit(answer, origin);
      setLaunched(true);
      setHeld({ hp: battle.bossHpPercent, correct: battle.correctCount });
    });
  };

  // If the answer never left (no connection), the throw fizzles out.
  useEffect(() => {
    if (!netError) return;
    combat.current?.abort();
    const id = window.setTimeout(() => setHeld(null), 0);
    return () => window.clearTimeout(id);
  }, [netError]);

  // 2. The server's answer resolves it, the moment it arrives.
  useEffect(() => {
    if (!fxEvent) return;
    const { feedback: fb, result } = fxEvent;
    const knockout = result.finished && result.passed;
    const big = fb.super || knockout;
    combat.current?.resolve(fb.turn, {
      correct: fb.correct,
      big,
      knockout,
      hpFrom: hpBefore.current,
      hpTo: result.bossHpPercent,
      text: knockout ? t.burstKo : fb.turn === "attack" ? (fb.super ? t.burstSuper : t.burstPow) : t.burstBlocked,
      missText: fb.turn === "attack" ? t.nearly : t.burstBonk,
    });
    const timers: number[] = [];
    if (!fb.correct) timers.push(window.setTimeout(() => setHeld(null), 0));
    if (knockout) timers.push(window.setTimeout(() => setKnockedOut(true), 650));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // Once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxEvent]);

  // ------------------------------------------------------------------ view
  const inEntrance = Boolean(entrance);
  const bossMounted = !inEntrance || (step ?? 0) >= 2;
  const bossPose: Pose = inEntrance
    ? activeStep === 3
      ? "taunt"
      : "idle"
    : knockedOut
      ? "ko"
      : feedback && !feedback.correct
        ? "taunt"
        : !feedback && turn === "block"
          ? "windup"
          : powered
            ? "powered"
            : "idle";
  const owlPose: OwlPose = feedback ? (feedback.correct ? "cheer" : "wrong") : turn === "block" ? "block" : "idle";
  const playersTurn = !feedback && !inEntrance && !launched;
  const busy = inFlight || feedback !== null || !isOnline || inEntrance;
  const canHint = !battle.hintUsed && !feedback && !inEntrance && hintFits(interaction);
  // The boss holds its projectile until the throw (the throw takes a copy of it).
  const showProjectile = turn === "block" && !inEntrance && (!feedback || launched);
  const comboLit = battle.combo > 0 ? (superReady(battle.combo) ? 3 : battle.combo % 3) : 0;
  const hpShown = held?.hp ?? battle.bossHpPercent;
  const hitsToGo = Math.max(0, battle.requiredCorrect - (held?.correct ?? battle.correctCount));
  const contentDir = question.contentLanguage === "ar" ? "rtl" : question.contentLanguage === "en" ? "ltr" : undefined;
  const fullName = BOSS_NAMES[bossKey][lang];
  const subtitle = fullName.startsWith(boss) ? fullName.slice(boss.length).trim() : "";
  // Impact words pop at the contact point (combat.ts); only the powered-up grumble is said here.
  const bossLine = !feedback && flash?.grumpy ? t.grumpy : null;
  const showPrompt = !feedback && !inEntrance && !moveOwnsPrompt(interaction);
  const talk = (ms: number) => void bossRef.current?.play("talk", { durationMs: ms });
  const speaker = (
    <ReadAloudButton
      cacheKey={`${battle.battleId}:${question.position}:${lang}`}
      initialUrl={question.audioUrl}
      requestUrl={() => milestoneApi.audio(fetcher, battle.battleId, question.position, lang)}
      speechText={[prompt, question.content].filter(Boolean).join(". ")}
      lang={lang}
      size="sm"
      onSpeak={talk}
    />
  );
  const { bubble } = geometry;
  // HUD type: readable on a small phone, never giant on a big screen.
  const hudFont = Math.round(Math.min(30, Math.max(18, 20 * (desktop ? ui * 1.05 : Math.min(1.3, Math.max(1, ui))))));
  const flashTop = geometry.move.top + bandHeight * moveScale * 0.4;

  const healthBar = (
    <div ref={hpBarRef} className="mt-1 overflow-hidden rounded-full bg-black/40" style={{ height: Math.round(hudFont * 0.7) }} role="progressbar" aria-label={t.power(boss)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpShown}>
      <div
        className="h-full rounded-full transition-[width] duration-150 ease-out"
        style={{
          width: `${hpShown}%`,
          background: powered ? "linear-gradient(180deg,#FB7185,#D21034 60%,#F59E0B)" : "linear-gradient(180deg,#F05A73,#D21034 60%,#A01028)",
        }}
      />
    </div>
  );
  const bossPanelInner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold uppercase leading-tight tracking-wide" style={{ fontSize: hudFont }}>{boss}</span>
        <span className="shrink-0 rounded-full bg-[#0B4A26] px-2.5 py-0.5 font-bold leading-tight text-[#D1FAE5]" style={{ fontSize: Math.round(hudFont * 0.7) }}>{t.hitsToGo(formatNumber(hitsToGo, lang))}</span>
      </div>
      {healthBar}
    </>
  );

  return (
    <div ref={arenaRef} className="absolute inset-0">
      {/* HUD: the close button, and the boss's name and health (top row on portrait screens, above the boss on landscape ones). */}
      <Link
        href="/lessons"
        aria-label={t.exit}
        title={t.exit}
        className={`absolute z-10 grid place-items-center rounded-full text-white ${GLASS}`}
        style={{ left: geometry.close.left, top: geometry.close.top, width: geometry.close.right - geometry.close.left, height: geometry.close.bottom - geometry.close.top }}
      >
        <X style={{ width: hudFont * 1.4, height: hudFont * 1.4 }} strokeWidth={3.2} aria-hidden="true" />
      </Link>
      <div
        data-layout="hud"
        className={`absolute z-10 flex flex-col justify-center rounded-[22px] px-4 ${GLASS}`}
        style={{ left: geometry.hud.left, top: geometry.hud.top, width: geometry.hud.right - geometry.hud.left, height: geometry.hud.bottom - geometry.hud.top }}
      >
        {bossPanelInner}
      </div>

      {/* The boss on its ledge */}
      <div ref={bossBoxRef} className="absolute" style={{ left: bossLeft, top: bossTop, width: bossSize, height: bossSize }}>
        <div data-layout="boss" className="pointer-events-none absolute" style={artBox(geometry.bossArt, geometry.boss)} aria-hidden="true" />
        <div ref={bossRigRef} className="absolute inset-0">
          {bossMounted && <BossCharacter ref={bossRef} bossKey={bossKey} pose={bossPose} size={bossSize} enter={inEntrance} onCue={bossCues.onCue} title={BOSS_NAMES[bossKey][lang]} />}
        </div>
        {inEntrance &&
          [0, 1, 2, 3].map((i) => (
            <span key={i} data-dust="" className="absolute bottom-[4%] h-8 w-8 rounded-full bg-[#F5E6C8] opacity-0" style={{ left: `${30 + i * 12}%` }} aria-hidden="true" />
          ))}
        {showProjectile && (
          <div ref={projectileRef} className="pointer-events-none invisible absolute -left-[6%] top-[22%]" aria-hidden="true">
            <Projectile bossKey={bossKey} big={powered} />
          </div>
        )}
        {bossLine && (
          <p className={`absolute -top-[10%] right-0 whitespace-nowrap rounded-[16px] bg-white px-3 py-1 font-bold text-[#1a1a1a] shadow-[0_3px_0_rgba(0,0,0,0.2)] motion-safe:animate-pop-in ${desktop ? "text-2xl" : "text-lg"}`}>
            {bossLine}
          </p>
        )}
      </div>

      {/* The question: always fully readable (it grows, steps its font down, and scrolls only if it truly can't fit) */}
      {(showPrompt || taunt) && (
        <div
          ref={bubbleRef}
          className="absolute z-[5]"
          style={{ left: bubble.rect.left, width: bubble.rect.right - bubble.rect.left, top: taunt && !desktop ? Math.max(bossTop + bossSize * 0.14, hudBottom + 8) : bubble.rect.top }}
        >
          <div
            data-layout="bubble"
            className="relative flex items-start gap-2 rounded-[26px] bg-[#FFF8EC] py-3 pe-2.5 ps-4 text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)] motion-safe:animate-pop-in"
            style={bubble.scroll && !taunt ? { maxHeight: bubble.height + 4 } : undefined}
          >
            {taunt ? (
              <p aria-live="polite" className={`font-bold leading-snug ${desktop ? "text-[28px]" : "text-[19px]"}`}>{taunt}</p>
            ) : (
              <>
                <div data-layout="bubble" className={`min-w-0 flex-1 self-stretch ${bubble.scroll ? "overflow-y-auto overscroll-contain pe-1 [scrollbar-color:#B45309_transparent] [scrollbar-width:thin]" : ""}`} style={bubble.scroll ? { maxHeight: bubble.height - 24 } : undefined} tabIndex={bubble.scroll ? 0 : undefined}>
                  {bubble.placement === "wide" && <div className="ms-1.5" style={{ float: "inline-end" }}>{speaker}</div>}
                  <p className="font-bold" style={{ fontSize: bubble.fontSize, lineHeight: 1.2, paddingBottom: lang === "ar" ? "0.35em" : undefined }}>
                    <MathText text={prompt} />
                  </p>
                  {question.content && (
                    <p lang={question.contentLanguage ?? undefined} dir={contentDir} className="break-words font-bold leading-tight text-[#007229] [unicode-bidi:plaintext]" style={{ fontSize: Math.round(bubble.fontSize * 1.25) }}>
                      <MathText text={question.content} />
                    </p>
                  )}
                  {question.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={question.imageUrl} alt="" className="mt-1 max-h-16 max-w-full rounded-lg object-contain" />
                  )}
                </div>
                {bubble.placement !== "wide" && <div className="shrink-0 self-center">{speaker}</div>}
              </>
            )}
          </div>
          {/* the tail points at the boss */}
            {bubble.placement === "beside" || (taunt && !desktop) ? (
              <span className="absolute -right-3 top-[38%] h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-[#FFF8EC]" aria-hidden="true" />
            ) : bubble.placement === "top" ? (
              <span
                className="absolute h-0 w-0 border-x-[13px] border-t-[22px] border-x-transparent border-t-[#FFF8EC]"
                style={{ top: "calc(100% - 1px)", left: bubble.tail?.x ?? "80%", transform: `translateX(-50%) rotate(${-(bubble.tail?.angle ?? 0)}deg)`, transformOrigin: "50% 0" }}
                aria-hidden="true"
              />
            ) : (
              <span className="absolute -top-3 right-[22%] h-0 w-0 border-x-[10px] border-b-[14px] border-x-transparent border-b-[#FFF8EC]" aria-hidden="true" />
            )}
        </div>
      )}

      {/* The owl on its platform, glowing on your turn */}
      <div ref={owlBoxRef} className="absolute z-[4]" style={{ left: owlLeft, top: owlTop, width: owlSize, height: owlSize }}>
        <div data-layout="owl" className="pointer-events-none absolute" style={artBox(geometry.owlArt, geometry.owl)} aria-hidden="true" />
        <OwlCharacter ref={owlRef} pose={owlPose} size={owlSize} glow={playersTurn} onCue={owlCues.onCue} />
      </div>

      {/* The owl's life: its shields (and the Super Star pips) in a row under its feet */}
      <div ref={shieldsRef} data-layout="shields" className={`absolute z-[7] flex -translate-x-1/2 items-center gap-1.5 ${inEntrance ? "invisible" : ""}`} style={{ left: geometry.shields.x, top: geometry.shields.top, height: geometry.shields.height }}>
        <span className={`flex gap-1 rounded-full px-2 py-1 ${GLASS}`} role="img" aria-label={`${t.shields}: ${formatNumber(battle.heartsLeft, lang)}`}>
          {Array.from({ length: battle.heartsTotal }, (_, i) => (
            <span key={i} className="block shrink-0" style={{ width: geometry.shields.icon, height: geometry.shields.icon }}>
              <OwlShieldIcon className="h-full w-full" empty={i >= battle.heartsLeft} />
            </span>
          ))}
        </span>
        {comboLit > 0 && (
          <span className={`flex gap-0.5 rounded-full px-2 py-1.5 ${GLASS}`} role="img" aria-label={superReady(battle.combo) ? t.superReady : `${t.superStar} ${formatNumber(comboLit, lang)}`}>
            {[0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 24 24" className={superReady(battle.combo) ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.9)]" : ""} style={{ width: geometry.shields.icon - 4, height: geometry.shields.icon - 4 }} aria-hidden="true">
                <path d={STAR_PATH} fill={i < comboLit ? "#F59E0B" : "none"} stroke={i < comboLit ? "#F59E0B" : "rgba(255,255,255,0.6)"} strokeWidth={1.8} strokeLinejoin="round" />
              </svg>
            ))}
          </span>
        )}
      </div>

      {/* The move: targets in the band, the action row at the bottom (bigger on desktop) */}
      <div
        className="absolute z-[6]"
        style={{
          // CSS zoom scales the element's own offsets and size too.
          left: geometry.move.left / moveScale,
          top: geometry.move.top / moveScale,
          width: (geometry.move.right - geometry.move.left) / moveScale,
          height: (geometry.move.bottom - geometry.move.top) / moveScale,
          zoom: moveScale === 1 ? undefined : moveScale,
          ...(inEntrance ? { visibility: "hidden" as const } : null),
        }}
      >
        {feedback ? (
          feedback.correct || (launched && !settled) ? null : (
            <div className="flex h-full flex-col items-center justify-end gap-3 motion-safe:animate-pop-in">
              <p className="text-center text-[24px] font-bold [text-shadow:0_2px_0_rgba(0,0,0,0.45)]">{t.nearlyLine}</p>
              <button
                type="button"
                autoFocus
                onClick={props.onNext}
                className="inline-flex h-[68px] w-full max-w-[420px] items-center justify-center rounded-full bg-[linear-gradient(180deg,#2FB25A_0%,#007229_55%,#005C22_100%)] px-6 text-[26px] font-bold text-white shadow-[0_6px_0_#00451A,inset_0_3px_0_rgba(255,255,255,0.35)] active:translate-y-1 active:shadow-none"
              >
                {feedback.final ? t.seeHowYouDid : t.next}
              </button>
            </div>
          )
        ) : (
          <BattleMove
            key={`${question.questionId}:${question.position}`}
            interaction={interaction}
            lang={lang}
            turn={turn}
            hint={hint}
            numeric={question.numericAnswer}
            disabled={busy || Boolean(pending) || launched}
            onSubmit={submit}
            seed={question.questionId}
            prompt={prompt}
            speaker={speaker}
            skin={signature ? SKIN_PARTS[signature.skin] : null}
            bandHeight={bandHeight}
            bandInset={geometry.bandInset}
            bandWidth={(geometry.move.right - geometry.move.left) / moveScale - geometry.bandInset}
            actionsHeight={geometry.actionsHeight}
            actionsInset={geometry.actionsInset}
            catchRise={desktop ? 0 : Math.max(0, geometry.move.top - hudBottom - 4) / moveScale}
            catchKey={`${hudBottom}:${inEntrance ? "entrance" : "play"}:${showPrompt ? prompt : ""}:${bossSize}:${geometry.mode}`}
            catchAvoid={() => {
              if (desktop) return [];
              // From the layout, not the painted boxes (the bubble pops in with a scale).
              const origin = arenaRef.current?.getBoundingClientRect();
              const ox = origin?.left ?? 0;
              const oy = origin?.top ?? 0;
              const r = (x: { left: number; top: number; right: number; bottom: number }) => new DOMRect(ox + x.left, oy + x.top, x.right - x.left, x.bottom - x.top);
              const sh = geometry.shields;
              return [
                r({ ...geometry.bossArt, bottom: Math.max(geometry.bossArt.bottom, geometry.move.top) }),
                r(bubble.rect),
                r({ ...geometry.owlArt, bottom: height }),
                r({ left: sh.x - sh.width / 2, top: sh.top, right: sh.x + sh.width / 2, bottom: sh.top + sh.height }),
              ];
            }}
            catchTarget={() => owlBoxRef.current?.getBoundingClientRect() ?? null}
            owlBox={() => owlBoxRef.current}
            throwFrom={() => bossBoxRef.current?.getBoundingClientRect() ?? null}
            hintButton={
              canHint ? (
                <button
                  type="button"
                  onClick={props.onAskOwl}
                  disabled={hintLoading || busy}
                  aria-label={t.owlHint}
                  title={t.owlHint}
                  className="grid h-[min(56px,calc(var(--actions,76px)-8px))] w-[min(56px,calc(var(--actions,76px)-8px))] shrink-0 place-items-center rounded-full bg-[#FFF8EC] shadow-[0_4px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
                >
                  <OwlHead className="h-9 w-9" />
                </button>
              ) : null
            }
          />
        )}
      </div>

      {/* the big turn flash (impact words pop where things hit: combat.ts) */}
      {flash && !feedback && (
        <div ref={flashRef} aria-live="polite" className="pointer-events-none absolute left-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap" style={{ top: flashTop }}>
          <span className={`font-bold leading-none [text-shadow:0_4px_0_rgba(0,0,0,0.45)] ${desktop ? "text-[84px]" : "text-[clamp(40px,7.5dvh,58px)]"} ${turn === "attack" ? "text-[#FDE68A]" : "text-white"}`}>{flash.text}</span>
        </div>
      )}

      {/* entrance: THUD and the boss's name banner across the lower third */}
      {inEntrance && entrance !== "resume" && (
        <>
          <div ref={thudRef} className="pointer-events-none absolute left-1/2 z-[9] opacity-0" style={{ top: geometry.move.top + 20 }} aria-hidden="true">
            <span className={`${desktop ? "text-[96px]" : "text-[56px]"} font-bold leading-none text-[#FDE68A] [text-shadow:0_4px_0_#7A2E00]`}>{lang === "ar" ? "دُم!" : "THUD!"}</span>
          </div>
          {(step ?? 0) >= 2 && (
            <div ref={bannerRef} className="absolute inset-x-[-6%] z-[9] bg-[#D21034] py-4 shadow-[0_8px_0_rgba(0,0,0,0.25)]" style={{ top: desktop ? Math.max(bubble.rect.bottom, bubble.rect.top + 110) + 28 : geometry.move.top + bandHeight * moveScale * 0.55, transform: "skewY(-6deg)" }}>
              <div className="mx-auto max-w-[720px] px-[12%] text-white">
                <p className={`${desktop ? "text-[80px]" : "text-[clamp(40px,7dvh,56px)]"} font-bold uppercase leading-none tracking-wide [text-shadow:0_3px_0_#7F0A20]`}>{boss}</p>
                {subtitle && <p className={`mt-1 ${desktop ? "text-[34px]" : "text-[clamp(20px,3dvh,26px)]"} font-semibold leading-tight text-[#FDE68A]`}>{subtitle}</p>}
              </div>
            </div>
          )}
        </>
      )}
      {inEntrance && <button type="button" onClick={props.onEntranceEnd} aria-label={t.skip} className="absolute inset-0 z-20 cursor-pointer bg-transparent" />}
      {/* What the old intro screen said, while the boss makes its entrance: the shields, what it takes to win, the lessons, the sound. */}
      {inEntrance && (
        <div className={`absolute inset-x-0 z-30 mx-auto flex w-fit max-w-[calc(100%-24px)] flex-wrap items-center justify-center gap-2 motion-safe:animate-pop-in ${desktop ? "text-xl" : "text-base"}`} style={{ bottom: "calc(env(safe-area-inset-bottom) + 14px)" }}>
          <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${GLASS}`} role="img" aria-label={`${t.shieldsCount(formatNumber(battle.heartsLeft, lang))}, ${t.toWin(formatNumber(battle.requiredCorrect, lang), formatNumber(battle.questionCount, lang))}`}>
            {Array.from({ length: battle.heartsTotal }, (_, i) => (
              <OwlShieldIcon key={i} className={desktop ? "h-8 w-8" : "h-6 w-6"} empty={i >= battle.heartsLeft} />
            ))}
            <span className="ms-1 font-bold">{t.toWin(formatNumber(battle.requiredCorrect, lang), formatNumber(battle.questionCount, lang))}</span>
          </span>
          {props.blockLessons[0] && (
            <Link href={`/lessons/${props.blockLessons[0].lessonId}`} className={`rounded-full px-4 py-2 font-semibold text-white ${GLASS}`}>
              {t.practiseLessons}
            </Link>
          )}
          <button
            type="button"
            onClick={props.onToggleMute}
            aria-pressed={muted}
            aria-label={muted ? t.soundOff : t.soundOn}
            title={muted ? t.soundOff : t.soundOn}
            className={`grid h-12 w-12 place-items-center rounded-full text-white ${GLASS}`}
          >
            {muted ? <VolumeX className="h-6 w-6" aria-hidden="true" /> : <Volume2 className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      )}

      {(!isOnline || netError) && !feedback && (
        <div role="status" className="absolute inset-x-4 z-30 mx-auto flex max-w-[460px] items-center gap-3 rounded-[22px] bg-[#1a1a1a]/90 px-4 py-3 text-white shadow-lg" style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
          <WifiOffIcon className="h-8 w-8 shrink-0 text-[#FDE68A]" />
          <p className="min-w-0 flex-1 text-base font-semibold leading-snug">{t.noInternetSaved}</p>
          {netError && (
            <button type="button" onClick={props.onRetry} disabled={inFlight} aria-label={t.retry} title={t.retry} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-[#007229] disabled:opacity-60">
              <RotateCw className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
