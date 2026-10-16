import type { ComponentType } from "react";

/** Arenas are drawn in a 390 × 844 portrait box and fill the screen with `slice`. */
export const ARENA_W = 390;
export const ARENA_H = 844;

export interface ArenaPoint {
  x: number;
  y: number;
}

export interface ArenaDef {
  name: string;
  /** Solid colour behind everything (shows while layers load, and in the bleed). */
  base: string;
  /** Far layer: sky or back wall, distant silhouettes, the light pool behind the boss. */
  Back: ComponentType<{ uid: string }>;
  /** Middle layer: mid foliage or furniture and the boss's raised ledge. */
  Mid: ComponentType<{ uid: string }>;
  /** Near layer: the warm foreground where the owl stands, and the framing at the edges. */
  Floor: ComponentType<{ uid: string }>;
  /** Where feet go, in the 390 × 844 box: the boss on its ledge (mid layer), the owl on the floor. */
  anchors: { boss: ArenaPoint; owl: ArenaPoint };
  /** Ambient motes (fireflies, dust, pollen). */
  motes: { color: string; glow: string };
}
