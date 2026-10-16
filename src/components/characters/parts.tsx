import type { BrowSet, PartVars, PoseSpec, RigSpec } from "./rig";

/**
 * Shared drawing pieces for the bosses: eyes (with pupils, lids and the
 * happy/spiral/closed/squeeze variants), brows, the mouth set, and the
 * effects (stars, steam, zzz, sparkles, dust). Every animated piece sits
 * inside a static translate so its pivot is simply 0 0.
 */

export const HIDDEN = { opacity: 0, visibility: "hidden" as const };

/**
 * Shared soft-shading gradients, defined once per character. They are pure
 * white/black overlays, so they shade whatever colour sits underneath and the
 * Phase 2 colour shift still works.
 *  - `${uid}-shade`: highlight top-left, darker underside
 *  - `${uid}-ground`: the soft contact shadow
 */
export function ShadeDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-shade`} cx="0.36" cy="0.26" r="0.8">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
        <stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset="0.74" stopColor="#1B1035" stopOpacity="0" />
        <stop offset="1" stopColor="#1B1035" stopOpacity="0.26" />
      </radialGradient>
      <radialGradient id={`${uid}-handglow`}>
        <stop offset="0" stopColor="#FFF7CC" stopOpacity="0.95" />
        <stop offset="0.45" stopColor="#FCD34D" stopOpacity="0.55" />
        <stop offset="1" stopColor="#F59E0B" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${uid}-ground`}>
        <stop offset="0" stopColor="#000000" stopOpacity="0.34" />
        <stop offset="0.6" stopColor="#000000" stopOpacity="0.16" />
        <stop offset="1" stopColor="#000000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

/** A soft rim light along the top-left edge of a round shape. */
export function Rim({ cx, cy, rx, ry, from = 200, to = 290, width = 3, opacity = 0.5 }: { cx: number; cy: number; rx: number; ry: number; from?: number; to?: number; width?: number; opacity?: number }) {
  const p = (deg: number, inset: number) => {
    const a = (deg * Math.PI) / 180;
    return [cx + Math.cos(a) * (rx - inset), cy + Math.sin(a) * (ry - inset)] as const;
  };
  const [x1, y1] = p(from, width * 1.4);
  const [x2, y2] = p(to, width * 1.4);
  return (
    <path
      d={`M${x1.toFixed(1)} ${y1.toFixed(1)} A${rx - width * 1.4} ${ry - width * 1.4} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`}
      stroke="#FFFFFF"
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
    />
  );
}

export interface EyesDef {
  l: readonly [number, number];
  r: readonly [number, number];
  rx: number;
  ry: number;
  pupil: number;
  /** Resting pupil offset (looking at the owl, down-left). */
  look: readonly [number, number];
  ink: string;
  /** `data-tint` key and colour of the skin the eye sits on (the lid). */
  lid: { tint: string; color: string };
  iris?: { r: number; color: string };
  white?: string;
}

