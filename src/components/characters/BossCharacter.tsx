"use client";

import type { Ref } from "react";
import { BOSSES } from "./bosses";
import type { BossHandle, BossKey, CharacterCue, Pose } from "./types";
import { useRig } from "./useRig";

export interface BossCharacterProps {
  bossKey: BossKey;
  pose?: Pose;
  /** Rendered width and height in CSS px (the drawing is square). */
  size?: number;
  ref?: Ref<BossHandle>;
  /** Accessible name; the character is decorative when omitted. */
  title?: string;
  /** Drop in with the entrance (`land`) as soon as it mounts, before first paint. */
  enter?: boolean;
  /** Sync points inside actions (projectile release, impact, landing). */
  onCue?: (cue: CharacterCue) => void;
  className?: string;
}

/**
 * A rigged, animated Big Challenge boss.
 *
 *   const boss = useRef<BossHandle>(null);
 *   <BossCharacter bossKey="number_giant" pose={phase2 ? "powered" : "idle"} size={190} ref={boss} />
 *   await boss.current?.play("hit");
 *
 * The drawing stands on the bottom of its box and spills over it a little
 * (jumps, stars, steam), so leave the parent `overflow: visible`.
 */
export function BossCharacter({ bossKey, pose = "idle", size = 200, ref, title, enter = false, onCue, className }: BossCharacterProps) {
  const def = BOSSES[bossKey];
  const { svgRef, uid } = useRig(def.spec, pose, ref, onCue, enter);
  const Art = def.Art;
  return (
    <svg
      key={bossKey}
      ref={svgRef}
      viewBox="0 0 200 200"
      width={size}
      height={size}
      overflow="visible"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ overflow: "visible", display: "block" }}
    >
      <Art uid={uid} />
    </svg>
  );
}

export default BossCharacter;
