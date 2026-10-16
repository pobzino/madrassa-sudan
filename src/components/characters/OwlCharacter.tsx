"use client";

import type { Ref } from "react";
import { HIDDEN, Rim, ShadeDefs, Sparkles } from "./parts";
import type { BrowSet, PartVars, RigSpec } from "./rig";
import type { CharacterCue, OwlHandle, OwlPose } from "./types";
import { useRig } from "./useRig";

/**
 * The Amal owl, rigged. Every shape is the brand owl's (OwlDuoStyle in
 * illustrations.tsx, viewBox 0 0 80 64): red body, pink facial disc, green
 * graduation cap with an amber tassel. Only soft shading is added.
 */

const DISC = "#E8334F";

const OWL_BROWS: Record<BrowSet, readonly [PartVars, PartVars]> = {
  neutral: [{}, {}],
  up: [{ y: -2 }, { y: -2 }],
  grumpy: [
    { rotation: 18, y: 1 },
    { rotation: -18, y: 1 },
  ],
  worried: [
    { rotation: -14, y: -1 },
    { rotation: 14, y: -1 },
  ],
  cheeky: [
    { rotation: -8, y: -2.5 },
    { rotation: -12, y: 1 },
  ],
  focus: [
    { rotation: 12, y: 1.5 },
    { rotation: -12, y: 1.5 },
  ],
};

/**
 * A 3/4 turn toward the boss (to the right): the face slides right on the
 * round body, the far eye narrows a touch and the far wing tucks in.
 */
const TURN: Record<string, PartVars> = {
  head: { x: 2.4 },
  eyeL: { scaleX: 1.03 },
  eyeR: { scaleX: 0.88 },
  wingR: { x: -1.6 },
  wingL: { x: -0.6 },
};

function turned(poses: RigSpec["poses"]): RigSpec["poses"] {
  const out: RigSpec["poses"] = {};
  for (const [name, pose] of Object.entries(poses)) {
    const parts: Record<string, PartVars> = { ...pose.parts };
    for (const [part, vars] of Object.entries(TURN)) parts[part] = { ...vars, ...parts[part] };
    out[name] = { ...pose, parts };
  }
  return out;
}

export const OWL_SPEC: RigSpec = {
  kind: "owl",
  facing: 1,
  unit: 0.42,
  gazeRange: [2, 1.6],
  orbit: { cx: 40, cy: 4, rx: 22, ry: 5 },
  propFly: { x: 70, y: -62, rotation: 300 },
  pivots: {
    move: [40, 63],
    root: [40, 63],
    shadow: [40, 63],
    body: [40, 62],
    head: [40, 42],
    wingL: [21, 38],
    wingR: [59, 38],
    tassel: [40, 10],
    mouth: [40, 42],
    footL: [32, 60],
    footR: [48, 60],
    eyeL: [0, 0],
    eyeR: [0, 0],
    pupilL: [0, 0],
    pupilR: [0, 0],
    lidL: [0, -10],
    lidR: [0, -10],
    browL: [0, 0],
    browR: [0, 0],
    shield: [68, 52],
    aura: [40, 40],
    orb: [76, 26],
    flash: [40, 38],
  },
  brows: OWL_BROWS,
  mouthFallback: { o: "open", laugh: "open", grumpy: "closed", wavy: "closed", smirk: "smile" },
  eyeFallback: { spiral: "open", closed: "happy", squeeze: "happy" },
  poses: turned({
    idle: { mouth: "closed", gaze: [0.6, -0.05] },
    cheer: {
      eyes: "happy",
      mouth: "open",
      fx: ["blush", "sparkles"],
      parts: { wingL: { rotation: 95 }, wingR: { rotation: -95 }, head: { rotation: -3 } },
    },
    think: {
      mouth: "closed",
      brows: "cheeky",
      gaze: [-0.6, -1],
      fx: ["brows", "think"],
      parts: { head: { rotation: -7 }, wingR: { rotation: -112 }, root: { rotation: -2 } },
    },
    wrong: {
      mouth: "smile",
      brows: "worried",
      gaze: [0, 0.4],
      fx: ["brows", "blush"],
      parts: { head: { rotation: 6 }, wingR: { rotation: -40 } },
    },
    block: {
      mouth: "closed",
      brows: "focus",
      gaze: [1, -0.4],
      fx: ["brows", "shield"],
      parts: { root: { rotation: -4 }, head: { rotation: -3 }, wingR: { rotation: -55 }, wingL: { rotation: 14 } },
    },
    _fireWind: {
      mouth: "closed",
      brows: "focus",
      gaze: [1, -0.6],
      fx: ["brows"],
      parts: { root: { rotation: -7, x: -2 }, head: { rotation: -4 }, wingR: { rotation: -150 }, body: { scaleX: 1.04, scaleY: 0.96 } },
    },
    _fire: {
      mouth: "open",
      brows: "focus",
      lids: 0.22,
      gaze: [1, -0.9],
      fx: ["brows"],
      parts: {
        root: { rotation: 9, x: 3 },
        head: { rotation: 5, x: 3.4 },
        wingR: { rotation: -72, scale: 1.25, x: 0 },
        wingL: { rotation: -25 },
        body: { scaleX: 0.96, scaleY: 1.04 },
      },
    },
  }),
};

