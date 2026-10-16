"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCw, X } from "lucide-react";
import { OwlHead } from "@/components/illustrations";
import type { AnswerResult, BattleQuestion, BattleState, BossKey, Lang, OwlHint } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { OwlShieldBubble, OwlShieldIcon, Projectile, ReadAloudButton, WifiOffIcon } from "./BattleParts";
import { BossCharacter, OwlCharacter, type CharacterHandle, type CharacterPose } from "./Characters";
import { arenaAnchors } from "./ArenaBackdrop";
import { milestoneApi, type Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { play, prefersReducedMotion } from "./motion";
import BattleMove, { moveOwnsPrompt } from "./moves/BattleMove";
import { hintFits, promptOf } from "./moves/contract";
import { BOSS_ENTRANCES, BOSS_TAUNTS, REMATCH_TAUNT, RESUME_TAUNT, SKIN_PARTS, signatureFor } from "./signatures";
import { superReady, turnOf } from "./turns";
import type { EntranceKind, Feedback, PendingAnswer } from "./useBattleSession";
import type { InteractionAnswer } from "@/lib/interactions/types";

export interface FxEvent {
  key: number;
  result: AnswerResult;
  feedback: Feedback;
  origin: DOMRect | null;
}

/** quiet -> the ground shakes -> the boss arrives (THUD, dust, name banner) -> its taunt. */
type EntranceStep = 0 | 1 | 2 | 3;

/** Translucent dark-green panels for the HUD. */
const GLASS = "bg-[#052814]/70 ring-1 ring-white/15 backdrop-blur-sm shadow-[0_4px_0_rgba(0,0,0,0.25)]";

const FIREFLIES = [
  { x: 12, y: 30, d: 5, delay: 0 },
  { x: 86, y: 52, d: 6, delay: 1.2 },
  { x: 40, y: 46, d: 7, delay: 0.6 },
  { x: 70, y: 70, d: 5.5, delay: 2 },
  { x: 22, y: 62, d: 6.5, delay: 1.6 },
];

/** Character sizes (heights). The arena's anchors say where they stand. */
const BOSS_SIZE = "min(20dvh, 38vw, 190px)";
const OWL_SIZE = "min(13dvh, 26vw, 112px)";

/** The raised hero platform the owl stands on. */
function HeroPlatform() {
  return (
    <svg viewBox="0 0 200 70" className="absolute -bottom-[34%] -start-[30%] w-[160%]" aria-hidden="true" preserveAspectRatio="none">
      <path d="M10 22 Q100 0 190 22 L178 44 Q140 68 100 66 Q60 68 22 44Z" fill="#7A5230" />
      <path d="M10 22 Q100 0 190 22 Q100 40 10 22Z" fill="#E2B56B" />
      <path d="M26 18 q8 -10 14 0 M160 16 q6 -9 12 1" stroke="#2E7D32" strokeWidth={5} fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The sandy rock ledge the boss stands on. */
function Ledge() {
  return (
    <svg viewBox="0 0 200 60" className="absolute -bottom-[16%] -start-[12%] w-[124%]" aria-hidden="true" preserveAspectRatio="none">
      <path d="M8 18 Q100 -4 192 18 L184 34 Q150 58 100 56 Q48 58 16 34Z" fill="#9C6B2E" />
      <path d="M8 18 Q100 -4 192 18 Q100 34 8 18Z" fill="#D9A55B" />
      <path d="M30 14 q8 -10 14 0 M150 12 q6 -9 12 1" stroke="#2E7D32" strokeWidth={5} fill="none" strokeLinecap="round" />
    </svg>
  );
}

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";

interface BattleSceneProps {
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
  /** The full-screen shell, for screen shakes. */
  shellRef: React.RefObject<HTMLDivElement | null>;
  onEntranceEnd: () => void;
  onSubmit: (answer: InteractionAnswer, origin: DOMRect | null) => void;
  onAskOwl: () => void;
  onRetry: () => void;
  onNext: () => void;
}

export default function BattleScene(props: BattleSceneProps) {
  const { lang, bossKey, level, battle, question, feedback, pending, inFlight, isOnline, netError, hint, hintLoading, fxEvent, entrance, muted, fetcher, shellRef } = props;
  const t = MILESTONE_COPY[lang];
  const boss = bossName(bossKey, lang, true);
  const turn = turnOf(question);
  const interaction = question.interaction;
  const prompt = promptOf(question, lang);
  const powered = battle.phase === 2;
  const signature = signatureFor(bossKey, interaction.type, turn);

  const arenaRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<CharacterHandle>(null);
  const owlRef = useRef<CharacterHandle>(null);
  const blastRef = useRef<HTMLDivElement>(null);
  const projectileRef = useRef<HTMLDivElement>(null);
  const shieldRef = useRef<HTMLDivElement>(null);
  const powRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const thudRef = useRef<HTMLDivElement>(null);
  const [projectileGone, setProjectileGone] = useState(false);
  const [flash, setFlash] = useState<{ key: number; text: string; grumpy: boolean } | null>(null);
  const [step, setStep] = useState<EntranceStep | null>(entrance ? (entrance === "resume" ? 2 : 0) : null);
  const previousPhase = useRef(battle.phase);

  // ------------------------------------------------------------ entrance
  // ~3s on a new battle (about 1s on resume); tap anywhere to skip.
  // Reduced motion: a fade-in and the taunt.
  useEffect(() => {
    if (!entrance) return;
    const reduce = prefersReducedMotion();
    const plan: Array<[number, EntranceStep | null]> =
      entrance === "resume" || reduce
        ? [[0, 2], [reduce ? 400 : 350, 3], [reduce ? 1600 : 1100, null]]
        : [[0, 0], [450, 1], [1000, 2], [2050, 3], [3100, null]];
    const timers = plan.map(([at, next]) => window.setTimeout(() => (next === null ? props.onEntranceEnd() : setStep(next)), at));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrance]);

  const activeStep = entrance ? step : null;
  useLayoutEffect(() => {
    if (activeStep === null || !entrance) return;
    const reduce = prefersReducedMotion();
    const animations: Array<Animation | null> = [];
    if (activeStep === 1) {
      animations.push(
        play(shellRef.current, [
          { transform: "translate(0, 0)" },
          { transform: "translate(0, 5px)" },
          { transform: "translate(0, -4px)" },
          { transform: "translate(0, 4px)" },
          { transform: "translate(0, -2px)" },
          { transform: "translate(0, 0)" },
        ], { duration: 520, easing: "linear" })
      );
    }
    if (activeStep === 2) {
      const style = entrance === "resume" ? "pop" : BOSS_ENTRANCES[bossKey];
      const frames: Keyframe[] = reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : style === "stomp"
          ? [
              { transform: "translateY(-160%)" },
              { transform: "translateY(0) scale(1.1, 0.88)", offset: 0.62 },
              { transform: "translateY(-5%) scale(0.97, 1.03)", offset: 0.82 },
              { transform: "translateY(0) scale(1, 1)" },
            ]
          : style === "fly"
            ? [
                { transform: "translate(70%, -140%) rotate(14deg)" },
                { transform: "translate(-8%, -18%) rotate(-6deg)", offset: 0.62 },
                { transform: "translate(0, 0) rotate(0deg)" },
              ]
            : style === "hop"
              ? [
                  { transform: "translateX(130%)" },
                  { transform: "translate(80%, -14%)", offset: 0.25 },
                  { transform: "translate(45%, 0)", offset: 0.45 },
                  { transform: "translate(18%, -10%)", offset: 0.65 },
                  { transform: "translate(0, 0)" },
                ]
              : style === "roll"
                ? [{ transform: "translateX(140%) rotate(400deg)" }, { transform: "translateX(0) rotate(0deg)" }]
                : [{ transform: "scale(0.6)", opacity: 0 }, { transform: "scale(1.05)", opacity: 1, offset: 0.7 }, { transform: "scale(1)" }];
      const arrive = bossRef.current?.element()?.animate(frames, {
        duration: reduce ? 400 : entrance === "resume" ? 350 : 900,
        easing: style === "stomp" ? "cubic-bezier(0.5, 0, 0.75, 1.35)" : "ease-out",
        fill: "backwards",
      });
      animations.push(arrive ?? null);
      if (entrance !== "resume" && !reduce) {
        // The landing: THUD, dust puffs, a jolt, then the name banner sweeps in.
        const land = 560;
        animations.push(
          play(thudRef.current, [
            { transform: "translate(-50%, -50%) scale(0.3) rotate(-8deg)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15) rotate(-8deg)", opacity: 1, offset: 0.3 },
            { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 1, offset: 0.75 },
            { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 0 },
          ], { duration: 950, delay: land, easing: "ease-out", fill: "both" })
        );
        Array.from(arenaRef.current?.querySelectorAll("[data-dust]") ?? []).forEach((puff, i) =>
          animations.push(
            play(puff, [
              { transform: "translate(0, 0) scale(0.3)", opacity: 0 },
              { transform: `translate(${(i % 2 ? 1 : -1) * (24 + i * 10)}px, -10px) scale(1.2)`, opacity: 0.95, offset: 0.4 },
              { transform: `translate(${(i % 2 ? 1 : -1) * (40 + i * 14)}px, -22px) scale(1.5)`, opacity: 0 },
            ], { duration: 900, delay: land, easing: "ease-out", fill: "both" })
          )
        );
        animations.push(
          play(shellRef.current, [
            { transform: "translate(0, 0)" },
            { transform: "translate(0, 7px)" },
            { transform: "translate(0, -3px)" },
            { transform: "translate(0, 0)" },
          ], { duration: 300, delay: land, easing: "linear" })
        );
      }
    }
    if (activeStep >= 2 && entrance !== "resume") {
      animations.push(
        play(bannerRef.current, [
          { transform: "translateX(-110%) skewY(-6deg)" },
          { transform: "translateX(4%) skewY(-6deg)", offset: 0.7 },
          { transform: "translateX(0) skewY(-6deg)" },
        ], { duration: 500, delay: activeStep === 2 && !reduce ? 700 : 0, easing: "ease-out", fill: "backwards" })
      );
    }
    if (activeStep === 3 && !muted) {
      const taunt = entrance === "rematch" ? REMATCH_TAUNT : entrance === "resume" ? RESUME_TAUNT : BOSS_TAUNTS[bossKey];
      speakLine(taunt[lang], lang);
    }
    return () => animations.forEach((a) => a?.cancel());
  }, [activeStep, bossKey, entrance, lang, muted, shellRef]);

  // ------------------------------------------------------------ turn flash
  const turnKey = !entrance ? `${question.questionId}:${question.position}` : null;
  useEffect(() => {
    if (!turnKey) return;
    const grumpy = battle.phase === 2 && previousPhase.current === 1;
    previousPhase.current = battle.phase;
    const id = window.setTimeout(() => {
      setProjectileGone(false);
      setFlash({ key: Date.now(), text: signature ? signature.name[lang] : turn === "attack" ? t.turnAttack : t.turnBlock, grumpy });
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
  // Star blasts, the boss's silly throw, the owl's shield, bonks.
  useLayoutEffect(() => {
    if (!fxEvent) return;
    const arena = arenaRef.current;
    const owlEl = owlRef.current?.element();
    const bossEl = bossRef.current?.element();
    if (!arena || !owlEl || !bossEl) return;
    const origin = arena.getBoundingClientRect();
    const owl = owlEl.getBoundingClientRect();
    const target = bossEl.getBoundingClientRect();
    const { feedback: fb, result } = fxEvent;
    const big = fb.super || (result.finished && result.passed);
    const kind = fb.correct ? (fb.turn === "attack" ? "blast" : "bounce") : fb.turn === "attack" ? "miss" : "bonk";
    const launch = fxEvent.origin ?? owl;
    const fromX = launch.left + launch.width / 2 - origin.left;
    const fromY = launch.top + launch.height / 2 - origin.top;
    const owlX = owl.left + owl.width / 2 - origin.left;
    const owlY = owl.top + owl.height * 0.45 - origin.top;
    const bossX = target.left + target.width / 2 - origin.left;
    const bossY = target.top + target.height * 0.45 - origin.top;
    const slow = big ? 950 : 620;
    const animations: Array<Animation | null> = [];
    const timers: number[] = [];

    const hitBoss = (delay: number) => {
      timers.push(window.setTimeout(() => void bossRef.current?.play("hit"), delay));
      const pow = powRef.current;
      if (pow) {
        pow.style.left = `${bossX + (owlX < bossX ? -1 : 1) * target.width * 0.32}px`;
        pow.style.top = `${bossY + target.height * 0.12}px`;
        animations.push(
          play(pow, [
            { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0 },
            { transform: `translate(-50%, -50%) scale(${big ? 1.4 : 1.05})`, opacity: 1, offset: 0.35 },
            { transform: `translate(-50%, -50%) scale(${big ? 1.3 : 1})`, opacity: 1, offset: 0.8 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
          ], { duration: 800, delay, easing: "ease-out", fill: "both" })
        );
      }
      if (big) {
        animations.push(
          play(shellRef.current, [
            { transform: "translate(0, 0)" },
            { transform: "translate(-7px, 3px)" },
            { transform: "translate(6px, -3px)" },
            { transform: "translate(-4px, 2px)" },
            { transform: "translate(3px, -1px)" },
            { transform: "translate(0, 0)" },
          ], { duration: 450, delay, easing: "linear" })
        );
      }
    };
    const gentleWobble = (delay: number) =>
      animations.push(
        play(shellRef.current, [{ transform: "rotate(0deg)" }, { transform: "rotate(-0.8deg)" }, { transform: "rotate(0.6deg)" }, { transform: "rotate(0deg)" }], {
          duration: 400,
          delay,
          easing: "ease-in-out",
        })
      );

    if (kind === "blast" || kind === "miss") {
      void owlRef.current?.play("fire");
      const endX = kind === "blast" ? bossX : bossX + (bossX > fromX ? 1 : -1) * target.width * 0.6;
      const endY = kind === "blast" ? bossY : bossY - target.height * 0.85;
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
      if (kind === "blast") hitBoss(slow * 0.75);
      else {
        // ...and the boss gives a cheeky little bonk back.
        timers.push(window.setTimeout(() => void bossRef.current?.play("throw"), slow * 0.7));
        timers.push(window.setTimeout(() => void owlRef.current?.play("block"), slow * 0.7 + 200));
        gentleWobble(slow * 0.7 + 200);
      }
    } else {
      // Block turns: the thing the boss wound up flies at the owl.
      void bossRef.current?.play("throw");
      const projectile = projectileRef.current?.getBoundingClientRect() ?? target;
      const px = projectile.left + projectile.width / 2 - origin.left;
      const py = projectile.top + projectile.height / 2 - origin.top;
      const toOwlX = owlX - px;
      const toOwlY = owlY - py;
      const gone = () => setProjectileGone(true);
      if (kind === "bounce") {
        animations.push(
          play(shieldRef.current, [
            { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
            { transform: "translate(-50%, -50%) scale(1.15)", opacity: 1, offset: 0.35 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.8 },
            { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
          ], { duration: 950, easing: "ease-out", fill: "both" })
        );
        timers.push(window.setTimeout(() => void owlRef.current?.play("block"), 380));
        const back = play(projectileRef.current, [
          { transform: "translate(0, 0) rotate(0deg)" },
          { transform: `translate(${toOwlX * 0.8}px, ${toOwlY * 0.8}px) rotate(200deg)`, offset: 0.45 },
          { transform: `translate(${(bossX - px) * 0.9}px, ${(bossY - py) * 0.9}px) rotate(400deg) scale(0.8)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${bossX - px}px, ${bossY - py}px) scale(0.4)`, opacity: 0 },
        ], { duration: big ? 980 : 880, easing: "ease-in-out", fill: "forwards" });
        animations.push(back);
        if (back) back.onfinish = gone;
        else gone();
        hitBoss((big ? 980 : 880) * 0.85);
      } else {
        const land = play(projectileRef.current, [
          { transform: "translate(0, 0) rotate(0deg)" },
          { transform: `translate(${toOwlX}px, ${toOwlY}px) rotate(220deg) scale(0.9)`, opacity: 1, offset: 0.7 },
          { transform: `translate(${toOwlX}px, ${toOwlY + 20}px) rotate(260deg) scale(0.5)`, opacity: 0 },
        ], { duration: 700, easing: "ease-in", fill: "forwards" });
        animations.push(land);
        if (land) land.onfinish = gone;
        else gone();
        timers.push(window.setTimeout(() => void owlRef.current?.play("block"), 480));
        gentleWobble(480);
      }
    }
    return () => {
      animations.forEach((a) => a?.cancel());
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [fxEvent, shellRef]);

  // ------------------------------------------------------------------ view
  const inEntrance = Boolean(entrance);
  const bossPose: CharacterPose = inEntrance
    ? activeStep === 3
      ? "taunt"
      : "idle"
    : feedback?.correct
      ? feedback.final
        ? "ko"
        : "hit"
      : feedback
        ? "taunt"
        : turn === "block"
          ? "windup"
          : powered
            ? "powered"
            : "idle";
  const owlPose: CharacterPose = feedback ? (feedback.correct ? "happy" : "hit") : turn === "attack" ? "taunt" : "windup";
  const busy = inFlight || feedback !== null || !isOnline || inEntrance;
  const canHint = !battle.hintUsed && !feedback && !inEntrance && hintFits(interaction);
  const showProjectile = turn === "block" && !projectileGone && !inEntrance;
  const comboLit = battle.combo > 0 ? (superReady(battle.combo) ? 3 : battle.combo % 3) : 0;
  const contentDir = question.contentLanguage === "ar" ? "rtl" : question.contentLanguage === "en" ? "ltr" : undefined;
  const taunt = activeStep === 3 ? (entrance === "rematch" ? REMATCH_TAUNT : entrance === "resume" ? RESUME_TAUNT : BOSS_TAUNTS[bossKey])[lang] : null;
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
  const speaker = (
    <ReadAloudButton
      cacheKey={`${battle.battleId}:${question.position}:${lang}`}
      initialUrl={question.audioUrl}
      requestUrl={() => milestoneApi.audio(fetcher, battle.battleId, question.position, lang)}
      speechText={[prompt, question.content].filter(Boolean).join(". ")}
      lang={lang}
      size="sm"
    />
  );
  const anchors = arenaAnchors(bossKey);
  const hitsToGo = Math.max(0, battle.requiredCorrect - battle.correctCount);

  return (
    <div ref={arenaRef} className="relative h-full w-full">
      {/* Ambient fireflies (none under reduced motion) */}
      <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden="true">
        {FIREFLIES.map((fly, i) => (
          <span
            key={i}
            className="absolute h-1.5 w-1.5 rounded-full bg-[#FDE68A] shadow-[0_0_8px_3px_rgba(253,230,138,0.6)]"
            style={{ left: `${fly.x}%`, top: `${fly.y}%`, animation: `float ${fly.d}s ease-in-out ${fly.delay}s infinite` }}
          />
        ))}
      </div>

      {/* HUD: one dark-glass panel (close, the boss's name, hits to go, health),
          then shields on the start side and the Super Star pips on the end side. */}
      <header className="absolute inset-x-3 top-3 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/milestones/${props.milestoneId}`} aria-label={t.exit} title={t.exit} className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white ${GLASS}`}>
            <X className="h-7 w-7" strokeWidth={3.2} aria-hidden="true" />
          </Link>
          <div className={`min-w-0 flex-1 rounded-[22px] px-4 pb-2.5 pt-1.5 ${GLASS}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[20px] font-bold uppercase tracking-wide">{boss}</span>
              <span className="shrink-0 rounded-full bg-[#0B4A26] px-2.5 py-0.5 text-[14px] font-bold text-[#D1FAE5]">{t.hitsToGo(formatNumber(hitsToGo, lang))}</span>
            </div>
            <div
              className="mt-1 h-3.5 overflow-hidden rounded-full bg-black/40"
              role="progressbar"
              aria-label={t.power(boss)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={battle.bossHpPercent}
            >
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

      {/* The boss on its raised ledge, standing on the arena's boss anchor */}
      <div
        className="absolute aspect-square"
        style={{ height: BOSS_SIZE, insetInlineStart: `calc(${anchors.boss.x}% - ${BOSS_SIZE} / 2)`, top: `calc(${anchors.boss.y}% - ${BOSS_SIZE})` }}
      >
        <Ledge />
        <BossCharacter
          ref={bossRef}
          bossKey={bossKey}
          pose={bossPose}
          level={level}
          powered={powered}
          title={bossName(bossKey, lang)}
          className={`relative h-full w-full transition-opacity ${inEntrance && (step ?? 0) < 2 ? "opacity-0" : ""}`}
        />
        {inEntrance &&
          [0, 1, 2, 3].map((i) => (
            <span key={i} data-dust="" className="absolute bottom-[2%] h-8 w-8 rounded-full bg-[#F5E6C8] opacity-0" style={{ insetInlineStart: `${30 + i * 12}%` }} aria-hidden="true" />
          ))}
        {showProjectile && (
          <div ref={projectileRef} className="pointer-events-none absolute -start-[4%] top-[10%]" aria-hidden="true">
            <Projectile bossKey={bossKey} big={powered} />
          </div>
        )}
        {bossLine && (
          <p className="absolute -top-[8%] end-0 whitespace-nowrap rounded-[16px] bg-white px-3 py-1 text-lg font-bold text-[#1a1a1a] shadow-[0_3px_0_rgba(0,0,0,0.2)] motion-safe:animate-pop-in">
            {bossLine}
          </p>
        )}
      </div>

      {/* The boss speaks the puzzle: a bubble beside it, the tail at its mouth */}
      {(showPrompt || taunt) && (
        <div
          className="absolute start-[3%] z-[5]"
          style={{ top: `calc(${anchors.boss.y}% - ${BOSS_SIZE} * 0.82)`, insetInlineEnd: `calc(${100 - anchors.boss.x}% + ${BOSS_SIZE} / 2 + 12px)` }}
        >
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
            <span className="absolute -end-3 top-[38%] h-0 w-0 border-y-[10px] border-s-[16px] border-y-transparent border-s-[#FFF8EC]" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* The owl on its raised hero platform, standing on the owl anchor */}
      <div
        className="absolute z-[4] aspect-[72/64]"
        style={{ height: OWL_SIZE, insetInlineStart: `calc(${anchors.owl.x}% - ${OWL_SIZE} * 0.5625)`, top: `calc(${anchors.owl.y}% - ${OWL_SIZE})` }}
      >
        <HeroPlatform />
        <OwlCharacter ref={owlRef} pose={owlPose} className="relative h-full w-full" />
        {turn === "block" && !feedback && !inEntrance && (
          // The owl's green shield arc, up and ready on a block turn.
          <svg viewBox="0 0 30 100" className="absolute -end-[24%] top-[2%] h-[96%] rtl:-scale-x-100" aria-hidden="true">
            <path d="M6 6 Q28 50 6 94" fill="none" stroke="#4ADE80" strokeWidth={7} strokeLinecap="round" opacity={0.35} />
            <path d="M6 6 Q28 50 6 94" fill="none" stroke="#00913D" strokeWidth={4} strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* The move: targets in the band between the boss and the owl, the action row at the bottom */}
      <div
        ref={moveRef}
        className="absolute inset-x-3 bottom-[2%] z-[6]"
        style={{ top: `calc(${anchors.boss.y}% + 1.5%)`, ...(inEntrance ? { visibility: "hidden" as const } : null) }}
      >
        {feedback ? (
          feedback.correct ? null : (
            <div className="flex h-full flex-col items-center justify-end gap-3 motion-safe:animate-pop-in">
              <p className="text-center text-[24px] font-bold [text-shadow:0_2px_0_rgba(0,0,0,0.35)]">{t.nearlyLine}</p>
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
            catchTarget={() => owlRef.current?.element()?.getBoundingClientRect() ?? null}
            throwFrom={() => bossRef.current?.element()?.getBoundingClientRect() ?? null}
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
      <div
        ref={shieldRef}
        className="pointer-events-none absolute z-[7] opacity-0"
        style={{ insetInlineStart: `calc(${anchors.owl.x}% + ${OWL_SIZE} * 0.75)`, top: `calc(${anchors.owl.y}% - ${OWL_SIZE} * 0.5)` }}
        aria-hidden="true"
      >
        <OwlShieldBubble className="h-20 w-20" />
      </div>
      <div ref={blastRef} key={fxEvent?.key ?? 0} className="pointer-events-none absolute inset-0 z-[8]" aria-hidden="true">
        {fxEvent &&
          (fxEvent.feedback.turn === "attack") &&
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

      {/* the burst ("Pow!") or the big turn flash, mid-arena */}
      {burst && (
        <p aria-live="polite" className={`pointer-events-none absolute left-1/2 top-[40%] z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[clamp(40px,7dvh,56px)] font-bold leading-none motion-safe:animate-pop-in [text-shadow:0_4px_0_rgba(0,0,0,0.35)] ${feedback?.correct ? "text-[#FDE68A]" : "text-white"}`}>
          {burst}
        </p>
      )}
      {flash && !feedback && (
        <div ref={flashRef} aria-live="polite" className="pointer-events-none absolute left-1/2 top-[40%] z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
          <span className={`text-[clamp(40px,7.5dvh,58px)] font-bold leading-none [text-shadow:0_4px_0_rgba(0,0,0,0.4)] ${turn === "attack" ? "text-[#FDE68A]" : "text-white"}`}>{flash.text}</span>
        </div>
      )}

      {/* entrance: THUD and the boss's name banner across the lower third */}
      {inEntrance && entrance !== "resume" && (
        <>
          <div ref={thudRef} className="pointer-events-none absolute left-1/2 top-[34%] z-[9] opacity-0" aria-hidden="true">
            <span className="text-[56px] font-bold leading-none text-[#FDE68A] [text-shadow:0_4px_0_#7A2E00]">{lang === "ar" ? "دُم!" : "THUD!"}</span>
          </div>
          {(step ?? 0) >= 2 && (
            <div ref={bannerRef} className="absolute inset-x-[-6%] top-[60%] z-[9] bg-[#D21034] py-4 shadow-[0_8px_0_rgba(0,0,0,0.25)]" style={{ transform: "skewY(-6deg)" }}>
              <div className="px-[12%] text-white">
                <p className="text-[clamp(40px,7dvh,56px)] font-bold uppercase leading-none tracking-wide [text-shadow:0_3px_0_#7F0A20]">{boss}</p>
                {subtitle && <p className="mt-1 text-[clamp(20px,3dvh,26px)] font-semibold leading-tight text-[#FDE68A]">{subtitle}</p>}
              </div>
            </div>
          )}
        </>
      )}
      {inEntrance && (
        <button type="button" onClick={props.onEntranceEnd} aria-label={t.skip} className="absolute inset-0 z-20 cursor-pointer bg-transparent" />
      )}

      {(!isOnline || netError) && !feedback && (
        <div role="status" className="absolute inset-x-4 bottom-4 z-30 flex items-center gap-3 rounded-[22px] bg-[#1a1a1a]/90 px-4 py-3 text-white shadow-lg">
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
