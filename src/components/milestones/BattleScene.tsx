"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
import type { AnswerResult, BattlePhase, BattleQuestion, BattleState, BossKey, Lang, MilestoneIntroResponse, OwlHint } from "@/lib/milestones/types";
import { BOSS_NAMES } from "@/lib/milestones/rules";
import { MathText, OwlShieldIcon, Projectile, ReadAloudButton, WifiOffIcon } from "./BattleParts";
import { milestoneApi, type Fetcher } from "./api";
import { bossName, formatNumber, MILESTONE_COPY, speakLine } from "./copy";
import { play, prefersReducedMotion } from "./motion";
import BattleMove, { moveOwnsPrompt } from "./moves/BattleMove";
import { hintFits, promptOf } from "./moves/contract";
import { BOSS_TAUNTS, REMATCH_TAUNT, RESUME_TAUNT, SKIN_PARTS, signatureFor } from "./signatures";
import { superReady, turnOf } from "./turns";
import { BossLinePicker, type BossLineKind } from "./bossLines";
import { speakBossLine, stopBossVoice } from "./bossVoice";
import { BIG_MOVE_SECONDS } from "@/lib/milestones/rules";
import { TimerIcon } from "@/components/icons/AmalIcons";
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
  /** The path's final boss ("The Grand Challenge"): crowned, dusk arena, a bigger finish. */
  final?: boolean;
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
  /** The Big Move's clock ran out. */
  onTimeout: () => void;
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
  // Placement ("Meet your first boss"): no tries, no hint, no combo; every answer gets the same happy reaction.
  const placement = battle.kind === "placement";
  const powered = !placement && battle.phase >= 2;
  const enraged = !placement && battle.phase === 3;
  const final = props.final === true && !placement;
  const bigMove = !placement && question.bigMove === true;
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
  // What the boss says: one line set per battle, no repeats until a kind is used up; a resume says the same things.
  const lines = useMemo(() => new BossLinePicker(bossKey, battle.battleId), [bossKey, battle.battleId]);
  const [said, setSaid] = useState<{ key: number; text: string } | null>(null);
  const speak = useCallback(
    (kind: BossLineKind, delay = 0) => {
      const id = window.setTimeout(() => {
        const line = lines.next(kind, lang);
        setSaid({ key: Date.now(), text: line.text });
        void speakBossLine(line, lang, muted).then((ms) => void bossRef.current?.play("talk", { durationMs: Math.min(4000, ms) }));
      }, delay);
      return () => window.clearTimeout(id);
    },
    [lines, lang, muted],
  );
  useEffect(() => {
    if (!said) return;
    const id = window.setTimeout(() => setSaid(null), 2800);
    return () => window.clearTimeout(id);
  }, [said]);
  useEffect(() => () => stopBossVoice(), []);
  // The Big Move's clock: seconds left, counting once the child can answer.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const timedOutRef = useRef(false);

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
  const taunt =
    activeStep === 3
      ? placement && entrance !== "resume"
        ? t.placementHello(boss)
        : (entrance === "rematch" ? REMATCH_TAUNT : entrance === "resume" ? RESUME_TAUNT : BOSS_TAUNTS[bossKey])[lang]
      : null;

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
      if (placement && entrance !== "resume") {
        // The placement's hello is the narrator's line, not a boss recording.
        const ms = Math.min(4000, Math.max(1200, taunt.length * 60));
        void bossRef.current?.play("talk", { durationMs: ms });
        if (!muted) speakLine(taunt, lang);
      } else {
        const line = lines.next(entrance === "rematch" ? "rematch" : entrance === "resume" ? "resume" : "entrance", lang);
        void speakBossLine(line, lang, muted).then((ms) => void bossRef.current?.play("talk", { durationMs: Math.min(4000, ms) }));
      }
    }
    return () => {
      cancelled = true;
      animations.forEach((a) => a?.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, entrance]);

  // ------------------------------------------------------------ the Big Move clock
  const clockKey = bigMove && !entrance && !feedback && !launched && !pending && isOnline ? `${question.questionId}:${question.position}` : null;
  useEffect(() => {
    if (!clockKey) {
      setSecondsLeft(null);
      return;
    }
    // A moment to read before the clock shows, then one tick a second.
    const started = Date.now() + 3000;
    setSecondsLeft(BIG_MOVE_SECONDS);
    const tick = window.setInterval(() => {
      const left = Math.ceil((started + BIG_MOVE_SECONDS * 1000 - Date.now()) / 1000);
      if (left <= 0) {
        window.clearInterval(tick);
        setSecondsLeft(0);
        if (!timedOutRef.current) {
          timedOutRef.current = true;
          props.onTimeout();
        }
        return;
      }
      setSecondsLeft(Math.min(BIG_MOVE_SECONDS, left));
    }, 250);
    return () => window.clearInterval(tick);
    // Restarts only when the question (or the chance to answer it) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockKey]);

  // ------------------------------------------------------------ turn flash
  const turnKey = !entrance ? `${question.questionId}:${question.position}` : null;
  useEffect(() => {
    if (!turnKey) return;
    const grumpy = !placement && battle.phase === 2 && previousPhase.current === 1;
    const rage = !placement && battle.phase === 3 && previousPhase.current < 3;
    previousPhase.current = battle.phase;
    const cancels: Array<() => void> = [];
    const id = window.setTimeout(() => {
      setLaunched(false);
      setSettled(false);
      setHeld(null);
      timedOutRef.current = false;
      setFlash({
        key: Date.now(),
        text: rage ? t.enragedFlash : bigMove ? t.bigMoveFlash : signature ? signature.name[lang] : turn === "attack" ? t.turnAttack : t.turnBlock,
        grumpy: grumpy || rage,
      });
      if (grumpy || rage) void bossRef.current?.play("powered");
      if (rage) {
        shake(6);
        cancels.push(speak("enraged", 350));
      } else if (grumpy) {
        cancels.push(speak("powered", 350));
      } else if (bigMove) {
        cancels.push(speak("bigMove", 250));
      } else if (!placement && question.position > 0 && question.position % 2 === 1 && !signature) {
        // Every other quiet turn the boss says something in its current mood.
        cancels.push(speak(enraged ? "enraged" : powered ? "powered" : "calm", 500));
      }
    }, 0);
    return () => {
      window.clearTimeout(id);
      cancels.forEach((cancel) => cancel());
    };
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

  useEffect(() => {
    if (!hint || placement) return;
    return speak("hint", 200);
    // Once per hint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint]);

  // The boss's HP (and hits to go) stay as they were until the hit lands.
  const [held, setHeld] = useState<{ hp: number; correct: number } | null>(null);
  const hpBefore = useRef(battle.bossHpPercent);
  // Which encouraging line a placement shows next (they rotate).
  const neutralAnswers = useRef(0);

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
    const knockout = !fb.neutral && result.finished && result.passed;
    const countered = bigMove && fb.correct && !fb.neutral;
    const landed = bigMove && fb.timedOut === true;
    const big = fb.super || knockout || countered;
    combat.current?.resolve(
      fb.turn,
      fb.neutral
        ? // A placement: an encouraging line (never a verdict, since it shows after wrong answers too) and a happy nod; the meter fills (no HP chunk).
          (() => {
            const cheer = t.placementCheers[neutralAnswers.current % t.placementCheers.length];
            neutralAnswers.current += 1;
            return { correct: true, big: false, knockout: false, neutral: true, hpFrom: hpBefore.current, hpTo: hpBefore.current, text: cheer, missText: cheer };
          })()
        : {
            correct: fb.correct,
            big,
            knockout,
            hpFrom: hpBefore.current,
            hpTo: result.bossHpPercent,
            text: knockout ? t.burstKo : countered ? t.burstCounter : fb.turn === "attack" ? (fb.super ? t.burstSuper : t.burstPow) : t.burstBlocked,
            missText: landed ? t.burstLanded : fb.turn === "attack" ? t.nearly : t.burstBonk,
          }
    );
    const timers: number[] = [];
    const cancels: Array<() => void> = [];
    if (!fb.correct) timers.push(window.setTimeout(() => setHeld(null), 0));
    if (knockout) timers.push(window.setTimeout(() => setKnockedOut(true), 650));
    if (!fb.neutral) {
      if (knockout) cancels.push(speak("ko", 1400));
      else if (result.finished && !result.passed) cancels.push(speak("victory", 900));
      else if (landed) {
        timers.push(window.setTimeout(() => shake(6), 500));
        cancels.push(speak("bigMoveLanded", 700));
      } else if (countered) cancels.push(speak("bigMoveCountered", 900));
      else if (!fb.correct) cancels.push(speak("stumble", 800));
      else if (result.combo > 0 && result.combo % 3 === 0) cancels.push(speak("streak", 900));
    }
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      cancels.forEach((cancel) => cancel());
    };
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
      : feedback?.neutral
        ? "happy"
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
  const canHint = !placement && battle.hintAllowed !== false && !battle.hintUsed && !feedback && !inEntrance && hintFits(interaction);
  // The boss holds its projectile until the throw (the throw takes a copy of it).
  const showProjectile = turn === "block" && !inEntrance && (!feedback || launched);
  const comboLit = !placement && battle.combo > 0 ? (superReady(battle.combo) ? 3 : battle.combo % 3) : 0;
  const hpShown = held?.hp ?? battle.bossHpPercent;
  const hitsToGo = Math.max(0, battle.requiredCorrect - (held?.correct ?? battle.correctCount));
  const contentDir = question.contentLanguage === "ar" ? "rtl" : question.contentLanguage === "en" ? "ltr" : undefined;
  const fullName = BOSS_NAMES[bossKey][lang];
  const subtitle = fullName.startsWith(boss) ? fullName.slice(boss.length).trim() : "";
  // Impact words pop at the contact point (combat.ts); only the powered-up grumble is said here.
  const bossLine = said?.text ?? null;
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

  // Placement: the same meter, framed as the boss getting to know you (it fills as you go).
  const knowShown = 100 - hpShown;
  const healthBar = placement ? (
    <div ref={hpBarRef} className="mt-1 overflow-hidden rounded-full bg-black/40" style={{ height: Math.round(hudFont * 0.7) }} role="progressbar" aria-label={t.placementMeter(boss)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={knowShown}>
      <div className="h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${knowShown}%`, background: "linear-gradient(180deg,#FDE68A,#F59E0B 60%,#D97706)" }} />
    </div>
  ) : (
    <div ref={hpBarRef} className="mt-1 overflow-hidden rounded-full bg-black/40" style={{ height: Math.round(hudFont * 0.7) }} role="progressbar" aria-label={t.power(boss)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hpShown}>
      <div
        className="h-full rounded-full transition-[width] duration-150 ease-out"
        style={{
          width: `${hpShown}%`,
          background: enraged ? "linear-gradient(180deg,#FDE68A,#F59E0B 50%,#D21034)" : powered ? "linear-gradient(180deg,#FB7185,#D21034 60%,#F59E0B)" : "linear-gradient(180deg,#F05A73,#D21034 60%,#A01028)",
        }}
      />
    </div>
  );
  const bossPanelInner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold uppercase leading-tight tracking-wide" style={{ fontSize: hudFont }}>{boss}</span>
        <span className="shrink-0 rounded-full bg-[#0B4A26] px-2.5 py-0.5 font-bold leading-tight text-[#D1FAE5]" style={{ fontSize: Math.round(hudFont * 0.7) }}>{placement ? t.placementMeterShort : t.hitsToGo(formatNumber(hitsToGo, lang))}</span>
      </div>
      {healthBar}
    </>
  );

  return (
    <div ref={arenaRef} className="absolute inset-0">
      {final && <Dusk stormy={enraged && !knockedOut} />}
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
        <div ref={bossRigRef} className={`absolute inset-0 ${enraged && !knockedOut ? "motion-safe:animate-[boss-rage_0.9s_ease-in-out_infinite] [filter:drop-shadow(0_0_16px_rgba(210,16,52,0.85))]" : ""}`}>
          {/* The Grand Challenge boss is in its final form: bigger, on a dais, inside an aura, caped and crowned. */}
          <div
            className="absolute inset-0"
            style={final ? { transform: knockedOut ? "scale(1)" : "scale(1.08)", transformOrigin: "50% 94%", transition: "transform 900ms ease-in", filter: enraged ? undefined : "drop-shadow(0 0 14px rgba(253,230,138,0.55))" } : undefined}
          >
            {final && bossMounted && <Dais size={bossSize} phase={enraged ? 3 : powered ? 2 : 1} />}
            {final && bossMounted && <Aura size={bossSize} phase={enraged ? 3 : powered ? 2 : 1} intense={Boolean(bigMove) && !feedback} fallen={knockedOut} />}
            {final && bossMounted && <Cape size={bossSize} fallen={knockedOut} />}
            {/* Positioned, so the boss paints above the cape behind it. */}
            <div className="relative h-full w-full">
              {bossMounted && <BossCharacter ref={bossRef} bossKey={bossKey} pose={bossPose} size={bossSize} enter={inEntrance} onCue={bossCues.onCue} title={BOSS_NAMES[bossKey][lang]} />}
            </div>
            {final && bossMounted && <Crown size={bossSize} fallen={knockedOut} />}
          </div>
          {final && inEntrance && bossMounted && <Strike size={bossSize} reach={bossTop} />}
        </div>
        {secondsLeft !== null && !feedback && (
          <div
            className={`pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1 font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.3)] motion-safe:animate-pop-in ${secondsLeft <= 5 ? "bg-[#D21034]" : "bg-[#7C2D12]"}`}
            style={{ top: -Math.round(hudFont * 1.4), fontSize: Math.round(hudFont * 0.85) }}
            role="timer"
            aria-live={secondsLeft <= 5 ? "assertive" : "off"}
            aria-label={t.bigMoveHurry}
          >
            <TimerIcon className="h-[1.1em] w-[1.1em]" />
            <span className="tabular-nums">{formatNumber(secondsLeft, lang)}</span>
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-black/35" aria-hidden="true">
              <span className="block h-full rounded-full bg-[#FDE68A] transition-[width] duration-200" style={{ width: `${(secondsLeft / BIG_MOVE_SECONDS) * 100}%` }} />
            </span>
          </div>
        )}
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
        {placement ? (
          // A row of dots, one per puzzle: done, this one, still to come. No tries.
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 ${GLASS}`} role="img" aria-label={t.placementProgress(formatNumber(Math.min(battle.questionCount, question.position + 1), lang), formatNumber(battle.questionCount, lang))}>
            {Array.from({ length: battle.questionCount }, (_, i) => {
              const dot = Math.max(8, Math.round(geometry.shields.icon * 0.42));
              const done = i < (feedback ? question.position + 1 : question.position);
              const here = !done && i === question.position;
              return (
                <span
                  key={i}
                  className={`block shrink-0 rounded-full ${done ? "bg-[#FDE68A]" : here ? "bg-white ring-2 ring-[#FDE68A]" : "bg-white/30"}`}
                  style={{ width: dot, height: dot }}
                />
              );
            })}
          </span>
        ) : (
          <span className={`flex gap-1 rounded-full px-2 py-1 ${GLASS}`} role="img" aria-label={`${t.shields}: ${formatNumber(battle.heartsLeft, lang)}`}>
            {Array.from({ length: battle.heartsTotal }, (_, i) => (
              <span key={i} className="block shrink-0" style={{ width: geometry.shields.icon, height: geometry.shields.icon }}>
                <OwlShieldIcon className="h-full w-full" empty={i >= battle.heartsLeft} />
              </span>
            ))}
          </span>
        )}
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
                {final && <p className={`${desktop ? "text-[30px]" : "text-[clamp(16px,2.6dvh,22px)]"} font-bold uppercase leading-tight tracking-[0.2em] text-[#FDE68A]`}>{t.grandChallenge}</p>}
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
          {placement ? (
            <span className={`rounded-full px-4 py-2 font-bold ${GLASS}`}>
              {t.placementPuzzles(formatNumber(battle.questionCount, lang))} · {t.placementNoRush}
            </span>
          ) : (
            <span className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${GLASS}`} role="img" aria-label={`${t.shieldsCount(formatNumber(battle.heartsLeft, lang))}, ${t.toWin(formatNumber(battle.requiredCorrect, lang), formatNumber(battle.questionCount, lang))}`}>
              {Array.from({ length: battle.heartsTotal }, (_, i) => (
                <OwlShieldIcon key={i} className={desktop ? "h-8 w-8" : "h-6 w-6"} empty={i >= battle.heartsLeft} />
              ))}
              <span className="ms-1 font-bold">{t.toWin(formatNumber(battle.requiredCorrect, lang), formatNumber(battle.questionCount, lang))}</span>
            </span>
          )}
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

/** The Grand Challenge's crown: on the boss's head, and knocked off at the KO. */
export function Crown({ size, fallen }: { size: number; fallen: boolean }) {
  const w = Math.round(size * 0.42);
  return (
    <svg
      viewBox="0 0 100 60"
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 ${fallen ? "motion-safe:animate-[crown-fall_1.4s_ease-in_both]" : "motion-safe:animate-[crown-bob_3s_ease-in-out_infinite]"}`}
      style={{ width: w, height: Math.round(w * 0.6), top: -Math.round(w * 0.22), transform: "translateX(-50%)" }}
    >
      <path d="M8 50 L14 16 L34 34 L50 8 L66 34 L86 16 L92 50 Z" fill="#F59E0B" stroke="#B45309" strokeWidth="3" strokeLinejoin="round" />
      <rect x="8" y="46" width="84" height="10" rx="4" fill="#FBBF24" stroke="#B45309" strokeWidth="3" />
      <circle cx="50" cy="26" r="5" fill="#D21034" />
      <circle cx="30" cy="38" r="3.5" fill="#007229" />
      <circle cx="70" cy="38" r="3.5" fill="#007229" />
    </svg>
  );
}

/** `n` points around an ellipse, rounded so the server and the client draw the same path. */
function ringPoints(n: number, cx: number, cy: number, rx: number, ry: number): Array<readonly [number, number]> {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round((cx + rx * Math.cos(a)) * 100) / 100, Math.round((cy + ry * Math.sin(a)) * 100) / 100] as const;
  });
}

/** The aura colour of each battle phase: gold while calm, orange when powered, red when enraged. */
const PHASE_GLOW: Record<BattlePhase, string> = { 1: "#FDE68A", 2: "#FB923C", 3: "#F43F5E" };

/**
 * The Grand Challenge arena at night: a deep sky wash, a moon, drifting clouds
 * and slow stars over the usual backdrop. A storm rolls in (lightning, sky
 * flashes) while the boss is enraged.
 */
export function Dusk({ stormy }: { stormy: boolean }) {
  const stars = [[8, 6], [22, 14], [37, 5], [55, 11], [71, 4], [86, 13], [93, 24], [15, 26], [64, 22], [44, 19], [30, 30], [78, 31]];
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,20,64,0.78)_0%,rgba(76,29,149,0.42)_38%,rgba(245,158,11,0.14)_62%,rgba(0,0,0,0)_100%)] mix-blend-multiply" />
      {stars.map(([x, y], i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-[#FDE68A] motion-safe:animate-[star-twinkle_2.6s_ease-in-out_infinite]"
          style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.37) % 2.6}s`, opacity: 0.8 }}
        />
      ))}
      {/* The moon, with its glow */}
      <svg viewBox="0 0 100 100" className="absolute" style={{ left: "70%", top: "4%", width: "min(18vw, 120px)", height: "min(18vw, 120px)" }}>
        <circle cx="50" cy="50" r="46" fill="#FDE68A" opacity="0.18" />
        <circle cx="50" cy="50" r="30" fill="#FFF3C4" />
        <circle cx="40" cy="42" r="6" fill="#F3DFA0" />
        <circle cx="60" cy="58" r="4" fill="#F3DFA0" />
        <circle cx="52" cy="36" r="3" fill="#F3DFA0" />
      </svg>
      {/* Drifting clouds */}
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 200 60" className="final-cloud absolute" style={{ top: `${6 + i * 9}%`, width: `${34 - i * 6}%`, animationDelay: `${-i * 13}s`, animationDuration: `${46 + i * 12}s`, opacity: stormy ? 0.75 : 0.45 }}>
          <path d="M20 50 Q10 30 34 28 Q40 8 70 14 Q90 0 112 16 Q140 4 150 30 Q182 26 184 50 Z" fill={stormy ? "#2A1C3F" : "#4C3A78"} />
        </svg>
      ))}
      {/* The storm: two bolts and a sky flash, each on its own slow cycle */}
      {stormy && (
        <>
          <div className="final-sky-flash absolute inset-0 bg-white" />
          <svg viewBox="0 0 40 120" className="final-bolt absolute" style={{ left: "14%", top: "0", width: "7%", maxWidth: 60 }}>
            <path d="M24 0 L8 50 L20 48 L6 120 L34 44 L20 46 L32 0 Z" fill="#FFF7D6" stroke="#FDE68A" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <svg viewBox="0 0 40 120" className="final-bolt absolute" style={{ left: "58%", top: "0", width: "6%", maxWidth: 50, animationDelay: "2.3s" }}>
            <path d="M24 0 L8 50 L20 48 L6 120 L34 44 L20 46 L32 0 Z" fill="#FFF7D6" stroke="#FDE68A" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </>
      )}
    </div>
  );
}

/** The Grand Challenge's dais: a stone platform with a gold rim and a glowing seal under the boss's feet. */
export function Dais({ size, phase }: { size: number; phase: BattlePhase }) {
  const w = Math.round(size * 1.3);
  const glow = PHASE_GLOW[phase];
  const runes = ringPoints(10, 100, 22, 82, 9.5);
  return (
    <svg
      viewBox="0 0 200 50"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2"
      style={{ width: w, height: Math.round(w * 0.25), bottom: -Math.round(size * 0.075), transform: "translateX(-50%)" }}
    >
      <ellipse cx="100" cy="38" rx="98" ry="11" fill="#140F24" opacity="0.55" />
      <path d="M4 22 L196 22 L192 36 Q100 48 8 36 Z" fill="#3B2A5A" />
      <path d="M4 22 L196 22 L192 36 Q100 48 8 36 Z" fill="none" stroke="#2A1C3F" strokeWidth="2" />
      <ellipse cx="100" cy="22" rx="96" ry="12" fill="#5B4A85" />
      <ellipse cx="100" cy="22" rx="96" ry="12" fill="none" stroke="#F59E0B" strokeWidth="3" />
      <ellipse className="final-seal" cx="100" cy="22" rx="60" ry="7" fill={glow} style={{ transition: "fill 600ms" }} />
      <ellipse cx="100" cy="22" rx="60" ry="7" fill="none" stroke="#FDE68A" strokeWidth="1.5" opacity="0.8" />
      {runes.map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 3} l2.4 3 -2.4 3 -2.4 -3 Z`} fill="#FDE68A" opacity="0.95" />
      ))}
    </svg>
  );
}

