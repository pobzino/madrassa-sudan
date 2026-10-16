"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { RotateCw, X } from "lucide-react";
import { OwlHead } from "@/components/illustrations";
import {
  BOSS_FOOT,
  BossCharacter,
  OWL_FOOT,
  OwlCharacter,
  type BossHandle,
  type CharacterCue,
  type OwlHandle,
  type OwlPose,
  type PlacedAnchor,
  type Pose,
} from "@/components/characters";
import type { InteractionAnswer } from "@/lib/interactions/types";
import type { AnswerResult, BattleQuestion, BattleState, BossKey, Lang, OwlHint } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { OwlShieldBubble, OwlShieldIcon, Projectile, ReadAloudButton, WifiOffIcon } from "./BattleParts";
import { milestoneApi, type Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { play, prefersReducedMotion } from "./motion";
import BattleMove, { moveOwnsPrompt } from "./moves/BattleMove";
import { hintFits, promptOf } from "./moves/contract";
import { BOSS_TAUNTS, REMATCH_TAUNT, RESUME_TAUNT, SKIN_PARTS, signatureFor } from "./signatures";
import { superReady, turnOf } from "./turns";
import type { EntranceKind, Feedback, PendingAnswer } from "./useBattleSession";

export interface FxEvent {
  key: number;
  result: AnswerResult;
  feedback: Feedback;
  origin: DOMRect | null;
}

/** quiet -> the ground shakes -> the boss lands (THUD, dust, name banner) -> its taunt. */
type EntranceStep = 0 | 1 | 2 | 3;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

/** Translucent dark-green panels for the HUD. */
const GLASS = "bg-[#052814]/70 ring-1 ring-white/15 backdrop-blur-sm shadow-[0_4px_0_rgba(0,0,0,0.25)]";

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

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
  fetcher: Fetcher;
  /** The layer above the arena, for screen shakes. */
  shellRef: RefObject<HTMLDivElement | null>;
  onEntranceEnd: () => void;
  onSubmit: (answer: InteractionAnswer, origin: DOMRect | null) => void;
  onAskOwl: () => void;
  onRetry: () => void;
  onNext: () => void;
}

