"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import ConfettiBurst from "@/components/practice/ConfettiBurst";
import { PathOwl, pathOwlFlightMs } from "@/components/learning-path/PathOwl";
import { usePrefetchBattle } from "@/components/milestones/usePrefetchBattle";
import { ARENAS, BossCharacter, OWL_FOOT, OwlCharacter, type BossHandle, type OwlHandle } from "@/components/characters";
import { bossName, formatNumber } from "@/components/milestones/copy";
import type { TreeMilestone } from "@/lib/lessons/useLearningPath";

/**
 * The Big Challenge on the learning path: the hero of the road. A round
 * window into the boss's arena with a gold rim, slow light rays and a soft
 * glow, the rigged boss alive in it (an idle loop and a taunt every few
 * seconds), a red "BOSS BATTLE" ribbon, one line of copy and a big Battle!
 * button. Animations are transform/opacity only, run only while the node is
 * on screen, and only one node animates at a time.
 */
const COPY = {
  en: {
    ribbon: "BOSS BATTLE",
    beatToOpen: (boss: string, week: string) => `Beat ${boss} to open Week ${week}!`,
    locked: (a: string, b: string) => `Finish weeks ${a}–${b} first`,
    inBattle: (boss: string) => `${boss} is waiting for you!`,
    passed: (boss: string) => `You beat ${boss}!`,
    offline: "Needs internet",
    battle: "Battle!",
    continue: "Continue",
    bossBook: "Boss Book",
    /** The face-off when the owl stands on the node: [boss, owl]. */
    faceOff: [
      ["Ready to lose, little owl?", "Let's battle!"],
      ["My puzzles are too tricky!", "I've been practising!"],
      ["You can't beat me!", "Watch me!"],
      ["Come and get me!", "Here I come!"],
    ],
  },
  ar: {
    ribbon: "معركة الوحش",
    beatToOpen: (boss: string, week: string) => `اهزم ${boss} لتفتح الأسبوع ${week}!`,
    locked: (a: string, b: string) => `أكمل الأسابيع ${a}–${b} أولاً`,
    inBattle: (boss: string) => `${boss} ينتظرك!`,
    passed: (boss: string) => `لقد هزمت ${boss}!`,
    offline: "يحتاج إلى إنترنت",
    battle: "إلى المعركة!",
    continue: "أكمل",
    bossBook: "كتاب الوحوش",
    faceOff: [
      ["مستعد تخسر يا بومة؟", "يلا نتحدى!"],
      ["ألغازي صعبة جداً!", "لقد تدرّبت!"],
      ["لن تغلبني!", "راقبني!"],
      ["تعال واهزمني!", "أنا قادم!"],
    ],
  },
} as const;

/** Shown under the node: one short line. */
export function milestoneLabel(m: TreeMilestone, lang: "ar" | "en", isOnline: boolean) {
  const t = COPY[lang];
  const boss = bossName(m.bossKey, lang, true);
  const sub =
    m.state === "passed"
      ? t.passed(boss)
      : !isOnline
        ? t.offline
        : m.state === "locked"
          ? t.locked(formatNumber(m.firstWeekNumber, lang), formatNumber(m.afterWeekNumber, lang))
          : m.state === "in_battle"
            ? t.inBattle(boss)
            : t.beatToOpen(boss, formatNumber(m.afterWeekNumber + 1, lang));
  return { title: `${t.ribbon} · ${boss}`, sub, muted: m.state === "locked" || (!isOnline && m.state !== "passed") };
}

export function milestoneCta(m: TreeMilestone, lang: "ar" | "en"): string {
  const t = COPY[lang];
  return m.state === "passed" ? t.bossBook : m.state === "in_battle" ? t.continue : t.battle;
}

/** Passed: the Boss Book card. Open and online: the challenge. Otherwise nothing to open. */
export function milestoneHref(m: TreeMilestone, isOnline: boolean): string | null {
  if (m.state === "passed") return `/boss-book#${m.bossKey}`;
  // Straight into the fight: the boss's entrance is the intro.
  if ((m.state === "available" || m.state === "in_battle") && isOnline) return `/milestones/${m.id}/battle?boss=${m.bossKey}`;
  return null;
}

