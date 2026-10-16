import { leaf } from "../arenas/shapes";
import { Brows, Dust, Eyes, Hand, lidPivots, Mouths, Rim, ShadeDefs, Sparkles, Stars, Steam, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/**
 * Sprouty the science sprout: a round green bean with a two-leaf sprout and a
 * red karkadeh (hibiscus) flower, holding a bubbling flask. Phase 2 turns it
 * autumn orange.
 */

const C = {
  main: ["#7CC85A", "#F0A04B"],
  dark: ["#5BA53D", "#D9772E"],
  light: ["#E3F6CF", "#FFE2B8"],
  leaf: ["#4FAE3E", "#E0702E"],
  brow: ["#2F6B1F", "#8A3A17"],
} as const;
const INK = "#1F3A17";

const EYES = {
  l: [80, 104],
  r: [120, 104],
  rx: 14.5,
  ry: 16,
  pupil: 8.6,
  look: [-2.5, 3],
  ink: INK,
  lid: { tint: "main", color: C.main[0] },
} as const;

const PETALS = [0, 72, 144, 216, 288]
  .map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const x = 140 + Math.cos(a) * 7;
    const y = 70 + Math.sin(a) * 7;
    return `M${(x - 6.5).toFixed(1)} ${y.toFixed(1)}a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0Z`;
  })
  .join("");

function Art({ uid }: { uid: string }) {
  return (
    <>
      <ShadeDefs uid={uid} />
      <ellipse data-part="shadow" cx={100} cy={190} rx={64} ry={9} fill={`url(#${uid}-ground)`} />
      <Dust ground={190} xs={[64, 136, 40, 160]} />
      <g data-part="move">
        <g data-part="root">
          <g data-part="leaf">
            <path d="M100 66 C100 56 98 50 100 42" stroke={C.dark[0]} data-tint-stroke="dark" strokeWidth={5} strokeLinecap="round" fill="none" />
            <path d={leaf(100, 44, 54, 17, 205) + leaf(100, 44, 54, 17, -25)} fill={C.leaf[0]} data-tint="leaf" />
            <path d="M100 44 L54 24 M100 44 L146 24" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
          </g>
          <g data-part="footL">
            <ellipse cx={74} cy={183} rx={18} ry={9} fill="#9C6B3E" />
            <path d="M60 186 q-6 3 -8 0" stroke="#9C6B3E" strokeWidth={3} strokeLinecap="round" fill="none" />
          </g>
          <g data-part="footR">
            <ellipse cx={126} cy={183} rx={18} ry={9} fill="#9C6B3E" />
            <path d="M140 186 q6 3 8 0" stroke="#9C6B3E" strokeWidth={3} strokeLinecap="round" fill="none" />
          </g>
          <g data-part="body">
            <ellipse cx={100} cy={122} rx={66} ry={64} fill={C.main[0]} data-tint="main" />
            <ellipse cx={100} cy={152} rx={41} ry={30} fill={C.light[0]} data-tint="light" />
            <ellipse cx={100} cy={122} rx={66} ry={64} fill={`url(#${uid}-shade)`} />
            <Rim cx={100} cy={122} rx={66} ry={64} from={205} to={300} width={3.4} opacity={0.45} />
            <path d="M56 92 a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z M64 84 a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0Z M140 140 a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z" fill="#FFFFFF" opacity={0.4} />
            <g data-part="head">
              {/* a red karkadeh flower */}
              <path d={PETALS} fill="#E23D5A" />
              <circle cx={140} cy={70} r={4} fill="#FFD34D" />
              <ellipse cx={58} cy={128} rx={10} ry={6.5} fill="#FF9FB2" opacity={0.8} />
              <ellipse cx={142} cy={128} rx={10} ry={6.5} fill="#FF9FB2" opacity={0.8} />
              <Eyes e={EYES} uid={uid} />
              <Brows b={{ l: [80, 80], r: [120, 80], len: 14, width: 4, color: C.brow[0], tint: "brow" }} />
              <Mouths m={{ at: [100, 132], scale: 0.62, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[62, 56], [138, 50]]} />
            </g>
            <g data-part="armR">
              <g data-part="prop">
                <rect x={95} y={136} width={10} height={14} fill="#E0F7FF" />
                <rect x={93} y={133} width={14} height={6} rx={2} fill="#B07B4A" />
                <circle cx={100} cy={162} r={16} fill="#E0F7FF" />
                <path d="M84.5 164 A16 16 0 0 0 115.5 164Z" fill="#34D399" />
                <circle cx={96} cy={168} r={2.2} fill="#FFFFFF" opacity={0.8} />
                <circle cx={104} cy={172} r={1.5} fill="#FFFFFF" opacity={0.8} />
                <ellipse cx={93} cy={155} rx={3} ry={5} fill="#FFFFFF" opacity={0.7} transform="rotate(30 93 155)" />
              </g>
              <Hand cx={122} cy={160} color={C.dark[0]} />
            </g>
            <g data-part="armL">
              <Hand cx={78} cy={160} color={C.dark[0]} />
            </g>
            <ellipse data-part="flash" cx={100} cy={122} rx={67} ry={65} fill="#FFFFFF" opacity={0} />
          </g>
          <Sparkles at={[[24, 110, 1], [180, 70, 1.3], [178, 140, 0.8]]} />
          <Zzz at={[152, 46]} />
        </g>
      </g>
    </>
  );
}

export const sprouty: BossDef = {
  name: "Sprouty",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 126],
      leaf: [100, 64],
      armL: [46, 128],
      armR: [154, 128],
      prop: [100, 158],
      footL: [74, 183],
      footR: [126, 183],
      flash: [100, 122],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 30, rx: 58, ry: 11 },
    tints: C,
  }),
};
