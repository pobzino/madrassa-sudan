"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BossKey } from "../types";
import { camelDesert } from "./camelDesert";
import { harfLibrary } from "./harfLibrary";
import { numboClearing } from "./numboClearing";
import { owletVillage } from "./owletVillage";
import { sproutGarden } from "./sproutGarden";
import { camelLandscape } from "./landscape/camel";
import { harfLandscape } from "./landscape/harf";
import { numboLandscape } from "./landscape/numbo";
import { owletLandscape } from "./landscape/owlet";
import { sproutLandscape } from "./landscape/sprout";
import { wordyLandscape } from "./landscape/wordy";
import { ARENA_H, ARENA_LH, ARENA_LW, ARENA_W, type ArenaDef, type ArenaLayers, type ArenaPoint } from "./types";
import { wordyStoryland } from "./wordyStoryland";

export type { ArenaDef, ArenaLayers, ArenaPoint } from "./types";
export { ARENA_H, ARENA_LH, ARENA_LW, ARENA_W } from "./types";

export type ArenaOrientation = "portrait" | "landscape";

export const ARENAS: Record<BossKey, ArenaDef> = {
  number_giant: numboClearing,
  letter_dragon: harfLibrary,
  word_dragon: wordyStoryland,
  letter_camel: camelDesert,
  sprout_buddy: sproutGarden,
  puzzle_owlet: owletVillage,
};

/** Desktop arenas (1440 × 900): owl on its platform in the left third, boss on its ledge in the right third. */
export const ARENAS_LANDSCAPE: Record<BossKey, ArenaLayers> = {
  number_giant: numboLandscape,
  letter_dragon: harfLandscape,
  word_dragon: wordyLandscape,
  letter_camel: camelLandscape,
  sprout_buddy: sproutLandscape,
  puzzle_owlet: owletLandscape,
};