/** The Grand Challenge's aura: a pulsing glow and a slow ring of sparks behind the boss, hotter in each phase and racing during a Big Move. */
export function Aura({ size, phase, intense, fallen }: { size: number; phase: BattlePhase; intense: boolean; fallen: boolean }) {
  const w = Math.round(size * 1.45);
  const color = PHASE_GLOW[phase];
  const sparks = ringPoints(10, 50, 50, 45, 45);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2"
      style={{ width: w, height: w, top: Math.round(size * 0.56 - w / 2), transform: "translateX(-50%)", opacity: fallen ? 0 : 1, transition: "opacity 800ms" }}
    >
      <div
        className={`final-aura-glow absolute inset-0 rounded-full ${intense ? "is-intense" : ""}`}
        style={{ background: `radial-gradient(circle, ${color}80 0%, ${color}33 42%, transparent 68%)`, transition: "background 600ms" }}
      />
      <svg viewBox="0 0 100 100" className={`final-aura-ring absolute inset-0 ${intense ? "is-intense" : ""}`}>
        {sparks.map(([x, y], i) => (
          <path key={i} d={`M${x} ${y - 3.2} l2.3 3.2 -2.3 3.2 -2.3 -3.2 Z`} fill={i % 2 ? "#FDE68A" : color} opacity="0.95" style={{ transition: "fill 600ms" }} />
        ))}
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="0.8" strokeDasharray="3 5" opacity="0.7" style={{ transition: "stroke 600ms" }} />
      </svg>
    </div>
  );
}

