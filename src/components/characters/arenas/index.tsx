"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BossKey } from "../types";
import { camelDesert } from "./camelDesert";
import { harfLibrary } from "./harfLibrary";
import { numboClearing } from "./numboClearing";
import { owletVillage } from "./owletVillage";
import { sproutGarden } from "./sproutGarden";
import { ARENA_H, ARENA_W, type ArenaDef, type ArenaPoint } from "./types";
import { wordyStoryland } from "./wordyStoryland";

export type { ArenaDef, ArenaPoint } from "./types";
export { ARENA_H, ARENA_W } from "./types";

export const ARENAS: Record<BossKey, ArenaDef> = {
  number_giant: numboClearing,
  letter_dragon: harfLibrary,
  word_dragon: wordyStoryland,
  letter_camel: camelDesert,
  sprout_buddy: sproutGarden,
  puzzle_owlet: owletVillage,
};

export type ArenaLayer = "back" | "mid" | "floor";

/**
 * Feet positions as a percentage of the 390 × 844 scene, for each arena:
 * the boss on its ledge and the owl on its hero platform. With a screen of
 * the same shape these are screen percentages; otherwise use `placeInArena`,
 * which accounts for the `slice` crop.
 */
export const ARENA_ANCHORS_PCT: Record<BossKey, { boss: ArenaPoint; owl: ArenaPoint }> = Object.fromEntries(
  (Object.entries(ARENAS) as [BossKey, ArenaDef][]).map(([key, def]) => [
    key,
    {
      boss: { x: +((def.anchors.boss.x / ARENA_W) * 100).toFixed(2), y: +((def.anchors.boss.y / ARENA_H) * 100).toFixed(2) },
      owl: { x: +((def.anchors.owl.x / ARENA_W) * 100).toFixed(2), y: +((def.anchors.owl.y / ARENA_H) * 100).toFixed(2) },
    },
  ]),
) as Record<BossKey, { boss: ArenaPoint; owl: ArenaPoint }>;

/** How far each layer drifts at full parallax, in CSS px. */
export const PARALLAX_DEPTH: Record<ArenaLayer, number> = { back: 4, mid: 9, floor: 16 };
const BLEED = 18;

export interface PlacedAnchor extends ArenaPoint {
  /** CSS px per arena unit at the current screen size (scale characters with it if you like). */
  scale: number;
}

/**
 * Maps an arena point to CSS px inside a box of `width` × `height` (the
 * layers are drawn with `slice`, plus a small bleed so parallax never shows
 * an edge), including that layer's parallax drift.
 */
export function placeInArena(point: ArenaPoint, width: number, height: number, layer: ArenaLayer = "mid", parallax = { x: 0, y: 0 }): PlacedAnchor {
  const w = width + BLEED * 2;
  const h = height + BLEED * 2;
  const s = Math.max(w / ARENA_W, h / ARENA_H);
  const ox = (w - ARENA_W * s) / 2 - BLEED;
  const oy = (h - ARENA_H * s) / 2 - BLEED;
  const d = PARALLAX_DEPTH[layer];
  return { x: ox + point.x * s - parallax.x * d, y: oy + point.y * s - parallax.y * d, scale: s };
}

const layerStyle = (layer: ArenaLayer, parallax: { x: number; y: number }): CSSProperties => ({
  position: "absolute",
  left: -BLEED,
  top: -BLEED,
  width: `calc(100% + ${BLEED * 2}px)`,
  height: `calc(100% + ${BLEED * 2}px)`,
  transform: `translate3d(${-parallax.x * PARALLAX_DEPTH[layer]}px, ${-parallax.y * PARALLAX_DEPTH[layer]}px, 0)`,
  transition: "transform 0.6s cubic-bezier(.2,.7,.3,1)",
  pointerEvents: "none",
});

export interface ArenaBackdropProps {
  bossKey: BossKey;
  /** -0.5..0.5 on each axis (pointer, device tilt, or a slow drift). Layers move by depth. */
  parallax?: { x: number; y: number };
  /** Render the cast on top, given the boss (ledge) and owl (floor) anchors in px. */
  children?: (anchors: { boss: PlacedAnchor; owl: PlacedAnchor }) => ReactNode;
  className?: string;
}

/**
 * A full-bleed, layered arena. Fills its positioned parent. Inline SVG only,
 * so it works offline; the motes are CSS-animated and stop under reduced motion.
 */
export function ArenaBackdrop({ bossKey, parallax = { x: 0, y: 0 }, children, className }: ArenaBackdropProps) {
  const def = ARENAS[bossKey];
  const uid = `a${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { Back, Mid, Floor } = def;
  return (
    <div ref={box} className={className} style={{ position: "absolute", inset: 0, overflow: "hidden", background: def.base }}>
      <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} preserveAspectRatio="xMidYMid slice" style={layerStyle("back", parallax)} aria-hidden="true">
        <Back uid={uid} />
      </svg>
      <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} preserveAspectRatio="xMidYMid slice" style={layerStyle("mid", parallax)} aria-hidden="true">
        <Mid uid={uid} />
      </svg>
      <svg viewBox={`0 0 ${ARENA_W} ${ARENA_H}`} preserveAspectRatio="xMidYMid slice" style={layerStyle("floor", parallax)} aria-hidden="true">
        <Floor uid={uid} />
      </svg>
      <Motes color={def.motes.color} glow={def.motes.glow} />
      {size &&
        children?.({
          boss: placeInArena(def.anchors.boss, size.w, size.h, "mid", parallax),
          owl: placeInArena(def.anchors.owl, size.w, size.h, "floor", parallax),
        })}
    </div>
  );
}

const MOTES = [
  [12, 30, 0, 7],
  [26, 58, 2.1, 9],
  [44, 22, 4.3, 8],
  [63, 64, 1.2, 10],
  [78, 40, 3.4, 7.5],
  [88, 70, 5.6, 9],
  [34, 76, 6.2, 8.5],
  [70, 14, 2.8, 11],
] as const;

/** A handful of drifting glow dots. Transform and opacity only; off under reduced motion. */
function Motes({ color, glow }: { color: string; glow: string }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <style>{`
        @keyframes amal-mote {
          0% { transform: translate3d(0, 0, 0) scale(.6); opacity: 0; }
          20% { opacity: 1; }
          50% { transform: translate3d(10px, -18px, 0) scale(1); opacity: .9; }
          80% { opacity: .8; }
          100% { transform: translate3d(-6px, -40px, 0) scale(.7); opacity: 0; }
        }
        .amal-mote { position: absolute; width: 5px; height: 5px; border-radius: 50%; animation: amal-mote linear infinite; will-change: transform, opacity; opacity: 0; }
        @keyframes amal-sway {
          from { transform: rotate(calc(var(--amal-sway, 3deg) * -1)); }
          to { transform: rotate(var(--amal-sway, 3deg)); }
        }
        .amal-sway { transform-box: view-box; animation: amal-sway 5s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .amal-mote { animation: none; opacity: .55; }
          .amal-sway { animation: none; }
        }
      `}</style>
      {MOTES.map(([x, y, delay, dur], i) => (
        <span
          key={i}
          className="amal-mote"
          style={{ left: `${x}%`, top: `${y}%`, background: color, boxShadow: `0 0 8px 3px ${glow}`, animationDuration: `${dur}s`, animationDelay: `-${delay}s` }}
        />
      ))}
    </div>
  );
}
