"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
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
import { MathText, OwlShieldBubble, OwlShieldIcon, Projectile, ReadAloudButton, WifiOffIcon } from "./BattleParts";
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

/** The first visible reaction to a move, started the instant the child confirms. */
interface Launch {
  key: number;
  turn: "attack" | "block";
  origin: DOMRect | null;
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

  // The layout for this screen (phone or desktop) and the question's length.
  const { width, height } = useViewport();
  const geometry = battleGeometry({ width, height, anchors, prompt: moveOwnsPrompt(interaction) ? "" : prompt, lang });
  const desktop = geometry.mode === "desktop";
  const { bossSize, owlSize, bandHeight, moveScale } = geometry;
  const bossLeft = geometry.boss.left;
  const bossTop = geometry.boss.top;
  const owlLeft = geometry.owl.left;
  const owlTop = geometry.owl.top;

  const arenaRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [hudBottom, setHudBottom] = useState(84);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setHudBottom(Math.round(header.getBoundingClientRect().bottom));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
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
  const [launch, setLaunch] = useState<Launch | null>(null);
  const launchAnimations = useRef<Animation[]>([]);
  // Signature effects fly in a layer of their own: clear it when the battle closes.
  useEffect(() => () => clearFx(), []);
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
      setProjectileGone(false);
      setLaunch(null);
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
  // Positions inside the arena, from the boxes the cast stands in.
  const spots = useCallback(() => {
    const arena = arenaRef.current?.getBoundingClientRect();
    const owl = owlBoxRef.current?.getBoundingClientRect();
    const target = bossBoxRef.current?.getBoundingClientRect();
    if (!arena || !owl || !target) return null;
    return {
      arena,
      target,
      owlX: owl.left + owl.width / 2 - arena.left,
      owlY: owl.top + owl.height * 0.5 - arena.top,
      bossX: target.left + target.width / 2 - arena.left,
      bossY: target.top + target.height * 0.5 - arena.top,
      owl,
    };
  }, []);