export default function BattleScene(props: BattleSceneProps) {
  const { anchors, lang, bossKey, battle, question, feedback, pending, inFlight, isOnline, netError, hint, hintLoading, fxEvent, entrance, muted, fetcher, shellRef } = props;
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  const turn = turnOf(question);
  const interaction = question.interaction;
  const prompt = promptOf(question, lang);
  const powered = battle.phase === 2;
  const signature = signatureFor(bossKey, interaction.type, turn);

  // The cast stands on the arena's anchors: feet on the ledge and the platform.
  const bossSize = Math.round(Math.min(230, Math.max(150, 180 * anchors.boss.scale)));
  const owlSize = Math.round(bossSize * 0.853);
  const bossLeft = anchors.boss.x - bossSize * BOSS_FOOT.x;
  const bossTop = anchors.boss.y - bossSize * BOSS_FOOT.y;
  const owlLeft = anchors.owl.x - owlSize * OWL_FOOT.x;
  const owlTop = anchors.owl.y - owlSize * OWL_FOOT.y;
  const bandTop = anchors.boss.y + 10;
  const bandHeight = Math.round(Math.max(170, Math.min(240, owlTop + owlSize * 0.12 - bandTop - 8)));

  const arenaRef = useRef<HTMLDivElement>(null);
  const bossBoxRef = useRef<HTMLDivElement>(null);
  const owlBoxRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<BossHandle>(null);
  const owlRef = useRef<OwlHandle>(null);
  const blastRef = useRef<HTMLDivElement>(null);
  const projectileRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const powRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const thudRef = useRef<HTMLDivElement>(null);
  const bossCues = useCues();
  const owlCues = useCues();
  const [projectileGone, setProjectileGone] = useState(false);
  const [knockedOut, setKnockedOut] = useState(false);
  const [flash, setFlash] = useState<{ key: number; text: string; grumpy: boolean } | null>(null);
  const [step, setStep] = useState<EntranceStep | null>(entrance ? (entrance === "resume" ? 2 : 0) : null);
  const previousPhase = useRef(battle.phase);

  const shake = useCallback(
    (strength: number, delay = 0) =>
      play(shellRef.current, [
        { transform: "translate(0, 0)" },
        { transform: `translate(${-strength}px, ${strength * 0.5}px)` },
        { transform: `translate(${strength * 0.8}px, ${-strength * 0.5}px)` },
        { transform: `translate(${-strength * 0.5}px, ${strength * 0.3}px)` },
        { transform: "translate(0, 0)" },
      ], { duration: 420, delay, easing: "linear" }),
    [shellRef]
  );

  // ------------------------------------------------------------ entrance
  // ~3s on a new battle (about 1s on resume); tap anywhere to skip.
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
      // The boss mounts with `enter`; its landing cue drops the THUD.
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
      setProjectileGone(false);
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

  // --------------------------------------------------------------- effects
  // Each answer plays out on the characters' own cues: the owl fires (release),
  // stars fly, the boss is hit (impact); or the boss throws (release), the
  // owl's shield goes up (shield) and it bounces back, or it lands with a bonk.
  useEffect(() => {
    if (!fxEvent) return;
    const arena = arenaRef.current?.getBoundingClientRect();
    const owl = owlBoxRef.current?.getBoundingClientRect();
    const target = bossBoxRef.current?.getBoundingClientRect();
    if (!arena || !owl || !target) return;
    let cancelled = false;
    const animations: Array<Animation | null> = [];
    const { feedback: fb, result } = fxEvent;
    const big = fb.super || (result.finished && result.passed);
    const knockout = result.finished && result.passed;
    const launch = fxEvent.origin ?? owl;
    const fromX = launch.left + launch.width / 2 - arena.left;
    const fromY = launch.top + launch.height / 2 - arena.top;
    const owlX = owl.left + owl.width / 2 - arena.left;
    const owlY = owl.top + owl.height * 0.5 - arena.top;
    const bossX = target.left + target.width / 2 - arena.left;
    const bossY = target.top + target.height * 0.5 - arena.top;
    const slow = big ? 950 : 620;

    const pow = () => {
      const el = powRef.current;
      if (!el) return;
      el.style.left = `${bossX - target.width * 0.32}px`;
      el.style.top = `${bossY + target.height * 0.1}px`;
      animations.push(
        play(el, [
          { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0 },
          { transform: `translate(-50%, -50%) scale(${big ? 1.4 : 1.05})`, opacity: 1, offset: 0.35 },
          { transform: `translate(-50%, -50%) scale(${big ? 1.3 : 1})`, opacity: 1, offset: 0.8 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
        ], { duration: 800, easing: "ease-out", fill: "both" })
      );
    };
    const hitBoss = async () => {
      void bossRef.current?.play(knockout ? "ko" : "hit");
      await bossCues.waitFor("impact", 180);
      if (cancelled) return;
      pow();
      if (big) animations.push(shake(7));
      if (knockout) setKnockedOut(true);
    };
    const stars = (endX: number, endY: number) =>
      Array.from(blastRef.current?.children ?? []).forEach((child, i) => {
        const el = child as HTMLElement;
        el.style.left = `${fromX}px`;
        el.style.top = `${fromY}px`;
        const spread = (i - 3) * (big ? 12 : 8);
        animations.push(
          play(el, [
            { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0 },
            { transform: `translate(calc(-50% + ${(endX - fromX) * 0.5}px), calc(-50% + ${(endY - fromY) * 0.5 - 30 + spread}px)) scale(${big ? 1.6 : 1.15})`, opacity: 1, offset: 0.5 },
            { transform: `translate(calc(-50% + ${endX - fromX + spread}px), calc(-50% + ${endY - fromY + spread * 0.4}px)) scale(0.7)`, opacity: 0 },
          ], { duration: slow, delay: i * 30, easing: "ease-out", fill: "both" })
        );
      });
    const throwAtOwl = (bounce: boolean) => {
      const projectile = projectileRef.current?.getBoundingClientRect() ?? target;
      const px = projectile.left + projectile.width / 2 - arena.left;
      const py = projectile.top + projectile.height / 2 - arena.top;
      const frames: Keyframe[] = bounce
        ? [
            { transform: "translate(0, 0) rotate(0deg)" },
            { transform: `translate(${(owlX - px) * 0.8}px, ${(owlY - py) * 0.8}px) rotate(200deg)`, offset: 0.45 },
            { transform: `translate(${(bossX - px) * 0.9}px, ${(bossY - py) * 0.9}px) rotate(400deg) scale(0.8)`, opacity: 1, offset: 0.9 },
            { transform: `translate(${bossX - px}px, ${bossY - py}px) scale(0.4)`, opacity: 0 },
          ]
        : [
            { transform: "translate(0, 0) rotate(0deg)" },
            { transform: `translate(${owlX - px}px, ${owlY - py}px) rotate(220deg) scale(0.9)`, opacity: 1, offset: 0.7 },
            { transform: `translate(${owlX - px}px, ${owlY - py + 20}px) rotate(260deg) scale(0.5)`, opacity: 0 },
          ];
      const flight = play(projectileRef.current, frames, { duration: bounce ? (big ? 980 : 880) : 700, easing: bounce ? "ease-in-out" : "ease-in", fill: "forwards" });
      animations.push(flight);
      if (flight) flight.onfinish = () => setProjectileGone(true);
      else setProjectileGone(true);
    };

    const run = async () => {
      if (fb.turn === "attack") {
        void owlRef.current?.play("fire");
        await owlCues.waitFor("release", 380);
        if (cancelled) return;
        if (fb.correct) {
          stars(bossX, bossY);
          await sleep(slow * 0.72);
          if (!cancelled) await hitBoss();
        } else {
          // A whoosh over the boss's head, a cheeky bonk back.
          stars(bossX - target.width * 0.6, bossY - target.height * 0.85);
          await sleep(slow * 0.7);
          if (cancelled) return;
          void bossRef.current?.play("taunt");
          void owlRef.current?.play("wrong");
          animations.push(shake(2));
        }
        return;
      }
      void bossRef.current?.play("throw");
      await bossCues.waitFor("release", 480);
      if (cancelled) return;
      if (fb.correct) {
        throwAtOwl(true);
        void owlRef.current?.play("block");
        await owlCues.waitFor("shield", 350);
        if (cancelled) return;
        animations.push(
          play(shieldRef.current, [
            { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.35 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.8 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
          ], { duration: 900, easing: "ease-out", fill: "both" })
        );
        await sleep((big ? 980 : 880) * 0.55);
        if (!cancelled) await hitBoss();
      } else {
        throwAtOwl(false);
        await sleep(480);
        if (cancelled) return;
        void owlRef.current?.play("wrong");
        animations.push(shake(2));
      }
    };
    void run();
    return () => {
      cancelled = true;
      animations.forEach((a) => a?.cancel());
    };
  }, [bossCues, fxEvent, owlCues, shake]);

  // ------------------------------------------------------------------ view
  const inEntrance = Boolean(entrance);
  const bossMounted = !inEntrance || (step ?? 0) >= 2;
  const bossPose: Pose = inEntrance
    ? activeStep === 3
      ? "taunt"
      : "idle"
    : knockedOut || (feedback?.final && feedback.correct && knockedOut)
      ? "ko"
      : feedback && !feedback.correct
        ? "taunt"
        : !feedback && turn === "block"
          ? "windup"
          : powered
            ? "powered"
            : "idle";
  const owlPose: OwlPose = feedback ? (feedback.correct ? "cheer" : "wrong") : turn === "block" ? "block" : "idle";
  const playersTurn = !feedback && !inEntrance;
  const busy = inFlight || feedback !== null || !isOnline || inEntrance;
  const canHint = !battle.hintUsed && !feedback && !inEntrance && hintFits(interaction);
  const showProjectile = turn === "block" && !projectileGone && !inEntrance;
  const comboLit = battle.combo > 0 ? (superReady(battle.combo) ? 3 : battle.combo % 3) : 0;
  const hitsToGo = Math.max(0, battle.requiredCorrect - battle.correctCount);
  const contentDir = question.contentLanguage === "ar" ? "rtl" : question.contentLanguage === "en" ? "ltr" : undefined;
  const fullName = BOSS_NAMES[bossKey][lang];
  const subtitle = fullName.startsWith(boss) ? fullName.slice(boss.length).trim() : "";
  const burst = feedback
    ? feedback.correct
      ? feedback.final
        ? t.burstKo
        : feedback.turn === "attack"
          ? feedback.super
            ? t.burstSuper
            : t.burstPow
          : t.burstBlocked
      : feedback.turn === "attack"
        ? t.burstWhoosh
        : t.burstBonk
    : null;
  const bossLine = feedback ? (feedback.final && feedback.correct ? null : feedback.correct ? t.ouch : t.burstBonk) : flash?.grumpy ? t.grumpy : null;
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

  return (
    <div ref={arenaRef} className="absolute inset-0">
      {/* HUD: one dark-glass panel (close, the boss's name, hits to go, health),
          then the shields pill and, once a streak starts, the Super Star pill. */}
      <header className="absolute inset-x-0 z-10 mx-auto flex max-w-[480px] flex-col gap-2 px-3" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
        <div className="flex items-center gap-2">
          <Link href={`/milestones/${props.milestoneId}`} aria-label={t.exit} title={t.exit} className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white ${GLASS}`}>
            <X className="h-7 w-7" strokeWidth={3.2} aria-hidden="true" />
          </Link>
          <div className={`min-w-0 flex-1 rounded-[22px] px-4 pb-2.5 pt-1.5 ${GLASS}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[20px] font-bold uppercase tracking-wide">{boss}</span>
              <span className="shrink-0 rounded-full bg-[#0B4A26] px-2.5 py-0.5 text-[14px] font-bold text-[#D1FAE5]">{t.hitsToGo(formatNumber(hitsToGo, lang))}</span>
            </div>
            <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-label={t.power(boss)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.bossHpPercent}>
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${battle.bossHpPercent}%`,
                  background: powered ? "linear-gradient(180deg,#FB7185,#D21034 60%,#F59E0B)" : "linear-gradient(180deg,#F05A73,#D21034 60%,#A01028)",
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className={`flex gap-1 rounded-full px-2.5 py-1 ${GLASS}`} role="img" aria-label={`${t.shields}: ${formatNumber(battle.heartsLeft, lang)}`}>
            {Array.from({ length: battle.heartsTotal }, (_, i) => (
              <OwlShieldIcon key={i} className="h-8 w-8" empty={i >= battle.heartsLeft} />
            ))}
          </span>
          {comboLit > 0 && (
            <span className={`flex gap-1 rounded-full px-3 py-1.5 ${GLASS}`} role="img" aria-label={superReady(battle.combo) ? t.superReady : `${t.superStar} ${formatNumber(comboLit, lang)}`}>
              {[0, 1, 2].map((i) => (
                <svg key={i} viewBox="0 0 24 24" className={`h-7 w-7 ${superReady(battle.combo) ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.9)]" : ""}`} aria-hidden="true">
                  <path d={STAR_PATH} fill={i < comboLit ? "#F59E0B" : "none"} stroke={i < comboLit ? "#F59E0B" : "rgba(255,255,255,0.6)"} strokeWidth={1.6} strokeLinejoin="round" />
                </svg>
              ))}
            </span>
          )}
        </div>
      </header>

      {/* The boss on its ledge (feet on the arena's boss anchor) */}
      <div ref={bossBoxRef} className="absolute" style={{ left: bossLeft, top: bossTop, width: bossSize, height: bossSize }}>
        {bossMounted && (
          <BossCharacter
            ref={bossRef}
            bossKey={bossKey}
            pose={bossPose}
            size={bossSize}
            enter={inEntrance}
            onCue={bossCues.onCue}
            title={BOSS_NAMES[bossKey][lang]}
          />
        )}
        {inEntrance &&
          [0, 1, 2, 3].map((i) => (
            <span key={i} data-dust="" className="absolute bottom-[4%] h-8 w-8 rounded-full bg-[#F5E6C8] opacity-0" style={{ left: `${30 + i * 12}%` }} aria-hidden="true" />
          ))}
        {showProjectile && (
          <div ref={projectileRef} className="pointer-events-none absolute -left-[6%] top-[22%]" aria-hidden="true">
            <Projectile bossKey={bossKey} big={powered} />
          </div>
        )}
        {bossLine && (
          <p className="absolute -top-[10%] right-0 whitespace-nowrap rounded-[16px] bg-white px-3 py-1 text-lg font-bold text-[#1a1a1a] shadow-[0_3px_0_rgba(0,0,0,0.2)] motion-safe:animate-pop-in">
            {bossLine}
          </p>
        )}
      </div>

      {/* The boss speaks the puzzle: a bubble to its left, the tail at its mouth */}
      {(showPrompt || taunt) && (
        <div className="absolute z-[5]" style={{ left: 12, width: Math.max(150, bossLeft + bossSize * 0.12 - 24), top: bossTop + bossSize * 0.14 }}>
          <div className="relative flex items-center gap-2 rounded-[26px] bg-[#FFF8EC] py-3 pe-2.5 ps-4 text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)] motion-safe:animate-pop-in">
            {taunt ? (
              <p aria-live="polite" className="text-[19px] font-bold leading-snug">{taunt}</p>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-3 text-[clamp(20px,3dvh,25px)] font-bold leading-tight">{prompt}</p>
                  {question.content && (
                    <p lang={question.contentLanguage ?? undefined} dir={contentDir} className="break-words text-[clamp(24px,3.8dvh,32px)] font-bold leading-tight text-[#007229] [unicode-bidi:plaintext]">
                      {question.content}
                    </p>
                  )}
                  {question.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={question.imageUrl} alt="" className="mt-1 max-h-16 max-w-full rounded-lg object-contain" />
                  )}
                </div>
                {speaker}
              </>
            )}
            <span className="absolute -right-3 top-[38%] h-0 w-0 border-y-[10px] border-l-[16px] border-y-transparent border-l-[#FFF8EC]" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* The owl on its hero platform (feet on the owl anchor), glowing on your turn */}
      <div ref={owlBoxRef} className="absolute z-[4]" style={{ left: owlLeft, top: owlTop, width: owlSize, height: owlSize }}>
        <OwlCharacter ref={owlRef} pose={owlPose} size={owlSize} glow={playersTurn} onCue={owlCues.onCue} />
      </div>

      {/* The move: targets in the calm band between the boss and the owl, the action row at the bottom */}
      <div
        className="absolute inset-x-0 z-[6] mx-auto max-w-[480px] px-3"
        style={{ top: bandTop, bottom: "calc(env(safe-area-inset-bottom) + 10px)", ...(inEntrance ? { visibility: "hidden" as const } : null) }}
      >
        {feedback ? (
          feedback.correct ? null : (
            <div className="flex h-full flex-col items-center justify-end gap-3 motion-safe:animate-pop-in">
              <p className="text-center text-[24px] font-bold [text-shadow:0_2px_0_rgba(0,0,0,0.45)]">{t.nearlyLine}</p>
              <button
                type="button"
                autoFocus
                onClick={props.onNext}
                className="inline-flex h-[68px] w-full items-center justify-center rounded-full bg-[linear-gradient(180deg,#2FB25A_0%,#007229_55%,#005C22_100%)] px-6 text-[26px] font-bold text-white shadow-[0_6px_0_#00451A,inset_0_3px_0_rgba(255,255,255,0.35)] active:translate-y-1 active:shadow-none"
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
            disabled={busy || Boolean(pending)}
            onSubmit={props.onSubmit}
            seed={question.questionId}
            prompt={prompt}
            speaker={speaker}
            skin={signature ? SKIN_PARTS[signature.skin] : null}
            bandHeight={bandHeight}
            catchTarget={() => owlBoxRef.current?.getBoundingClientRect() ?? null}
            throwFrom={() => bossBoxRef.current?.getBoundingClientRect() ?? null}
            hintButton={
              canHint ? (
                <button
                  type="button"
                  onClick={props.onAskOwl}
                  disabled={hintLoading || busy}
                  aria-label={t.owlHint}
                  title={t.owlHint}
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#FFF8EC] shadow-[0_4px_0_rgba(0,0,0,0.25)] disabled:opacity-50"
                >
                  <OwlHead className="h-9 w-9" />
                </button>
              ) : null
            }
          />
        )}
      </div>

      {/* effects layers */}
      <div ref={shieldRef} className="pointer-events-none absolute z-[7] opacity-0" style={{ left: owlLeft + owlSize * 0.95, top: owlTop + owlSize * 0.45 }} aria-hidden="true">
        <OwlShieldBubble className="h-20 w-20" />
      </div>
      <div ref={blastRef} key={fxEvent?.key ?? 0} className="pointer-events-none absolute inset-0 z-[8]" aria-hidden="true">
        {fxEvent &&
          fxEvent.feedback.turn === "attack" &&
          Array.from({ length: fxEvent.feedback.super || fxEvent.result.finished ? 9 : 6 }, (_, i) => (
            <svg key={i} viewBox="0 0 24 24" className={`absolute opacity-0 ${fxEvent.feedback.super ? "h-10 w-10" : "h-7 w-7"} drop-shadow-[0_0_8px_rgba(245,158,11,0.95)]`}>
              <path d={STAR_PATH} fill="#F59E0B" />
            </svg>
          ))}
      </div>
      <div ref={powRef} className="pointer-events-none absolute z-[8] opacity-0" aria-hidden="true">
        <svg viewBox="0 0 120 80" className="h-16 w-24 overflow-visible">
          <path d="M60 2 L70 22 L94 10 L88 32 L116 36 L92 50 L104 72 L78 62 L66 80 L56 62 L28 74 L36 52 L6 44 L32 32 L22 10 L48 22 Z" fill="#FDE68A" />
        </svg>
      </div>

      {/* the burst ("Pow!") or the big turn flash, between the two */}
      {burst && (
        <p
          aria-live="polite"
          className={`pointer-events-none absolute left-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(40px,7dvh,56px)] font-bold leading-none motion-safe:animate-pop-in [text-shadow:0_4px_0_rgba(0,0,0,0.4)] ${feedback?.correct ? "text-[#FDE68A]" : "text-white"}`}
          style={{ top: bandTop + bandHeight * 0.4 }}
        >
          {burst}
        </p>
      )}
      {flash && !feedback && (
        <div ref={flashRef} aria-live="polite" className="pointer-events-none absolute left-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap" style={{ top: bandTop + bandHeight * 0.4 }}>
          <span className={`text-[clamp(40px,7.5dvh,58px)] font-bold leading-none [text-shadow:0_4px_0_rgba(0,0,0,0.45)] ${turn === "attack" ? "text-[#FDE68A]" : "text-white"}`}>{flash.text}</span>
        </div>
      )}

      {/* entrance: THUD and the boss's name banner across the lower third */}
      {inEntrance && entrance !== "resume" && (
        <>
          <div ref={thudRef} className="pointer-events-none absolute left-1/2 z-[9] opacity-0" style={{ top: bandTop + 20 }} aria-hidden="true">
            <span className="text-[56px] font-bold leading-none text-[#FDE68A] [text-shadow:0_4px_0_#7A2E00]">{lang === "ar" ? "دُم!" : "THUD!"}</span>
          </div>
          {(step ?? 0) >= 2 && (
            <div ref={bannerRef} className="absolute inset-x-[-6%] z-[9] bg-[#D21034] py-4 shadow-[0_8px_0_rgba(0,0,0,0.25)]" style={{ top: bandTop + bandHeight * 0.55, transform: "skewY(-6deg)" }}>
              <div className="mx-auto max-w-[480px] px-[12%] text-white">
                <p className="text-[clamp(40px,7dvh,56px)] font-bold uppercase leading-none tracking-wide [text-shadow:0_3px_0_#7F0A20]">{boss}</p>
                {subtitle && <p className="mt-1 text-[clamp(20px,3dvh,26px)] font-semibold leading-tight text-[#FDE68A]">{subtitle}</p>}
              </div>
            </div>
          )}
        </>
      )}
      {inEntrance && <button type="button" onClick={props.onEntranceEnd} aria-label={t.skip} className="absolute inset-0 z-20 cursor-pointer bg-transparent" />}

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
