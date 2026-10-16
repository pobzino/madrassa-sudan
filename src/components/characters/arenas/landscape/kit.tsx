import type { ReactNode } from "react";
import { HeroMat, Pool, Sway } from "../common";
import { fan, grass } from "../shapes";

/**
 * Shared pieces for the landscape (desktop) arenas, drawn in a 1440 × 900
 * box: owl on its hero platform in the left third, boss on its ledge in the
 * right third, a wide calm band between them.
 */

export const LW = 1440;
export const LH = 900;

/** Feet positions shared by every landscape arena. */
export const L_BOSS = { x: 1100, y: 610 } as const;
export const L_OWL = { x: 340, y: 700 } as const;

/** Draws a portrait piece (e.g. a boss ledge) scaled up, with its anchor `from` placed at `at`. */
export function Scaled({ at, from, s = 1.5, children }: { at: { x: number; y: number }; from: readonly [number, number]; s?: number; children: ReactNode }) {
  return <g transform={`translate(${at.x - from[0] * s} ${at.y - from[1] * s}) scale(${s})`}>{children}</g>;
}

export interface MoundColours {
  side: string;
  sideDark: string;
  top: string;
  topLight: string;
  rim: string;
  grass?: string;
  light: string;
}

/** A free-standing hero mound (earth, dune, knoll) with its own pool of light and a woven mat. */
export function HeroMound({ id, cx, top, w = 360, c, mat = true }: { id: string; cx: number; top: number; w?: number; c: MoundColours; mat?: boolean }) {
  const L = cx - w / 2;
  const R = cx + w / 2;
  return (
    <g>
      <Pool id={id} cx={cx} cy={top - 50} rx={w * 0.85} ry={w * 0.7} color={c.light} strength={0.55} />
      <ellipse cx={cx} cy={top + 112} rx={w * 0.46} ry={14} fill="#000000" opacity={0.22} />
      <path
        d={`M${L} ${top + 6} C${L + 10} ${top - 14} ${cx - w * 0.25} ${top - 20} ${cx} ${top - 20} C${cx + w * 0.25} ${top - 20} ${R - 10} ${top - 14} ${R} ${top + 6} C${R + 8} ${top + 40} ${R - 30} ${top + 82} ${R - 80} ${top + 98} C${cx + 60} ${top + 114} ${cx - 60} ${top + 114} ${L + 80} ${top + 98} C${L + 30} ${top + 82} ${L - 8} ${top + 40} ${L} ${top + 6}Z`}
        fill={c.side}
      />
      <path
        d={`M${L + 2} ${top + 42} C${L + 70} ${top + 72} ${R - 70} ${top + 72} ${R - 2} ${top + 42} C${R - 8} ${top + 72} ${R - 40} ${top + 92} ${R - 80} ${top + 98} C${cx + 60} ${top + 114} ${cx - 60} ${top + 114} ${L + 80} ${top + 98} C${L + 40} ${top + 92} ${L + 8} ${top + 72} ${L + 2} ${top + 42}Z`}
        fill={c.sideDark}
      />
      <ellipse cx={cx} cy={top} rx={w / 2} ry={w * 0.085} fill={c.top} />
      <ellipse cx={cx - 8} cy={top - 5} rx={w * 0.42} ry={w * 0.052} fill={c.topLight} />
      <path d={`M${L + 14} ${top - 6} C${L + 50} ${top - 22} ${cx - 70} ${top - 28} ${cx} ${top - 28}`} stroke={c.rim} strokeWidth={3.4} strokeLinecap="round" fill="none" opacity={0.9} />
      {c.grass && <path d={grass([[L + 10, top + 6, 30], [R - 6, top + 8, 26], [L + 36, top + 20, 18], [R - 34, top + 22, 16]], 81)} fill={c.grass} />}
      {mat && <HeroMat cx={cx} cy={top + 2} rx={78} ry={15} />}
    </g>
  );
}

/** Foliage framing on both edges and all four corners: a vignette made of leaves. */
export function EdgeFoliage({ dark, mid, top, seed = 1 }: { dark: string; mid: string; top: string; seed?: number }) {
  return (
    <>
      <Sway x={-20} y={930} seconds={5.5}>
        <path d={fan(-20, 930, 8, 280, 40, -95, -12, seed)} fill={dark} />
      </Sway>
      <path d={fan(1460, 930, 8, 280, 40, -168, -85, seed + 1)} fill={dark} />
      <path d={fan(-16, 920, 5, 180, 28, -80, -25, seed + 2) + fan(1456, 920, 5, 180, 28, -155, -100, seed + 3)} fill={mid} />
      <path d={fan(-20, -20, 7, 240, 36, 12, 100, seed + 4)} fill={top} />
      <Sway x={1460} y={-20} seconds={6.5} degrees={-2.5}>
        <path d={fan(1460, -20, 7, 240, 36, 80, 168, seed + 5)} fill={top} />
      </Sway>
      <path d={fan(-20, 470, 5, 170, 28, -45, 35, seed + 6) + fan(1460, 430, 5, 170, 28, 145, 225, seed + 7)} fill={dark} />
      <path d={fan(-20, 470, 3, 120, 20, -30, 20, seed + 8) + fan(1460, 430, 3, 120, 20, 160, 210, seed + 9)} fill={mid} />
    </>
  );
}