  // 1. The instant the child confirms: the owl fires (attack) or raises its
  //    shield while the boss throws (block). Stars or the projectile fly most
  //    of the way and wait there for the server's answer.
  const submit = (answer: InteractionAnswer, origin: DOMRect | null) => {
    setLaunch({ key: Date.now(), turn, origin });
    props.onSubmit(answer, origin);
  };
  useLayoutEffect(() => {
    if (!launch) return;
    const at = spots();
    if (!at) return;
    const animations: Animation[] = [];
    const add = (animation: Animation | null) => {
      if (animation) animations.push(animation);
    };
    if (launch.turn === "attack") {
      void owlRef.current?.play("fire");
      const from = launch.origin ?? at.owl;
      const fromX = from.left + from.width / 2 - at.arena.left;
      const fromY = from.top + from.height / 2 - at.arena.top;
      const holdX = fromX + (at.bossX - fromX) * 0.72;
      const holdY = fromY + (at.bossY - fromY) * 0.72;
      Array.from(blastRef.current?.children ?? []).forEach((child, i) => {
        const el = child as HTMLElement;
        el.style.left = `${fromX}px`;
        el.style.top = `${fromY}px`;
        const spread = (i - 3) * 8;
        add(
          play(el, [
            { transform: "translate(-50%, -50%) scale(0.5)", opacity: 0 },
            { transform: `translate(calc(-50% + ${(holdX - fromX) * 0.55}px), calc(-50% + ${(holdY - fromY) * 0.55 - 30 + spread}px)) scale(1.15)`, opacity: 1, offset: 0.55 },
            { transform: `translate(calc(-50% + ${holdX - fromX + spread}px), calc(-50% + ${holdY - fromY + spread * 0.4}px)) scale(1)`, opacity: 1 },
          ], { duration: 480, delay: i * 25, easing: "ease-out", fill: "forwards" })
        );
      });
    } else {
      void owlRef.current?.play("block");
      void bossRef.current?.play("throw");
      add(
        play(shieldRef.current, [
          { transform: "translate(-50%, -50%) scale(0)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1.1)", opacity: 1, offset: 0.6 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        ], { duration: 320, easing: "ease-out", fill: "forwards" })
      );
      const projectile = projectileRef.current?.getBoundingClientRect() ?? at.target;
      const px = projectile.left + projectile.width / 2 - at.arena.left;
      const py = projectile.top + projectile.height / 2 - at.arena.top;
      add(
        play(projectileRef.current, [
          { transform: "translate(0, 0) rotate(0deg)" },
          { transform: `translate(${(at.owlX - px) * 0.6}px, ${(at.owlY - py) * 0.6}px) rotate(160deg)` },
        ], { duration: 520, easing: "ease-out", fill: "forwards" })
      );
    }
    launchAnimations.current = animations;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch]);

  // If the answer never left (no connection), the launch fizzles out.
  useEffect(() => {
    if (!launch || !netError) return;
    launchAnimations.current.forEach((animation) => animation.cancel());
    launchAnimations.current = [];
    const id = window.setTimeout(() => setLaunch(null), 0);
    return () => window.clearTimeout(id);
  }, [launch, netError]);

  // 2. The server's answer resolves it: a hit or a fizzle past (attack), a
  //    bounce back or a bonk (block). Without a launch (a resync), the whole
  //    move plays from the start.
  useEffect(() => {
    if (!fxEvent) return;
    const at = spots();
    if (!at) return;
    let cancelled = false;
    const animations: Array<Animation | null> = [];
    const { feedback: fb, result } = fxEvent;
    const big = fb.super || (result.finished && result.passed);
    const knockout = result.finished && result.passed;
    const launched = launchAnimations.current;
    launchAnimations.current = [];
    // Keep where the launch got to, then carry on from there.
    launched.forEach((animation) => {
      try {
        animation.commitStyles();
      } catch {
        // detached element
      }
      animation.cancel();
    });
    const { target, owlX, owlY, bossX, bossY } = at;

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
    const starsTo = (endX: number, endY: number, fade: boolean, duration: number) =>
      Array.from(blastRef.current?.children ?? []).forEach((child, i) => {
        const el = child as HTMLElement;
        const fromX = parseFloat(el.style.left || "0");
        const fromY = parseFloat(el.style.top || "0");
        const current = el.style.transform || "translate(-50%, -50%) scale(0.5)";
        const spread = (i - 3) * (big ? 12 : 6);
        animations.push(
          play(el, [
            { transform: current, opacity: launched.length ? 1 : 0 },
            { transform: `translate(calc(-50% + ${endX - fromX + spread}px), calc(-50% + ${endY - fromY + spread * 0.4}px)) scale(${big ? 1.5 : 0.8})`, opacity: fade ? 0 : 0.2 },
          ], { duration, delay: i * 20, easing: "ease-in", fill: "forwards" })
        );
      });

    const run = async () => {
      if (fb.turn === "attack") {
        if (!launched.length) {
          // No launch (a resync): set the stars off from the owl first.
          void owlRef.current?.play("fire");
          Array.from(blastRef.current?.children ?? []).forEach((child) => {
            const el = child as HTMLElement;
            el.style.left = `${owlX}px`;
            el.style.top = `${owlY}px`;
          });
        }
        if (fb.correct) {
          starsTo(bossX, bossY, false, big ? 420 : 220);
          await sleep(big ? 380 : 200);
          if (!cancelled) await hitBoss();
        } else {
          // They fizzle past, over the boss's head; a cheeky bonk back.
          starsTo(bossX + target.width * 0.7, bossY - target.height * 0.9, true, 420);
          await sleep(380);
          if (cancelled) return;
          void bossRef.current?.play("taunt");
          void owlRef.current?.play("wrong");
          animations.push(shake(2));
        }
        return;
      }
      if (!launched.length) {
        void bossRef.current?.play("throw");
        await bossCues.waitFor("release", 480);
        if (cancelled) return;
      }
      const projectile = projectileRef.current;
      const box = projectile?.getBoundingClientRect();
      const base = projectile?.offsetParent?.getBoundingClientRect();
      const current = projectile?.style.transform || "translate(0, 0)";
      // The projectile's resting spot (before any transform), in the arena.
      const restX = box && base ? projectile!.offsetLeft + base.left - at.arena.left + box.width / 2 : bossX;
      const restY = box && base ? projectile!.offsetTop + base.top - at.arena.top + box.height / 2 : bossY;
      const done = () => setProjectileGone(true);
      if (fb.correct) {
        void owlRef.current?.play("block");
        await owlCues.waitFor("shield", 200);
        if (cancelled) return;
        const back = play(projectile, [
          { transform: current },
          { transform: `translate(${(owlX - restX) * 0.85}px, ${(owlY - restY) * 0.85}px) rotate(220deg)`, offset: 0.3 },
          { transform: `translate(${bossX - restX}px, ${bossY - restY}px) rotate(420deg) scale(0.5)`, opacity: 0 },
        ], { duration: big ? 760 : 640, easing: "ease-in-out", fill: "forwards" });
        animations.push(back);
        if (back) back.onfinish = done;
        else done();
        animations.push(play(shieldRef.current, [{ transform: "translate(-50%, -50%) scale(1)", opacity: 1 }, { transform: "translate(-50%, -50%) scale(1.15)", opacity: 0 }], { duration: 700, easing: "ease-out", fill: "forwards" }));
        await sleep((big ? 760 : 640) * 0.8);
        if (!cancelled) await hitBoss();
      } else {
        const land = play(projectile, [
          { transform: current },
          { transform: `translate(${owlX - restX}px, ${owlY - restY}px) rotate(260deg) scale(0.9)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${owlX - restX}px, ${owlY - restY + 20}px) rotate(300deg) scale(0.5)`, opacity: 0 },
        ], { duration: 420, easing: "ease-in", fill: "forwards" });
        animations.push(land);
        if (land) land.onfinish = done;
        else done();
        animations.push(play(shieldRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }));
        await sleep(260);
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
  }, [bossCues, fxEvent, owlCues, shake, spots]);

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
  const playersTurn = !feedback && !inEntrance && !launch;
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
  const { bubble } = geometry;
  // Very short phones: the owl's row of shields shrinks a step.
  const compact = !desktop && height < 700;
  const flashTop = geometry.move.top + bandHeight * moveScale * 0.4;

  const healthBar = (
    <div className="mt-1 h-3.5 overflow-hidden rounded-full bg-black/40" role="progressbar" aria-label={t.power(boss)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battle.bossHpPercent}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${battle.bossHpPercent}%`,
          background: powered ? "linear-gradient(180deg,#FB7185,#D21034 60%,#F59E0B)" : "linear-gradient(180deg,#F05A73,#D21034 60%,#A01028)",
        }}
      />
    </div>
  );
  const bossPanelInner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate font-bold uppercase tracking-wide ${desktop ? "text-[26px]" : "text-[20px]"}`}>{boss}</span>
        <span className={`shrink-0 rounded-full bg-[#0B4A26] px-2.5 py-0.5 font-bold text-[#D1FAE5] ${desktop ? "text-[17px]" : "text-[14px]"}`}>{t.hitsToGo(formatNumber(hitsToGo, lang))}</span>
      </div>
      {healthBar}
    </>
  );

  return (
    <div ref={arenaRef} className="absolute inset-0">
      {/* HUD. Phone: close + the boss's panel across the top. Desktop: close top-left, the boss's panel over the boss. */}
      <header ref={headerRef} className={`absolute z-10 flex items-center gap-2 ${desktop ? "left-6" : "inset-x-0 mx-auto max-w-[480px] px-3"}`} style={{ top: `calc(env(safe-area-inset-top) + ${desktop ? 24 : 12}px)` }}>
        <Link href="/lessons" aria-label={t.exit} title={t.exit} className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-white ${GLASS}`}>
          <X className="h-7 w-7" strokeWidth={3.2} aria-hidden="true" />
        </Link>
        {!desktop && <div className={`min-w-0 flex-1 rounded-[22px] px-4 pb-2.5 pt-1.5 ${GLASS}`}>{bossPanelInner}</div>}
      </header>
      {desktop && geometry.bossPanel && (
        <div className={`absolute z-10 rounded-[22px] px-5 pb-3 pt-2 ${GLASS}`} style={{ left: geometry.bossPanel.left, top: geometry.bossPanel.top, width: geometry.bossPanel.right - geometry.bossPanel.left }}>
          {bossPanelInner}
        </div>
      )}

      {/* The boss on its ledge */}
      <div ref={bossBoxRef} className="absolute" style={{ left: bossLeft, top: bossTop, width: bossSize, height: bossSize }}>
        {bossMounted && <BossCharacter ref={bossRef} bossKey={bossKey} pose={bossPose} size={bossSize} enter={inEntrance} onCue={bossCues.onCue} title={BOSS_NAMES[bossKey][lang]} />}
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
            className="relative flex items-start gap-2 rounded-[26px] bg-[#FFF8EC] py-3 pe-2.5 ps-4 text-[#1a1a1a] shadow-[0_6px_0_rgba(0,0,0,0.22)] motion-safe:animate-pop-in"
            style={bubble.scroll && !taunt ? { maxHeight: bubble.height + 4 } : undefined}
          >
            {taunt ? (
              <p aria-live="polite" className={`font-bold leading-snug ${desktop ? "text-[28px]" : "text-[19px]"}`}>{taunt}</p>
            ) : (
              <>
                <div className={`min-w-0 flex-1 self-stretch ${bubble.scroll ? "overflow-y-auto overscroll-contain pe-1 [scrollbar-color:#B45309_transparent] [scrollbar-width:thin]" : ""}`} style={bubble.scroll ? { maxHeight: bubble.height - 24 } : undefined} tabIndex={bubble.scroll ? 0 : undefined}>
                  {bubble.placement === "wide" && <div className="ms-1.5" style={{ float: "inline-end" }}>{speaker}</div>}
                  <p className="font-bold" style={{ fontSize: bubble.fontSize, lineHeight: 1.2 }}>
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
        </div>
      )}

      {/* The owl on its platform, glowing on your turn */}
      <div ref={owlBoxRef} className="absolute z-[4]" style={{ left: owlLeft, top: owlTop, width: owlSize, height: owlSize }}>
        <OwlCharacter ref={owlRef} pose={owlPose} size={owlSize} glow={playersTurn} onCue={owlCues.onCue} />
      </div>

      {/* The owl's life: its shields (and the Super Star pips) in a row under its feet */}
      <div className={`absolute z-[7] flex -translate-x-1/2 items-center gap-1.5 ${inEntrance ? "invisible" : ""}`} style={{ left: Math.max(geometry.shields.x, (comboLit > 0 ? 96 : 54) * (desktop ? 1.3 : 1) + 6), top: geometry.shields.top }}>
        <span className={`flex gap-1 rounded-full px-2 py-1 ${GLASS}`} role="img" aria-label={`${t.shields}: ${formatNumber(battle.heartsLeft, lang)}`}>
          {Array.from({ length: battle.heartsTotal }, (_, i) => (
            <OwlShieldIcon key={i} className={desktop ? "h-8 w-8" : compact ? "h-5 w-5" : "h-6 w-6"} empty={i >= battle.heartsLeft} />
          ))}
        </span>
        {comboLit > 0 && (
          <span className={`flex gap-0.5 rounded-full px-2 py-1.5 ${GLASS}`} role="img" aria-label={superReady(battle.combo) ? t.superReady : `${t.superStar} ${formatNumber(comboLit, lang)}`}>
            {[0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 24 24" className={`${desktop ? "h-6 w-6" : compact ? "h-4 w-4" : "h-5 w-5"} ${superReady(battle.combo) ? "drop-shadow-[0_0_6px_rgba(245,158,11,0.9)]" : ""}`} aria-hidden="true">
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
          feedback.correct ? null : (
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
            disabled={busy || Boolean(pending) || Boolean(launch)}
            onSubmit={submit}
            seed={question.questionId}
            prompt={prompt}
            speaker={speaker}
            skin={signature ? SKIN_PARTS[signature.skin] : null}
            bandHeight={bandHeight}
            catchRise={desktop ? 0 : Math.max(0, geometry.move.top - hudBottom - 4)}
            catchKey={`${hudBottom}:${inEntrance ? "entrance" : "play"}:${showPrompt ? prompt : ""}:${bossSize}:${geometry.mode}`}
            catchAvoid={() => {
              if (desktop) return [];
              const rects: DOMRect[] = [];
              // Layout boxes (offset*), not painted ones: the bubble pops in with a scale.
              const origin = arenaRef.current?.getBoundingClientRect();
              const box = (el: HTMLElement | null) => (el && origin ? new DOMRect(origin.left + el.offsetLeft, origin.top + el.offsetTop, el.offsetWidth, el.offsetHeight) : null);
              const bossBox = box(bossBoxRef.current);
              if (bossBox) rects.push(new DOMRect(bossBox.left, bossBox.top, bossBox.width, Math.max(bossBox.height, geometry.move.top - bossBox.top)));
              const bubbleBox = box(bubbleRef.current);
              if (bubbleBox) rects.push(bubbleBox);
              return rects;
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
        <OwlShieldBubble className={desktop ? "h-28 w-28" : "h-20 w-20"} />
      </div>
      <div ref={blastRef} key={launch?.key ?? fxEvent?.key ?? 0} className="pointer-events-none absolute inset-0 z-[8]" aria-hidden="true">
        {(launch?.turn === "attack" || (!launch && fxEvent?.feedback.turn === "attack")) &&
          Array.from({ length: fxEvent?.feedback.super || fxEvent?.result.finished ? 9 : 6 }, (_, i) => (
            <svg key={i} viewBox="0 0 24 24" className={`absolute opacity-0 ${desktop ? "h-10 w-10" : "h-7 w-7"} drop-shadow-[0_0_8px_rgba(245,158,11,0.95)]`}>
              <path d={STAR_PATH} fill="#F59E0B" />
            </svg>
          ))}
      </div>
      <div ref={powRef} className="pointer-events-none absolute z-[8] opacity-0" aria-hidden="true">
        <svg viewBox="0 0 120 80" className={`${desktop ? "h-24 w-36" : "h-16 w-24"} overflow-visible`}>
          <path d="M60 2 L70 22 L94 10 L88 32 L116 36 L92 50 L104 72 L78 62 L66 80 L56 62 L28 74 L36 52 L6 44 L32 32 L22 10 L48 22 Z" fill="#FDE68A" />
        </svg>
      </div>

      {/* the burst ("Pow!") or the big turn flash */}
      {burst && (
        <p
          aria-live="polite"
          className={`pointer-events-none absolute left-1/2 z-[9] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold leading-none motion-safe:animate-pop-in [text-shadow:0_4px_0_rgba(0,0,0,0.4)] ${desktop ? "text-[80px]" : "text-[clamp(40px,7dvh,56px)]"} ${feedback?.correct ? "text-[#FDE68A]" : "text-white"}`}
          style={{ top: flashTop }}
        >
          {burst}
        </p>
      )}
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
