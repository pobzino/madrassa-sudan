import { Brows, HandGlow, Dust, Eyes, Hand, lidPivots, Mouths, Rim, ShadeDefs, Sparkles, Stars, Steam, Tile, Zzz, bossSpec } from "../parts";
import type { BossDef } from "./types";

/** Harf the Letter Dragon: a chubby sky-blue baby dragon with amber horns and a letter tile. */

const C = {
  main: ["#4EA8DE", "#F08A5D"],
  dark: ["#2F7FB8", "#D9663A"],
  light: ["#FFF1CF", "#FFE0C2"],
  muzzle: ["#8FD0F2", "#FFC6A8"],
  wing: ["#B7E3FA", "#FFD2B8"],
  brow: ["#1F5A86", "#8A3A17"],
} as const;
const INK = "#1F3A5C";

const EYES = {
  l: [78, 96],
  r: [122, 96],
  rx: 15,
  ry: 16.5,
  pupil: 9,
  look: [-2.5, 3],
  ink: INK,
  lid: { tint: "main", color: C.main[0] },
} as const;

const WING_L = "M58 98 C44 72 24 56 8 58 C14 66 12 74 18 80 C10 84 10 94 16 98 C12 104 16 112 26 112 C38 114 50 110 58 104Z";
const WING_L_IN = "M54 98 C42 78 28 66 16 64 C20 70 20 76 24 80 C18 86 18 92 22 96 C20 102 24 106 30 106 C40 108 48 104 54 100Z";
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);

function Art({ uid }: { uid: string }) {
  return (
    <>
      <ShadeDefs uid={uid} />
      <ellipse data-part="shadow" cx={100} cy={190} rx={64} ry={9} fill={`url(#${uid}-ground)`} />
      <Dust ground={190} xs={[64, 136, 40, 160]} />
      <g data-part="move">
        <g data-part="root">
          <g data-part="tail">
            <path d="M138 172 C164 184 186 174 186 152" stroke={C.main[0]} data-tint-stroke="main" strokeWidth={16} strokeLinecap="round" fill="none" />
            <path d="M186 154 C174 146 178 130 188 124 C198 130 202 146 186 154Z" fill={C.dark[0]} data-tint="dark" />
          </g>
          <g data-part="flapL">
            <path d={WING_L} fill={C.main[0]} data-tint="main" />
            <path d={WING_L_IN} fill={C.wing[0]} data-tint="wing" />
          </g>
          <g data-part="flapR">
            <path d={mirror(WING_L)} fill={C.main[0]} data-tint="main" />
            <path d={mirror(WING_L_IN)} fill={C.wing[0]} data-tint="wing" />
          </g>
          <g data-part="head">
            <path d="M74 66 C64 50 60 38 64 28 C76 34 84 48 88 62Z" fill="#FFC83D" />
            <path d="M126 66 C136 50 140 38 136 28 C124 34 116 48 112 62Z" fill="#FFC83D" />
            <path d="M68 40 C70 48 74 54 78 60" stroke="#FFE7A0" strokeWidth={2.4} strokeLinecap="round" fill="none" />
            <g data-part="tuft">
              <path d="M88 60 a7 7 0 0 1 10 -8 a8 8 0 0 1 12 2 a6 6 0 0 1 4 8Z" fill={C.dark[0]} data-tint="dark" />
            </g>
          </g>
          <g data-part="footL">
            <ellipse cx={72} cy={182} rx={20} ry={10} fill={C.dark[0]} data-tint="dark" />
            <path d="M58 182 a3 3 0 0 1 6 0Z M68 180 a3 3 0 0 1 6 0Z M78 181 a3 3 0 0 1 6 0Z" fill="#FFFFFF" opacity={0.5} />
          </g>
          <g data-part="footR">
            <ellipse cx={128} cy={182} rx={20} ry={10} fill={C.dark[0]} data-tint="dark" />
            <path d="M116 181 a3 3 0 0 1 6 0Z M126 180 a3 3 0 0 1 6 0Z M136 182 a3 3 0 0 1 6 0Z" fill="#FFFFFF" opacity={0.5} />
          </g>
          <g data-part="body">
            <ellipse cx={100} cy={120} rx={68} ry={66} fill={C.main[0]} data-tint="main" />
            <ellipse cx={100} cy={152} rx={41} ry={31} fill={C.light[0]} data-tint="light" />
            <path d="M72 140 Q100 147 128 140 M68 154 Q100 162 132 154 M74 168 Q100 175 126 168" stroke="#E8CD92" strokeWidth={2.2} strokeLinecap="round" fill="none" />
            <ellipse cx={100} cy={120} rx={68} ry={66} fill={`url(#${uid}-shade)`} />
            <Rim cx={100} cy={120} rx={68} ry={66} from={205} to={300} width={3.4} opacity={0.45} />
            <ellipse data-part="flash" cx={100} cy={120} rx={69} ry={67} fill="#FFFFFF" opacity={0} />
            <g data-part="head">
              <ellipse cx={56} cy={120} rx={10} ry={6.5} fill="#FF9FB2" opacity={0.8} />
              <ellipse cx={144} cy={120} rx={10} ry={6.5} fill="#FF9FB2" opacity={0.8} />
              <ellipse cx={100} cy={124} rx={28} ry={16} fill={C.muzzle[0]} data-tint="muzzle" />
              <ellipse cx={93} cy={119} rx={2.8} ry={2} fill={INK} />
              <ellipse cx={107} cy={119} rx={2.8} ry={2} fill={INK} />
              <Eyes e={EYES} uid={uid} />
              <Brows b={{ l: [77, 72], r: [123, 72], len: 15, width: 4, color: C.brow[0], tint: "brow" }} />
              <Mouths m={{ at: [100, 131], scale: 0.6, ink: INK, tongue: "#FF7A90" }} />
              <Stars />
              <Steam at={[[64, 24], [136, 24]]} />
            </g>
            <g data-part="armR">
              <HandGlow uid={uid} cx={100} cy={158} />
              <g data-part="prop">
                <Tile cx={100} cy={158} glyph="ب" face="#FFF6DD" edge="#007229" ink="#007229" arabic />
              </g>
              <Hand cx={122} cy={160} color={C.dark[0]} />
            </g>
            <g data-part="armL">
              <Hand cx={78} cy={160} color={C.dark[0]} />
            </g>
          </g>
          <Sparkles at={[[24, 120, 1], [178, 40, 1.3], [176, 112, 0.8]]} />
          <Zzz at={[150, 40]} />
        </g>
      </g>
    </>
  );
}

export const harf: BossDef = {
  name: "Harf",
  Art,
  spec: bossSpec({
    pivots: {
      head: [100, 124],
      tuft: [100, 62],
      tail: [140, 172],
      flapL: [56, 100],
      flapR: [144, 100],
      armL: [46, 128],
      armR: [154, 128],
      prop: [100, 158],
      footL: [72, 182],
      footR: [128, 182],
      flash: [100, 120],
      ...lidPivots(EYES),
    },
    orbit: { cx: 100, cy: 26, rx: 56, ry: 11 },
    tints: C,
  }),
};
