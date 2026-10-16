"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  BossCharacter as RigBoss,
  OwlCharacter as RigOwl,
  type BossKey as CharacterBossKey,
  type OwlPose,
  type Pose,
} from "@/components/characters";
import type { BossKey } from "@/lib/milestones/types";

/**
 * Adapters from the milestone screens to the rigged characters in
 * @/components/characters. The battle itself uses those components directly
 * (sized from the arena anchors); everything else (intro, end screens,
 * certificate, Boss Book, the path node, teacher pages) uses these, which size
 * the character to fit their own box.
 */

// The characters keep their own copy of the boss union (no app imports). Fail
// the build if the two ever drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const bossKeysMatch: Same<BossKey, CharacterBossKey> = true;
void bossKeysMatch;

export type { Pose as CharacterPose, OwlPose };

function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize(Math.floor(Math.min(el.clientWidth || el.clientHeight, el.clientHeight || el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}

/** A rigged boss that fills its box (square). Old "wave" is now "happy". */
export function FitBoss({
  bossKey,
  pose = "idle",
  title,
  enter = false,
  className = "",
}: {
  bossKey: BossKey;
  pose?: Pose;
  title?: string;
  enter?: boolean;
  className?: string;
}) {
  const { ref, size } = useBoxSize();
  return (
    <div ref={ref} className={`relative ${className}`}>
      {size > 0 && <RigBoss bossKey={bossKey} pose={pose} size={size} title={title} enter={enter} className="absolute inset-0" />}
    </div>
  );
}

/** The rigged Amal owl, filling its box (square). */
export function FitOwl({ pose = "idle", glow = false, className = "" }: { pose?: OwlPose; glow?: boolean; className?: string }) {
  const { ref, size } = useBoxSize();
  return (
    <div ref={ref} className={`relative ${className}`} aria-hidden="true">
      {size > 0 && <RigOwl pose={pose} size={size} glow={glow} className="absolute inset-0" />}
    </div>
  );
}