/* ---------------------------------------- one animated node at a time */

let activeNode: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Layout constants the tree uses to give the hero room. */
export const HERO_WINDOW = 104;
export const HERO_ROOM_ABOVE = 86;
export const HERO_ROOM_BELOW = 240;

const STAR_PATH = "M12 2.5 l2.9 6 6.6 .8 -4.9 4.6 1.3 6.5 -5.9 -3.3 -5.9 3.3 1.3 -6.5 -4.9 -4.6 6.6 -.8 z";
const BOSS_SIZE = 96;
const OWL_SIZE = 82;
/** One face-off every 8 seconds. */
const CYCLE_MS = 8000;

export function MilestoneHero({
  milestone,
  lang,
  isOnline,
  isCurrent,
  href,
  onSelect,
  owlFrom,
}: {
  milestone: TreeMilestone;
  lang: "ar" | "en";
  isOnline: boolean;
  isCurrent: boolean;
  href: string | null;
  /** Like a lesson node: the first tap brings the owl here; only the button opens the battle. */
  onSelect?: () => void;
  /** Where the path owl was before it was sent here (node centre offset), so it can fly over. */
  owlFrom?: { dx: number; dy: number; key: string } | null;
}) {
  const t = COPY[lang];
  const { state, bossKey } = milestone;
  const boss = bossName(bossKey, lang, true);
  const passed = state === "passed";
  const locked = state === "locked";
  const dim = !isOnline && !passed;
  const label = milestoneLabel(milestone, lang, isOnline);
  const arena = ARENAS[bossKey];
  const uid = `h${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<BossHandle>(null);
  const owlRef = useRef<OwlHandle>(null);
  const bossBoxRef = useRef<HTMLDivElement>(null);
  const owlBoxRef = useRef<HTMLDivElement>(null);
  const sparkRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [bossSays, setBossSays] = useState<string | null>(null);
  const [owlSays, setOwlSays] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(0);
  // The owl flies in from the previous node exactly like it does between lessons
  // (the path's own flying owl), then the rigged owl takes over on landing.
  const W = HERO_WINDOW + 14;
  const owlSpot = { left: -OWL_SIZE + 6, top: W * 0.86 - OWL_SIZE * OWL_FOOT.y };
  // Owl centre relative to the window centre (the node's point on the path).
  const owlOffset = { x: owlSpot.left + OWL_SIZE / 2 - W / 2, y: owlSpot.top + OWL_SIZE / 2 - W / 2 };
  const [flight, setFlight] = useState<{ dx: number; dy: number; key: string } | null>(null);

  // Selected and open: load the battle in the background so Battle! is instant.
  const { prefetchBattle, startBattle } = usePrefetchBattle();
  const fightable = (state === "available" || state === "in_battle") && isOnline;
  useEffect(() => {
    if (isCurrent && fightable) prefetchBattle(milestone.id, bossKey);
  }, [isCurrent, fightable, milestone.id, bossKey, prefetchBattle]);
  const isActive = useSyncExternalStore(subscribe, () => activeNode === milestone.id, () => false);
  const reduceMotion = useSyncExternalStore(
    (cb) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", cb);
      return () => media.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true
  );

  const flightKey = isCurrent && owlFrom ? owlFrom.key : null;
  useLayoutEffect(() => {
    if (!flightKey || !owlFrom || reduceMotion) return;
    // The path owl rides 32px above a lesson node's centre.
    const dx = owlFrom.dx - owlOffset.x;
    const dy = owlFrom.dy - 32 - owlOffset.y;
    if (Math.hypot(owlFrom.dx, owlFrom.dy) < 1) return;
    setFlight({ dx, dy, key: flightKey });
    const landed = window.setTimeout(() => setFlight(null), pathOwlFlightMs(dx, dy));
    return () => window.clearTimeout(landed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey, reduceMotion]);

  // On screen? Only then is the boss mounted and animated.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Claim the single "animated node" slot while visible; give it back when not.
  const claim = useCallback(() => {
    if (visible && activeNode === null) {
      activeNode = milestone.id;
      notify();
    }
  }, [milestone.id, visible]);
  useEffect(() => {
    claim();
    const unsubscribe = subscribe(claim);
    return () => {
      unsubscribe();
      if (activeNode === milestone.id) {
        activeNode = null;
        notify();
      }
    };
  }, [claim, milestone.id]);

  // The owl stands on this node (it's the learner's current step): the two
  // face off. Awake when the owl is here or a battle is under way; asleep
  // otherwise; knocked out once beaten.
  const animate = isActive && !reduceMotion;
  const owlHere = (isCurrent || passed) && !locked;
  const awake = !locked && !passed && (isCurrent || state === "in_battle");
  const facingOff = isActive && isCurrent && awake && isOnline && !flight;
  // Reduced motion: a still face-off with one line, no loop.
  const stillLine = facingOff && reduceMotion ? t.faceOff[0][0] : null;
  useEffect(() => {
    if (!facingOff || reduceMotion) return;
    const timers: number[] = [];
    const animations: Animation[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    const move = (el: HTMLElement | null, frames: Keyframe[], duration: number) => {
      const animation = el?.animate(frames, { duration, easing: "ease-in-out" });
      if (animation) animations.push(animation);
    };
    let round = 0;
    const cycle = () => {
      const [bossLine, owlLine] = t.faceOff[round % t.faceOff.length];
      round += 1;
      // 1. (the owl has already flown in and landed, once) 2. the boss notices: leans in, taunts
      at(900, () => {
        move(bossBoxRef.current, [{ transform: "rotate(0deg) translateX(0)" }, { transform: "rotate(-7deg) translateX(-6px)" }, { transform: "rotate(-7deg) translateX(-6px)", offset: 0.8 }, { transform: "rotate(0deg) translateX(0)" }], 1900);
        void bossRef.current?.play("taunt");
        setBossSays(bossLine);
      });
      at(2900, () => setBossSays(null));
      // 3. the owl answers: puffs up, determined
      at(3100, () => {
        move(owlBoxRef.current, [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1.08)", offset: 0.7 }, { transform: "scale(1)" }], 900);
        void owlRef.current?.play("talk", { durationMs: 1400 });
        setOwlSays(owlLine);
      });
      at(5000, () => setOwlSays(null));
      // 4. a star clash between them, and a little bounce from both
      at(5150, () => {
        move(sparkRef.current, [{ transform: "scale(0) rotate(0deg)", opacity: 0 }, { transform: "scale(1.25) rotate(25deg)", opacity: 1, offset: 0.4 }, { transform: "scale(0.9) rotate(45deg)", opacity: 0 }], 650);
        const bounce: Keyframe[] = [{ transform: "translateY(0)" }, { transform: "translateY(-8px)" }, { transform: "translateY(0)" }];
        move(bossBoxRef.current, bounce, 420);
        move(owlBoxRef.current, bounce, 420);
      });
    };
    cycle();
    const every = window.setInterval(cycle, CYCLE_MS);
    return () => {
      window.clearInterval(every);
      timers.forEach((id) => window.clearTimeout(id));
      animations.forEach((animation) => animation.cancel());
      setBossSays(null);
      setOwlSays(null);
    };
  }, [facingOff, reduceMotion, t.faceOff]);

  // Beaten, with the owl beside the knocked-out boss: one cheer.
  const cheered = useRef(false);
  useEffect(() => {
    if (!passed || !visible || !owlHere || cheered.current) return;
    cheered.current = true;
    const id = window.setTimeout(() => void owlRef.current?.play("cheer"), 500);
    return () => window.clearTimeout(id);
  }, [owlHere, passed, visible]);

  // Beaten: a confetti burst the first time it is seen.
  useEffect(() => {
    if (!passed || !visible) return;
    const key = `amal-boss-confetti-${milestone.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    const id = window.setTimeout(() => setConfetti((n) => n + 1), 300);
    return () => window.clearTimeout(id);
  }, [milestone.id, passed, visible]);

  // The window shows the arena around the boss's ledge.
  const crop = { x: arena.anchors.boss.x - 120, y: arena.anchors.boss.y - 175, size: 240 };
  const feetY = ((arena.anchors.boss.y - crop.y) / crop.size) * HERO_WINDOW - HERO_WINDOW / 2;
  const raysOn = !locked && !passed && !dim;
  const play = animate ? "running" : "paused";

  const windowArt = (
    <div className="relative" style={{ width: HERO_WINDOW + 14, height: HERO_WINDOW + 14 }}>
      {/* the thick gold rim */}
      <div
        className={`absolute inset-0 rounded-full shadow-[0_6px_0_#92400E,0_10px_24px_rgba(146,64,14,0.35)] ${isCurrent ? "ring-4 ring-amber-200" : ""}`}
        style={{ background: locked || dim ? "linear-gradient(160deg,#E5E7EB,#9CA3AF)" : "linear-gradient(160deg,#FEF3C7 0%,#F59E0B 40%,#B45309 100%)" }}
      />
      {/* the window into the boss's arena */}
      <div className="absolute inset-[7px] overflow-hidden rounded-full" style={{ background: arena.base }}>
        <svg
          viewBox={`${crop.x} ${crop.y} ${crop.size} ${crop.size}`}
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          style={locked || dim ? { filter: "grayscale(0.8) brightness(0.9)" } : undefined}
          aria-hidden="true"
        >
          <arena.Back uid={uid} />
          <arena.Mid uid={uid} />
        </svg>
        {locked && (
          // gate bars over the window
          <div className="absolute inset-0" aria-hidden="true">
            {[16, 34, 52, 70, 88].map((x) => (
              <span key={x} className="absolute inset-y-0 w-[7px] rounded-full bg-[#374151] shadow-[inset_-2px_0_0_rgba(255,255,255,0.25)]" style={{ left: `${x}%`, transform: "translateX(-50%)" }} />
            ))}
            <span className="absolute inset-x-0 top-[38%] h-[7px] bg-[#374151]" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={`relative flex flex-col items-center ${dim ? "opacity-60" : ""}`} style={{ width: 230 }}>
      {/* slow light rays and a soft pulsing glow behind the window */}
      {raysOn && (
        <>
          <div
            className="pointer-events-none absolute left-1/2 rounded-full"
            aria-hidden="true"
            style={{
              top: (HERO_WINDOW + 14) / 2 - 115,
              width: 230,
              height: 230,
              marginLeft: -115,
              background: "repeating-conic-gradient(from 0deg, rgba(253,230,138,0.55) 0deg 9deg, rgba(253,230,138,0) 9deg 24deg)",
              WebkitMaskImage: "radial-gradient(circle, #000 30%, transparent 70%)",
              maskImage: "radial-gradient(circle, #000 30%, transparent 70%)",
              animation: reduceMotion ? undefined : "amal-hero-spin 24s linear infinite",
              animationPlayState: play,
            }}
          />
          <div
            className="pointer-events-none absolute left-1/2 rounded-full"
            aria-hidden="true"
            style={{
              top: (HERO_WINDOW + 14) / 2 - 85,
              width: 170,
              height: 170,
              marginLeft: -85,
              background: "radial-gradient(circle, rgba(251,191,36,0.55), rgba(251,191,36,0) 68%)",
              animation: reduceMotion ? undefined : "amal-hero-pulse 2.4s ease-in-out infinite alternate",
              animationPlayState: play,
            }}
          />
        </>
      )}
      <style>{`
        @keyframes amal-hero-spin { to { transform: rotate(360deg); } }
        @keyframes amal-hero-pulse { from { transform: scale(0.94); opacity: .75; } to { transform: scale(1.1); opacity: 1; } }
        @keyframes amal-hero-btn { from { transform: scale(1); } to { transform: scale(1.06); } }
      `}</style>

      {/* pennant flags at the node */}
      {!locked && (
        <>
          {!owlHere && <Pennant className="absolute -left-1 top-[38px]" />}
          <Pennant className="absolute -right-1 top-[38px] -scale-x-100" />
        </>
      )}

      <div className="relative">
        {href && onSelect ? (
          <button type="button" onClick={onSelect} aria-label={`${label.title}: ${label.sub}`} className="block rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300">
            {windowArt}
          </button>
        ) : (
          windowArt
        )}

        {/* the boss, feet on its ledge, head popping out over the rim */}
        <div
          ref={bossBoxRef}
          className="pointer-events-none absolute left-1/2"
          style={{ width: BOSS_SIZE, height: BOSS_SIZE, marginLeft: -BOSS_SIZE / 2, top: (HERO_WINDOW + 14) / 2 + feetY - BOSS_SIZE * 0.94, transformOrigin: "50% 100%" }}
        >
          {visible && (
            <BossCharacter
              ref={bossRef}
              bossKey={bossKey}
              pose={passed ? "ko" : !awake ? "sleep" : state === "in_battle" ? "hit" : "idle"}
              size={BOSS_SIZE}
              title={bossName(bossKey, lang)}
              className={locked || dim ? "[filter:grayscale(0.85)]" : undefined}
            />
          )}
          {!awake && !passed && (
            <span className="absolute -right-2 top-0 text-sm font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]" aria-hidden="true">
              z<span className="text-xs">z</span>
            </span>
          )}
          {state === "in_battle" && (
            // a bandage on the boss's head
            <span className="absolute left-[30%] top-[12%] h-2.5 w-8 -rotate-[25deg] rounded-sm bg-white shadow ring-1 ring-rose-200" aria-hidden="true" />
          )}
        </div>

        {/* the face-off: small bubbles and a star clash between them */}
        {(bossSays ?? stillLine) && (
          <p aria-live="polite" className="pointer-events-none absolute -top-[58px] left-[46%] z-10 whitespace-nowrap rounded-[14px] bg-white px-2.5 py-1 text-[12px] font-bold text-[#1a1a1a] shadow-md motion-safe:animate-pop-in">
            {bossSays ?? stillLine}
          </p>
        )}
        <span ref={sparkRef} className="pointer-events-none absolute -left-[22px] top-[18px] z-10 opacity-0" aria-hidden="true">
          <svg viewBox="0 0 40 40" className="h-10 w-10"><path d="M20 0 L24 14 L40 12 L27 22 L36 38 L20 28 L4 38 L13 22 L0 12 L16 14 Z" fill="#FDE68A" stroke="#F59E0B" strokeWidth={2} strokeLinejoin="round" /></svg>
        </span>

        {/* Amowl, standing on this node beside the window */}
        {flight && (
          <div
            key={flight.key}
            className="pointer-events-none absolute z-20"
            style={{ left: owlSpot.left + OWL_SIZE / 2 - 32, top: owlSpot.top + OWL_SIZE / 2 - 32 }}
          >
            <PathOwl dx={flight.dx} dy={flight.dy} />
          </div>
        )}
        {owlHere && visible && (
          <div
            ref={owlBoxRef}
            className="absolute z-[5]"
            style={{ width: OWL_SIZE, height: OWL_SIZE, left: owlSpot.left, top: owlSpot.top, transformOrigin: "50% 100%", opacity: flight ? 0 : 1 }}
          >
            <OwlCharacter ref={owlRef} pose={passed ? "cheer" : "idle"} size={OWL_SIZE} glow={Boolean(href) && animate && awake} />
            {owlSays && (
              <p aria-live="polite" className="pointer-events-none absolute -top-[30px] right-[-6px] z-10 whitespace-nowrap rounded-[14px] bg-[#007229] px-2.5 py-1 text-[12px] font-bold text-white shadow-md motion-safe:animate-pop-in">
                {owlSays}
              </p>
            )}
          </div>
        )}

        {/* in battle: the boss's health on the rim */}
        {state === "in_battle" && (
          <span className="absolute -top-1 left-1/2 h-2.5 w-16 -translate-x-1/2 overflow-hidden rounded-full bg-black/40 ring-2 ring-white" aria-hidden="true">
            <span className="block h-full w-1/2 rounded-full bg-[#D21034]" />
          </span>
        )}

        {/* beaten: the gold trophy */}
        {passed && (
          <span className="absolute -right-2 -top-1 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-gradient-to-b from-amber-300 to-amber-500 shadow-md" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white"><path fill="currentColor" d="M7 4h10v3a5 5 0 0 1-10 0V4Zm-3 1h3v2.2A3 3 0 0 1 4 5Zm16 0h-3v2.2A3 3 0 0 0 20 5ZM11 13h2v3h3v2H8v-2h3v-3Z" /></svg>
          </span>
        )}

        {/* needs internet */}
        {dim && (
          <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-sky-700 text-white shadow" aria-hidden="true">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M4 3l16 18" /></svg>
          </span>
        )}

        {/* the red BOSS BATTLE ribbon across the bottom of the window */}
        <div className="pointer-events-none absolute left-1/2 top-[74%] w-[176px] -translate-x-1/2" aria-hidden="true">
          <div className={`px-3 py-1 text-center shadow-[0_4px_0_rgba(0,0,0,0.25)] ${locked || dim ? "bg-[#6B7280]" : "bg-[#D21034]"}`} style={{ transform: "skewY(-5deg)" }}>
            <p className="text-[10px] font-bold leading-none tracking-[0.18em] text-[#FDE68A]">{t.ribbon}</p>
            <p className="text-[20px] font-bold uppercase leading-tight tracking-wide text-white [text-shadow:0_2px_0_rgba(0,0,0,0.3)]">{boss}</p>
          </div>
        </div>
      </div>

      {/* beaten: the stars kept */}
      {passed && milestone.stars && (
        <span className="mt-10 flex gap-0.5" role="img" aria-label={`${formatNumber(milestone.stars, lang)} / ${formatNumber(3, lang)}`}>
          {[1, 2, 3].map((n) => (
            <svg key={n} viewBox="0 0 24 24" className="h-6 w-6 drop-shadow" aria-hidden="true">
              <path d={STAR_PATH} fill={n <= (milestone.stars ?? 0) ? "#F59E0B" : "#E5E7EB"} />
            </svg>
          ))}
        </span>
      )}

      {/* one line of copy, then the big button */}
      <p
        className={`${passed ? "mt-1" : "mt-11"} max-w-[220px] text-center font-fredoka text-[13px] font-bold leading-snug ${label.muted ? "text-gray-500" : "text-[#9A3412]"}`}
        style={{ textShadow: "0 0 6px rgba(255,255,255,0.95), 0 1px 2px rgba(255,255,255,0.95)" }}
      >
        {label.sub}
      </p>
      {href && isCurrent && (
        <Link
          href={href}
          onClick={() => {
            if (fightable) startBattle(milestone.id);
          }}
          className={`mt-2 inline-flex h-12 items-center justify-center rounded-full px-7 font-fredoka text-[18px] font-bold shadow-[0_5px_0_rgba(0,0,0,0.2),inset_0_3px_0_rgba(255,255,255,0.35)] ${
            passed
              ? "bg-[linear-gradient(180deg,#FDE68A,#F59E0B_55%,#D97706)] text-[#3B1D00]"
              : "bg-[linear-gradient(180deg,#F05A73,#D21034_55%,#A01028)] text-white [text-shadow:0_2px_0_rgba(0,0,0,0.25)]"
          }`}
          style={state === "available" && !reduceMotion ? { animation: "amal-hero-btn 1.2s ease-in-out infinite alternate", animationPlayState: play } : undefined}
        >
          {milestoneCta(milestone, lang)}
        </Link>
      )}

      <ConfettiBurst burst={confetti} big originY={0.25} className="-inset-16 !h-[calc(100%+8rem)] !w-[calc(100%+8rem)]" />
    </div>
  );
}

function Pennant({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 40" className={`h-10 w-7 ${className}`} aria-hidden="true">
      <path d="M4 2 V38" stroke="#7A4A26" strokeWidth={3} strokeLinecap="round" />
      <path d="M5 4 L26 10 L5 17 Z" fill="#D21034" />
      <path d="M5 4 L26 10 L5 10 Z" fill="#F05A73" />
    </svg>
  );
}