function Eye({ side, x, pupilDx }: { side: "L" | "R"; x: number; pupilDx: number }) {
  return (
    <g transform={`translate(${x} 32)`}>
      <g data-part={`eye${side}`}>
        <ellipse rx={8} ry={9} fill="#FFFFFF" />
        <g data-part={`pupil${side}`}>
          <circle cx={pupilDx} cy={0} r={5} fill="#000000" />
          <circle cx={pupilDx + 2} cy={-2} r={2} fill="#FFFFFF" />
          <circle cx={pupilDx - 1.8} cy={2.2} r={0.8} fill="#FFFFFF" opacity={0.8} />
        </g>
        <ellipse data-part={`lid${side}`} rx={9} ry={10} fill={DISC} opacity={0} />
      </g>
    </g>
  );
}

function OwlArt({ uid }: { uid: string }) {
  return (
    <>
      <ShadeDefs uid={uid} />
      <defs>
        <radialGradient id={`${uid}-aura`}>
          <stop offset="0" stopColor="#FFE9A8" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#FCD34D" stopOpacity="0.45" />
          <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse data-part="aura" cx={40} cy={40} rx={40} ry={38} fill={`url(#${uid}-aura)`} opacity={0} />
      <ellipse data-part="shadow" cx={40} cy={63} rx={22} ry={3.4} fill={`url(#${uid}-ground)`} />
      <g data-fx="dust" {...HIDDEN}>
        {[28, 52, 20, 60].map((x, i) => (
          <circle key={i} cx={x} cy={61} r={i < 2 ? 4.5 : 3.4} fill="#F5EBDD" />
        ))}
      </g>
      <g data-part="move">
        <g data-part="root">
          <g data-part="head">
            <ellipse cx={22} cy={18} rx={5} ry={7} fill="#a01028" />
            <ellipse cx={58} cy={18} rx={5} ry={7} fill="#a01028" />
          </g>
          <g data-part="wingL">
            <path d="M20 36 Q8 40 6 48 Q8 54 18 50 Q22 46 20 36Z" fill="#D21034" />
          </g>
          <g data-part="wingR">
            <path d="M60 36 Q72 40 74 48 Q72 54 62 50 Q58 46 60 36Z" fill="#D21034" />
          </g>
          <g data-part="body">
            <ellipse cx={40} cy={38} rx={24} ry={24} fill="#D21034" />
            <ellipse cx={40} cy={38} rx={24} ry={24} fill={`url(#${uid}-shade)`} />
            <Rim cx={40} cy={38} rx={24} ry={24} from={200} to={290} width={1.4} opacity={0.4} />
            <g data-part="head">
              <ellipse cx={40} cy={34} rx={18} ry={14} fill={DISC} />
            </g>
            <ellipse cx={40} cy={52} rx={12} ry={8} fill="#FFF5F5" />
            <g data-part="head">
              <g data-fx="blush" {...HIDDEN}>
                <circle cx={25} cy={39} r={3.5} fill="#FDBA74" opacity={0.6} />
                <circle cx={55} cy={39} r={3.5} fill="#FDBA74" opacity={0.6} />
              </g>
              <g data-variant="eyes:open">
                <Eye side="L" x={31} pupilDx={2} />
                <Eye side="R" x={49} pupilDx={-2} />
              </g>
              <g data-variant="eyes:happy" {...HIDDEN}>
                <path d="M24 32 Q31 26 38 32" stroke="#000" strokeWidth={3} strokeLinecap="round" fill="none" />
                <path d="M42 32 Q49 26 56 32" stroke="#000" strokeWidth={3} strokeLinecap="round" fill="none" />
              </g>
              <g data-fx="brows" {...HIDDEN}>
                <g transform="translate(31 23.5)">
                  <path data-part="browL" d="M-7 2 Q0 -2 7 2" stroke="#a01028" strokeWidth={2} strokeLinecap="round" fill="none" />
                </g>
                <g transform="translate(49 23.5)">
                  <path data-part="browR" d="M-7 2 Q0 -2 7 2" stroke="#a01028" strokeWidth={2} strokeLinecap="round" fill="none" />
                </g>
              </g>
              <g data-part="mouth">
                <g data-variant="mouth:closed">
                  <ellipse cx={40} cy={42} rx={4} ry={3} fill="#F59E0B" />
                  <path d="M36 42 Q40 48 44 42" fill="#E08A05" />
                </g>
                <g data-variant="mouth:open" {...HIDDEN}>
                  <path d="M36.2 42 Q40 51 43.8 42Z" fill="#7A1020" />
                  <path d="M36.6 45 Q40 51.5 43.4 45 Q40 47.5 36.6 45Z" fill="#E08A05" />
                  <ellipse cx={40} cy={41.2} rx={4} ry={2.8} fill="#F59E0B" />
                </g>
                <g data-variant="mouth:smile" {...HIDDEN}>
                  <ellipse cx={40} cy={42} rx={4} ry={3} fill="#F59E0B" />
                  <path d="M36 44 Q40 48 44 44" stroke="#E08A05" strokeWidth={2} strokeLinecap="round" fill="none" />
                </g>
              </g>
              <path d="M20 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
              <path d="M16 12l24-6 24 6-24 8-24-8z" fill="#007229" />
              <path d="M16 12l24 8 24-8" stroke="#005C22" strokeWidth={1} fill="none" />
              <path d="M22 11 L40 6.5 L50 9" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.2} strokeLinecap="round" fill="none" />
              <circle cx={40} cy={10} r={2.5} fill="#1a1a1a" />
              <g data-part="tassel">
                <path d="M40 10 Q48 14 52 22" stroke="#F59E0B" strokeWidth={2.5} strokeLinecap="round" fill="none" />
                <ellipse cx={53} cy={24} rx={3} ry={4} fill="#F59E0B" />
              </g>
              <g data-fx="think" {...HIDDEN}>
                <circle cx={64} cy={14} r={1.4} fill="#FFFFFF" />
                <circle cx={68} cy={8} r={2.2} fill="#FFFFFF" />
                <circle cx={74} cy={-1} r={6.5} fill="#FFFFFF" />
                <text x={74} y={2.6} textAnchor="middle" fontSize={9} fontWeight={700} fill="#007229" fontFamily="var(--font-fredoka), Fredoka, sans-serif">
                  ?
                </text>
              </g>
            </g>
            <ellipse data-part="flash" cx={40} cy={38} rx={24} ry={24} fill="#FFFFFF" opacity={0} />
          </g>
          <g data-part="footL">
            <ellipse cx={32} cy={60} rx={4} ry={2.5} fill="#F59E0B" />
          </g>
          <g data-part="footR">
            <ellipse cx={48} cy={60} rx={4} ry={2.5} fill="#F59E0B" />
          </g>
          <g data-fx="shield" {...HIDDEN}>
            <g data-part="shield">
              <path d="M68 22 L80 26.5 V36 C80 44 75 49.5 68 52 C61 49.5 56 44 56 36 V26.5 Z" fill="#005C22" />
              <path d="M68 24.5 L78 28.3 V36.1 C78 42.8 73.8 47.4 68 49.6 C62.2 47.4 58 42.8 58 36.1 V28.3Z" fill="#007229" />
              <path d="M68 24.5 L78 28.3 V36.1 C78 39 77 41.5 75.5 43.5 C71 33 66 28 58 30 V28.3Z" fill="#00913D" />
              <path
                d="M68 30.5 L69.7 34.2 L73.6 34.5 L70.6 37.1 L71.6 41 L68 38.9 L64.4 41 L65.4 37.1 L62.4 34.5 L66.3 34.2Z"
                fill="#FFC83D"
              />
              <path data-part="shieldGlow" d="M60.5 30 L64 28.6 L60.5 41 Z" fill="#FFFFFF" opacity={0.5} />
            </g>
          </g>
          <g data-fx="trail" {...HIDDEN}>
            <circle cx={76} cy={26} r={5} fill="#FFE08A" />
            <circle cx={76} cy={26} r={4} fill="#FFF3C4" />
            <circle cx={76} cy={26} r={3} fill="#FFE08A" />
          </g>
          <g data-part="orb" {...HIDDEN}>
            <circle cx={76} cy={26} r={15} fill="#FCD34D" opacity={0.35} />
            <circle cx={76} cy={26} r={11.5} fill="#E39A10" />
            <circle cx={76} cy={25} r={10} fill="#FFC83D" />
            <path d="M76 18 L78.2 22.8 L83.4 23.2 L79.5 26.6 L80.8 31.8 L76 29 L71.2 31.8 L72.5 26.6 L68.6 23.2 L73.8 22.8Z" fill="#FFF3C4" />
            <ellipse cx={71.5} cy={20.5} rx={3} ry={1.6} fill="#FFFFFF" opacity={0.7} transform="rotate(-35 71.5 20.5)" />
          </g>
          <Sparkles at={[[4, 18, 0.55], [76, 12, 0.7], [72, 52, 0.45]]} />
        </g>
      </g>
    </>
  );
}

export interface OwlCharacterProps {
  pose?: OwlPose;
  /** Rendered width and height in CSS px. */
  size?: number;
  ref?: Ref<OwlHandle>;
  title?: string;
  /** Hop in with `land` as soon as it mounts. */
  enter?: boolean;
  /** The player's turn: a soft golden aura pulses behind the owl. */
  glow?: boolean;
  onCue?: (cue: CharacterCue) => void;
  className?: string;
}

/**
 * The rigged Amal owl for battles.
 *
 *   const owl = useRef<OwlHandle>(null);
 *   <OwlCharacter pose="idle" size={118} ref={owl} />
 *   await owl.current?.play("fire");
 */
export function OwlCharacter({ pose = "idle", size = 120, ref, title, enter = false, glow = false, onCue, className }: OwlCharacterProps) {
  const { svgRef, uid } = useRig(OWL_SPEC, pose, ref, onCue, enter, glow);
  return (
    <svg
      ref={svgRef}
      viewBox="-2 -10 84 84"
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
      <OwlArt uid={uid} />
    </svg>
  );
}

export default OwlCharacter;
