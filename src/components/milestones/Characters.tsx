"use client";

import { forwardRef, useImperativeHandle, useRef, type ComponentType } from "react";
import { OwlCelebrating, OwlConfused, OwlCorrect, OwlEncouraging, OwlExcited, OwlSleeping, OwlThinking } from "@/components/illustrations";
import type { BossKey } from "@/lib/milestones/types";
import Boss, { type BossMood } from "./Boss";
import { prefersReducedMotion } from "./motion";

/**
 * The swap point for the character art. Every boss and owl drawing in the
 * Big Challenge goes through these two components, so rigged, animated
 * characters can replace them later without touching the battle:
 *
 *   <BossCharacter bossKey pose ref />   <OwlCharacter pose ref />
 *   ref.current.play(action): Promise<void>   (one-shot actions)
 *
 * For now the poses map onto the flat SVGs, and actions are short WAAPI
 * transforms (under a second; an opacity blink under reduced motion).
 */
export type CharacterPose = "idle" | "taunt" | "windup" | "throw" | "hit" | "dizzy" | "ko" | "powered" | "happy" | "sleep";
export type CharacterAction = "hit" | "throw" | "block" | "fire" | "blink" | "land" | "victory";

export interface CharacterHandle {
  play(action: CharacterAction | string): Promise<void>;
  /** The element that moves, for effects that need its position. */
  element(): HTMLElement | null;
}

const ACTIONS: Record<CharacterAction, { frames: Keyframe[]; duration: number; easing?: string }> = {
  hit: {
    frames: [
      { transform: "rotate(0deg) scale(1)" },
      { transform: "rotate(-9deg) scale(0.92)" },
      { transform: "rotate(6deg) scale(0.97)" },
      { transform: "rotate(-2deg) scale(0.99)" },
      { transform: "rotate(0deg) scale(1)" },
    ],
    duration: 600,
  },
  throw: {
    frames: [{ transform: "translateX(0) rotate(0deg)" }, { transform: "translateX(-8%) rotate(-8deg)" }, { transform: "translateX(0) rotate(0deg)" }],
    duration: 450,
  },
  block: {
    frames: [{ transform: "scale(1, 1)" }, { transform: "scale(1.12, 0.86)" }, { transform: "scale(0.96, 1.05)" }, { transform: "scale(1, 1)" }],
    duration: 450,
  },
  fire: {
    frames: [{ transform: "translate(0, 0)" }, { transform: "translate(-4%, 3%) rotate(-6deg)" }, { transform: "translate(0, 0)" }],
    duration: 320,
  },
  blink: { frames: [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], duration: 250 },
  land: {
    frames: [{ transform: "scale(1, 1)" }, { transform: "scale(1.1, 0.88)" }, { transform: "scale(0.97, 1.04)" }, { transform: "scale(1, 1)" }],
    duration: 420,
  },
  victory: {
    frames: [{ transform: "translateY(0)" }, { transform: "translateY(-14%)" }, { transform: "translateY(0)" }, { transform: "translateY(-7%)" }, { transform: "translateY(0)" }],
    duration: 900,
  },
};

function useActions() {
  const ref = useRef<HTMLDivElement>(null);
  const play = (action: string) =>
    new Promise<void>((resolve) => {
      const el = ref.current;
      const spec = ACTIONS[action as CharacterAction];
      if (!el || !spec || typeof el.animate !== "function") return resolve();
      const animation = prefersReducedMotion()
        ? el.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 300 })
        : el.animate(spec.frames, { duration: spec.duration, easing: spec.easing ?? "ease-in-out" });
      animation.onfinish = () => resolve();
      animation.oncancel = () => resolve();
    });
  return { ref, play };
}

const BOSS_MOOD: Record<CharacterPose, BossMood> = {
  idle: "curious",
  taunt: "cheeky",
  windup: "curious",
  throw: "cheeky",
  hit: "hit",
  dizzy: "dizzy",
  ko: "ko",
  powered: "curious",
  happy: "wave",
  sleep: "sleep",
};

export const BossCharacter = forwardRef<
  CharacterHandle,
  { bossKey: BossKey; pose: CharacterPose; level?: number; powered?: boolean; title?: string; className?: string }
>(function BossCharacter({ bossKey, pose, level = 1, powered = false, title, className = "" }, ref) {
  const { ref: el, play } = useActions();
  useImperativeHandle(ref, () => ({ play, element: () => el.current }));
  return (
    <div ref={el} className={className}>
      <Boss
        bossKey={bossKey}
        level={level}
        mood={BOSS_MOOD[pose]}
        powered={powered || pose === "powered"}
        animate={typeof window !== "undefined" && !prefersReducedMotion()}
        title={title}
        className="h-full w-full drop-shadow-[0_10px_16px_rgba(0,0,0,0.35)]"
      />
    </div>
  );
});

// The app's own owl mascot (red owl, green cap) from the illustrations set.
const OWL_ART: Record<CharacterPose, ComponentType<{ className?: string }>> = {
  idle: OwlThinking,
  taunt: OwlExcited,
  windup: OwlThinking,
  throw: OwlExcited,
  hit: OwlEncouraging,
  dizzy: OwlConfused,
  ko: OwlEncouraging,
  powered: OwlExcited,
  happy: OwlCorrect,
  sleep: OwlSleeping,
};

export const OwlCharacter = forwardRef<CharacterHandle, { pose: CharacterPose; celebrate?: boolean; className?: string }>(function OwlCharacter(
  { pose, celebrate = false, className = "" },
  ref
) {
  const { ref: el, play } = useActions();
  useImperativeHandle(ref, () => ({ play, element: () => el.current }));
  const Art = celebrate ? OwlCelebrating : OWL_ART[pose];
  return (
    <div ref={el} className={`${className} motion-reduce:[&_*]:[animation:none!important]`} aria-hidden="true">
      <Art className="h-full w-full" />
    </div>
  );
});
