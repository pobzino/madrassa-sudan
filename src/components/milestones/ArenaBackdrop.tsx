import type { BossKey } from "@/lib/milestones/types";
import Arena from "./Arena";

/**
 * The swap point for arena art: the battle only ever renders
 * <ArenaBackdrop bossKey /> and reads `arenaAnchors(bossKey)` to stand the
 * characters, so painted arenas (with their own anchors) can replace these.
 *
 * Anchors are where each character's FEET touch the ground, in percent of the
 * screen (x from the start edge, y from the top): the owl on a raised hero
 * platform lower-start, the boss upper-end, the moves in between.
 */
export interface ArenaAnchors {
  owl: { x: number; y: number };
  boss: { x: number; y: number };
}

const DEFAULT_ANCHORS: ArenaAnchors = { owl: { x: 20, y: 79 }, boss: { x: 72, y: 36 } };

const ANCHORS: Partial<Record<BossKey, ArenaAnchors>> = {};

export function arenaAnchors(bossKey: BossKey): ArenaAnchors {
  return ANCHORS[bossKey] ?? DEFAULT_ANCHORS;
}

export default function ArenaBackdrop({ bossKey, powered = false, className = "" }: { bossKey: BossKey; powered?: boolean; className?: string }) {
  return <Arena bossKey={bossKey} powered={powered} className={className} />;
}
