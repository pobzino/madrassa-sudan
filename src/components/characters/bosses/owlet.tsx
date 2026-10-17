import { Brows, HandGlow, Dust, Eyes, Hand, lidPivots, Mouths, Rim, ShadeDefs, Sparkles, Stars, Steam, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/**
 * Puzzle Owlet: Amowl's cheeky little rival. Deliberately unlike the
 * Amowl: blue, no cap, puzzle-knob ear tufts, a heart-shaped face, amber
 * eyes in dark rings and a smug half-lidded look. Holds a puzzle piece.
 */

const C = {
  main: ["#5B8DEF", "#F08A5D"],
  dark: ["#3F6FD1", "#D9663A"],
  light: ["#D6E4FF", "#FFE0C2"],
  belly: ["#EEF3FF", "#FFF1E3"],
  brow: ["#27408B", "#8A3A17"],
} as const;
const INK = "#16213F";

const EYES = {
  l: [80, 106],
  r: [120, 106],
  rx: 15,
  ry: 15,
  pupil: 6.6,
  look: [-2.5, 2.5],
  ink: INK,
  lid: { tint: "dark", color: C.dark[0] },
  iris: { r: 10.5, color: "#FFB020" },
} as const;

const EAR_L = "M58 102 L50 62 C62 66 76 76 86 88Z";
const FACE = "M100 90 C88 76 50 78 50 106 C50 132 80 142 100 148 C120 142 150 132 150 106 C150 78 112 76 100 90Z";
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);

function Art({ uid }: { uid: string }) {
  return (
    <>
      <ShadeDefs uid={uid} />
      <ellipse data-part="shadow" cx={100} cy={190} rx={56} ry={8} fill={`url(#${uid}-ground)`} />
      <Dust ground={190} xs={[70, 130, 46, 154]} />
      <g data-part="move">
        <g data-part="root">
          <g data-part="earL">
            <path d={EAR_L} fill={C.dark[0]} data-tint="dark" />
            <circle cx={50} cy={58} r={7.5} fill="#FFC83D" />
          </g>
          <g data-part="earR">
            <path d={mirror(EAR_L)} fill={C.dark[0]} data-tint="dark" />
            <circle cx={150} cy={58} r={7.5} fill="#FFC83D" />
          </g>
          <g data-part="footL">
            <ellipse cx={84} cy={185} rx={11} ry={5.5} fill="#F59E0B" />
          </g>
          <g data-part="footR">
            <ellipse cx={116} cy={185} rx={11} ry={5.5} fill="#F59E0B" />
          </g>
          <g data-part="body">
            <ellipse cx={100} cy={128} rx={60} ry={58} fill={C.main[0]} data-tint="main" />
            {/* folded wings at the sides */}
            <path d="M42 112 Q30 140 44 168 Q56 160 58 134Z M158 112 Q170 140 156 168 Q144 160 142 134Z" fill={C.dark[0]} data-tint="dark" />
            <ellipse cx={100} cy={164} rx={32} ry={21} fill={C.belly[0]} data-tint="belly" />
            <path d="M84 158 l5 5 l5 -5 M106 158 l5 5 l5 -5 M95 168 l5 5 l5 -5" stroke="#B8CCF5" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <ellipse cx={100} cy={128} rx={60} ry={58} fill={`url(#${uid}-shade)`} />
            <Rim cx={100} cy={128} rx={60} ry={58} from={205} to={300} width={3.2} opacity={0.45} />
            <ellipse data-part="flash" cx={100} cy={128} rx={61} ry={59} fill="#FFFFFF" opacity={0} />
            <g data-part="head">
              <path d={FACE} fill={C.light[0]} data-tint="light" />
              <path data-part="flash" d={FACE} fill="#FFFFFF" opacity={0} />
              <circle cx={80} cy={106} r={18} fill={C.dark[0]} data-tint="dark" />
              <circle cx={120} cy={106} r={18} fill={C.dark[0]} data-tint="dark" />
              <Eyes e={EYES} uid={uid} />
              <Brows b={{ l: [78, 82], r: [122, 82], len: 14, width: 4, color: C.brow[0], tint: "brow" }} />
              <path d="M93 124 Q100 121 107 124 L100 135Z" fill="#F59E0B" stroke="#F59E0B" strokeWidth={2} strokeLinejoin="round" />
              <Mouths m={{ at: [100, 141], scale: 0.48, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[50, 46], [150, 46]]} />
            </g>
            <g data-part="armR">
              <HandGlow uid={uid} cx={100} cy={160} />
              <g data-part="prop">
                <path d="M86 146 H95 C95 139 105 139 105 146 H114 V155 C121 155 121 165 114 165 V174 H86 V165 C93 165 93 155 86 155Z" fill="#22C55E" />
                <path d="M88 148 H93 M90 150 V156" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={2.4} strokeLinecap="round" />
              </g>
              <Hand cx={120} cy={162} color={C.dark[0]} rx={10} ry={9} />
            </g>
            <g data-part="armL">
              <Hand cx={80} cy={162} color={C.dark[0]} rx={10} ry={9} />
            </g>
          </g>
          <Sparkles at={[[30, 120, 1], [172, 60, 1.2], [172, 150, 0.8]]} />
          <Zzz at={[148, 60]} />
        </g>
      </g>
    </>
  );
}

export const owlet: BossDef = {
  name: "Puzzle Owlet",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 130],
      earL: [62, 90],
      earR: [138, 90],
      armL: [50, 132],
      armR: [150, 132],
      prop: [100, 160],
      footL: [84, 185],
      footR: [116, 185],
      flash: [100, 128],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 48, rx: 54, ry: 11 },
    tints: C,
    gazeRange: [3.5, 3],
    poses: {
      // A smug little rival: half-lidded and smirking when idle.
      idle: { mouth: "smirk", lids: 0.08, brows: "cheeky", gaze: [-0.5, 0.3] },
    },
  }),
};