const DIMS: Record<ArenaOrientation, { w: number; h: number; bleed: number; depth: number }> = {
  portrait: { w: ARENA_W, h: ARENA_H, bleed: 18, depth: 1 },
  landscape: { w: ARENA_LW, h: ARENA_LH, bleed: 40, depth: 2.2 },
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

/**
 * The same, for the landscape arenas, as a percentage of the 1440 × 900
 * scene (left/right thirds, owl a little lower and nearer).
 */
export const ARENA_ANCHORS_PCT_LANDSCAPE: Record<BossKey, { boss: ArenaPoint; owl: ArenaPoint }> = Object.fromEntries(
  (Object.entries(ARENAS_LANDSCAPE) as [BossKey, ArenaLayers][]).map(([key, def]) => [
    key,
    {
      boss: { x: +((def.anchors.boss.x / ARENA_LW) * 100).toFixed(2), y: +((def.anchors.boss.y / ARENA_LH) * 100).toFixed(2) },
      owl: { x: +((def.anchors.owl.x / ARENA_LW) * 100).toFixed(2), y: +((def.anchors.owl.y / ARENA_LH) * 100).toFixed(2) },
    },
  ]),
) as Record<BossKey, { boss: ArenaPoint; owl: ArenaPoint }>;

/** How far each layer drifts at full parallax, in CSS px (landscape drifts 2.2× as far). */
export const PARALLAX_DEPTH: Record<ArenaLayer, number> = { back: 4, mid: 9, floor: 16 };

export interface PlacedAnchor extends ArenaPoint {
  /** CSS px per arena unit at the current screen size (scale characters with it if you like). */
  scale: number;
}

/**
 * Maps an arena point to CSS px inside a box of `width` × `height` (the
 * layers are drawn with `slice`, plus a small bleed so parallax never shows
 * an edge), including that layer's parallax drift.
 */
export function placeInArena(
  point: ArenaPoint,
  width: number,
  height: number,
  layer: ArenaLayer = "mid",
  parallax = { x: 0, y: 0 },
  orientation: ArenaOrientation = "portrait",
): PlacedAnchor {
  const { w: AW, h: AH, bleed, depth } = DIMS[orientation];
  const w = width + bleed * 2;
  const h = height + bleed * 2;
  const s = Math.max(w / AW, h / AH);
  const ox = (w - AW * s) / 2 - bleed;
  const oy = (h - AH * s) / 2 - bleed;
  const d = PARALLAX_DEPTH[layer] * depth;
  return { x: ox + point.x * s - parallax.x * d, y: oy + point.y * s - parallax.y * d, scale: s };
}

const layerStyle = (layer: ArenaLayer, parallax: { x: number; y: number }, orientation: ArenaOrientation): CSSProperties => ({
  position: "absolute",
  left: -DIMS[orientation].bleed,
  top: -DIMS[orientation].bleed,
  width: `calc(100% + ${DIMS[orientation].bleed * 2}px)`,
  height: `calc(100% + ${DIMS[orientation].bleed * 2}px)`,
  transform: `translate3d(${-parallax.x * PARALLAX_DEPTH[layer] * DIMS[orientation].depth}px, ${-parallax.y * PARALLAX_DEPTH[layer] * DIMS[orientation].depth}px, 0)`,
  transition: "transform 0.6s cubic-bezier(.2,.7,.3,1)",
  pointerEvents: "none",
});

export interface ArenaBackdropProps {
  bossKey: BossKey;
  /** "portrait" (phones, the default, 390 × 844) or "landscape" (desktop and tablets on their side, 1440 × 900). */
  orientation?: ArenaOrientation;
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
export function ArenaBackdrop({ bossKey, orientation = "portrait", parallax = { x: 0, y: 0 }, children, className }: ArenaBackdropProps) {
  const def = ARENAS[bossKey];
  const layers: ArenaLayers = orientation === "landscape" ? ARENAS_LANDSCAPE[bossKey] : def;
  const { w: AW, h: AH } = DIMS[orientation];
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

  const { Back, Mid, Floor } = layers;
  const viewBox = `0 0 ${AW} ${AH}`;
  return (
    <div ref={box} className={className} style={{ position: "absolute", inset: 0, overflow: "hidden", background: def.base }}>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" style={layerStyle("back", parallax, orientation)} aria-hidden="true">
        <Back uid={uid} />
      </svg>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" style={layerStyle("mid", parallax, orientation)} aria-hidden="true">
        <Mid uid={uid} />
      </svg>
      <svg viewBox={viewBox} preserveAspectRatio="xMidYMid slice" style={layerStyle("floor", parallax, orientation)} aria-hidden="true">
        <Floor uid={uid} />
      </svg>
      <Motes color={def.motes.color} glow={def.motes.glow} wide={orientation === "landscape"} />
      {size &&
        children?.({
          boss: placeInArena(layers.anchors.boss, size.w, size.h, "mid", parallax, orientation),
          owl: placeInArena(layers.anchors.owl, size.w, size.h, "floor", parallax, orientation),
        })}
    </div>
  );
}

const MOTES_WIDE = [
  [6, 34, 0, 8],
  [14, 62, 2.4, 10],
  [24, 22, 4.1, 9],
  [33, 48, 1.1, 11],
  [42, 70, 3.3, 8.5],
  [51, 30, 5.2, 10],
  [58, 58, 0.7, 9],
  [66, 18, 2.9, 11],
  [74, 72, 4.6, 8],
  [83, 40, 1.8, 10],
  [91, 64, 3.9, 9],
  [96, 26, 5.8, 10.5],
] as const;

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
function Motes({ color, glow, wide = false }: { color: string; glow: string; wide?: boolean }) {
  const dots = wide ? MOTES_WIDE : MOTES;
  const size = wide ? 7 : 5;
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
      {dots.map(([x, y, delay, dur], i) => (
        <span
          key={i}
          className="amal-mote"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            background: color,
            boxShadow: `0 0 ${size + 3}px ${size - 2}px ${glow}`,
            animationDuration: `${dur}s`,
            animationDelay: `-${delay}s`,
          }}
        />
      ))}
    </div>
  );
}