/** The lightning strike that greets the Grand Challenge boss when it lands: one bolt from the top of the arena to its head, then a flash. */
export function Strike({ size, reach }: { size: number; reach: number }) {
  const h = Math.round(reach + size * 0.45);
  return (
    <svg
      viewBox="0 0 60 300"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="final-strike pointer-events-none absolute left-1/2"
      style={{ width: Math.round(size * 0.3), height: h, bottom: Math.round(size * 0.55), transform: "translateX(-50%)" }}
    >
      <path d="M34 0 L14 110 L30 106 L8 230 L22 226 L10 300 L52 150 L36 154 L56 60 L40 64 L50 0 Z" fill="#FFF7D6" stroke="#FDE68A" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

/** The Grand Challenge's cape: behind the boss, swaying; it drops with the boss at the KO. */
export function Cape({ size, fallen }: { size: number; fallen: boolean }) {
  const w = Math.round(size * 1.08);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 ${fallen ? "opacity-60" : "motion-safe:animate-[cape-sway_3.4s_ease-in-out_infinite]"}`}
      style={{ width: w, height: Math.round(size * 0.66), top: Math.round(size * 0.28), transform: "translateX(-50%)", transformOrigin: "50% 8%", transition: "opacity 600ms" }}
    >
      <path d="M22 8 C12 30 6 60 10 94 Q30 86 50 92 Q70 86 90 94 C94 60 88 30 78 8 Q50 18 22 8 Z" fill="#B3102C" stroke="#7F0A20" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M22 8 Q50 18 78 8" fill="none" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
      <path d="M10 94 Q30 86 50 92 Q70 86 90 94" fill="none" stroke="#F59E0B" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M30 20 C26 45 24 70 26 90" fill="none" stroke="#7F0A20" strokeWidth="2" opacity="0.6" />
      <path d="M70 20 C74 45 76 70 74 90" fill="none" stroke="#7F0A20" strokeWidth="2" opacity="0.6" />
      <circle cx="50" cy="12" r="4" fill="#FDE68A" stroke="#B45309" strokeWidth="1.5" />
    </svg>
  );
}