export function Eyes({ e, uid }: { e: EyesDef; uid: string }) {
  const k = e.rx / 17;
  const clip = `${uid}-eyeclip`;
  const sw = 4.4 * k;
  const white = e.white ?? "#FFFFFF";
  const sides = [
    ["L", e.l],
    ["R", e.r],
  ] as const;
  return (
    <>
      <defs>
        {/* Lids are clipped to the eye, so a half-closed lid never pokes out onto the face. */}
        <clipPath id={clip}>
          <ellipse rx={e.rx + 0.4} ry={e.ry + 0.4} />
        </clipPath>
      </defs>
      <g data-variant="eyes:open">
        {sides.map(([s, [x, y]]) => (
          <g key={s} transform={`translate(${x} ${y})`}>
            <g data-part={`eye${s}`}>
              <ellipse rx={e.rx} ry={e.ry} fill={white} />
              <ellipse cy={e.ry * 0.38} rx={e.rx * 0.82} ry={e.ry * 0.5} fill="#C7CCE8" opacity={0.35} />
              <g data-part={`pupil${s}`}>
                {e.iris && <circle cx={e.look[0]} cy={e.look[1]} r={e.iris.r} fill={e.iris.color} />}
                <circle cx={e.look[0]} cy={e.look[1]} r={e.pupil} fill={e.ink} />
                <circle cx={e.look[0] + e.pupil * 0.34} cy={e.look[1] - e.pupil * 0.38} r={e.pupil * 0.38} fill="#FFFFFF" />
                <circle cx={e.look[0] - e.pupil * 0.42} cy={e.look[1] + e.pupil * 0.45} r={e.pupil * 0.16} fill="#FFFFFF" opacity={0.85} />
              </g>
              <g clipPath={`url(#${clip})`}>
                <ellipse
                  data-part={`lid${s}`}
                  data-tint={e.lid.tint}
                  rx={e.rx + 2.5}
                  ry={e.ry + 1}
                  fill={e.lid.color}
                  opacity={0}
                />
              </g>
            </g>
          </g>
        ))}
      </g>
      <g data-variant="eyes:happy" {...HIDDEN}>
        {sides.map(([s, [x, y]]) => (
          <path
            key={s}
            d={`M${x - e.rx * 0.62} ${y + e.ry * 0.2} Q${x} ${y - e.ry * 0.75} ${x + e.rx * 0.62} ${y + e.ry * 0.2}`}
            stroke={e.ink}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </g>
      <g data-variant="eyes:closed" {...HIDDEN}>
        {sides.map(([s, [x, y]]) => (
          <path
            key={s}
            d={`M${x - e.rx * 0.6} ${y} Q${x} ${y + e.ry * 0.55} ${x + e.rx * 0.6} ${y}`}
            stroke={e.ink}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </g>
      <g data-variant="eyes:squeeze" {...HIDDEN}>
        {sides.map(([s, [x, y]]) => {
          const d = s === "L" ? 1 : -1;
          return (
            <path
              key={s}
              d={`M${x - d * e.rx * 0.5} ${y - e.ry * 0.45} L${x + d * e.rx * 0.42} ${y} L${x - d * e.rx * 0.5} ${y + e.ry * 0.45}`}
              stroke={e.ink}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          );
        })}
      </g>
      <g data-variant="eyes:spiral" {...HIDDEN}>
        {sides.map(([s, [x, y]]) => (
          <g key={s} transform={`translate(${x} ${y})`}>
            <ellipse rx={e.rx} ry={e.ry} fill={white} />
            <path
              data-part={`spiral${s}`}
              d={`M${-11 * k} 0 a${11 * k} ${11 * k} 0 1 1 ${22 * k} 0 a${8 * k} ${8 * k} 0 1 1 ${-16 * k} 0 a${5 * k} ${5 * k} 0 1 1 ${10 * k} 0 a${2 * k} ${2 * k} 0 1 1 ${-4 * k} 0`}
              stroke={e.ink}
              strokeWidth={2.8 * k}
              strokeLinecap="round"
              fill="none"
            />
          </g>
        ))}
      </g>
    </>
  );
}

export interface BrowsDef {
  l: readonly [number, number];
  r: readonly [number, number];
  len: number;
  width: number;
  color: string;
  tint?: string;
}

export function Brows({ b }: { b: BrowsDef }) {
  const h = b.len / 2;
  return (
    <>
      <g transform={`translate(${b.l[0]} ${b.l[1]})`}>
        <path
          data-part="browL"
          data-tint-stroke={b.tint}
          d={`M${-h} 2 Q${-h * 0.2} -3.5 ${h} 0.5`}
          stroke={b.color}
          strokeWidth={b.width}
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g transform={`translate(${b.r[0]} ${b.r[1]})`}>
        <path
          data-part="browR"
          data-tint-stroke={b.tint}
          d={`M${-h} 0.5 Q${h * 0.2} -3.5 ${h} 2`}
          stroke={b.color}
          strokeWidth={b.width}
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </>
  );
}

export interface MouthDef {
  at: readonly [number, number];
  scale: number;
  ink: string;
  tongue: string;
}

/** The mouth set, drawn about 0 0 at Numbo's size and scaled per boss. */
export function Mouths({ m, only }: { m: MouthDef; only?: "smile" }) {
  const v = (name: string) => (name === (only ?? "smile") ? {} : HIDDEN);
  return (
    <g transform={`translate(${m.at[0]} ${m.at[1]}) scale(${m.scale})`}>
      <g data-part="mouth">
        <g data-variant="mouth:closed" {...v("closed")}>
          <path d="M-9 0 Q0 4 9 0" stroke={m.ink} strokeWidth={4.2} strokeLinecap="round" fill="none" />
        </g>
        <g data-variant="mouth:smile" {...v("smile")}>
          <path d="M-14 -3 Q0 12 14 -3" stroke={m.ink} strokeWidth={4.6} strokeLinecap="round" fill="none" />
        </g>
        <g data-variant="mouth:smirk" {...v("smirk")}>
          <path d="M-12 1 Q1 9 13 -5" stroke={m.ink} strokeWidth={4.6} strokeLinecap="round" fill="none" />
        </g>
        <g data-variant="mouth:open" {...v("open")}>
          <path d="M-13 -4 Q0 -1 13 -4 Q11 15 0 15 Q-11 15 -13 -4Z" fill={m.ink} />
          <ellipse cx={0} cy={10} rx={6.5} ry={3.6} fill={m.tongue} />
        </g>
        <g data-variant="mouth:o" {...v("o")}>
          <ellipse cx={0} cy={3} rx={6} ry={7.5} fill={m.ink} />
          <ellipse cx={0} cy={7} rx={3.6} ry={2.4} fill={m.tongue} />
        </g>
        <g data-variant="mouth:laugh" {...v("laugh")}>
          <path d="M-18 -5 Q0 -1 18 -5 Q15 21 0 21 Q-15 21 -18 -5Z" fill={m.ink} />
          <ellipse cx={0} cy={14} rx={8.5} ry={5} fill={m.tongue} />
        </g>
        <g data-variant="mouth:grumpy" {...v("grumpy")}>
          <path d="M-12 5 Q0 -5 12 5" stroke={m.ink} strokeWidth={4.6} strokeLinecap="round" fill="none" />
        </g>
        <g data-variant="mouth:wavy" {...v("wavy")}>
          <ellipse cx={6} cy={6} rx={5} ry={6.5} fill={m.tongue} />
          <path d="M-15 1 q7.5 -6 15 0 q7.5 6 15 0" stroke={m.ink} strokeWidth={4.2} strokeLinecap="round" fill="none" />
        </g>
      </g>
    </g>
  );
}

const STAR = "M0 -8 L2.4 -2.6 L8.2 -2.4 L3.8 1.4 L5.2 7.2 L0 4 L-5.2 7.2 L-3.8 1.4 L-8.2 -2.4 L-2.4 -2.6Z";
function sparkle(x: number, y: number, s: number) {
  const a = 7 * s;
  const b = 1 * s;
  return `M${x} ${y - a} Q${x + b} ${y - b} ${x + a} ${y} Q${x + b} ${y + b} ${x} ${y + a} Q${x - b} ${y + b} ${x - a} ${y} Q${x - b} ${y - b} ${x} ${y - a}Z`;
}

function scaled(d: string, k: number) {
  return d.replace(/-?\d+(\.\d+)?/g, (n) => String(+(Number(n) * k).toFixed(2)));
}

/** Three stars that circle the head (positions are set by the rig). */
export function Stars({ scale = 1.5 }: { scale?: number }) {
  return (
    <g data-fx="stars" {...HIDDEN}>
      {[0, 1, 2].map((i) => (
        <path key={i} d={scale === 1 ? STAR : scaled(STAR, scale)} fill={i === 1 ? "#FFE08A" : "#FFC83D"} />
      ))}
    </g>
  );
}

export function Steam({ at }: { at: readonly (readonly [number, number])[] }) {
  return (
    <g data-fx="steam" {...HIDDEN}>
      {at.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x - 12} ${y + 5} a7 7 0 0 1 3 -13 a10 10 0 0 1 18 0 a7 7 0 0 1 3 13 Z`}
          fill="#FFFFFF"
        />
      ))}
    </g>
  );
}

export function Zzz({ at, color = "#A5B4FC" }: { at: readonly [number, number]; color?: string }) {
  const [x, y] = at;
  return (
    <g data-fx="zzz" {...HIDDEN}>
      {[0, 1, 2].map((i) => {
        const s = 1 - i * 0.22;
        const zx = x + i * 13;
        const zy = y - i * 14;
        return (
          <path
            key={i}
            d={`M${zx - 6 * s} ${zy - 6 * s} h${12 * s} l${-12 * s} ${12 * s} h${12 * s}`}
            stroke={color}
            strokeWidth={4 * s}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        );
      })}
    </g>
  );
}

export function Sparkles({ at, color = "#FFD34D" }: { at: readonly (readonly [number, number, number])[]; color?: string }) {
  return (
    <g data-fx="sparkles" {...HIDDEN}>
      {at.map(([x, y, s], i) => (
        <path key={i} d={sparkle(x, y, s)} fill={color} />
      ))}
    </g>
  );
}

export function Dust({ ground, xs, color = "#F5EBDD" }: { ground: number; xs: readonly number[]; color?: string }) {
  return (
    <g data-fx="dust" {...HIDDEN}>
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ground - 6} r={i < 2 ? 11 : 8} fill={color} />
      ))}
    </g>
  );
}

// ─── Spec builder ────────────────────────────────────────────────────────

export const BOSS_BROWS: Record<BrowSet, readonly [PartVars, PartVars]> = {
  neutral: [{}, {}],
  up: [{ y: -5 }, { y: -5 }],
  grumpy: [
    { rotation: 22, y: 3 },
    { rotation: -22, y: 3 },
  ],
  worried: [
    { rotation: -16, y: -3 },
    { rotation: 16, y: -3 },
  ],
  cheeky: [
    { rotation: -10, y: -7 },
    { rotation: -14, y: 2 },
  ],
  focus: [
    { rotation: 12, y: 2 },
    { rotation: -12, y: 2 },
  ],
};

/**
 * The shared boss poses. Arms are "floating hands" that orbit a shoulder
 * pivot, so the same rotations read on every boss; each boss overrides what
 * its own silhouette needs.
 */
const BASE_POSES: Record<string, PoseSpec> = {
  idle: { gaze: [-0.45, 0.3] },
  taunt: {
    mouth: "laugh",
    brows: "cheeky",
    lids: 0.32,
    gaze: [-0.6, 0.1],
    parts: { head: { rotation: -6 }, armL: { rotation: 178 }, root: { rotation: -3 } },
  },
  windup: {
    mouth: "smirk",
    brows: "focus",
    lids: 0.18,
    gaze: [-0.9, 0.35],
    fx: ["handglow"],
    // Leaning back, the prop held up over the throwing shoulder (inside the box), glowing.
    parts: { root: { rotation: 10, x: 2 }, head: { rotation: 7 }, body: { scaleX: 0.96, scaleY: 1.04 }, armR: { rotation: -231, x: -26, y: -4 }, armL: { rotation: 30 } },
  },
  throw: {
    mouth: "open",
    brows: "up",
    gaze: [-1, 0.5],
    // The release: an overhand swing that ends forward and low, clear of the face.
    parts: { root: { rotation: -9, x: -8 }, head: { rotation: -6 }, armR: { rotation: "-11_ccw" }, armL: { rotation: -20 } },
  },
  hit: {
    eyes: "squeeze",
    mouth: "o",
    brows: "worried",
    parts: { body: { scaleX: 1.08, scaleY: 0.92 }, head: { rotation: 8 }, root: { rotation: 8, x: 6 }, armL: { x: -6, y: -34, rotation: -10 }, armR: { x: 4, y: -2 } },
  },
  dizzy: {
    eyes: "spiral",
    mouth: "wavy",
    brows: "worried",
    fx: ["stars"],
    parts: { head: { rotation: 5 }, root: { rotation: 3 }, armL: { rotation: 30 }, armR: { rotation: -8 } },
  },
  ko: {
    eyes: "spiral",
    mouth: "wavy",
    brows: "worried",
    fx: ["stars"],
    parts: {
      root: { rotation: 22, x: 14, y: 6 },
      body: { scaleX: 1.07, scaleY: 0.9 },
      head: { rotation: 10 },
      armL: { rotation: 30, x: 8 },
      armR: { rotation: -18, x: 10, y: 8 },
      footL: { rotation: -30, y: -8 },
      footR: { rotation: 10, y: -2 },
    },
  },
  powered: {
    tint: "powered",
    mouth: "grumpy",
    brows: "grumpy",
    gaze: [-0.7, 0.2],
    fx: ["steam"],
    parts: { root: { scale: 1.12 }, armL: { x: 4, y: 2 }, armR: { x: -4, y: 2 } },
  },
  happy: {
    eyes: "happy",
    mouth: "laugh",
    brows: "up",
    fx: ["sparkles"],
    parts: { armL: { rotation: 200 }, armR: { rotation: -200 }, head: { rotation: -3 } },
  },
  sleep: {
    eyes: "closed",
    mouth: "closed",
    fx: ["zzz"],
    parts: { head: { rotation: 7, y: 4 }, root: { rotation: 2 }, body: { scaleX: 1.02, scaleY: 0.97 }, armL: { rotation: -12 }, armR: { rotation: 12 } },
  },
};

/** The glow that lights the throwing hand in the windup (sits behind the prop, inside `armR`). */
export function HandGlow({ uid, cx, cy, r = 34 }: { uid: string; cx: number; cy: number; r?: number }) {
  return (
    <g data-fx="handglow" {...HIDDEN}>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${uid}-handglow)`} />
    </g>
  );
}

export interface BossSpecInput {
  pivots: Record<string, readonly [number, number]>;
  orbit: RigSpec["orbit"];
  tints: RigSpec["tints"];
  propFly?: RigSpec["propFly"];
  gazeRange?: readonly [number, number];
  /** Contact points; defaults to the middle of the body and the prop in the throwing hand. */
  points?: RigSpec["points"];
  /** Per-pose overrides; `parts` merge part by part. */
  poses?: Record<string, PoseSpec>;
}

export function bossSpec(input: BossSpecInput): RigSpec {
  const poses: Record<string, PoseSpec> = {};
  for (const [name, base] of Object.entries(BASE_POSES)) {
    const over = input.poses?.[name] ?? {};
    const parts: Record<string, PartVars> = { ...base.parts };
    for (const [part, vars] of Object.entries(over.parts ?? {})) parts[part] = { ...parts[part], ...vars };
    poses[name] = { ...base, ...over, parts };
  }
  return {
    kind: "boss",
    pivots: {
      move: [100, 188],
      root: [100, 188],
      shadow: [100, 190],
      body: [100, 186],
      mouth: [0, 0],
      eyeL: [0, 0],
      eyeR: [0, 0],
      pupilL: [0, 0],
      pupilR: [0, 0],
      spiralL: [0, 0],
      spiralR: [0, 0],
      browL: [0, 0],
      browR: [0, 0],
      ...input.pivots,
    },
    poses,
    brows: BOSS_BROWS,
    gazeRange: input.gazeRange ?? [5, 4],
    facing: -1,
    unit: 1,
    orbit: input.orbit,
    tints: input.tints,
    propFly: input.propFly ?? { x: -90, y: 30, rotation: -260 },
    points: input.points ?? { impact: ["body", 100, 122], launch: ["prop", 100, 158] },
    mouthFallback: {},
  };
}

/** Lid pivots sit on the top edge of each eye. */
export function lidPivots(e: EyesDef) {
  return { lidL: [0, -(e.ry + 1)] as const, lidR: [0, -(e.ry + 1)] as const };
}

/** A floating mitten hand (the bosses' hands orbit a shoulder pivot). */
export function Hand({ cx, cy, color, tint = "dark", rx = 11, ry = 10 }: { cx: number; cy: number; color: string; tint?: string; rx?: number; ry?: number }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} data-tint={tint} />
      <ellipse cx={cx + 1.5} cy={cy - ry * 0.4} rx={rx * 0.45} ry={ry * 0.3} fill="#FFFFFF" opacity={0.2} />
    </>
  );
}

/** A letter tile prop. */
export function Tile({ cx, cy, glyph, face, edge, ink, arabic = false }: { cx: number; cy: number; glyph: string; face: string; edge: string; ink: string; arabic?: boolean }) {
  return (
    <>
      <rect x={cx - 20} y={cy - 19} width={40} height={40} rx={9} fill={edge} />
      <rect x={cx - 18} y={cy - 19} width={36} height={36} rx={8} fill={face} />
      <text
        x={cx}
        y={cy + (arabic ? 6 : 8)}
        textAnchor="middle"
        fontSize={arabic ? 26 : 24}
        fontWeight={700}
        fill={ink}
        fontFamily={arabic ? "var(--font-cairo), Cairo, sans-serif" : "var(--font-fredoka), Fredoka, sans-serif"}
      >
        {glyph}
      </text>
      <rect x={cx - 14} y={cy - 16} width={12} height={4} rx={2} fill="#FFFFFF" opacity={0.5} />
    </>
  );
}
